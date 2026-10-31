// Command-line search on a snapshot. Examples:
//   node src/cli.js --when this
//   node src/cli.js --when flex --people "Me:superschoolcard,Anna:deutschlandticket" --no-car
//   node src/cli.js --leave 2026-11-06T15:00 --leave-before 2026-11-06T23:00 --back 2026-11-09T01:00 --dest London
import { readFile } from 'node:fs/promises';
import { plan, weekendWindows } from './planner/plan.js';
import { todayIn, utcMinToLocal } from './lib/time.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes(`--${n}`);

export function parsePeople(s) {
  return s.split(',').filter(Boolean).map((p) => {
    const [name, cards = ''] = p.split(':');
    return { name: name.trim(), cards: cards.split('+').map((c) => c.trim()).filter(Boolean) };
  });
}

export function line(t) {
  const rides = t.legs.filter((l) => ['flight', 'bus', 'train', 'drive'].includes(l.kind) && (l.fromCode || l.kind === 'drive'));
  const out = rides[0];
  const back = rides[rides.length - 1];
  const f = (u, tz) => { const l = utcMinToLocal(u, tz || 'Europe/Vienna'); return `${l.dow} ${l.date.slice(8)}.${l.date.slice(5, 7)}. ${l.time}`; };
  const code = (c, fallback) => (!c ? fallback : c === 'sbg-hbf' ? 'Salzburg' : c.startsWith('C:') ? c.slice(2) : c);
  const ride = (l) => (l ? `${f(l.dep, l.tzFrom)} ${code(l.fromCode, l.from)}→${code(l.toCode, l.to)} (${l.kind === 'flight' ? 'plane' : l.kind === 'drive' ? 'car' : l.kind})` : '?');
  return `€${t.total.toFixed(2).padStart(7)}  ${t.city.padEnd(14)} out ${ride(out)} · back ${ride(back)} · ${Math.round(t.stayHours)}h there · ${t.tags.join(', ')}`;
}

if (process.argv[1]?.endsWith('src/cli.js')) {
  const snap = JSON.parse(await readFile(opt('snapshot', 'dist/snapshot.json'), 'utf8'));
  const base = {
    travelers: parsePeople(opt('people', 'Me:superschoolcard')),
    car: !flag('no-car'),
    bags: opt('bags', 'small'),
    minStayHours: Number(opt('min-stay', 20)),
    destinations: opt('dest') ? opt('dest').split(',') : null,
    limit: Number(opt('top', 15)),
  };
  const when = opt('when', opt('leave') ? 'custom' : 'this');
  const all = weekendWindows(todayIn('Europe/Vienna'), 6, { leaveTime: opt('leave-time', '14:00') });
  const wins = when === 'custom' ? [{ label: 'custom', leaveAfter: opt('leave'), leaveBefore: opt('leave-before', opt('leave')), backBy: opt('back') }]
    : when === 'flex' ? all : [all[when === 'next' ? 1 : 0]];
  for (const w of wins) {
    const r = plan(snap, { ...base, ...w });
    console.log(`\n== ${w.leaveAfter} → ${w.backBy}  (${r.stats.combos} combinations checked)`);
    if (!r.trips.length) console.log('   no trip found');
    for (const t of r.trips) console.log(line(t));
  }
  if (snap.live === false) console.log('\n(demo snapshot: invented prices)');
}
