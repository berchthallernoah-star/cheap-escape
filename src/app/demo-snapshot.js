// DEMO DATA GENERATOR — invents plausible flights so the app can be previewed
// before the first live refresh. Output is marked live:false and the app shows
// a "Demo mode: invented prices" banner. Never used for alerts.
//   node src/app/demo-snapshot.js [--out dist/demo-snapshot.json]
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { localToUtcMin, addDays, todayIn } from '../lib/time.js';

const AP = {
  SZG: ['Salzburg', 'Salzburg', 'at', 'Austria', 'Europe/Vienna', 47.7933, 13.0043],
  MUC: ['Munich', 'Munich', 'de', 'Germany', 'Europe/Berlin', 48.3538, 11.7861],
  FMM: ['Memmingen', 'Memmingen', 'de', 'Germany', 'Europe/Berlin', 47.9888, 10.2395],
  VIE: ['Vienna', 'Vienna', 'at', 'Austria', 'Europe/Vienna', 48.1103, 16.5697],
  BTS: ['Bratislava', 'Bratislava', 'sk', 'Slovakia', 'Europe/Bratislava', 48.1702, 17.2127],
  LNZ: ['Linz', 'Linz', 'at', 'Austria', 'Europe/Vienna', 48.2332, 14.1875],
  STN: ['London Stansted', 'London', 'gb', 'United Kingdom', 'Europe/London', 51.885, 0.235],
  LTN: ['London Luton', 'London', 'gb', 'United Kingdom', 'Europe/London', 51.8747, -0.3683],
  BHX: ['Birmingham', 'Birmingham', 'gb', 'United Kingdom', 'Europe/London', 52.4539, -1.748],
  BGY: ['Milan Bergamo', 'Milan', 'it', 'Italy', 'Europe/Rome', 45.6739, 9.7042],
  CIA: ['Rome Ciampino', 'Rome', 'it', 'Italy', 'Europe/Rome', 41.7994, 12.5949],
  BCN: ['Barcelona', 'Barcelona', 'es', 'Spain', 'Europe/Madrid', 41.2971, 2.0785],
  GRO: ['Girona', 'Girona', 'es', 'Spain', 'Europe/Madrid', 41.901, 2.7605],
  DUB: ['Dublin', 'Dublin', 'ie', 'Ireland', 'Europe/Dublin', 53.4213, -6.2701],
  CRL: ['Brussels Charleroi', 'Brussels', 'be', 'Belgium', 'Europe/Brussels', 50.4592, 4.4538],
  KRK: ['Krakow', 'Krakow', 'pl', 'Poland', 'Europe/Warsaw', 50.0777, 19.7848],
  PMO: ['Palermo', 'Palermo', 'it', 'Italy', 'Europe/Rome', 38.1759, 13.091],
  BVA: ['Paris Beauvais', 'Paris', 'fr', 'France', 'Europe/Paris', 49.4544, 2.1128],
};

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const price = () => Math.round((9.99 + rnd() ** 2 * 90) * 100) / 100 - 0.01 + 0.01;

export function demoSnapshot(now = Date.now()) {
  const today = todayIn('Europe/Vienna', now);
  const routes = {
    SZG: ['STN', 'DUB', 'BGY'], FMM: ['STN', 'BGY', 'CIA', 'BCN', 'DUB', 'KRK', 'PMO', 'BVA', 'CRL'],
    VIE: ['STN', 'BGY', 'CIA', 'BCN', 'CRL', 'BVA', 'PMO', 'DUB'], BTS: ['STN', 'LTN', 'BHX', 'BGY', 'CIA', 'DUB', 'GRO', 'KRK'],
    MUC: ['DUB', 'BHX'], LNZ: ['STN'],
  };
  const flights = [];
  const minutes = { STN: 120, LTN: 120, BHX: 130, BGY: 70, CIA: 95, BCN: 125, GRO: 115, DUB: 150, CRL: 85, KRK: 75, PMO: 120, BVA: 95 };
  for (let d = 0; d < 45; d++) {
    const day = addDays(today, d);
    for (const [hub, dests] of Object.entries(routes)) {
      for (const dest of dests) {
        if (rnd() < 0.35) continue;
        const m = minutes[dest] + (hub === 'BTS' || hub === 'VIE' ? 10 : 0);
        const outH = pick(['06:40', '09:15', '13:30', '16:55', '18:20', '20:10']);
        const dep = localToUtcMin(`${day}T${outH}`, AP[hub][4]);
        flights.push([hub, dest, dep, dep + m, Math.round(price() * 100) / 100, 'FR', `FR${1000 + Math.floor(rnd() * 8999)}`]);
        const backH = pick(['07:30', '11:05', '15:40', '17:45', '19:30']);
        const bdep = localToUtcMin(`${day}T${backH}`, AP[dest][4]);
        flights.push([dest, hub, bdep, bdep + m, Math.round(price() * 100) / 100, 'FR', `FR${1000 + Math.floor(rnd() * 8999)}`]);
      }
    }
  }
  const timed = [];
  for (let d = 0; d < 21; d++) {
    const day = addDays(today, d);
    for (const t of ['07:05', '10:20', '13:35', '15:50', '18:10']) {
      const dep = localToUtcMin(`${day}T${t}`, 'Europe/Vienna');
      timed.push(['sbg-hbf', 'MUC', dep, dep + 125, Math.round((4.99 + rnd() * 15) * 100) / 100, 'Flixbus', 'https://www.flixbus.com']);
      timed.push(['MUC', 'sbg-hbf', dep + 60, dep + 185, Math.round((4.99 + rnd() * 15) * 100) / 100, 'Flixbus', 'https://www.flixbus.com']);
    }
  }
  return {
    version: 1, live: false, synthetic: true, generatedAt: new Date(now).toISOString(),
    sources: [{ id: 'demo data (invented)', ok: true }],
    airports: Object.fromEntries(Object.entries(AP).map(([k, a]) => [k, { name: a[0], city: a[1], country: a[2], countryName: a[3], tz: a[4], lat: a[5], lon: a[6] }])),
    flights: flights.sort((a, b) => a[2] - b[2]), timed, drive: {}, fuel: null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--out');
  const out = i > 0 ? process.argv[i + 1] : 'dist/demo-snapshot.json';
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(demoSnapshot()));
  console.log(`wrote ${out}`);
}
