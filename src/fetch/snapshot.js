// REFRESH JOB: collects a fresh fare snapshot and writes dist/snapshot.json.
//
//   node src/fetch/snapshot.js [--days 60] [--budget 5000] [--minutes 8] [--out dist/snapshot.json]
//
// Every source is optional: if one is down or changed, the others still produce a
// snapshot, and the snapshot's `sources` list says exactly what worked.
// Independent sources run in parallel; each website gets its own polite limit.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createClient, settle } from './http.js';
import * as ryanair from './ryanair.js';
import * as kiwi from './kiwi.js';
import * as wizz from './wizz.js';
import { fetchHostels } from './hostels.js';
import * as trivago from './trivago.js';
import * as flix from './flixbus.js';
import * as db from './db.js';
import { fetchDriveTimes, fetchFuel } from './extras.js';
import { fetchDeals } from './deals.js';
import { HUBS, HOMES, CARPARKS, NODES, FLIX_PAIRS } from '../data/home.js';
import { GROUND_CITIES, DISCOVERY } from '../data/ground.js';
import { METROS, GROUND_LINKS } from '../data/destinations.js';
import { haversineKm } from '../planner/graph.js';
import { addDays, todayIn, dowOf } from '../lib/time.js';

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
}

export async function buildSnapshot({ days = 60, nearDays = 35, budget = 5000, minutes = 8, log = console.log, now = Date.now(), cacheDir, minGapMs, kiwiRegions = 20 } = {}) {
  const http = createClient({ budget, log, deadline: Date.now() + minutes * 60000, ...(cacheDir ? { cacheDir } : {}), ...(minGapMs != null ? { minGapMs } : {}) });
  const today = todayIn('Europe/Vienna', now);
  const lastDay = addDays(today, days);
  const startUtc = Math.floor(now / 60000) + 60;
  const sources = [];
  const source = (id, fn) => fn().then(
    (v) => { sources.push({ id, ok: true, ...(v?.meta || {}) }); return v; },
    (e) => { sources.push({ id, ok: false, error: e?.cause?.code || e?.message || String(e) }); log(`✗ ${id}: ${e?.message}`); return null; },
  );
  const hubCodes = Object.keys(HUBS);

  // days the weekend searches look at (next 5 weeks + the next 2 days for spontaneous trips)
  const outDays = [];
  const backDays = [];
  for (let i = 0; i <= Math.min(days, nearDays); i++) {
    const d = addDays(today, i);
    const dow = dowOf(d);
    if (i <= 1 || [4, 5, 6].includes(dow)) outDays.push(d);
    if ((i >= 1 && i <= 3) || [6, 0, 1].includes(dow)) backDays.push(d);
  }

  // ---------------------------------------------------------------- airport list (everything else builds on it)
  let airports = Object.fromEntries(Object.entries(HUBS).map(([k, h]) => [k, { name: h.name, city: h.name, country: '', lat: h.lat, lon: h.lon, tz: h.tz }]));
  try {
    airports = { ...airports, ...(await ryanair.fetchAirports(http)) };
  } catch (e) {
    log(`✗ airport list: ${e.message}`);
  }
  const tzOf = (c) => airports[c]?.tz;
  const flights = [];

  // ---------------------------------------------------------------- chain A: Ryanair, then Kiwi (all airlines)
  const chainA = (async () => {
    await source('ryanair', async () => {
      if (Object.keys(airports).length < 50) throw new Error('airport list unavailable');
      const routes = new Map();
      await settle(hubCodes, async (h) => routes.set(h, (await ryanair.fetchRoutes(http, h)).filter((d) => !HUBS[d] && tzOf(d))));
      // months that still have at least one day left in the horizon
      const months = [];
      for (let d = addDays(today, 1).slice(0, 7); d <= lastDay.slice(0, 7);) {
        months.push(`${d}-01`);
        const [y, m] = d.split('-').map(Number);
        d = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
      }
      const jobs = [];
      for (const [h, dests] of routes) for (const d of dests) for (const month of months) {
        const ttl = month.slice(0, 7) === today.slice(0, 7) ? 180 : 720;
        jobs.push([h, d, month, ttl], [d, h, month, ttl]);
      }
      log(`ryanair: ${[...routes.values()].filter((x) => x.length).length} airports with routes, ${jobs.length} route-months`);
      let failed = 0;
      await settle(jobs, async ([from, to, month, ttl]) => {
        try { flights.push(...(await ryanair.fetchCheapestPerDay(http, from, to, month, tzOf(from), tzOf(to), ttl)).rows); } catch { failed++; }
      });
      // cheapestPerDay keeps one flight per day: add afternoon/evening departures for the next 10 days
      const near = Array.from({ length: 11 }, (_, i) => addDays(today, i));
      const active = [...routes].filter(([, d]) => d.length).map(([h]) => h);
      await settle(active.flatMap((h) => near.flatMap((d) => [[h, d, '00:00', '13:59'], [h, d, '14:00', '23:59']])), async ([h, d, a, b]) => {
        try { flights.push(...(await ryanair.fetchDayWindow(http, h, d, a, b, tzOf, 120)).rows.filter((x) => !HUBS[x[1]])); } catch { failed++; }
      });
      if (!flights.length) throw new Error(`no fares returned (${failed} requests failed)`);
      return { meta: { fares: flights.length, failedRequests: failed } };
    });

    await source('wizz', async () => {
      const ver = await wizz.fetchVersion(http);
      const map = await wizz.fetchMap(http, ver);
      for (const [code, info] of Object.entries(map.airports)) if (!airports[code]) airports[code] = info;
      const all = { ...map.airports, ...airports };
      const ranges = [];
      for (let d = addDays(today, 1); d <= lastDay;) {
        const monthEnd = (() => { const [y, m] = d.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); })();
        const to = monthEnd < lastDay ? monthEnd : lastDay;
        ranges.push([d, to]);
        d = addDays(to, 1);
      }
      const jobs = [];
      for (const h of hubCodes) for (const dest of map.routes.get(h) || []) if (!HUBS[dest]) for (const [a, b] of ranges) jobs.push([h, dest, a, b]);
      let n = 0;
      let failed = 0;
      await settle(jobs, async ([h, dest, a, b]) => {
        try { const r = await wizz.fetchTimetable(http, ver, h, dest, a, b, all); flights.push(...r.rows); n += r.rows.length; } catch { failed++; }
      });
      if (!n) throw new Error(`no fares (${failed} of ${jobs.length} requests failed)`);
      return { meta: { fares: n, routes: jobs.length / Math.max(1, ranges.length), failedRequests: failed, version: ver } };
    });

    await source('kiwi', async () => {
      let n = 0;
      let failed = 0;
      const add = (r) => {
        for (const [code, info] of Object.entries(r.airports)) if (!airports[code] && info.tz) airports[code] = info;
        for (const row of r.rows) if (row[2] >= startUtc) { flights.push(row); n++; }
      };
      // out: from each home airport to anywhere, any airline
      await settle(hubCodes.flatMap((h) => outDays.map((d) => [h, d])), async ([h, d]) => {
        try { add(await kiwi.search(http, [h], [], d)); } catch { failed++; }
      });
      // back: from the cheapest destinations (+ their neighbour airports, e.g. London + Birmingham) to all home airports
      const best = new Map();
      for (const f of flights) {
        if (!HUBS[f[0]] || HUBS[f[1]]) continue;
        if (!best.has(f[1]) || f[4] < best.get(f[1])) best.set(f[1], f[4]);
      }
      const metroOf = new Map(Object.entries(METROS).flatMap(([m, codes]) => codes.map((c) => [c, codes])));
      const regions = new Map();
      for (const [code] of [...best].sort((a, b) => a[1] - b[1])) {
        const set = new Set([code, ...(metroOf.get(code) || [])]);
        for (const l of GROUND_LINKS) {
          if (l.minutes > 240) continue;
          if (l.a === code) set.add(l.b);
          if (l.b === code) set.add(l.a);
        }
        const list = [...set].slice(0, 8).sort();
        regions.set(list.join(','), list);
        if (regions.size >= kiwiRegions) break;
      }
      await settle([...regions.values()].flatMap((src) => backDays.map((d) => [src, d])), async ([src, d]) => {
        try { add(await kiwi.search(http, src, hubCodes, d)); } catch { failed++; }
      });
      if (!n) throw new Error(`no itineraries (${failed} requests failed)`);
      return { meta: { itineraries: n, regions: regions.size, failedRequests: failed } };
    });
  })();

  // ---------------------------------------------------------------- chain B: Flixbus to the airports (home side)
  const timed = [];
  const chainB = source('flixbus', async () => {
    const ids = new Map();
    const names = [...new Set(FLIX_PAIRS.flatMap((p) => [p.aName, p.bName]))];
    await settle(names, async (n) => { const c = await flix.resolveCity(http, n); if (c) ids.set(n, c.id); });
    const flixDays = [];
    for (let i = 0; i <= Math.min(days, nearDays); i++) {
      const d = addDays(today, i);
      if (i <= 7 || [4, 5, 6, 0, 1].includes(dowOf(d))) flixDays.push(d);
    }
    const jobs = [];
    for (const p of FLIX_PAIRS) {
      const a = ids.get(p.aName);
      const b = ids.get(p.bName);
      if (!a || !b) continue;
      // bExtra = city stop -> airport (e.g. Linz city + bus 601): add after arrival / before departure
      const min = p.bExtraMin || 0;
      const eur = p.bExtraEur || 0;
      for (const d of flixDays) {
        jobs.push({ from: a, to: b, d, na: p.a, nb: p.b, arrPlus: min, depMinus: 0, eur });
        jobs.push({ from: b, to: a, d, na: p.b, nb: p.a, arrPlus: 0, depMinus: min, eur });
      }
    }
    if (!jobs.length) throw new Error(`could not resolve Flixbus cities (${[...ids.keys()].join(', ') || 'none'})`);
    let failed = 0;
    await settle(jobs, async (j) => {
      try {
        const r = await flix.fetchDay(http, j.from, j.to, j.d, j.na, j.nb, { min: j.arrPlus, eur: j.eur }, 120);
        for (const row of r.rows) row[2] -= j.depMinus;
        timed.push(...r.rows);
      } catch { failed++; }
    });
    return { meta: { departures: timed.length, failedRequests: failed } };
  });

  // ---------------------------------------------------------------- chain C: discovered cities by bus, train, car
  const known = new Set(Object.values(GROUND_CITIES).map((c) => c.city.toLowerCase()));
  const places = {};
  for (const a of Object.values(airports)) {
    if (!a?.city || a.lat == null || !a.tz || known.has(a.city.toLowerCase())) continue;
    const km = haversineKm(DISCOVERY.from, a);
    if (km > DISCOVERY.maxKmCar || km < 60) continue;
    const key = `C:${a.city}`;
    if (!places[key]) places[key] = { name: a.city, city: a.city, country: a.country, countryName: a.countryName, tz: a.tz, lat: a.lat, lon: a.lon, km: Math.round(km), discovered: true };
  }
  const nearKeys = Object.keys(places).filter((k) => places[k].km <= DISCOVERY.maxKmBusTrain);
  log(`discovered ${Object.keys(places).length} extra destination cities (${nearKeys.length} within bus/train range)`);
  const placeOf = (key) => GROUND_CITIES[key] || places[key];
  const ground = [];
  const carRoutes = {};
  const drive = {};
  let fuel = null;

  const chainC = (async () => {
    // quick ones first so they can never be starved
    await source('osrm', async () => {
      for (const [homeId, h] of Object.entries(HOMES)) {
        const ids = Object.keys(CARPARKS);
        const res = await fetchDriveTimes(http, h, ids.map((id) => NODES[CARPARKS[id].node]));
        drive[homeId] = {};
        ids.forEach((id, i) => { if (res[i]) drive[homeId][id] = res[i]; });
      }
      return { meta: { homes: Object.keys(drive).length } };
    });
    await source('osrm-cities', async () => {
      const keys = [...Object.keys(GROUND_CITIES), ...Object.keys(places)];
      for (let i = 0; i < keys.length; i += 80) {
        const chunk = keys.slice(i, i + 80);
        const res = await fetchDriveTimes(http, HOMES.salzburg, chunk.map((k) => placeOf(k)));
        chunk.forEach((k, j) => { if (res[j] && res[j].km > 0) carRoutes[k] = res[j]; });
      }
      if (!Object.keys(carRoutes).length) throw new Error('no routes');
      return { meta: { cities: Object.keys(carRoutes).length } };
    });
    await source('fuel', async () => {
      const eurPerLitre = await fetchFuel(http, HOMES.salzburg.lat, HOMES.salzburg.lon);
      if (!eurPerLitre) throw new Error('no prices');
      fuel = { eurPerLitre, type: 'Super 95', src: 'E-Control Spritpreisrechner', at: new Date(now).toISOString() };
      return { meta: { eurPerLitre } };
    });
    await source('flixbus-trips', async () => {
      const salzburg = await flix.resolveCity(http, 'Salzburg');
      if (!salzburg) throw new Error('could not resolve Salzburg');
      const ids = new Map();
      await settle(Object.entries(GROUND_CITIES).filter(([, c]) => c.flix), async ([key, c]) => { const r = await flix.resolveCity(http, c.flix); if (r) ids.set(key, r.id); });
      const extraIds = new Map();
      await settle(nearKeys, async (key) => { const r = await flix.resolveCity(http, places[key].city, 'en'); if (r) extraIds.set(key, r.id); });
      const wkOut = outDays.filter((d) => [4, 5, 6].includes(dowOf(d)));
      const wkBack = backDays.filter((d) => [6, 0, 1].includes(dowOf(d)));
      const fri = wkOut.filter((d) => dowOf(d) === 5).slice(0, 4);
      const sun = wkBack.filter((d) => dowOf(d) === 0).slice(0, 4);
      const jobs = [];
      for (const [key, id] of ids) {
        for (const d of wkOut) jobs.push({ from: salzburg.id, to: id, d, na: 'sbg-hbf', nb: key });
        for (const d of wkBack) jobs.push({ from: id, to: salzburg.id, d, na: key, nb: 'sbg-hbf' });
      }
      for (const [key, id] of extraIds) {
        if (id === salzburg.id || [...ids.values()].includes(id)) continue;
        for (const d of fri) jobs.push({ from: salzburg.id, to: id, d, na: 'sbg-hbf', nb: key });
        for (const d of sun) jobs.push({ from: id, to: salzburg.id, d, na: key, nb: 'sbg-hbf' });
      }
      let failed = 0;
      await settle(jobs, async (j) => {
        try {
          const r = await flix.fetchDay(http, j.from, j.to, j.d, j.na, j.nb, { min: 0, eur: 0 }, 180);
          for (const row of r.rows) ground.push([row[0], row[1], row[2], row[3], row[4], 'bus', 'Flixbus', row[6]]);
        } catch { failed++; }
      });
      if (!ground.length && failed) throw new Error(`no departures (${failed} requests failed)`);
      return { meta: { departures: ground.length, cities: ids.size + extraIds.size, failedRequests: failed } };
    });
    await source('db-trains', async () => {
      const sbg = await db.resolveStation(http, 'Salzburg Hbf'); // bahn.de currently refuses server requests (403)
      if (!sbg) throw new Error('could not resolve Salzburg Hbf');
      const cities = [...Object.entries(GROUND_CITIES).filter(([, c]) => c.db).map(([k, c]) => [k, c.db]), ...nearKeys.map((k) => [k, places[k].city])];
      const st = new Map();
      await settle(cities, async ([key, name]) => { const r = await db.resolveStation(http, name); if (r) st.set(key, r); });
      const fri = outDays.filter((d) => dowOf(d) === 5).slice(0, 2);
      const sun = backDays.filter((d) => dowOf(d) === 0).slice(0, 2);
      const jobs = [];
      for (const [key, s2] of st) {
        const tz = placeOf(key).tz;
        for (const d of fri) jobs.push([sbg, s2, `${d}T14:00`, ['sbg-hbf', key], 'Europe/Vienna', tz]);
        for (const d of sun) jobs.push([s2, sbg, `${d}T12:00`, [key, 'sbg-hbf'], tz, 'Europe/Vienna']);
      }
      let n = 0;
      let failed = 0;
      await settle(jobs, async (j) => {
        try { const r = await db.fetchJourneys(http, ...j, 180); ground.push(...r.rows); n += r.rows.length; } catch { failed++; }
      });
      if (!n) throw new Error(`no priced connections (${failed} of ${jobs.length} requests failed)`);
      return { meta: { connections: n, failedRequests: failed } };
    });
  })();

  // ---------------------------------------------------------------- chain D: deal-hunter feeds (incl. price mistakes, hotels)
  let deals = [];
  const chainD = source('deal-feeds', async () => {
    const r = await fetchDeals(http, 14, now);
    if (!r.items.length) throw new Error(`no items (${r.failed} feeds failed)`);
    deals = r.items.slice(0, 120);
    return { meta: { items: deals.length, mistakes: deals.filter((d) => d.mistake).length, failedFeeds: r.failed } };
  });

  await Promise.all([chainA, chainB, chainC, chainD]);

  // ---------------------------------------------------------------- hostels: cheapest bed in every destination city
  const hostels = {};
  const stayCities = [];
  await source('hostelworld', async () => {
    const best = new Map();
    for (const f of flights) {
      if (!HUBS[f[0]] || HUBS[f[1]] || !airports[f[1]]?.city) continue;
      const a = airports[f[1]];
      const k = `${a.city}|${a.countryName}`;
      if (!best.has(k) || f[4] < best.get(k).eur) best.set(k, { key: a.city, city: a.city, countryName: a.countryName, eur: f[4] });
    }
    for (const c of Object.values(GROUND_CITIES)) if (!best.has(`${c.city}|${c.countryName}`)) best.set(`${c.city}|${c.countryName}`, { key: c.city, city: c.city, countryName: c.countryName, eur: 0 });
    const list = [...best.values()].sort((a, b) => a.eur - b.eur).slice(0, 90);
    stayCities.push(...list.filter((c) => c.eur > 0).slice(0, 25));
    const r = await fetchHostels(http, list);
    Object.assign(hostels, r.hostels);
    if (!Object.keys(hostels).length) throw new Error(`no prices (${r.failed} failed)`);
    return { meta: { cities: Object.keys(hostels).length, failed: r.failed } };
  });

  // ---------------------------------------------------------------- cheap hotels + hostels for the next four weekends (trivago)
  const stays = {};
  await source('trivago', async () => {
    const fridays = outDays.filter((d) => dowOf(d) === 5).slice(0, 4);
    const sid = await trivago.openSession();
    const jobs = stayCities.flatMap((c) => fridays.map((fri) => [c, fri, addDays(fri, 2)]));
    let ok = 0;
    let failed = 0;
    for (let i = 0; i < jobs.length; i += 4) {
      await Promise.all(jobs.slice(i, i + 4).map(async ([c, arrival, departure]) => {
        try {
          const items = (await trivago.searchStays(sid, c.city, arrival, departure)).slice(0, 6);
          if (!items.length) return;
          (stays[c.key] ||= []).push({ arrival, departure, items });
          ok++;
        } catch { failed++; }
      }));
    }
    if (!ok) throw new Error(`no stays (${failed} of ${jobs.length} searches failed)`);
    return { meta: { searches: jobs.length, withResults: ok, failed } };
  });

  // dedupe (same flight from two sources) keeping the lower price, clip to horizon
  const seen = new Map();
  for (const f of flights) {
    if (f[2] < startUtc) continue;
    const k = `${f[0]}|${f[1]}|${f[2]}|${f[7] || ''}`;
    const o = seen.get(k);
    if (!o || f[4] < o[4] - 0.01 || (Math.abs(f[4] - o[4]) <= 0.01 && o[8] === 'kiwi' && f[8] !== 'kiwi')) seen.set(k, f);
  }
  const cleanFlights = [...seen.values()].sort((a, b) => a[2] - b[2]);

  // only ship airports we actually use (some sources pad names with spaces or line breaks)
  for (const a of Object.values(airports)) {
    if (!a) continue;
    for (const k of ['name', 'city', 'countryName']) if (typeof a[k] === 'string') a[k] = a[k].replace(/\s+/g, ' ').trim();
  }
  const used = new Set([...hubCodes, ...cleanFlights.flatMap((f) => [f[0], f[1]])]);
  const shipAirports = Object.fromEntries([...used].filter((c) => airports[c]).map((c) => [c, airports[c]]));

  return {
    version: 2,
    live: true,
    generatedAt: new Date(now).toISOString(),
    range: { from: today, to: lastDay },
    requests: http.used(),
    hosts: Object.fromEntries(http.stats),
    sources,
    airports: shipAirports,
    flights: cleanFlights,
    timed: timed.sort((a, b) => a[2] - b[2]),
    ground: ground.filter((g) => g[2] >= startUtc).sort((a, b) => a[2] - b[2]),
    places,
    carRoutes,
    drive,
    fuel,
    deals,
    hostels,
    stays,
  };
}

if (process.argv[1]?.endsWith('src/fetch/snapshot.js')) {
  const out = arg('out', 'dist/snapshot.json');
  const snap = await buildSnapshot({ days: Number(arg('days', 60)), budget: Number(arg('budget', 6000)), minutes: Number(arg('minutes', 12)) });
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(snap));
  console.log(`\nsnapshot: ${snap.flights.length} flights, ${snap.ground.length} bus/train trips, ${snap.timed.length} airport buses, ${snap.requests} requests`);
  for (const s of snap.sources) console.log(`  ${s.ok ? '✓' : '✗'} ${s.id} ${s.ok ? JSON.stringify(s) : s.error}`);
  process.exit(snap.flights.length || snap.ground.length ? 0 : 2);
}
