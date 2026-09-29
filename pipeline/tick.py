"""ARQ world tick: pull live feeds, fuse them, write world.json.

Runs locally (`python3 pipeline/tick.py`) or as the WorldTick Lambda (`handler`).
Stdlib only, so the Lambda needs no layers.

Feeds (no API keys needed):
  - Open-Meteo Air Quality API (Copernicus CAMS): PM2.5 / PM10, 24h back + 48h ahead
  - Open-Meteo Forecast API: 850 hPa + 10 m wind, planetary boundary layer height
  - NASA FIRMS VIIRS 375 m (S-NPP + NOAA-20) active fires, South Asia, last 7 days
"""
import csv, gzip, io, json, math, os, time, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEO = os.environ.get('ARQ_GEO', os.path.join(ROOT, 'web', 'public', 'geo'))
BUCKET = os.environ.get('ARQ_BUCKET')  # set in Lambda: world.json, archive and feed cache live in S3
RAID_AQI = 300  # 'Very Poor' and above counts as a smog raid
CACHE = os.environ.get('ARQ_CACHE', os.path.join(ROOT, 'data', 'cache'))
OUT = os.environ.get('ARQ_OUT', os.path.join(ROOT, 'web', 'public', 'data', 'world.json'))
ARCHIVE = os.environ.get('ARQ_ARCHIVE', os.path.join(ROOT, 'data', 'archive'))
IST = timezone(timedelta(hours=5, minutes=30))

# Wind grid over India + upwind Pakistan / Afghanistan border
LON0, LAT0, D, NX, NY = 56.0, 0.0, 2.0, 26, 21

# ---------------------------------------------------------------- NAQI (CPCB 2014)
BP = {
    'pm25': [(0, 30, 0, 50), (30, 60, 50, 100), (60, 90, 100, 200), (90, 120, 200, 300), (120, 250, 300, 400), (250, 380, 400, 500)],
    'pm10': [(0, 50, 0, 50), (50, 100, 50, 100), (100, 250, 100, 200), (250, 350, 200, 300), (350, 430, 300, 400), (430, 510, 400, 500)],
}
CATS = [(50, 'Good'), (100, 'Satisfactory'), (200, 'Moderate'), (300, 'Poor'), (400, 'Very Poor'), (450, 'Severe'), (999, 'Severe+')]


def sub_index(c, table):
    for lo, hi, ilo, ihi in table:
        if c <= hi:
            return ilo + (max(c, lo) - lo) * (ihi - ilo) / (hi - lo)
    return 500


def naqi(pm25, pm10):
    return round(min(500, max(sub_index(pm25, BP['pm25']), sub_index(pm10, BP['pm10']))))


def category(aqi):
    return next(name for top, name in CATS if aqi <= top)


# ---------------------------------------------------------------- fetch helpers
def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'arq-tick/1.0'}), timeout=90) as r:
                return r.read()
        except Exception as e:
            if i == tries - 1:
                raise
            # 429 = Open-Meteo per-minute budget; wait for the window to roll over
            time.sleep(35 if getattr(e, 'code', None) == 429 else 3 * (i + 1))


def s3():
    import boto3  # available in the Lambda runtime; not needed locally
    return boto3.client('s3')


def cached(name, fetch, sources, label, url):
    """Fetch fresh; on failure fall back to the last good copy so a flaky feed never breaks the world."""
    path = os.path.join(CACHE, name)
    try:
        data = fetch()
        body = json.dumps(data)
        if BUCKET:
            s3().put_object(Bucket=BUCKET, Key=f'cache/{name}', Body=body.encode(), ContentType='application/json')
        else:
            os.makedirs(CACHE, exist_ok=True)
            with open(path, 'w') as f:
                f.write(body)
        sources.append({'name': label, 'url': url, 'stale': False})
    except Exception as e:
        print(f'[warn] {label} failed ({e}); using last good copy')
        if BUCKET:
            data = json.loads(s3().get_object(Bucket=BUCKET, Key=f'cache/{name}')['Body'].read())
        else:
            with open(path) as f:
                data = json.load(f)
        sources.append({'name': label, 'url': url, 'stale': True})
    return data


PACE_S = float(os.environ.get('ARQ_PACE_S', 12))  # 100 locations per 12 s keeps us under 600 calls/min


def open_meteo(base, lats, lons, params, chunk=100):
    out = []
    for i in range(0, len(lats), chunk):
        if i:
            time.sleep(PACE_S)
        q = dict(params, latitude=','.join(f'{x:.3f}' for x in lats[i:i + chunk]),
                 longitude=','.join(f'{x:.3f}' for x in lons[i:i + chunk]), timezone='GMT')
        res = json.loads(get(base + '?' + urllib.parse.urlencode(q)))
        out.extend(res if isinstance(res, list) else [res])
    return out


def fetch_fires(now):
    fires = []
    for sat, path in (('snpp', 'suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2'), ('noaa20', 'noaa-20-viirs-c2/csv/J1_VIIRS_C2')):
        text = get(f'https://firms.modaps.eosdis.nasa.gov/data/active_fire/{path}_South_Asia_7d.csv').decode()
        for r in csv.DictReader(io.StringIO(text)):
            lon, lat = float(r['longitude']), float(r['latitude'])
            if not (60 <= lon <= 100 and 4 <= lat <= 38) or r['confidence'] in ('l', 'low'):
                continue
            t = datetime.strptime(r['acq_date'] + r['acq_time'].zfill(4), '%Y-%m-%d%H%M').replace(tzinfo=timezone.utc)
            age = (now - t).total_seconds() / 3600
            if 0 <= age <= 60:
                fires.append([round(lon, 3), round(lat, 3), round(float(r['frp']), 1), round(age, 1)])
    return fires


# ---------------------------------------------------------------- geometry
def centroid(geom):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    A = X = Y = 0.0
    for poly in polys:
        ring = poly[0]
        a = cx = cy = 0.0
        for (x0, y0), (x1, y1) in zip(ring, ring[1:] + ring[:1]):
            f = x0 * y1 - x1 * y0
            a += f
            cx += (x0 + x1) * f
            cy += (y0 + y1) * f
        if abs(a) < 1e-12:
            continue
        A += abs(a) / 2
        X += cx / (3 * a) * abs(a) / 2
        Y += cy / (3 * a) * abs(a) / 2
    if A == 0:
        x, y = polys[0][0][0]
        return x, y
    return X / A, Y / A


def km(lon1, lat1, lon2, lat2):
    dx = (lon2 - lon1) * 111.32 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, (lat2 - lat1) * 110.57)


def uv(speed, direction):
    """Meteorological 'from' direction -> (u east, v north)."""
    r = math.radians(direction)
    return -speed * math.sin(r), -speed * math.cos(r)


def bilinear(field, lon, lat):
    fx = min(max((lon - LON0) / D, 0), NX - 1.001)
    fy = min(max((lat - LAT0) / D, 0), NY - 1.001)
    i, j = int(fx), int(fy)
    tx, ty = fx - i, fy - j
    a, b = field[j * NX + i], field[j * NX + i + 1]
    c, d = field[(j + 1) * NX + i], field[(j + 1) * NX + i + 1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty


# ---------------------------------------------------------------- attribution priors
# Non-stubble split by district type. Approximate winter PM2.5 source ranges for
# Delhi (TERI-ARAI 2018 apportionment, IITM DSS sector bulletins) and IGP rural
# inventories; tuned so Delhi's stubble share tracks IITM DSS daily estimates.
# All outputs are labelled "model estimate" in the UI.
NCR = {
    'DELHI': None,
    'HARYANA': {'FARIDABAD', 'GURUGRAM', 'NUH', 'ROHTAK', 'SONIPAT', 'REWARI', 'JHAJJAR', 'PANIPAT', 'PALWAL',
                'BHIWANI', 'CHARKI DADRI', 'MAHENDRAGARH', 'JIND', 'KARNAL'},
    'UTTAR PRADESH': {'MEERUT', 'GHAZIABAD', 'GAUTAM BUDDHA NAGAR', 'BULANDSHAHR', 'BAGHPAT', 'HAPUR', 'SHAMLI', 'MUZAFFARNAGAR'},
    'RAJASTHAN': {'ALWAR', 'BHARATPUR', 'KHAIRTHAL-TIJARA', 'KOTPUTLI-BEHROR', 'DEEG'},
}
IGP = {'PUNJAB', 'HARYANA', 'UTTAR PRADESH', 'BIHAR', 'WEST BENGAL', 'CHANDIGARH', 'DELHI'}
PRIORS = {  # vehicles, dust, industry, household (waste + solid fuel), regional background
    'ncr': (0.26, 0.22, 0.17, 0.12, 0.23),
    'igp': (0.12, 0.18, 0.15, 0.25, 0.30),
    'rest': (0.12, 0.25, 0.15, 0.18, 0.30),
}
STUBBLE_K = 2500.0   # half-saturation of the trajectory-weighted fire index (FRP-MW units)
STUBBLE_MAX = 0.55   # ceiling on the transported-smoke share


def is_ncr(state, name):
    names = NCR.get(state, set())
    return state in NCR and (names is None or name in names)


def attribution(state, name, biomass, coal, blh_night, coarse=0.0):
    kind = 'ncr' if is_ncr(state, name) else 'igp' if state in IGP else 'rest'
    veh, dust, ind, hh, reg = PRIORS[kind]
    ind += min(0.18, coal / 12000)                        # nearby coal capacity (MW, distance-weighted)
    local = min(1.4, max(0.8, 600 / max(blh_night, 50)))  # shallow nights trap local emissions
    veh, dust, hh = veh * local, dust * local, hh * local
    tot = veh + dust + ind + hh + reg
    stubble = STUBBLE_MAX * biomass / (biomass + STUBBLE_K)
    # coarse-heavy air (PM10 >> PM2.5) is mostly crustal dust: let the measured ratio lift the dust share
    if coarse > 0.6:
        want = min(0.85, coarse) * tot
        if dust < want:
            scale = (tot - want) / (tot - dust)
            veh, ind, hh, reg, dust = veh * scale, ind * scale, hh * scale, reg * scale, want
    k = (1 - stubble) / tot
    return {'fire': round(stubble, 3), 'vehicles': round(veh * k, 3), 'dust': round(dust * k, 3),
            'industry': round(ind * k, 3), 'household': round(hh * k, 3), 'regional': round(reg * k, 3)}, kind


# ---------------------------------------------------------------- build
def build():
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    sources = []
    districts = json.load(open(os.path.join(GEO, 'districts.geojson')))['features']
    plants = [p for p in json.load(open(os.path.join(GEO, 'plants.geojson')))['features']
              if p['properties']['type'] == 'coal_power_plant']
    cents = [centroid(f['geometry']) for f in districts]

    aq = cached('aq.json', lambda: open_meteo(
        'https://air-quality-api.open-meteo.com/v1/air-quality', [c[1] for c in cents], [c[0] for c in cents],
        {'hourly': 'pm2_5,pm10', 'past_days': 2, 'forecast_days': 3}),
        sources, 'Copernicus CAMS via Open-Meteo Air Quality', 'https://open-meteo.com/en/docs/air-quality-api')

    glon = [LON0 + i * D for j in range(NY) for i in range(NX)]
    glat = [LAT0 + j * D for j in range(NY) for i in range(NX)]
    wx = cached('wind.json', lambda: open_meteo(
        'https://api.open-meteo.com/v1/forecast', glat, glon,
        {'hourly': 'wind_speed_850hPa,wind_direction_850hPa,wind_speed_10m,wind_direction_10m,boundary_layer_height',
         'past_days': 2, 'forecast_days': 2, 'wind_speed_unit': 'ms'}),
        sources, 'Open-Meteo wind (850 hPa, 10 m) and boundary layer height', 'https://open-meteo.com/en/docs')

    fires = cached('fires.json', lambda: fetch_fires(now), sources,
                   'NASA FIRMS VIIRS 375 m active fires', 'https://firms.modaps.eosdis.nasa.gov/')

    # --- wind fields per hour: transport wind = mean of 10 m and 850 hPa (boundary-layer proxy)
    t0 = datetime.fromisoformat(wx[0]['hourly']['time'][0]).replace(tzinfo=timezone.utc)
    now_w = int((now - t0).total_seconds() // 3600)
    nh = len(wx[0]['hourly']['time'])
    U, V, BLH, W10 = [], [], [], []
    for h in range(nh):
        u, v, b, w = [], [], [], []
        for p in wx:
            H = p['hourly']
            s8, d8 = H['wind_speed_850hPa'][h] or 0, H['wind_direction_850hPa'][h] or 0
            s1, d1 = H['wind_speed_10m'][h] or 0, H['wind_direction_10m'][h] or 0
            u8, v8 = uv(s8, d8)
            u1, v1 = uv(s1, d1)
            u.append((u8 + u1) / 2)
            v.append((v8 + v1) / 2)
            b.append(H['boundary_layer_height'][h] or 500)
            w.append(s1)
        U.append(u), V.append(v), BLH.append(b), W10.append(w)

    # --- fire spatial hash (0.5 deg cells)
    cells = {}
    for k, (lon, lat, frp, age) in enumerate(fires):
        cells.setdefault((int(lon * 2), int(lat * 2)), []).append(k)

    t0a = datetime.fromisoformat(aq[0]['hourly']['time'][0]).replace(tzinfo=timezone.utc)
    now_a = int((now - t0a).total_seconds() // 3600)

    out = []
    for f, (clon, clat), p in zip(districts, cents, aq):
        props = f['properties']
        pm25s = p['hourly']['pm2_5']
        pm10s = p['hourly']['pm10']

        def mean24(series, i):
            vals = [x for x in series[max(0, i - 23):i + 1] if x is not None]
            return sum(vals) / len(vals) if vals else 0.0

        fc_idx = [i for i in range(now_a, min(now_a + 49, len(pm25s)))]
        aqi_fc = [naqi(mean24(pm25s, i), mean24(pm10s, i)) for i in fc_idx]
        pm25_now, pm10_now = mean24(pm25s, now_a), mean24(pm10s, now_a)
        aqi = aqi_fc[0]
        aqi_prev = naqi(mean24(pm25s, now_a - 24), mean24(pm10s, now_a - 24))

        # best 2-hour window in the next 24 h, daytime IST (06-21)
        best = None
        for i in range(now_a, min(now_a + 23, len(pm25s) - 1)):
            hour_ist = (t0a + timedelta(hours=i)).astimezone(IST)
            if 6 <= hour_ist.hour <= 20 and pm25s[i] is not None and pm25s[i + 1] is not None:
                avg = (pm25s[i] + pm25s[i + 1]) / 2
                if best is None or avg < best[1]:
                    best = (hour_ist.isoformat(), avg)

        # back-trajectory 36 h + trajectory-weighted fire index
        lon, lat = clon, clat
        traj, biomass, hits = [[round(lon, 3), round(lat, 3)]], 0.0, {}
        for step in range(1, 37):
            h = max(0, now_w - step)
            u, v = bilinear(U[h], lon, lat), bilinear(V[h], lon, lat)
            lon -= u * 3600 / (111320 * math.cos(math.radians(lat)))
            lat -= v * 3600 / 110540
            if step % 3 == 0:
                traj.append([round(lon, 3), round(lat, 3)])
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    for k in cells.get((int(lon * 2) + dx, int(lat * 2) + dy), ()):
                        flon, flat, frp, age = fires[k]
                        # fire must have burned before the air parcel passed (with 3 h slack)
                        if age + 3 >= step and km(lon, lat, flon, flat) <= 35:
                            w = frp * math.exp(-step / 30)
                            biomass += w
                            hits[k] = hits.get(k, 0) + w

        coal = sum(float(pl['properties']['inst_cap'] or 0) * math.exp(-km(clon, clat, *pl['geometry']['coordinates']) / 40)
                   for pl in plants if km(clon, clat, *pl['geometry']['coordinates']) < 150)
        night = [bilinear(BLH[min(nh - 1, now_w + k)], clon, clat) for k in range(24)]
        vi_now = bilinear(BLH[now_w], clon, clat) * bilinear(W10[now_w], clon, clat)
        vi_min = min(bilinear(BLH[min(nh - 1, now_w + k)], clon, clat) * bilinear(W10[min(nh - 1, now_w + k)], clon, clat)
                     for k in range(24))
        coarse = (pm10_now - pm25_now) / pm10_now if pm10_now > 150 else 0.0
        att, kind = attribution(props['state'], props['district'], biomass, coal, min(night), coarse)
        ahead10 = [x for x in pm10s[now_a:now_a + 25] if x is not None]
        ahead25 = [x for x in pm25s[now_a:now_a + 25] if x is not None]
        dust_ahead = bool(ahead10) and max(ahead10) > 400 and max(ahead10) > 3 * max(ahead25)

        # top source clusters (0.25 deg) for Trace to Source
        clusters = {}
        for k, w in hits.items():
            key = (round(fires[k][0] * 4), round(fires[k][1] * 4))
            c = clusters.setdefault(key, [0.0, 0, 0.0, 0.0, 0.0])
            c[0] += w; c[1] += 1; c[2] += fires[k][2]; c[3] += fires[k][0]; c[4] += fires[k][1]
        top = sorted(clusters.values(), reverse=True)[:3]

        out.append({
            'id': props['id'], 'n': props['district'].title(), 's': props['state'].title(),
            'c': [round(clon, 3), round(clat, 3)], 'k': kind,
            'aqi': aqi, 'aqiPrev': aqi_prev, 'cat': category(aqi), 'pm25': round(pm25_now), 'pm10': round(pm10_now),
            'fc': aqi_fc, 'pm25h': [round(x) if x is not None else None for x in pm25s[now_a:now_a + 49]],
            'att': att, 'conf': 'medium' if biomass > 50 or kind == 'ncr' else 'low',
            'traj': traj, 'clusters': [{'c': [round(c[3] / c[1], 3), round(c[4] / c[1], 3)], 'fires': c[1],
                                        'frp': round(c[2]), 'w': round(c[0])} for c in top],
            'dustAhead': dust_ahead,
            'vi': round(vi_now), 'viMin': round(vi_min), 'blhMin': round(min(night)),
            'best': {'start': best[0], 'pm25': round(best[1])} if best else None,
        })

    # attach nearest district name to each cluster (label for Trace to Source)
    for d in out:
        for c in d['clusters']:
            near = min(out, key=lambda o: km(o['c'][0], o['c'][1], *c['c']))
            c['near'] = f"{near['n']}, {near['s']}"

    frames = []
    for k in (0, 3, 6, 9, 12):
        h = min(nh - 1, now_w + k)
        frames.append({'t': (t0 + timedelta(hours=h)).isoformat(),
                       'u': [round(x, 1) for x in U[h]], 'v': [round(x, 1) for x in V[h]]})

    # smog raids: districts crossing into Very Poor now, or forecast to within 24 h
    raids = []
    for d in out:
        ahead = d['fc'][1:25]
        if d['aqi'] > RAID_AQI and d['aqiPrev'] <= RAID_AQI:
            raids.append({'id': d['id'], 'n': d['n'], 's': d['s'], 'aqi': d['aqi'], 'kind': 'now', 'etaH': 0, 'dust': d['dustAhead']})
        elif d['aqi'] <= RAID_AQI and ahead and max(ahead) > RAID_AQI:
            eta = next(i + 1 for i, v in enumerate(ahead) if v > RAID_AQI)
            raids.append({'id': d['id'], 'n': d['n'], 's': d['s'], 'aqi': max(ahead), 'kind': 'incoming', 'etaH': eta, 'dust': d['dustAhead']})
    raids.sort(key=lambda r: -r['aqi'])

    world = {
        'generatedAt': now.isoformat(), 'sources': sources, 'districts': out, 'raids': raids[:50],
        'fires': fires,
        'wind': {'lon0': LON0, 'lat0': LAT0, 'd': D, 'nx': NX, 'ny': NY, 'frames': frames,
                 'blh': [round(x) for x in BLH[now_w]]},
        'calibration': {'stubbleK': STUBBLE_K, 'stubbleMax': STUBBLE_MAX,
                        'benchmark': 'IITM DSS (ews.tropmet.res.in/dss) daily Delhi stubble share'},
    }
    return world


def write(world):
    body = json.dumps(world, separators=(',', ':'))
    stamp = world['generatedAt'][:13].replace('-', '').replace('T', '')
    if BUCKET:
        c = s3()
        c.put_object(Bucket=BUCKET, Key='data/world.json', Body=gzip.compress(body.encode()), ContentType='application/json',
                     ContentEncoding='gzip', CacheControl='public, max-age=300')
        c.put_object(Bucket=BUCKET, Key=f'archive/world-{stamp}.json.gz', Body=gzip.compress(body.encode()),
                     ContentType='application/gzip')
        return len(body)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        f.write(body)
    os.makedirs(ARCHIVE, exist_ok=True)
    with gzip.open(os.path.join(ARCHIVE, f'world-{stamp}.json.gz'), 'wt') as f:
        f.write(body)
    return len(body)


def handler(event=None, context=None):
    world = build()
    size = write(world)
    return {'generatedAt': world['generatedAt'], 'districts': len(world['districts']), 'fires': len(world['fires']),
            'bytes': size, 'raids': world['raids']}


if __name__ == '__main__':
    t = time.time()
    print(handler(), f'{time.time() - t:.1f}s')
