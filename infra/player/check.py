"""Self-check for the player economy. Run: python3 infra/player/check.py"""
from datetime import datetime, timezone
from app import ECO, award, band, board, buy, can_submit, clean_name, equip, home_movable, new_player, prev_week, roll, sync, week_id

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

# home district lock
assert not home_movable(b, t0 + 86400) and home_movable(b, t0 + 31 * 86400)

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
print('ok')
