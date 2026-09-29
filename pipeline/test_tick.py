"""Self-check for the pure logic in tick.py. Run: python3 pipeline/test_tick.py"""
import math
from tick import naqi, category, uv, centroid, attribution, sub_index, BP, stamp_time, pick_archive, replay_block, archive_times
from datetime import datetime, timezone

# NAQI breakpoints (CPCB 2014): PM2.5 60 -> 100, 90 -> 200, 250 -> 400; max of sub-indices wins
assert naqi(60, 0) == 100 and naqi(90, 0) == 200 and naqi(250, 0) == 400
assert naqi(10, 350) == 300 and naqi(500, 0) == 500
assert round(sub_index(45, BP['pm25'])) == 75
assert [category(a) for a in (50, 51, 200, 301, 420, 460)] == ['Good', 'Satisfactory', 'Moderate', 'Very Poor', 'Severe', 'Severe+']

# wind from the north-west blows toward the south-east: u > 0, v < 0
u, v = uv(10, 315)
assert u > 7 and v < -7 and math.isclose(math.hypot(u, v), 10)

# centroid of a unit square
x, y = centroid({'type': 'Polygon', 'coordinates': [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]})
assert math.isclose(x, 0.5) and math.isclose(y, 0.5)

# shares sum to 1; more upwind fire -> more stubble; Delhi uses the NCR prior
a0, kind = attribution('DELHI', 'SOUTH', 0, 0, 400)
a1, _ = attribution('DELHI', 'SOUTH', 5000, 0, 400)
assert kind == 'ncr' and abs(sum(a1.values()) - 1) < 0.01 and a1['fire'] > a0['fire'] == 0
assert attribution('KERALA', 'ERNAKULAM', 0, 0, 800)[1] == 'rest'
# dusty air (PM10 >> PM2.5) shifts the split toward dust and still sums to 1
ad, _ = attribution('HARYANA', 'JIND', 0, 0, 400, coarse=0.8)
assert ad['dust'] > a0['dust'] and abs(sum(ad.values()) - 1) < 0.01
# replay: archive stamps parse as UTC hours; pick the one nearest 24 h ago that is at least 18 h old
t = lambda s: datetime.strptime(s, '%Y%m%d%H').replace(tzinfo=timezone.utc)
assert stamp_time('archive/world-2026092914.json.gz') == t('2026092914')
assert stamp_time('world-2026092914.json.gz') == t('2026092914')
now = t('2026093014')
assert pick_archive([t('2026092903'), t('2026092908'), t('2026092913'), t('2026093009')], now) == t('2026092913')
assert pick_archive([t('2026093001'), t('2026093009')], now) is None  # nothing >= 18 h old
assert pick_archive([], now) is None
assert pick_archive([t('2026092714')], now) == t('2026092714')  # only an old one: still usable
# block: forecast index = whole hours since the archive; short forecasts give None
old = {'generatedAt': '2026-09-29T13:00:00+00:00', 'districts': [
    {'id': 'a', 'aqi': 180, 'fc': list(range(49))},
    {'id': 'b', 'aqi': 90, 'fc': [1, 2, 3]},
]}
rb = replay_block(old, now)
assert rb['at'] == '2026-09-29T13:00:00+00:00'
assert rb['districts']['a'] == [180, 25] and rb['districts']['b'] == [90, None]
# archive listing: stray or oddly named keys are skipped instead of dropping the whole replay
k = archive_times(['archive/world-2026092914.json.gz', 'archive/world-latest.json.gz', 'archive/notes.txt'])
assert list(k) == [t('2026092914')] and k[t('2026092914')] == 'archive/world-2026092914.json.gz'
print('ok')
