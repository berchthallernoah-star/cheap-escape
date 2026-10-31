import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, weekendWindows } from '../src/planner/plan.js';
import { priceFare, parkingCost } from '../src/planner/pricing.js';
import { localToUtcMin, utcMinToLocal } from '../src/lib/time.js';
import { flight, bus, snapshot, WEEKEND } from './fixtures/synthetic.js';

// flight-logic tests: no bus/train-only trips, no walking, so the arithmetic stays isolated
const W = { ...WEEKEND, ground: false, maxWalkMin: 0 };
const SSC = { name: 'Me', cards: ['superschoolcard'] };
const NONE = { name: 'Me', cards: [] };

const OUT = flight('SZG', 'STN', '2026-11-06T17:25', 125, 19.99);
const BACK_DIRECT = flight('STN', 'SZG', '2026-11-08T19:00', 120, 89.99);
const BACK_LHR_MUC = flight('LHR', 'MUC', '2026-11-08T18:00', 105, 15, 'XX');
const BACK_BHX_MUC = flight('BHX', 'MUC', '2026-11-08T17:00', 105, 9.99);

test('time zones: local <-> UTC incl. London and DST', () => {
  assert.equal(localToUtcMin('2026-11-06T17:25', 'Europe/Vienna'), Date.UTC(2026, 10, 6, 16, 25) / 60000);
  assert.equal(localToUtcMin('2026-07-01T12:00', 'Europe/London'), Date.UTC(2026, 6, 1, 11, 0) / 60000);
  assert.equal(localToUtcMin('2026-03-29T03:30', 'Europe/Vienna'), Date.UTC(2026, 2, 29, 1, 30) / 60000);
  assert.equal(utcMinToLocal(Date.UTC(2026, 10, 8, 23, 25) / 60000, 'Europe/Vienna').time, '00:25');
});

test('pricing: Bayern-Ticket group price and card coverage', () => {
  const fare = [{ kind: 'bayern', first: 34, extra: 10, max: 5, coveredBy: ['deutschlandticket'] }];
  const p = (cards) => priceFare(fare, cards.map((c, i) => ({ name: `p${i}`, cards: c }))).eur;
  assert.equal(p([[]]), 34);
  assert.equal(p([[], []]), 44);
  assert.equal(p([[], ['deutschlandticket']]), 34);
  assert.equal(p([['deutschlandticket']]), 0);
  assert.equal(p([[], [], [], [], [], []]), 74 + 34);
  const vc = priceFare([{ eur: 20, discounts: { vorteilscard: 0.8 } }], [{ name: 'a', cards: ['vorteilscard'] }, { name: 'b', cards: [] }]);
  assert.equal(vc.eur, 36);
});

test('pricing: parking per started day with weekly cap', () => {
  assert.equal(parkingCost({ perDay: 10 }, 1), 10);
  assert.equal(parkingCost({ perDay: 10, weekCap: 48 }, 3 * 1440), 30);
  assert.equal(parkingCost({ perDay: 10, weekCap: 48 }, 6 * 1440), 48);
  assert.equal(parkingCost({ perDay: 10, weekCap: 48 }, 8 * 1440), 58);
});

test('simple return from Salzburg: SuperSchoolCard makes the airport bus free', () => {
  const s = snapshot([OUT, flight('STN', 'SZG', '2026-11-08T19:00', 120, 29.99)]);
  const r = plan(s, { ...W, travelers: [SSC], car: false });
  assert.equal(r.trips[0].total, 49.98);
  assert.equal(r.trips[0].city, 'London');
  const r2 = plan(s, { ...W, travelers: [NONE], car: true });
  assert.equal(r2.trips[0].total, 54.18, 'bus both ways (2 × €2.10) beats car + 3 days parking');
  assert.ok(r2.trips[0].tags.includes('no car'));
});

test('open-jaw: fly into Stansted, home from Heathrow to Munich, train home', () => {
  const s = snapshot([OUT, BACK_DIRECT, BACK_LHR_MUC]);
  const r = plan(s, { ...W, travelers: [SSC], car: false });
  const best = r.trips[0];
  assert.equal(best.total, 90.99); // 19.99 + coach 22 + 15 + Bayern-Ticket 34
  assert.ok(best.tags.includes('different airport back'));
  assert.ok(best.tags.includes('land in München'));
  assert.deepEqual(best.legs.map((l) => l.kind), ['bus', 'flight', 'transfer', 'flight', 'train', 'bus']);
  assert.equal(r.trips[1].total, 109.98);
});

test('Deutschlandticket makes the Munich -> Salzburg train free', () => {
  const s = snapshot([OUT, BACK_DIRECT, BACK_LHR_MUC]);
  const r = plan(s, { ...W, travelers: [{ name: 'Me', cards: ['superschoolcard', 'deutschlandticket'] }], car: false });
  assert.equal(r.trips[0].total, 56.99);
});

test('nearby city: Flixbus-style coach to Birmingham and fly home from there', () => {
  const s = snapshot([OUT, BACK_DIRECT, BACK_LHR_MUC, BACK_BHX_MUC]);
  const r = plan(s, { ...W, travelers: [SSC], car: false });
  assert.equal(r.trips[0].total, 88.98); // 19.99 + 25 + 9.99 + 34
  assert.ok(r.trips[0].tags.includes('home from Birmingham'));
  assert.deepEqual(r.trips.map((t) => t.total), [88.98, 90.99, 109.98]);
});

test('timetabled bus beats the Bayern-Ticket when it fits after landing', () => {
  const late = bus('MUC', 'sbg-hbf', '2026-11-08T22:00', 120, 9.99, 'Europe/Berlin');
  const tooEarly = bus('MUC', 'sbg-hbf', '2026-11-08T21:00', 120, 4.99, 'Europe/Berlin');
  const s = snapshot([OUT, BACK_LHR_MUC], [late, tooEarly]);
  const r = plan(s, { ...W, travelers: [SSC], car: false });
  assert.equal(r.trips[0].total, 66.98);
  assert.ok(r.trips[0].tags.includes('Flixbus'));
});

test('group of two: cards are applied per person', () => {
  const s = snapshot([OUT, BACK_DIRECT, BACK_LHR_MUC]);
  const r = plan(s, { ...W, travelers: [{ name: 'A', cards: ['deutschlandticket'] }, { name: 'B', cards: [] }], car: false });
  assert.equal(r.trips[0].total, 156.38);
  assert.equal(r.trips[0].perPerson, 78.19);
});

test('car vs. no car: the other mode is shown as an alternative', () => {
  const s = snapshot([OUT, BACK_LHR_MUC]);
  const r = plan(s, { ...W, travelers: [NONE], car: true });
  assert.equal(r.trips[0].total, 95.19, 'public both ways is cheapest here');
  assert.deepEqual(r.trips[0].alt, { vehicle: 'car', car: true, total: 105.85, via: 'Freilassing station parking' });
  assert.equal(plan(s, { ...W, travelers: [NONE], car: false }).trips[0].alt, null);
});

test('car wins for 4 people to Munich: park & shuttle beats 2 Bayern-Tickets', () => {
  const s = snapshot([flight('MUC', 'STN', '2026-11-06T19:00', 115, 20), flight('STN', 'MUC', '2026-11-08T17:00', 110, 20)]);
  const four = ['A', 'B', 'C', 'D'].map((name) => ({ name, cards: [] }));
  const r = plan(s, { ...W, travelers: four, car: true });
  const t = r.trips[0];
  assert.equal(t.total, 218.32); // 4×(20+20) + fuel 2×17.16 + 3 days × €8
  assert.equal(t.legs[0].kind, 'drive');
  assert.equal(t.legs[1].from, 'Off-airport park & shuttle near MUC');
  assert.equal(t.legs.at(-1).kind, 'drive');
  assert.equal(t.alt.car, false);
  assert.equal(t.alt.total, 304.8);
});

test('constraints: too early to reach the plane, too short a stay, destination filter', () => {
  const early = flight('SZG', 'STN', '2026-11-06T14:30', 125, 5);
  assert.equal(plan(snapshot([early, BACK_DIRECT]), { ...W, travelers: [SSC] }).trips.length, 0);
  const shortStay = flight('STN', 'SZG', '2026-11-06T21:00', 120, 10);
  assert.equal(plan(snapshot([OUT, shortStay]), { ...W, travelers: [SSC] }).trips.length, 0);
  const milan = [flight('SZG', 'BGY', '2026-11-06T18:00', 70, 9.99), flight('BGY', 'SZG', '2026-11-08T17:00', 70, 9.99)];
  const r = plan(snapshot([OUT, BACK_DIRECT, ...milan]), { ...W, travelers: [SSC], destinations: ['Milan'] });
  assert.deepEqual([...new Set(r.trips.map((t) => t.city))], ['Milan']);
});

test('weekend windows start on the next Friday', () => {
  const w = weekendWindows('2026-10-31', 3);
  assert.deepEqual(w.map((x) => x.leaveAfter), ['2026-11-06T14:00', '2026-11-13T14:00', '2026-11-20T14:00']);
  assert.equal(w[0].backBy, '2026-11-09T01:00');
});

test('alerts: only live snapshots, only trips under the per-person limit', async () => {
  const { findDeals } = await import('../src/alerts.js');
  const s = { ...snapshot([OUT, flight('STN', 'SZG', '2026-11-08T19:00', 120, 29.99)]), live: true };
  const rule = { name: 'r', travelers: [SSC], car: false, maxPerPerson: 60, weekends: 1 };
  assert.equal(findDeals(s, [rule], '2026-11-02')[0].trips[0].total, 49.98);
  assert.equal(findDeals(s, [{ ...rule, maxPerPerson: 40 }], '2026-11-02').length, 0);
});

// ------------------------------------------------------------------ every mode on every step
test('walking: a 66-minute walk to the airport replaces the bus when allowed, and is always listed', () => {
  const s = snapshot([OUT, flight('STN', 'SZG', '2026-11-08T19:00', 120, 29.99)]);
  const base = { ...WEEKEND, ground: false, travelers: [NONE], car: false };
  const bus = plan(s, { ...base, maxWalkMin: 30 }).trips[0];
  assert.equal(bus.total, 54.18);
  const busLeg = bus.legs[0];
  assert.equal(busLeg.kind, 'bus');
  const walkAlt = busLeg.alts.find((a) => a.mode === 'walk');
  assert.ok(walkAlt && walkAlt.eur === 0 && walkAlt.minutes > 30 && walkAlt.minutes < 90, 'walking alternative is shown');
  const walk = plan(s, { ...base, maxWalkMin: 120 }).trips[0];
  assert.equal(walk.total, 49.98);
  assert.equal(walk.legs[0].kind, 'walk');
  assert.ok(walk.tags.includes('some walking'));
});

test('own bike: ride to the airport and back for €0, bike waits at the airport', () => {
  const s = snapshot([OUT, flight('STN', 'SZG', '2026-11-08T19:00', 120, 29.99)]);
  const r = plan(s, { ...WEEKEND, ground: false, travelers: [NONE], car: false, bike: true, maxWalkMin: 0 });
  const t = r.trips[0];
  assert.equal(t.total, 49.98);
  assert.equal(t.legs[0].kind, 'bike');
  assert.equal(t.legs.at(-1).kind, 'bike');
  assert.equal(t.vehicle, 'bike');
});

test('bus/train-only trips: with KlimaTicket Österreich, Vienna by train costs €0', () => {
  const r = plan(snapshot([]), { ...WEEKEND, travelers: [{ name: 'Me', cards: ['klimaticket_at'] }], car: false });
  assert.equal(r.trips[0].total, 0);
  assert.equal(r.trips[0].mode, 'train');
  assert.ok(['Vienna', 'Linz', 'Graz', 'Innsbruck', 'Klagenfurt'].includes(r.trips[0].city));
  assert.ok(r.trips.some((t) => t.city === 'Vienna' && t.total === 0));
});

test('Flixbus vs train vs plane are compared per city', () => {
  const g = (from, to, local, tz, minutes, eur) => {
    const dep = localToUtcMin(local, tz);
    return [from, to, dep, dep + minutes, eur, 'bus', 'Flixbus', 'https://shop.flixbus.de'];
  };
  const s = { ...snapshot([]), ground: [
    g('sbg-hbf', 'C:Prag', '2026-11-06T15:00', 'Europe/Vienna', 300, 12.99),
    g('C:Prag', 'sbg-hbf', '2026-11-08T14:00', 'Europe/Prague', 300, 14.99),
  ] };
  const r = plan(s, { ...WEEKEND, travelers: [SSC], car: false, destinations: ['Prague'] });
  const t = r.trips[0];
  assert.equal(t.total, 27.98, 'walk to Hbf (free) + Flixbus both ways');
  assert.equal(t.mode, 'bus');
  assert.equal(t.byMode.bus, 27.98);
  assert.equal(t.byMode.train, 60, 'typical train price both ways is shown for comparison');
  const busLeg = t.legs.find((l) => l.kind === 'bus' && l.operator === 'Flixbus');
  assert.ok(busLeg.rideshare.startsWith('https://www.blablacar.de/search?fn=Salzburg&tn=Prague'));
});

test('plane out, train home: mixed trips are found when cheaper', () => {
  // fly to Bergamo for €5, come back from Milano Centrale by (estimated) train
  const s = snapshot([flight('SZG', 'BGY', '2026-11-06T18:00', 70, 5)]);
  const r = plan(s, { ...WEEKEND, travelers: [{ name: 'Me', cards: ['klimaticket_at', 'superschoolcard'] }], car: false, destinations: ['Milan'] });
  const t = r.trips[0];
  assert.equal(t.mode, 'mixed');
  assert.ok(t.tags.includes('plane out, train back'));
  assert.ok(t.legs.some((l) => l.kind === 'transfer'));
});

test('driving the whole way: shown per city and wins for a group of four', () => {
  const four = ['A', 'B', 'C', 'D'].map((name) => ({ name, cards: [] }));
  const r = plan(snapshot([]), { ...WEEKEND, travelers: four, car: true, destinations: ['Munich'] });
  const carTrip = r.trips.find((t) => t.mode === 'car');
  // 2 × fuel(145 km) + 0 tolls + 3 days × €3 parking = 2 × 15.08 + 9
  assert.equal(carTrip.total, 39.16);
  assert.equal(r.trips[0].mode, 'car', 'beats 4 people on the train (2 Bayern-Tickets)');
  assert.ok(r.trips[0].byMode.train > carTrip.total);
  assert.equal(plan(snapshot([]), { ...WEEKEND, travelers: four, car: false, destinations: ['Munich'] }).trips.some((t) => t.mode === 'car'), false);
});

test('every discovered city can be driven to: live road distance + rough tolls', () => {
  const s = { ...snapshot([]), places: { 'C:Florence': { name: 'Florence', city: 'Florence', country: 'it', countryName: 'Italy', tz: 'Europe/Rome', lat: 43.8, lon: 11.2 } },
    carRoutes: { 'C:Florence': { km: 640, min: 400 } } };
  const four = ['A', 'B', 'C', 'D'].map((name) => ({ name, cards: [] }));
  const t = plan(s, { ...WEEKEND, travelers: four, car: true, destinations: ['Florence'], minStayHours: 8 }).trips[0];
  assert.equal(t.mode, 'car');
  assert.equal(t.city, 'Florence');
  // fuel 2 × 66.56 + tolls (12 + 0.075 × 640 × 0.6 × 2 = 69.6 -> 70) + 2 days × €15
  assert.equal(t.total, 233.12);
});

test('other airlines: Ryanair out to Stansted, home from Birmingham with a Kiwi multi-airline itinerary', () => {
  const kiwiBack = [...flight('BHX', 'VIE', '2026-11-08T12:00', 300, 41, 'FR+W6', 'FR1 / W62'), 'KRK', 'kiwi'];
  const s = snapshot([OUT, kiwiBack]);
  const r = plan(s, { ...W, travelers: [SSC], car: false });
  const t = r.trips[0];
  assert.ok(t.tags.includes('home from Birmingham'));
  const back = t.legs.filter((l) => l.kind === 'flight').at(-1);
  assert.equal(back.operator, 'Ryanair + Wizz Air');
  assert.equal(back.bookWith, 'Kiwi.com');
  assert.equal(back.stops, 1);
  assert.ok(back.url.startsWith('https://www.kiwi.com/en/search/results/BHX/VIE/2026-11-08'));
  assert.match(back.note, /self-transfer/);
});

test('alert lines work for bus, train and car trips too', async () => {
  const { line } = await import('../src/cli.js');
  const four = ['A', 'B', 'C', 'D'].map((name) => ({ name, cards: [] }));
  const r = plan(snapshot([]), { ...WEEKEND, travelers: four, car: true, destinations: ['Munich'] });
  for (const t of r.trips) assert.match(line(t), /Munich .* out .* back /);
});

test('too cheap to be true: a fare far below the route normal is flagged, promos are not', async () => {
  const { findAnomalies } = await import('../src/planner/anomalies.js');
  const days = ['03', '04', '05', '06', '07', '08', '09'];
  const rows = days.map((d) => flight('SZG', 'STN', `2026-11-${d}T17:25`, 125, 89.99));
  rows.push(flight('SZG', 'STN', '2026-11-10T17:25', 125, 9.99)); // 89 % below normal
  rows.push(...days.map((d) => flight('SZG', 'BGY', `2026-11-${d}T18:00`, 70, 19.99)), flight('SZG', 'BGY', '2026-11-10T18:00', 70, 9.99)); // cheap route, normal promo
  const a = findAnomalies(snapshot(rows));
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].from, a[0].to, a[0].eur, a[0].normal, a[0].level], ['SZG', 'STN', 9.99, 90, 'mistake']);
});
