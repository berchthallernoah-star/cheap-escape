// DEAL ALERTS: checks a fresh snapshot against your saved watch rules
// (alerts.json) and writes dist/alerts.md. Exit code 0 = deals found, 3 = none,
// 2 = snapshot not live (never alert on demo data).
//   node src/alerts.js [--snapshot dist/snapshot.json] [--rules alerts.json]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { plan, weekendWindows } from './planner/plan.js';
import { todayIn } from './lib/time.js';
import { line } from './cli.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };

/** Returns [{ rule, trips }] with trips under the rule's per-person limit. */
export function findDeals(snapshot, rules, today) {
  const hits = [];
  for (const rule of rules) {
    const wins = weekendWindows(today, rule.weekends ?? 6, { leaveTime: rule.leaveTime ?? '14:00' });
    const trips = [];
    for (const w of wins) {
      const r = plan(snapshot, { travelers: rule.travelers, car: rule.car ?? true, bags: rule.bags ?? 'small',
        minStayHours: rule.minStayHours ?? 20, destinations: rule.destinations ?? null, ...w, limit: 5, perCity: 1 });
      trips.push(...r.trips.filter((t) => t.perPerson <= rule.maxPerPerson && t.estimatedShare <= 0.5));
    }
    trips.sort((a, b) => a.total - b.total);
    if (trips.length) hits.push({ rule, trips: trips.slice(0, rule.max ?? 5) });
  }
  return hits;
}

if (process.argv[1]?.endsWith('src/alerts.js')) {
  const snap = JSON.parse(await readFile(arg('snapshot', 'dist/snapshot.json'), 'utf8'));
  const rules = JSON.parse(await readFile(arg('rules', 'alerts.json'), 'utf8')).rules;
  if (snap.live === false || !snap.flights?.length) {
    console.log('Snapshot is not live data — no alerts.');
    process.exit(2);
  }
  const hits = findDeals(snap, rules, todayIn('Europe/Vienna'));
  const md = hits.length
    ? hits.map((h) => `### ${h.rule.name} (≤ €${h.rule.maxPerPerson} per person)\n${h.trips.map((t) => `- ${line(t)}`).join('\n')}`).join('\n\n')
    : 'No trip under your limits right now.';
  await mkdir('dist', { recursive: true });
  await writeFile('dist/alerts.md', `# Cheap Escape deals — ${snap.generatedAt}\n\n${md}\n`);
  console.log(md);
  process.exit(hits.length ? 0 : 3);
}
