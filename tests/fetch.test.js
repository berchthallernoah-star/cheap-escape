// Parser + orchestration tests against SAMPLE payloads. The payload shapes follow
// the publicly documented behaviour of these endpoints as known on 2026-10-31;
// they could not be checked live from the build container (network blocked).
// When a live refresh runs, docs/SOURCES.md records whether each source worked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ryanair from '../src/fetch/ryanair.js';
import * as flix from '../src/fetch/flixbus.js';
import { parseOsrmTable, parseFuel } from '../src/fetch/extras.js';
import * as db from '../src/fetch/db.js';
import * as kiwi from '../src/fetch/kiwi.js';
import { readFileSync } from 'node:fs';
const live = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
import { buildSnapshot } from '../src/fetch/snapshot.js';
import { plan } from '../src/planner/plan.js';

const AIRPORTS_JSON = [
  { code: 'SZG', name: 'Salzburg', city: { name: 'Salzburg', code: 'SALZBURG' }, country: { code: 'at', name: 'Austria' }, coordinates: { latitude: 47.7933, longitude: 13.0043 }, timeZone: 'Europe/Vienna' },
  { code: 'STN', name: 'London Stansted', city: { name: 'London', code: 'LONDON' }, country: { code: 'gb', name: 'United Kingdom' }, coordinates: { latitude: 51.885, longitude: 0.235 }, timeZone: 'Europe/London' },
  { code: 'LTN', name: 'London Luton', city: { name: 'London', code: 'LONDON' }, country: { code: 'gb', name: 'United Kingdom' }, coordinates: { latitude: 51.8747, longitude: -0.3683 }, timeZone: 'Europe/London' },
  ...Array.from({ length: 60 }, (_, i) => ({ code: `X${String(i).padStart(2, '0')}`, name: `Filler ${i}`, city: { name: `F${i}` }, country: { code: 'xx' }, coordinates: { latitude: 40, longitude: i }, timeZone: 'Europe/Rome' })),
];

const PER_DAY = (from, to, day, dep, arr, value) => ({
  outbound: {
    fares: [
      { day, departureDate: `${day}T${dep}:00`, arrivalDate: `${day}T${arr}:00`, price: { value, valueMainUnit: String(Math.floor(value)), currencyCode: 'EUR', currencySymbol: '€' }, soldOut: false, unavailable: false },
      { day: '2026-11-02', departureDate: null, arrivalDate: null, price: null, soldOut: false, unavailable: true },
    ],
    minFare: null, maxFare: null,
  },
});

test('ryanair parsers', () => {
  const ap = ryanair.parseAirports(AIRPORTS_JSON);
  assert.deepEqual(ap.STN, { name: 'London Stansted', city: 'London', country: 'gb', countryName: 'United Kingdom', lat: 51.885, lon: 0.235, tz: 'Europe/London' });
  assert.deepEqual(ryanair.parseRoutes([{ arrivalAirport: { code: 'STN' }, connectingAirport: null }, { arrivalAirport: { code: 'DUB' }, connectingAirport: { code: 'BGY' } }]), ['STN']);
  const r = ryanair.parseCheapestPerDay(PER_DAY('SZG', 'STN', '2026-11-06', '17:25', '18:30', 19.99), 'SZG', 'STN', 'Europe/Vienna', 'Europe/London');
  assert.equal(r.rows.length, 1);
  const [, , dep, arr, eur] = r.rows[0];
  assert.equal(arr - dep, 125, 'local times converted through both time zones');
  assert.equal(eur, 19.99);
  const ow = ryanair.parseOneWayFares({ fares: [{ outbound: { departureAirport: { iataCode: 'SZG' }, arrivalAirport: { iataCode: 'STN' }, departureDate: '2026-11-06T17:25:00', arrivalDate: '2026-11-06T18:30:00', price: { value: 24.99, currencyCode: 'EUR' }, flightNumber: 'FR 8471' } }] }, (c) => ap[c]?.tz);
  assert.equal(ow.rows[0][6], 'FR8471');
});

test('flixbus parsers', () => {
  assert.equal(flix.pickCity([{ id: 'u1', name: 'Salzburger Land' }, { id: 'u2', name: 'Salzburg' }], 'Salzburg').id, 'u2');
  assert.equal(flix.pickCity([{ id: 'u3', name: 'München Flughafen' }, { id: 'u4', name: 'München' }], 'München Flughafen').id, 'u3');
  const res = flix.parseSearch({ trips: [{ results: {
    a: { status: 'available', departure: { date: '2026-11-06T15:00:00+01:00' }, arrival: { date: '2026-11-06T17:05:00+01:00' }, price: { total: 9.99 } },
    b: { status: 'full', departure: { date: '2026-11-06T16:00:00+01:00' }, arrival: { date: '2026-11-06T18:05:00+01:00' }, price: { total: 4.99 } },
  } }] }, 'sbg-hbf', 'MUC', 'https://shop.flixbus.de');
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0][2], Date.UTC(2026, 10, 6, 14, 0) / 60000);
  assert.equal(res.rows[0][4], 9.99);
});

test('REAL responses (captured 2026-10-31): Ryanair + Kiwi parse correctly', () => {
  const ap = ryanair.parseAirports(live('live-ryanair-airports.json'));
  assert.equal(ap.SZG.tz, 'Europe/Vienna');
  assert.equal(ap.SZG.city, 'Salzburg');
  const cpd = ryanair.parseCheapestPerDay(live('live-ryanair-cheapestPerDay-SZG-STN.json'), 'SZG', 'STN', 'Europe/Vienna', 'Europe/London');
  assert.equal(cpd.rows.length, 4, 'days without flights (null times) are skipped');
  for (const r of cpd.rows) assert.equal(r[3] - r[2], 115, 'Salzburg -> Stansted: 1h55 flight, 1 h time difference');
  const ow = ryanair.parseOneWayFares(live('live-ryanair-oneWayFares-BTS.json'), (c) => ({ BTS: 'Europe/Bratislava', SUF: 'Europe/Rome' }[c] || 'Europe/Rome'));
  assert.equal(ow.rows[0][0], 'BTS');
  assert.equal(ow.rows[0][6], 'FR5761');
  const k = kiwi.parseItineraries(live('live-kiwi-SZG-london.json'));
  assert.deepEqual(k.rows[0].slice(0, 2), ['SZG', 'STN']);
  assert.equal(k.rows[0][4], 63);
  assert.deepEqual([k.rows[1][0], k.rows[1][1], k.rows[1][5], k.rows[1][7], k.rows[1][8]], ['SZG', 'LGW', 'EW+U2', 'PMI', 'kiwi']);
  assert.equal(k.rows[1][2], Date.parse('2026-11-06T09:20:00Z') / 60000);
  assert.equal(k.airports.LGW.tz, 'Europe/London');
  assert.equal(k.airports.PMI.country, 'es');
});

test('db parsers', () => {
  assert.deepEqual(db.parseLocations([{ id: 'A=1@O=Salzburg Hbf@L=8100002@', name: 'Salzburg Hbf', type: 'ST' }]), { id: 'A=1@O=Salzburg Hbf@L=8100002@', name: 'Salzburg Hbf' });
  const r = db.parseJourneys({ verbindungen: [
    { verbindungsAbschnitte: [{ abfahrtsZeitpunkt: '2026-11-06T14:08:00', ankunftsZeitpunkt: '2026-11-06T15:40:00', verkehrsmittel: { produktGattung: 'EC_IC' } },
      { abfahrtsZeitpunkt: '2026-11-06T15:50:00', ankunftsZeitpunkt: '2026-11-06T16:34:00', verkehrsmittel: { produktGattung: 'ICE' } }], angebotsPreis: { betrag: 21.99, waehrung: 'EUR' } },
    { verbindungsAbschnitte: [{ abfahrtsZeitpunkt: '2026-11-06T15:08:00', ankunftsZeitpunkt: '2026-11-06T17:00:00' }] },
  ] }, 'sbg-hbf', 'C:München', 'Europe/Vienna', 'Europe/Berlin', 'https://www.bahn.de');
  assert.equal(r.rows.length, 1);
  assert.equal(r.skipped, 1);
  assert.equal(r.rows[0][3] - r.rows[0][2], 146);
  assert.equal(r.rows[0][4], 21.99);
  assert.equal(r.rows[0][6], 'DB / ÖBB train (EC_IC + ICE)');
});

test('drive time + fuel parsers', () => {
  assert.deepEqual(parseOsrmTable({ durations: [[0, 900, null]], distances: [[0, 7000, null]] }), [{ min: 20, km: 7 }, null]);
  assert.equal(parseFuel([{ prices: [{ fuelType: 'SUP', amount: 1.62 }] }, { prices: [{ fuelType: 'SUP', amount: 1.55 }] }, { prices: [{ fuelType: 'SUP', amount: 1.58 }] }]), 1.58);
});

test('refresh job end-to-end with a mocked network, then planning on its output', async () => {
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    seen.push(u);
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('/airports/en/active')) return json(AIRPORTS_JSON);
    if (u.includes('/routes/en/airport/SZG')) return json([{ arrivalAirport: { code: 'STN' }, connectingAirport: null }]);
    if (u.includes('/routes/en/airport/')) return json([]);
    if (u.includes('/SZG/STN/cheapestPerDay') && u.includes('2026-11-01')) return json(PER_DAY('SZG', 'STN', '2026-11-06', '17:25', '18:30', 19.99));
    if (u.includes('/STN/SZG/cheapestPerDay') && u.includes('2026-11-01')) return json(PER_DAY('STN', 'SZG', '2026-11-08', '19:00', '22:00', 29.99));
    if (u.includes('cheapestPerDay')) return json({ outbound: { fares: [] } });
    if (u.includes('farfnd/v4/oneWayFares?')) return json({ fares: [] });
    if (u.includes('skypicker')) return json(live('live-kiwi-SZG-london.json'));
    if (u.includes('autocomplete/cities')) { const q = new URL(u).searchParams.get('q'); return json([{ id: `city-${q}`, name: q }]); }
    if (u.includes('flixbus')) return json({ trips: [] });
    if (u.includes('osrm')) return json({ durations: [[0, ...Array(12).fill(1200)]], distances: [[0, ...Array(12).fill(9000)]] });
    if (u.includes('e-control')) return new Response('nope', { status: 503 });
    return new Response('not found', { status: 404 });
  };
  try {
    const cacheDir = await mkdtemp(join(tmpdir(), 'ce-'));
    const snap = await buildSnapshot({ days: 20, now: Date.UTC(2026, 9, 31, 8, 0), cacheDir, minGapMs: 0, log: () => {} });
    assert.equal(snap.live, true);
    assert.equal(snap.flights.filter((f) => f[8] !== 'kiwi').length, 2);
    assert.ok(snap.flights.some((f) => f[8] === 'kiwi' && f[5] === 'EW+U2'), 'Kiwi multi-airline itinerary kept');
    assert.equal(snap.airports.LGW?.tz, 'Europe/London', 'airports from Kiwi added');
    const byId = Object.fromEntries(snap.sources.map((s) => [s.id, s.ok]));
    assert.deepEqual(byId, { ryanair: true, kiwi: true, flixbus: true, 'flixbus-trips': true, 'db-trains': false, osrm: true, 'osrm-cities': true, fuel: false, 'deal-feeds': false, wizz: false, hostelworld: false, trivago: false });
    assert.ok(Object.keys(snap.places).length > 0, 'cities from the airline network were discovered');
    assert.ok(Object.keys(snap.carRoutes).length > 0, 'road distances were fetched');
    assert.equal(snap.drive.salzburg['SZG-P3'].km, 9);
    const r = plan(snap, { leaveAfter: '2026-11-06T14:00', leaveBefore: '2026-11-07T14:00', backBy: '2026-11-09T01:00', travelers: [{ name: 'Me', cards: ['superschoolcard'] }] });
    const flightTrip = r.trips.find((t) => t.mode === 'flight');
    assert.equal(flightTrip.total, 49.98);
    assert.ok(r.trips[0].total < 49.98, 'cheaper non-flight trips (train / car with the mocked 9 km roads) rank above it');
    assert.ok(seen.some((u) => u.includes('outboundMonthOfDate=2026-11-01')));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('deal feeds: price mistakes, stays and near-home deals are recognised', async () => {
  const { parseFeed, priceIn } = await import('../src/fetch/deals.js');
  const xml = `<rss><channel>
    <item><title><![CDATA[[Preisfehler] HARBR. hotel Ludwigsburg (07.–08.12.2026) – 1 Nacht für 9€]]></title><link>https://www.mydealz.de/deals/x</link><pubDate>Sat, 31 Oct 2026 10:00:00 +0100</pubDate><category>Urlaub &amp; Reisen</category></item>
    <item><title>Adventure time 🦓 Full-service flights from Vienna to Kenya for €459</title><link>https://www.fly4free.com/y</link><pubDate>Sat, 31 Oct 2026 09:00:00 +0000</pubDate><category>Europe</category><category>Austria</category></item>
    <item><title>No link here</title></item>
  </channel></rss>`;
  const items = parseFeed(xml, { name: 'Test' });
  assert.equal(items.length, 2);
  assert.deepEqual([items[0].mistake, items[0].hotel, items[0].price], [true, true, 9]);
  assert.deepEqual([items[1].mistake, items[1].nearHome, items[1].flight, items[1].price], [false, true, true, 459]);
  assert.equal(priceIn('3 Nächte ab 298,50€ p.P.'), 298.5);
  assert.equal(priceIn('SAS Sale ab 49€/Strecke, Nordamerika ab 381€'), 49);
});

test('Wizz Air: version, route map and fare calendar (real response shapes)', async () => {
  const wizz = await import('../src/fetch/wizz.js');
  assert.equal(wizz.parseVersion('<script src="https://be.wizzair.com/29.23.1/Api/x"></script>'), '29.23.1');
  const map = wizz.parseMap({ cities: [
    { iata: 'BTS', shortName: 'Bratislava', countryCode: 'SK', countryName: 'Slovakia', latitude: 48.17, longitude: 17.21, connections: [{ iata: 'BCN', isDirectFlight: true }] },
    { iata: 'BCN', shortName: 'Barcelona', countryCode: 'ES', countryName: 'Spain', latitude: 41.3, longitude: 2.08, connections: [] },
  ] });
  assert.deepEqual(map.routes.get('BTS'), ['BCN']);
  assert.equal(map.airports.BCN.tz, 'Europe/Madrid');
  const r = wizz.parseTimetable({ outboundFlights: [
    { departureStation: 'BTS', arrivalStation: 'BCN', departureDate: '2026-11-01T00:00:00', price: { amount: 35.99, currencyCode: 'EUR' }, priceType: 'price', departureDates: ['2026-11-01T09:00:00'] },
    { departureStation: 'BTS', arrivalStation: 'BCN', departureDate: '2026-11-02T00:00:00', price: { amount: 0, currencyCode: 'EUR' }, priceType: 'checkPrice', departureDates: ['2026-11-02T09:00:00'] },
  ], returnFlights: [] }, map.airports);
  assert.equal(r.rows.length, 1);
  assert.deepEqual([r.rows[0][0], r.rows[0][1], r.rows[0][4], r.rows[0][5], r.rows[0][8]], ['BTS', 'BCN', 35.99, 'W6', 'wizz']);
  assert.equal(r.rows[0][2], Date.UTC(2026, 10, 1, 8, 0) / 60000);
  assert.ok(r.rows[0][3] - r.rows[0][2] > 120 && r.rows[0][3] - r.rows[0][2] < 180, 'Bratislava–Barcelona ≈ 2.5 h');
});

test('Hostelworld: city pick, page address and cheapest bed (real page title)', async () => {
  const hw = await import('../src/fetch/hostels.js');
  const sugg = [{ type: 'city', city: { id: '9699', name: 'Vienna', country: 'USA' } }, { type: 'city', city: { id: '38', name: 'Vienna', country: 'Austria' } }];
  const c = hw.pickCity(sugg, 'Vienna', 'Austria');
  assert.equal(c.city.id, '38');
  assert.equal(hw.cityPageUrl(c), 'https://www.hostelworld.com/hostels/europe/austria/vienna/');
  assert.equal(hw.pickCity([{ type: 'city', city: { name: 'London', country: 'England' } }], 'London', 'United Kingdom').city.country, 'England');
  assert.equal(hw.parseLeadPrice('<title>Best Hostels in Vienna from €2.92 | 2026</title>'), 2.92);
  assert.deepEqual(hw.cityPageCandidates('Edinburgh', 'United Kingdom'), ['https://www.hostelworld.com/hostels/europe/scotland/edinburgh/']);
  assert.deepEqual(hw.cityPageCandidates('Kraków', 'Poland'), ['https://www.hostelworld.com/hostels/europe/poland/krakow/']);
  assert.equal(hw.parseLeadPrice('<title>Best Hostels in Salzburg from €14.52 | 2026</title>'), 14.52);
});

test('trivago: price parsing and cheapest stays first', async () => {
  const tv = await import('../src/fetch/trivago.js');
  assert.equal(tv.parsePrice('181€'), 181);
  assert.equal(tv.parsePrice('1.086€'), 1086);
  const stays = tv.parseStays({ result: { structuredContent: { accommodations: [
    { accommodation_name: 'Expensive', hotel_rating: 4, deals: [{ price_per_night: '120€', price_per_stay: '240€', advertiser: 'X', deal_url: 'https://a' }] },
    { accommodation_name: 'a&o Wien Hauptbahnhof', hotel_rating: 2, deals: [{ price_per_night: '25€', advertiser: 'B', deal_url: 'https://b' }, { price_per_night: '20€', price_per_stay: '40€', advertiser: 'C', deal_url: 'https://c' }] },
  ] } } });
  assert.deepEqual(stays.map((s) => [s.name, s.perNight, s.advertiser]), [['a&o Wien Hauptbahnhof', 20, 'C'], ['Expensive', 120, 'X']]);
});

test('password lock: only the right password opens the page', async () => {
  const { encrypt, decrypt, wrapDocument } = await import('../src/site/encrypt.js');
  const p = encrypt(wrapDocument('<h1>secret trips</h1>'), 'correct horse battery', 'c2FsdHNhbHRzYWx0c2FsdA==', 1000);
  assert.ok(!Buffer.from(p.data, 'base64').toString('utf8').includes('secret trips'));
  assert.match(decrypt(p, 'correct horse battery'), /secret trips/);
  assert.throws(() => decrypt(p, 'wrong password'));
});
