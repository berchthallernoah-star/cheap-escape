// ONE-FILE REFRESH: fetch live prices -> build the phone app -> check alerts.
// Bundled to dist/refresh.mjs (no npm install needed) so a scheduled cloud
// session can run it without access to the Git repository.
//   NODE_USE_ENV_PROXY=1 node refresh.mjs [--out ./out] [--rules alerts.json] [--days 45]
// Exit codes: 0 ok + deals, 3 ok + no deals, 2 no flight/bus/train prices at all (do not publish).
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildSnapshot } from './fetch/snapshot.js';
import { findDeals } from './alerts.js';
import { findAnomalies } from './planner/anomalies.js';
import { line } from './cli.js';
import { todayIn } from './lib/time.js';
import { APP_JS, TEMPLATE, DEFAULT_RULES } from './app/generated-assets.js';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };

export function renderApp(snapshot) {
  const json = JSON.stringify(snapshot).replace(/</g, '\\u003c');
  return TEMPLATE.replace('/*SNAPSHOT*/', () => json).replace('/*APP*/', () => APP_JS);
}

async function main() {
  const out = arg('out', 'out');
  await mkdir(out, { recursive: true });
  const snap = await buildSnapshot({ days: Number(arg('days', 45)), budget: Number(arg('budget', 5000)), minutes: Number(arg('minutes', 8)), cacheDir: join(out, '.cache') });
  await writeFile(join(out, 'snapshot.json'), JSON.stringify(snap));
  console.log(`\nsnapshot: ${snap.flights.length} flights, ${snap.ground.length} bus/train trips, ${snap.timed.length} airport buses, ${snap.requests} requests`);
  for (const s of snap.sources) console.log(`  ${s.ok ? '✓' : '✗'} ${s.id} ${s.ok ? '' : s.error}`);
  const failedHosts = Object.entries(snap.hosts || {}).filter(([, v]) => v.fail && !v.ok).map(([h, v]) => `${h} (${v.lastError})`);
  if (failedHosts.length) console.log(`  hosts that never answered: ${failedHosts.join(', ')}`);
  const okMain = ['ryanair', 'wizz', 'kiwi', 'flixbus-trips', 'db-trains'].filter((id) => snap.sources.find((s) => s.id === id)?.ok);
  if (!okMain.length) {
    console.log('\nNo flight, bus or train prices could be fetched: NOT building the page.');
    process.exit(2);
  }
  if (process.env.CE_HOSTING === 'github') snap.hosting = { kind: 'github', runUrl: process.env.CE_RUN_URL || '', every: process.env.CE_EVERY || '3' };
  await writeFile(join(out, 'cheap-escape.html'), renderApp(snap));
  console.log(`page: ${join(out, 'cheap-escape.html')}`);

  let rules = DEFAULT_RULES;
  const rulesPath = arg('rules');
  if (rulesPath) rules = JSON.parse(await readFile(rulesPath, 'utf8')).rules;
  const hits = findDeals(snap, rules, todayIn('Europe/Vienna'));
  const md = hits.length
    ? hits.map((h) => `${h.rule.name} (≤ €${h.rule.maxPerPerson} p.p.):\n${h.trips.map((t) => `- ${line(t)}`).join('\n')}`).join('\n\n')
    : 'No trip under your limit right now.';
  // too cheap to be true: price mistakes in the fare data + mistakes reported by deal hunters (last 3 days)
  const mistakes = findAnomalies(snap).filter((a) => a.level === 'mistake').slice(0, 3)
    .map((a) => `- ${a.from}→${a.to} €${a.eur} (normally ≈ €${a.normal}, −${a.savePct}%) on ${new Date(a.dep * 60000).toISOString().slice(0, 10)}`);
  const reported = (snap.deals || []).filter((d) => d.mistake && d.date && Date.now() - Date.parse(d.date) < 3 * 86400000).slice(0, 3)
    .map((d) => `- ${d.title} (${d.source})`);
  const mistakeMd = [...mistakes, ...reported].length ? `\n\nPOSSIBLE PRICE MISTAKES\n${[...mistakes, ...reported].join('\n')}` : '';
  await writeFile(join(out, 'alerts.md'), md + mistakeMd);
  if (mistakeMd) console.log(mistakeMd);
  console.log(`\nALERTS\n${md}`);
  process.exit(hits.length || mistakeMd ? 0 : 3);
}

if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('refresh.mjs'))) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
