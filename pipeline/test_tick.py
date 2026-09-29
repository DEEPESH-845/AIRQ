"""Self-check for the pure logic in tick.py. Run: python3 pipeline/test_tick.py"""
import math
from tick import naqi, category, uv, centroid, attribution, sub_index, BP

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
print('ok')
