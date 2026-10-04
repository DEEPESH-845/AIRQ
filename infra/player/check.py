"""Self-check for the player economy. Run: python3 infra/player/check.py"""
from datetime import datetime, timezone
from app import (ECO, award, review_claim, new_challenge, challenge_error, code_matches, normalise, near_duplicate, low_information,
                 hamming, field_error, make_field, overlaps, fires_on_field, field_check, sign_cert, read_cert, cert_payload, band, board, buy, can_submit, clean_name, equip, home_movable, new_player, prev_week, roll, sync, week_id)

at = lambda iso: datetime.fromisoformat(iso).replace(tzinfo=timezone.utc).timestamp()
D = {'id': 'd001', 'n': 'New Delhi', 's': 'Delhi', 'aqi': 320}
t0 = at('2026-10-05T04:00:00')  # Monday 09:30 IST

# IST weeks: Sunday 18:29 UTC is still Sunday 23:59 IST; 18:31 UTC is Monday
assert week_id(at('2026-10-04T18:29:00')) == '2026-W40' and week_id(at('2026-10-04T18:31:00')) == '2026-W41'
assert prev_week('2026-W01') == '2025-W52' and prev_week('2026-W41', 2) == '2026-W39'
assert [band(a) for a in (50, 51, 301, 450, 451, 500)] == [0, 1, 4, 5, 6, 6]

# check-in pays once a day; browser XP is capped per day and the excess is forfeited, not trickled in later
p = new_player('a', 'h', 'Cmdr One', D, t0)
assert sync(p, 0, t0) == 2 and sync(p, 0, t0) == 0 and p['cr'] == 2
sync(p, 999999, t0)
assert p['xp'] == ECO['dailyGameXp'] and p['wxp'] == ECO['dailyGameXp']
sync(p, 999999, t0 + 86400)
assert p['xp'] == ECO['dailyGameXp'], 'no trickle of forfeited XP'
sync(p, 1000009, t0 + 86400)
assert p['xp'] == ECO['dailyGameXp'] + 10 and p['cr'] == 4

# caps: per action per day, and 6 proofs a day in total
q = roll(new_player('b', 'h', 'Cmdr Two', D, t0), t0)
assert can_submit(q, 'nope', t0)
r1 = award(q, 'tree', 0)
assert r1 == {**r1, 'base': 60, 'first': 20, 'credits': 80, 'weeks': 1}, r1
award(q, 'tree', 0)
assert 'limit' in can_submit(q, 'tree', t0)
assert can_submit(q, 'stubble', t0) is None
q['pt'] = 6
assert 'proofs' in can_submit(q, 'stubble', t0)
assert can_submit(q, 'stubble', t0 + 86400) is None, 'new day resets'
award(q, 'stubble', 0)
assert 'week' in can_submit(q, 'stubble', t0 + 2 * 86400), 'weekly cap'

# multipliers: frontline x2 at Severe, boost x2, product capped at 3x; boost consumed
s = roll(new_player('c', 'h', 'Cmdr Three', D, t0), t0)
s['inv'] = {'boost': 1}
r = award(s, 'cycle', 5)
assert r['mult'] == ECO['multiplierCap'] and r['credits'] == 15 * 3 + 20 and s['inv']['boost'] == 0

# eco-streak: consecutive weeks grow it; one missed week breaks it unless a shield is held
w = roll(new_player('e', 'h', 'Cmdr Four', D, t0), t0)
award(w, 'compost', 0)
for k in (1, 2):
    roll(w, t0 + k * 7 * 86400); award(w, 'compost', 0)
assert w['streak'] == 3 and award(w, 'carpool', 0)['streak'] == 1.2
roll(w, t0 + 4 * 7 * 86400)  # skipped week 4
assert award(w, 'compost', 0)['weeks'] == 1
w['inv']['shield'] = 1
roll(w, t0 + 6 * 7 * 86400)  # skipped week 6, shield saves it
r = award(w, 'compost', 0)
assert r['shield'] and r['weeks'] == 2 and w['inv']['shield'] == 0

# shop: credits, titles once, boosts max 2, goodies after 3 verified actions, one claim under review per goodie
b = new_player('f', 'h', 'Cmdr Five', D, t0)
assert 'more credits' in buy(b, 't-sapling', t0)
b['cr'] = 1000
assert buy(b, 't-sapling', t0) is None and b['title'] == 'Sapling Scout' and b['cr'] == 950
assert 'already' in buy(b, 't-sapling', t0)
assert equip(b, '') is None and b['title'] == '' and equip(b, 't-slayer')
assert buy(b, 'boost', t0) is None and buy(b, 'boost', t0) is None and 'at most' in buy(b, 'boost', t0)
assert 'unlock' in buy(b, 'g-n95', t0)
b['n'] = 3
assert buy(b, 'g-n95', t0) is None and b['claims'][0]['status'] == 'review' and b['claims'][0]['code'].startswith('AIRQ-')
assert 'review' in buy(b, 'g-n95', t0)
assert buy(b, 'g-metro', t0), 'cash-like top-up is not sold'

# home district: the first change is free, then locked for 30 days
assert home_movable(new_player('h', 'h', 'Cmdr Home', D, t0), t0 + 60)
b['dset'] = t0
assert not home_movable(b, t0 + 86400) and home_movable(b, t0 + 31 * 86400)

# claim review: refund returns the credits once; delivered claims are final
code = b['claims'][0]['code']
cr = b['cr']
assert review_claim(b, code, 'ready') is None and b['claims'][0]['status'] == 'ready'
assert review_claim(b, code, 'refund') is None and b['cr'] == cr + 250 and b['claims'][0]['status'] == 'refunded'
assert review_claim(b, code, 'refund') and b['cr'] == cr + 250, 'no double refund'
assert review_claim(b, 'AIRQ-NOPE-NOPE', 'done') and review_claim(b, code, 'bogus')

# callsigns
assert clean_name('  Cmdr   Vayu ') == 'Cmdr Vayu' and not clean_name('ab') and not clean_name('x' * 19) and not clean_name('<b>hi</b>')
assert not clean_name('Smog Fuck er')

# leaderboard: weekly ignores other weeks, me pinned, states aggregate, no pids leak
P = [dict(new_player(str(i), 'h', f'P{i}', D, t0), wxp=i * 10, xp=i, eco=0) for i in range(1, 60)]
P.append(dict(new_player('old', 'h', 'Old', D, t0), wk='2026-W30', wxp=9999, xp=5000))
me = P[0]
out = board(P, 'week', me, t0)
assert out['rows'][0]['name'] == 'P59' and len(out['rows']) == 50 and out['me']['rank'] == 59
assert all('pid' not in r for r in out['rows'])
assert board(P, 'all', None, t0)['rows'][0]['name'] == 'Old'
st = board(P, 'states', me, t0)
assert st['rows'][0] == {'name': 'Delhi', 'score': sum(i * 10 for i in range(1, 60)), 'players': 60, 'rank': 1, 'me': True}
# zero-score players are hidden and don't push ranks down
Z = [dict(new_player('z1', 'h', 'Zero', D, t0), wxp=0), dict(new_player('s1', 'h', 'Scorer', D, t0), wxp=5), dict(new_player('m1', 'h', 'Me', D, t0), wxp=0)]
zb = board(Z, 'week', Z[2], t0)
assert [(r['name'], r['rank']) for r in zb['rows']] == [('Scorer', 1), ('Me', 2)], zb
# challenge codes: high-value actions need a live code for that action; reading tolerates spacing and 0/O, 1/I
c = new_player('k', 'h', 'Cmdr Code', D, t0)
assert challenge_error(c, 'cycle', t0) is None, 'low-value actions need no code'
assert challenge_error(c, 'tree', t0)
code = new_challenge(c, 'tree', t0)
assert challenge_error(c, 'tree', t0 + 60) is None and challenge_error(c, 'stubble', t0) and challenge_error(c, 'tree', t0 + 901)
assert code_matches(c, ' ' + code[:2] + ' ' + code[2:].lower()) and not code_matches(c, 'ZZZZ') and not code_matches(c, '')
c['ch']['code'] = 'KO7I'
assert code_matches(c, 'k07 1')
c['ch']['code'] = 'DKVL'
assert code_matches(c, 'DKVVL') and code_matches(c, 'DKV') and code_matches(c, 'Code: DKXL') and not code_matches(c, 'ABCD') and not code_matches(c, 'D')
# DynamoDB-safe floats (field coordinates)
from app import ddb
from decimal import Decimal
assert ddb({'c': [76.98, 29.69], 'acres': 5.5, 'n': 3}) == {'c': [Decimal('76.98'), Decimal('29.69')], 'acres': Decimal('5.5'), 'n': 3}

# photo fingerprints: a re-encoded, resized copy matches; a different scene doesn't; blank images are refused
import io
from PIL import Image, ImageDraw
def scene(seed):
    im = Image.new('RGB', (900, 700), (40, 120, 60))
    d = ImageDraw.Draw(im)
    for i in range(40):
        x, y = (i * 97 * seed) % 900, (i * 53 * seed) % 700
        d.ellipse([x, y, x + 60 + i, y + 40 + i], fill=((i * 31 * seed) % 255, (i * 17) % 255, (i * 7 * seed) % 255))
    return im
def jpeg(im, q=90):
    b = io.BytesIO(); im.save(b, 'JPEG', quality=q); return b.getvalue()
a_img, a_h = normalise(jpeg(scene(3)))
_, a2_h = normalise(jpeg(scene(3).resize((450, 350)), q=50))
_, b_h = normalise(jpeg(scene(7)))
assert a_img[:3] == b'\xff\xd8\xff' and hamming(a_h, a2_h) <= 8 and near_duplicate(a2_h, [a_h + ':x'])
assert not near_duplicate(b_h, [a_h + ':x']), (a_h, b_h)
_, blank = normalise(jpeg(Image.new('RGB', (400, 300), (0, 0, 0))))
assert low_information(blank) and not low_information(a_h)
png = io.BytesIO(); scene(3).save(png, 'PNG'); assert normalise(png.getvalue())[0][:2] == b'\xff\xd8', 'PNG is re-encoded to JPEG'
try:
    normalise(b'not an image'); raise AssertionError('garbage accepted')
except ValueError:
    pass

# Fire Watch: belt only, sane size; fires inside the field (plus a VIIRS pixel) count; clean days pay once a day; a fire starts a cooldown
igp = {'id': 'd900', 'n': 'Karnal', 's': 'Haryana', 'k': 'igp', 'c': [76.98, 29.69]}
south = {'id': 'd901', 'n': 'Ernakulam', 's': 'Kerala', 'k': 'rest', 'c': [76.3, 10.0]}
assert field_error(76.98, 29.69, 5, igp, []) is None
assert field_error(76.3, 10.0, 5, south, []) and field_error(76.3, 10.0, 5, south, [[76.31, 10.01, 2, 3]] * 3) is None
assert field_error(76.98, 29.69, 500, igp, []) and field_error(10, 10, 5, igp, [])
assert field_error(72.0, 30.0, 5, igp, []), 'nearest district 480 km away (e.g. across the border) is refused'
assert overlaps(76.98, 29.69, 80, ['76.9805,29.6902,80,abcd1234']) and not overlaps(76.98, 29.69, 80, ['77.1,29.69,80,abcd1234'])
fp = new_player('f1', 'h', 'Farmer One', D, t0)
fp['field'] = make_field(76.98, 29.69, 5, igp, t0)
assert 75 < fp['field']['r'] < 85  # 5 acres (20,234 m²) is a circle of ~80 m
on = [76.98 + 0.004, 29.69, 5, 3]   # ~390 m east: inside 80 m radius + 375 m buffer
off = [76.98 + 0.02, 29.69, 5, 3]   # ~1.9 km
old = [76.98, 29.69, 5, 30]         # on the field but 30 h ago
assert len(fires_on_field(fp['field'], [on, off, old])) == 1
st, r = field_check(fp, [off, old], t0)
assert st == 'clean' and r['credits'] == ECO['fieldWatch']['credits'] and fp['cr'] == ECO['fieldWatch']['credits'] and fp['life']['fieldwatch'] == 1
assert field_check(fp, [], t0)[0] == 'done', 'once a day'
# the look-back reaches the previous check: a fire 40 h ago is seen when the last check was 46 h ago
assert field_check(fp, [[76.98, 29.69, 5, 40]], t0 + 46 * 3600)[0] == 'fire'
# fire seen on IST day t0+2 (07:30 IST): checked daily, rewards pause 7 days, then resume
assert [field_check(fp, [], t0 + k * 86400)[0] for k in range(3, 9)] == ['cooldown'] * 6
assert field_check(fp, [], t0 + 9 * 86400)[0] == 'clean'
# skipping more than 60 h re-baselines without pay (fires older than the satellite record can't be seen)
cr = fp['cr']
assert field_check(fp, [], t0 + 12 * 86400)[0] == 'gap' and fp['cr'] == cr
assert field_check(fp, [], t0 + 13 * 86400)[0] == 'clean'

# certificates: verifiable, tamper-evident, wrong secret fails
tok = sign_cert(cert_payload(fp, t0), 's3cret')
assert read_cert(tok, 's3cret')['name'] == 'Farmer One' and read_cert(tok, 'other') is None
body, sig = tok.split('.')
import base64, json as _j
forged = base64.urlsafe_b64encode(_j.dumps({**read_cert(tok, 's3cret'), 'earned': 99999}).encode()).rstrip(b'=').decode()
assert read_cert(forged + '.' + sig, 's3cret') is None and read_cert('junk', 's3cret') is None
print('ok')
