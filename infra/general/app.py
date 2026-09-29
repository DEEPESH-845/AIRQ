"""The General: ARQ's in-game advisor (Strands Agents on Amazon Bedrock).

POST /api/general {"d": "<district id>"}              -> morning briefing (cached per world tick)
POST /api/general {"d": "<id>"?, "q": "<question>"}    -> answer, plus district ids to highlight on the map

Health guidance is never generated: the agent must quote the CPCB/GRAP persona matrix via a tool,
and a lint pass blocks medication or dosage talk in anything it writes.
"""
import gzip, hashlib, json, math, os, re, time
from datetime import datetime, timezone

import boto3
from strands import Agent, tool
from strands.models import BedrockModel

BUCKET = os.environ.get('ARQ_BUCKET')
QUOTA_TABLE = os.environ.get('QUOTA_TABLE')
# Amazon Nova Micro: the cheapest Bedrock model that handles these tool calls well (first-party, no Marketplace subscription).
MODEL_ID = os.environ.get('MODEL_ID', 'us.amazon.nova-micro-v1:0')
DAILY_QUESTIONS = int(os.environ.get('DAILY_QUESTIONS', 10))
HERE = os.path.dirname(os.path.abspath(__file__))
MATRIX = json.load(open(os.path.join(HERE, 'advice-matrix.json')))
BANDS = [(50, 'Good'), (100, 'Satisfactory'), (200, 'Moderate'), (300, 'Poor'), (400, 'Very Poor'), (450, 'Severe'), (999, 'Severe+')]
SOURCES = {'fire': 'farm and forest fires', 'vehicles': 'vehicles', 'dust': 'road and construction dust',
           'industry': 'industry and power plants', 'household': 'waste and household burning', 'regional': 'regional background'}

s3 = boto3.client('s3')
ddb = boto3.client('dynamodb')
_world = {'at': 0.0, 'data': None}


def world():
    """world.json from S3, re-read at most every 5 minutes per warm container."""
    if _world['data'] is None or time.time() - _world['at'] > 300:
        if BUCKET:
            raw = s3.get_object(Bucket=BUCKET, Key='data/world.json')['Body'].read()
            _world['data'] = json.loads(gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw)
        else:  # local dev
            _world['data'] = json.load(open(os.path.join(HERE, '..', '..', 'web', 'public', 'data', 'world.json')))
        _world['at'] = time.time()
    return _world['data']


def band(aqi):
    return next(i for i, (top, _) in enumerate(BANDS) if aqi <= top)


def km(a, b):
    dx = (b[0] - a[0]) * 111.32 * math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot(dx, (b[1] - a[1]) * 110.57)


def find(name):
    q = name.strip().lower()
    ds = world()['districts']
    exact = [d for d in ds if d['n'].lower() == q or d['id'] == q]
    return exact[0] if exact else next((d for d in ds if q in d['n'].lower()), None)


def summary(d):
    peak = max(d['fc'][:25])
    peak_h = d['fc'].index(peak)
    top = sorted(d['att'].items(), key=lambda kv: -kv[1])[:3]
    return {
        'id': d['id'], 'district': d['n'], 'state': d['s'], 'aqi': d['aqi'], 'category': BANDS[band(d['aqi'])][1],
        'aqi_24h_ago': d['aqiPrev'], 'pm25': d['pm25'], 'pm10': d['pm10'],
        'peak_next_24h': {'aqi': peak, 'in_hours': peak_h, 'category': BANDS[band(peak)][1]},
        'top_sources_estimate': [{'source': SOURCES[k], 'share_pct': round(v * 100)} for k, v in top],
        'fire_clusters_upwind': [{'near': c['near'], 'fires': c['fires']} for c in d['clusters']],
        'night_mixing_height_m': d['blhMin'], 'dust_storm_forecast': d.get('dustAhead', False),
        'cleanest_window_start': d['best']['start'] if d['best'] else None,
    }


class Turn:
    """Collects district ids the agent looked at, so the map can highlight them."""
    ids: list = []


# ---------------------------------------------------------------- tools
@tool
def district_status(name: str) -> dict:
    """Current air quality, 24-hour forecast peak, estimated pollution sources, upwind fires and the night-time
    mixing height for one Indian district.

    Args:
        name: District name as people write it, e.g. "New Delhi", "Karnal", "Kolkata".
    """
    d = find(name)
    if not d:
        return {'error': f'No district called {name}. Try the official district name.'}
    Turn.ids.append(d['id'])
    return summary(d)


@tool
def rank_districts(metric: str, state: str = '', limit: int = 5) -> list:
    """Rank districts across India or within one state.

    Args:
        metric: One of "worst" (highest AQI), "cleanest", "worsening" (biggest rise in 24 h),
            "rising_tomorrow" (forecast rise over the next 24 h), "fire_smoke" (largest estimated fire share).
        state: Optional state name to filter by, e.g. "Punjab".
        limit: How many districts to return, 1 to 10.
    """
    key = {
        'worst': lambda d: -d['aqi'], 'cleanest': lambda d: d['aqi'], 'worsening': lambda d: -(d['aqi'] - d['aqiPrev']),
        'rising_tomorrow': lambda d: -(d['fc'][24] - d['aqi']), 'fire_smoke': lambda d: -d['att']['fire'],
    }.get(metric)
    if not key:
        return [{'error': 'metric must be worst, cleanest, worsening, rising_tomorrow or fire_smoke'}]
    pool = [d for d in world()['districts'] if not state or d['s'].lower() == state.strip().lower()]
    rows = sorted(pool, key=key)[: max(1, min(limit, 10))]
    Turn.ids.extend(d['id'] for d in rows)
    return [{'district': d['n'], 'state': d['s'], 'aqi': d['aqi'], 'aqi_24h_ago': d['aqiPrev'], 'aqi_in_24h': d['fc'][24],
             'fire_share_pct': round(d['att']['fire'] * 100)} for d in rows]


@tool
def fires_near(name: str, radius_km: int = 100) -> dict:
    """Satellite-detected fires (NASA FIRMS VIIRS, last ~48 hours) within a radius of a district's centre.

    Args:
        name: District name.
        radius_km: Search radius in kilometres, 10 to 300.
    """
    d = find(name)
    if not d:
        return {'error': f'No district called {name}.'}
    Turn.ids.append(d['id'])
    r = max(10, min(radius_km, 300))
    near = [f for f in world()['fires'] if km(d['c'], f[:2]) <= r]
    return {'district': d['n'], 'radius_km': r, 'fires': len(near), 'total_frp_mw': round(sum(f[2] for f in near)),
            'detected_in_last_12h': sum(1 for f in near if f[3] <= 12)}


@tool
def health_guidance(aqi: int, persona: str) -> dict:
    """The official health guidance for an AQI level and a type of person. Always use this for any health advice;
    quote it instead of writing your own.

    Args:
        aqi: The National AQI value.
        persona: One of "parent", "runner", "sensitive" (asthma, heart or lung disease, elderly), "worker" (outdoor jobs).
    """
    row = MATRIX[band(max(0, aqi))]
    p = persona if persona in ('parent', 'runner', 'sensitive', 'worker') else 'sensitive'
    return {'category': BANDS[band(aqi)][1], 'cpcb_statement': row['cpcb'], 'grap_stage': row['grap'], 'verdict': row['verdict'], 'advice': row[p]}


TOOLS = [district_status, rank_districts, fires_near]  # health guidance is attached by code, never written by the model

SYSTEM = """You are the General, the advisor inside ARQ, a live map of India's air quality framed as a strategy game.
Pollution is the enemy; players defend their district. Speak like a calm, sharp field commander: brief, concrete, a little dramatic,
never alarmist. Plain English a 17-year-old understands.

Rules:
- Use the tools for every fact. Never invent AQI values, forecasts, fire counts or sources.
- Source splits are model estimates; say "estimated" when you quote them.
- Never give health or safety advice, and never say whether something is safe: the app attaches official CPCB guidance after your answer.
  Just give the air-quality facts. Never mention medicines, doses or diagnoses.
- Keep answers under 90 words unless the question needs a list. No markdown headings; short sentences."""

BRIEF = """Write this morning's situation report for {name}, {state}: exactly 2 sentences, under 45 words.
Open with "Commander," then say how bad the air is and what is driving it, then what is coming in the next 24 hours.
Call district_status first. Do not give health advice; the order line is added separately."""

# ---------------------------------------------------------------- safety lint
BLOCK = re.compile(r'\b(\d+\s?(mg|mcg|ml|puffs?)|dos(e|age)|prescri\w*|steroid\w*|salbutamol|albuterol|antibiotic\w*|diagnos\w*)\b', re.I)
SAFE = 'For health decisions follow the CPCB guidance shown in the app, and see a doctor if you have symptoms.'


THINK = re.compile(r'<thinking>.*?</thinking>\s*|</?(response|answer|result)>', re.S)
QUOTED = [row[k] for row in MATRIX for k in ('cpcb', 'parent', 'runner', 'sensitive', 'worker')]


def lint(text):
    text = THINK.sub('', text).strip()
    unquoted = text
    for q in QUOTED:  # the matrix's own wording ("medication as prescribed") is allowed; anything else is not
        unquoted = unquoted.replace(q, '')
    return SAFE if BLOCK.search(unquoted) else text


HEALTH = re.compile(r'\b(safe|unsafe|health|healthy|breath\w*|mask|n95|kid|kids|child\w*|son|daughter|baby|school|run\w*|jog\w*|walk\w*|cycl\w*|exercis\w*|workout|asthma\w*|elderly|old|grand\w*|parents?|heart|lung\w*|pregnan\w*|outside|outdoors?|play\w*|work\w*|delivery|job)\b', re.I)
PERSONAS = [('parent', r'\b(kid|kids|child\w*|son|daughter|baby|school|play\w*)\b'), ('runner', r'\b(run\w*|jog\w*|cycl\w*|exercis\w*|workout|gym)\b'),
            ('sensitive', r'\b(asthma\w*|elderly|old|grand\w*|parents?|heart|lung\w*|pregnan\w*|copd)\b'), ('worker', r'\b(work\w*|delivery|job|shift)\b')]
LABEL = {'parent': 'children', 'runner': 'runners', 'sensitive': 'people with asthma, heart or lung disease, and the elderly', 'worker': 'outdoor workers'}


def guidance(q, d):
    """Official guidance for a health-flavoured question: persona from the wording, worst AQI of the next 24 h."""
    persona = next((p for p, rx in PERSONAS if re.search(rx, q, re.I)), 'sensitive')
    worst = max(d['aqi'], max(d['fc'][:25]))
    row = MATRIX[band(worst)]
    return f"Official guidance for {LABEL[persona]} in {d['n']} (AQI up to {worst} in the next 24 h, {BANDS[band(worst)][1]}): {row['verdict']}. {row[persona]}"


def order_line(d):
    """Deterministic civilian order for a briefing: worst of now and the next 12 hours, persona 'sensitive'."""
    row = MATRIX[band(max(d['aqi'], max(d['fc'][:13])))]
    return f"Order: {row['verdict']}. {row['sensitive']}"


def agent():
    model = BedrockModel(model_id=MODEL_ID, region_name=os.environ.get('AWS_REGION', 'us-east-1'), max_tokens=2000)
    return Agent(model=model, system_prompt=SYSTEM, tools=TOOLS, callback_handler=None)


def run(prompt):
    Turn.ids = []
    text = str(agent()(prompt)).strip()
    return lint(text), list(dict.fromkeys(Turn.ids))[:12]


# ---------------------------------------------------------------- quota + cache
def over_quota(ip):
    if not QUOTA_TABLE:
        return False
    day = datetime.now(timezone.utc).strftime('%Y%m%d')
    key = hashlib.sha256(f'{ip}:{day}'.encode()).hexdigest()[:32]  # no raw IPs stored
    r = ddb.update_item(TableName=QUOTA_TABLE, Key={'k': {'S': key}}, UpdateExpression='ADD n :one SET #t = if_not_exists(#t, :ttl)',
                        ExpressionAttributeNames={'#t': 'ttl'},
                        ExpressionAttributeValues={':one': {'N': '1'}, ':ttl': {'N': str(int(time.time()) + 172800)}}, ReturnValues='UPDATED_NEW')
    return int(r['Attributes']['n']['N']) > DAILY_QUESTIONS


def briefing(d):
    key = f"briefings/{world()['generatedAt'][:13]}/{d['id']}.json"
    if BUCKET:
        try:
            return json.loads(s3.get_object(Bucket=BUCKET, Key=key)['Body'].read())
        except s3.exceptions.NoSuchKey:
            pass
    text, ids = run(BRIEF.format(name=d['n'], state=d['s']))
    if text != SAFE:
        text = f'{text} {order_line(d)}'
    out = {'text': text, 'highlight': ids, 'generatedAt': world()['generatedAt']}
    if BUCKET:
        s3.put_object(Bucket=BUCKET, Key=key, Body=json.dumps(out).encode(), ContentType='application/json')
    return out


def reply(code, body):
    return {'statusCode': code, 'headers': {'content-type': 'application/json'}, 'body': json.dumps(body)}


def handler(event, context=None):
    try:
        return _handle(event)
    except Exception as e:  # Bedrock access, throttling, timeouts: tell the player plainly, keep the trace in logs
        print(f'[general] {type(e).__name__}: {e}')
        return reply(503, {'error': 'The General is offline right now. Try again in a few minutes.'})


def _handle(event):
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return reply(400, {'error': 'Send JSON.'})
    did, q = str(body.get('d') or ''), str(body.get('q') or '').strip()
    d = next((x for x in world()['districts'] if x['id'] == did), None) if did else None
    if not q:
        if not d:
            return reply(400, {'error': 'Pick a district for a briefing.'})
        return reply(200, briefing(d))
    if len(q) > 400:
        return reply(400, {'error': 'Keep questions under 400 characters.'})
    ip = event.get('requestContext', {}).get('http', {}).get('sourceIp', 'local')
    if over_quota(ip):
        return reply(429, {'error': f'The General answers {DAILY_QUESTIONS} questions a day per player. Come back tomorrow.'})
    context_line = f"(The player is looking at {d['n']}, {d['s']}.) " if d else ''
    text, ids = run(context_line + q)
    if HEALTH.search(q):
        # guidance is for the district the question is about: the first one the agent looked up, else the open one
        target = next((x for x in world()['districts'] if ids and x['id'] == ids[0] and x['n'].lower() in q.lower()), d)
        if target:
            text = f"{text}\n\n{guidance(q, target)}"
    return reply(200, {'text': text, 'highlight': ids})


if __name__ == '__main__':
    import sys
    t = time.time()
    ev = {'body': json.dumps({'d': sys.argv[1], 'q': ' '.join(sys.argv[2:])})}
    print(handler(ev)['body'], f'{time.time() - t:.1f}s')
