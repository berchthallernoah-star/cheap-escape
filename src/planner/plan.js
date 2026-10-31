// THE PLANNER. Pure function: (fare snapshot, your query) -> ranked door-to-door trips.
// Runs in the phone page (instant re-planning) and in Node (CLI, alerts, tests).
//
// A trip = getting to the departure point (walk / bike / bike sharing / car / P+R / bus / train / Flixbus)
//        + the main ride out (flight, Flixbus or train)
//        + optional coach/train at the destination (fly into Stansted, home from Heathrow)
//        + the main ride back (to ANY home airport or Salzburg Hbf)
//        + getting home (back to your car or bike if you used one).
// Every step takes the cheapest way; the other ways are listed next to it.

import * as STATIC_HOME from '../data/home.js';
import * as STATIC_DEST from '../data/destinations.js';
import * as STATIC_GROUND from '../data/ground.js';
import { buildGraph, homeNodeId, haversineKm, bikeMinutes } from './graph.js';
import { parkingCost, fuelCost, round2, priceFare } from './pricing.js';
import { localToUtcMin, utcMinToLocal, addDays } from '../lib/time.js';

const EXIT = { flight: 25, bus: 5, train: 5 }; // arrive abroad -> outside
const CHECKIN = { flight: 90, bus: 15, train: 15 }; // be there before departing abroad
const BUS_STATION_BUFFER = 10;
const STATION = 'sbg-hbf';

export const DEFAULT_QUERY = {
  home: 'salzburg',
  travelers: [{ name: 'You', cards: [] }],
  car: true,
  bike: false,
  ground: true,
  bags: 'small',
  minStayHours: 20,
  maxTransferMin: 240,
  maxWalkMin: 30,
  timeValuePerHour: 4,
  limit: 40,
  perCity: 3,
  openJaw: true,
};

export const STATIC_DATA = { ...STATIC_HOME, ...STATIC_DEST, ...STATIC_GROUND, DEST: STATIC_DEST };

const indexCache = new WeakMap();

/** Indexes a snapshot once: rides by origin (sorted), timed access legs by pair, stay zones. */
export function indexSnapshot(snapshot, data = STATIC_DATA) {
  const cached = indexCache.get(snapshot);
  if (cached) return cached;
  const dest = data.DEST || STATIC_DEST;
  const places = { ...(snapshot.places || {}), ...(data.GROUND_CITIES || {}), ...(snapshot.airports || {}) };
  const byFrom = new Map();
  const push = (r) => { if (!byFrom.has(r.from)) byFrom.set(r.from, []); byFrom.get(r.from).push(r); };
  snapshot.flights.forEach((row, i) => {
    const [from, to, dep, arr, eur, carrier, number, via, src] = row;
    push({ uid: `f${i}`, mode: 'flight', from, to, dep, arr, eur, carrier, number, via: via || '', src: src || 'ryanair', live: snapshot.live !== false });
  });
  (snapshot.ground || []).forEach((row, i) => {
    const [from, to, dep, arr, eur, mode, operator, url] = row;
    push({ uid: `g${i}`, mode, from, to, dep, arr, eur, operator, url, live: snapshot.live !== false });
  });
  for (const list of byFrom.values()) list.sort((a, b) => a.dep - b.dep);

  const timed = new Map();
  for (const row of snapshot.timed || []) {
    const [a, b, dep, arr, eur, operator, url] = row;
    const key = `${a}>${b}`;
    if (!timed.has(key)) timed.set(key, []);
    timed.get(key).push({ a, b, dep, arr, eur, operator, url });
  }
  for (const list of timed.values()) list.sort((x, y) => x.dep - y.dep);

  const metroOf = new Map();
  for (const [metro, codes] of Object.entries(dest.METROS)) for (const c of codes) metroOf.set(c, metro);

  // Ground links between destination airports / city stations.
  const links = new Map();
  const addLink = (a, b, l) => {
    if (!links.has(a)) links.set(a, new Map());
    const m = links.get(a);
    const old = m.get(b);
    if (!old || l.eur + l.minutes / 30 < old.eur + old.minutes / 30) m.set(b, l);
  };
  for (const l of dest.GROUND_LINKS) {
    addLink(l.a, l.b, l);
    addLink(l.b, l.a, { ...l, a: l.b, b: l.a });
  }
  const codes = Object.keys(places);
  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      const a = places[codes[i]];
      const b = places[codes[j]];
      if (!a || !b || a.country !== b.country || a.lat == null || b.lat == null) continue;
      const km = haversineKm(a, b);
      if (km > dest.AUTO_LINK.maxKm) continue;
      const l = { minutes: dest.AUTO_LINK.minutes(km), eur: dest.AUTO_LINK.eur(km), operator: 'Bus / train (rough estimate)', est: true, rough: true, km: Math.round(km) };
      if (!links.get(codes[i])?.has(codes[j])) addLink(codes[i], codes[j], { ...l, a: codes[i], b: codes[j] });
      if (!links.get(codes[j])?.has(codes[i])) addLink(codes[j], codes[i], { ...l, a: codes[j], b: codes[i] });
    }
  }
  const idx = { byFrom, timed, links, metroOf, places };
  indexCache.set(snapshot, idx);
  return idx;
}

export function cityOf(code, idx) {
  return idx.metroOf.get(code) || idx.places[code]?.city || code;
}

function matchesDestination(code, filters, idx) {
  if (!filters || !filters.length) return true;
  const a = idx.places[code] || {};
  const city = cityOf(code, idx).toLowerCase();
  return filters.some((raw) => {
    const f = String(raw).trim().toLowerCase();
    return f === code.toLowerCase() || f === city || f === (a.country || '').toLowerCase()
      || f === (a.countryName || '').toLowerCase() || (a.city || '').toLowerCase() === f || (a.name || '').toLowerCase() === f;
  });
}

/** Typical-timetable trains (estimates) for the days the query covers. */
function estimatedTrains(data, fromDate, toDate) {
  const rows = [];
  const homeTz = 'Europe/Vienna';
  for (let d = fromDate; d <= toDate; d = addDays(d, 1)) {
    for (const r of data.TRAIN_ROUTES || []) {
      const city = data.GROUND_CITIES[r.to];
      for (const h of r.hours) {
        const hh = String(h).padStart(2, '0');
        const dep = localToUtcMin(`${d}T${hh}:00`, homeTz);
        rows.push({ uid: `e${r.to}${d}${hh}o`, mode: 'train', from: STATION, to: r.to, dep, arr: dep + r.minutes, fare: r.fare, est: true, approx: true, operator: r.operator, url: r.url });
        const bdep = localToUtcMin(`${d}T${hh}:00`, city.tz);
        rows.push({ uid: `e${r.to}${d}${hh}b`, mode: 'train', from: r.to, to: STATION, dep: bdep, arr: bdep + r.minutes, fare: r.fare, est: true, approx: true, operator: r.operator, url: r.url });
      }
    }
  }
  return rows;
}

/**
 * @param {object} snapshot  fare snapshot
 * @param {object} query     see DEFAULT_QUERY + leaveAfter/leaveBefore/backBy (local home time)
 * @param {object} [data]    override static data (tests)
 */
export function plan(snapshot, query, data = STATIC_DATA) {
  const q = { ...DEFAULT_QUERY, ...query };
  const home = data.HOMES[q.home];
  if (!home) throw new Error(`Unknown home "${q.home}"`);
  const tz = home.tz;
  const leaveAfter = localToUtcMin(q.leaveAfter, tz);
  const leaveBefore = localToUtcMin(q.leaveBefore, tz);
  const backBy = localToUtcMin(q.backBy, tz);
  const returnAfter = q.returnAfter ? localToUtcMin(q.returnAfter, tz) : -Infinity;
  const party = q.travelers.length ? q.travelers : DEFAULT_QUERY.travelers;
  const n = party.length;
  const bagFee = (data.BAGS[q.bags] || data.BAGS.small).perFlight;
  const car = { ...data.CAR_DEFAULTS, ...(snapshot.fuel?.eurPerLitre ? { fuelEurPerLitre: snapshot.fuel.eurPerLitre } : {}) };
  const idx = indexSnapshot(snapshot, data);
  const graph = buildGraph(data, q.home, party, q.timeValuePerHour, { maxWalkMin: q.maxWalkMin });
  const homeNode = homeNodeId(q.home);
  const minStay = q.minStayHours * 60;

  // departure points: airports + Salzburg Hbf (for bus/train-only trips)
  const H = { ...data.HUBS };
  if (q.ground && data.NODES[STATION]) H[STATION] = { name: 'Salzburg Hbf', tz: 'Europe/Vienna', lat: data.NODES[STATION].lat, lon: data.NODES[STATION].lon, checkinMin: 10, exitMin: 5 };
  const hubs = Object.keys(H).filter((h) => !q.hubs || q.hubs.includes(h) || h === STATION);
  const hubSet = new Set(Object.keys(H));

  // rides by origin for this query (snapshot + estimated train timetables)
  const byFrom = new Map(idx.byFrom);
  if (q.ground && data.TRAIN_ROUTES) {
    const extra = estimatedTrains(data, addDays(q.leaveAfter.slice(0, 10), -1), q.backBy.slice(0, 10));
    for (const r of extra) byFrom.set(r.from, [...(byFrom.get(r.from) || []), r]);
    for (const k of new Set(extra.map((r) => r.from))) byFrom.get(k).sort((a, b) => a.dep - b.dep);
  }
  if (!q.ground) for (const [k, list] of byFrom) byFrom.set(k, list.filter((r) => r.mode === 'flight'));

  const fareCache = new Map();
  function rideEur(r) {
    if (r.mode === 'flight') return round2((r.eur + bagFee) * n);
    if (r.fare) {
      if (!fareCache.has(r.fare)) fareCache.set(r.fare, priceFare(r.fare, party));
      return fareCache.get(r.fare).eur;
    }
    return round2(r.eur * n);
  }

  // ---------------------------------------------------------------- anchors: where your car / bike waits (or none)
  const nodeName = (id) => (id === homeNode ? 'Home' : data.NODES[id]?.name || id);
  const anchors = [{ id: 'public', vehicle: null, start: homeNode, driveMin: 0, km: 0, walkMin: 0, park: null }];
  if (q.car) {
    for (const [id, cp] of Object.entries(data.CARPARKS)) {
      const d = snapshot.drive?.[q.home]?.[id] || home.drive?.[id];
      if (!d) continue;
      anchors.push({ id, vehicle: 'car', start: cp.node, driveMin: d.min, km: d.km, walkMin: cp.walkMin, park: cp });
    }
  }
  if (q.bike && data.MICRO) {
    for (const node of [STATION, 'freilassing', 'SZG', 'pr-sued', 'pr-messe']) {
      const p = data.NODES[node];
      if (!p) continue;
      const km = haversineKm(home, p);
      if (km > data.MICRO.maxBikeKm) continue;
      anchors.push({ id: `bike@${node}`, vehicle: 'bike', start: node, driveMin: bikeMinutes(km, data.MICRO), km: Math.round(km * 10) / 10, walkMin: 2,
        park: { name: `Bike parking at ${nodeName(node)}`, tariff: { perDay: 0 }, node } });
    }
  }
  const vehicleCost = (a) => (a.vehicle === 'car' ? fuelCost(a.km, car) : 0);
  const anchorById = new Map(anchors.map((a) => [a.id, a]));

  function staticLegs(p, startUtc) {
    let t = startUtc;
    return p.steps.map((s) => {
      const mode = s.edge.mode || 'bus';
      const alts = graph.alternatives(s.from, s.to).filter((x) => !(x.mode === mode && x.operator === s.edge.operator)).slice(0, 4);
      const leg = {
        kind: mode, from: nodeName(s.from), to: nodeName(s.to),
        dep: t, arr: t + s.minutes, approxTime: true, minutes: s.minutes, eur: s.eur, est: !!s.edge.est,
        operator: s.edge.operator, note: [s.edge.note, ...(s.notes || [])].filter(Boolean).join(' · ') || undefined,
        free: s.free, url: s.edge.src, alts, km: s.edge.km,
        maps: { from: graph.places[s.from], to: graph.places[s.to], mode: mode === 'walk' ? 'walking' : mode === 'bikeshare' ? 'bicycling' : 'transit' },
      };
      t += s.minutes;
      return leg;
    });
  }

  function vehicleLeg(a, fromLabel, toLabel, dep, outbound) {
    const isCar = a.vehicle === 'car';
    const startPlace = data.NODES[a.start];
    return { kind: isCar ? 'drive' : 'bike', from: fromLabel, to: toLabel, dep, arr: dep + a.driveMin, approxTime: true, minutes: a.driveMin,
      eur: vehicleCost(a), est: isCar, km: a.km, operator: isCar ? 'Your car' : 'Your bike',
      note: isCar ? `${a.km} km · fuel ≈ ${car.litresPer100km} l/100 km × €${car.fuelEurPerLitre.toFixed(2)}` : `${a.km} km`,
      maps: { from: outbound ? home : startPlace, to: outbound ? startPlace : home, mode: isCar ? 'driving' : 'bicycling' } };
  }

  // ---------------------------------------------------------------- outbound: home -> departure point in time for `dep`
  const outCache = new Map();
  function bestOut(hub, dep) {
    const key = `${hub}|${dep}`;
    if (outCache.has(key)) return outCache.get(key);
    const mustArrive = dep - H[hub].checkinMin;
    const res = new Map();
    for (const a of anchors) {
      const pre = a.driveMin + a.walkMin;
      const vc = vehicleCost(a);
      let best = null;
      const consider = (opt) => { if (!best || opt.eur < best.eur - 0.01 || (Math.abs(opt.eur - best.eur) < 0.01 && opt.leave > best.leave)) best = opt; };
      const p = graph.path(a.start, hub);
      if (p) {
        const leave = mustArrive - p.minutes - pre;
        if (leave >= leaveAfter && leave <= leaveBefore) consider({ eur: p.eur + vc, leave, parkStart: leave + a.driveMin, p, timed: null });
      }
      for (const [k, list] of idx.timed) {
        if (!k.endsWith(`>${hub}`)) continue;
        const via = k.slice(0, k.indexOf('>'));
        const p1 = graph.path(a.start, via);
        if (!p1) continue;
        for (const b of list) {
          if (b.arr > mustArrive) break;
          const leave = b.dep - BUS_STATION_BUFFER - p1.minutes - pre;
          if (leave < leaveAfter || leave > leaveBefore) continue;
          consider({ eur: p1.eur + b.eur * n + vc, leave, parkStart: leave + a.driveMin, p: p1, timed: b });
        }
      }
      if (best) res.set(a.id, best);
    }
    outCache.set(key, res);
    return res;
  }

  // ---------------------------------------------------------------- return: hub -> home (or -> your car/bike -> home)
  const backCache = new Map();
  function bestBack(hub, arr) {
    const key = `${hub}|${arr}`;
    if (backCache.has(key)) return backCache.get(key);
    const ready = arr + H[hub].exitMin;
    const res = new Map();
    for (const a of anchors) {
      const post = a.walkMin + a.driveMin;
      const vc = vehicleCost(a);
      let best = null;
      const consider = (opt) => { if (!best || opt.eur < best.eur - 0.01 || (Math.abs(opt.eur - best.eur) < 0.01 && opt.home < best.home)) best = opt; };
      const p = graph.path(hub, a.start);
      if (p) {
        const homeAt = ready + p.minutes + post;
        if (homeAt <= backBy) consider({ eur: p.eur + vc, home: homeAt, parkEnd: ready + p.minutes + a.walkMin, p, timed: null, ready });
      }
      for (const [k, list] of idx.timed) {
        if (!k.startsWith(`${hub}>`)) continue;
        const via = k.slice(k.indexOf('>') + 1);
        const p2 = graph.path(via, a.start);
        if (!p2) continue;
        for (const b of list) {
          if (b.dep < ready + BUS_STATION_BUFFER) continue;
          const homeAt = b.arr + p2.minutes + post;
          if (homeAt > backBy) break;
          consider({ eur: b.eur * n + p2.eur + vc, home: homeAt, parkEnd: b.arr + p2.minutes + a.walkMin, p: p2, timed: b, ready });
        }
      }
      if (best) res.set(a.id, best);
    }
    backCache.set(key, res);
    return res;
  }

  // ---------------------------------------------------------------- stay zone: where you can start the way home from
  function zone(code) {
    const z = [{ R: code, link: null, minutes: 0, eur: 0 }];
    if (!q.openJaw) return z;
    for (const [R, l] of idx.links.get(code) || []) {
      if (l.minutes <= q.maxTransferMin) z.push({ R, link: l, minutes: l.minutes, eur: l.eur });
    }
    return z;
  }

  // ---------------------------------------------------------------- combine (branch & bound per city)
  // Out rides are tried cheapest-first; per city and main mode we keep the best K trips and skip
  // anything whose lower bound cannot beat them. Long date ranges stay fast this way.
  const K = Math.max(12, q.perCity * 4);
  const top = new Map(); // `${city}|${mode}` -> ascending totals
  const kth = (key) => { const a = top.get(key); return a && a.length >= K ? a[K - 1] : Infinity; };
  const record = (key, total) => {
    const a = top.get(key) || [];
    let i = a.length;
    while (i > 0 && a[i - 1] > total) i--;
    a.splice(i, 0, total);
    if (a.length > K) a.pop();
    top.set(key, a);
  };
  const retCache = new Map();
  function returnsFrom(code) {
    if (retCache.has(code)) return retCache.get(code);
    const list = (byFrom.get(code) || [])
      .filter((r) => hubSet.has(r.to) && (!q.hubs || q.hubs.includes(r.to) || r.to === STATION) && r.dep <= backBy && r.dep >= returnAfter && r.dep >= leaveAfter)
      .map((r) => ({ r, eur: rideEur(r) }))
      .sort((a, b) => a.eur - b.eur);
    retCache.set(code, list);
    return list;
  }

  const outs = [];
  for (const hub of hubs) {
    for (const f of byFrom.get(hub) || []) {
      if (hubSet.has(f.to)) continue;
      if (f.dep < leaveAfter || f.dep > leaveBefore + 10 * 60) continue;
      if (!matchesDestination(f.to, q.destinations, idx)) continue;
      const o = bestOut(hub, f.dep);
      if (!o.size) continue;
      let minOut = Infinity;
      for (const v of o.values()) minOut = Math.min(minOut, v.eur);
      const fEur = rideEur(f);
      outs.push({ f, outs: o, fEur, lb: fEur + minOut, city: cityOf(f.to, idx) });
    }
  }
  outs.sort((a, b) => a.lb - b.lb);

  const best = new Map(); // `${out}|${back}|${vehicle}` -> candidate
  let combos = 0;
  for (const { f, outs: os, fEur, lb, city } of outs) {
    const boundKey = `${city}|${f.mode}`;
    if (lb >= kth(boundKey)) continue;
    for (const z of zone(f.to)) {
      const zEur = z.eur * n;
      if (lb + zEur >= kth(boundKey)) continue;
      const readyAt = f.arr + (EXIT[f.mode] ?? 25) + z.minutes;
      for (const { r, eur: rEur } of returnsFrom(z.R)) {
        if (lb + zEur + rEur >= kth(boundKey)) break;
        const stay = r.dep - (CHECKIN[r.mode] ?? 90) - readyAt;
        if (stay < minStay) continue;
        const backs = bestBack(r.to, r.arr);
        if (!backs.size) continue;
        for (const [aid, o] of os) {
          const b = backs.get(aid);
          if (!b) continue;
          combos++;
          const a = anchorById.get(aid);
          const parking = a.park ? parkingCost(a.park.tariff, b.parkEnd - o.parkStart) : 0;
          const toll = a.park?.toll?.eur || 0;
          const total = round2(o.eur + b.eur + parking + toll + fEur + rEur + zEur);
          if (q.maxPrice && total > q.maxPrice) continue;
          const key = `${f.uid}|${r.uid}|${a.vehicle || 'public'}`;
          const old = best.get(key);
          if (!old) record(boundKey, total);
          if (!old || total < old.total) best.set(key, { total, f, r, z, a, o, b, parking, toll, stay, fEur, rEur });
        }
      }
    }
  }

  // ---------------------------------------------------------------- driving the whole way (flexible times)
  const carTrips = [];
  if (q.car && q.ground && data.CAR_ROUTES) {
    // curated routes (better toll/parking numbers) + every discovered city with a live road distance
    const routes = new Map(Object.entries(data.CAR_ROUTES).map(([k, v]) => [k, { ...v }]));
    for (const [key, r] of Object.entries(snapshot.carRoutes || {})) {
      const cur = routes.get(key);
      if (cur) { cur.km = r.km; cur.min = r.min; continue; }
      const p = idx.places[key];
      if (!p) continue;
      routes.set(key, { km: r.km, min: r.min, tolls: STATIC_GROUND.estimateCarTolls(p.country, r.km), parkPerDay: STATIC_GROUND.DEFAULT_CITY_PARKING,
        note: 'tolls and parking roughly estimated', rough: true });
    }
    for (const [key, cr] of routes) {
      if (!matchesDestination(key, q.destinations, idx)) continue;
      const leave = leaveAfter;
      const arrive = leave + cr.min;
      const backLeave = backBy - cr.min;
      const stay = backLeave - arrive;
      if (stay < minStay) continue;
      const parkDays = Math.max(1, Math.ceil(stay / 1440));
      const fuel = fuelCost(cr.km, car);
      const parkingEur = round2(parkDays * cr.parkPerDay);
      const total = round2(2 * fuel + cr.tolls + parkingEur);
      if (q.maxPrice && total > q.maxPrice) continue;
      carTrips.push({ key, cr, leave, arrive, backLeave, stay, fuel, parkingEur, parkDays, total });
    }
  }

  // ---------------------------------------------------------------- rank, compare modes, diversify, explain
  const pairs = new Map();
  for (const c of best.values()) {
    const k = `${c.f.uid}|${c.r.uid}`;
    const p = pairs.get(k);
    if (!p) pairs.set(k, { main: c, others: [] });
    else if (c.total < p.main.total) { p.others.push(p.main); p.main = c; } else p.others.push(c);
  }
  const mainMode = (c) => (c.f.mode === c.r.mode ? c.f.mode : 'mixed');
  const byCityMode = new Map();
  for (const { main } of pairs.values()) {
    const city = cityOf(main.f.to, idx);
    if (!byCityMode.has(city)) byCityMode.set(city, {});
    const m = byCityMode.get(city);
    const mode = mainMode(main);
    if (m[mode] == null || main.total < m[mode]) m[mode] = main.total;
  }
  for (const c of carTrips) {
    const city = cityOf(c.key, idx);
    if (!byCityMode.has(city)) byCityMode.set(city, {});
    const m = byCityMode.get(city);
    if (m.car == null || c.total < m.car) m.car = c.total;
  }
  const sorted = [...pairs.values()].map((p) => ({ ...p.main, others: p.others }))
    .concat(carTrips.map((c) => ({ ...c, carOnly: true, f: { to: c.key } })))
    .sort((x, y) => x.total - y.total || y.stay - x.stay);
  // variety per city: the same flight out again only with a different way home (other airport / other home airport)
  const perCity = new Map();
  const picked = [];
  for (const c of sorted) {
    const city = cityOf(c.f.to, idx);
    const got = perCity.get(city) || [];
    if (got.length >= q.perCity) continue;
    if (!c.carOnly && got.some((x) => !x.carOnly && (x.r.uid === c.r.uid || (x.f.uid === c.f.uid && x.z.R === c.z.R && x.r.to === c.r.to)))) continue;
    if (c.carOnly && got.some((x) => x.carOnly)) continue;
    got.push(c);
    perCity.set(city, got);
    picked.push(c);
    if (picked.length >= q.limit) break;
  }

  const trips = picked.map((c) => (c.carOnly ? explainCar(c) : explain(c)));
  return { trips, stats: { combos, outs: outs.length, candidates: pairs.size, anchors: anchors.length, rides: [...byFrom.values()].reduce((s, l) => s + l.length, 0) } };

  // ----------------------------------------------------------------
  function placeName(code) {
    if (H[code]) return code === STATION ? H[code].name : `${H[code].name} (${code})`;
    const p = idx.places[code] || {};
    return code.startsWith('C:') ? p.name || code.slice(2) : `${p.name || code} (${code})`;
  }

  function cityLabel(code) {
    if (code === STATION) return 'Salzburg';
    return cityOf(code, idx);
  }

  function rideLeg(r, eur) {
    const tzFrom = H[r.from]?.tz || idx.places[r.from]?.tz;
    const tzTo = H[r.to]?.tz || idx.places[r.to]?.tz;
    const dateLocal = utcMinToLocal(r.dep, tzFrom || 'UTC').date;
    if (r.mode === 'flight') {
      const stops = r.via ? r.via.split(',').filter(Boolean) : [];
      const multi = String(r.carrier || '').includes('+');
      const notes = [];
      if (stops.length) notes.push(`${stops.length} stop${stops.length > 1 ? 's' : ''} via ${stops.join(', ')}`);
      if (stops.length && (multi || r.src === 'kiwi')) notes.push('self-transfer: separate tickets, collect bags and check in again, missed connections are at your risk unless booked with Kiwi.com Guarantee');
      notes.push(bagFee ? `incl. ≈ €${bagFee} bag per person` : 'small under-seat bag included');
      return { kind: 'flight', from: placeName(r.from), to: placeName(r.to), fromCode: r.from, toCode: r.to, dep: r.dep, arr: r.arr, tzFrom, tzTo,
        minutes: r.arr - r.dep, eur, live: r.live, operator: String(r.carrier || '').split('+').map(carrierName).join(' + '), number: r.number,
        stops: stops.length, via: stops, bookWith: r.src === 'kiwi' ? 'Kiwi.com' : r.src === 'wizz' ? 'Wizz Air' : 'Ryanair', approxArr: r.src === 'wizz',
        url: r.src === 'kiwi' ? kiwiUrl(r.from, r.to, dateLocal, n) : r.src === 'wizz' ? wizzUrl(r.from, r.to, dateLocal, n) : bookingUrl(r, n, dateLocal),
        note: [...notes, ...(r.src === 'wizz' ? ['arrival time estimated (Wizz only publishes departures)'] : [])].join(' · ') };
    }
    // other buses/trains on the same route within ±4 h: cheapest per operator
    const others = new Map();
    for (const x of byFrom.get(r.from) || []) {
      if (x.to !== r.to || x.uid === r.uid || Math.abs(x.dep - r.dep) > 240) continue;
      const k = `${x.mode}|${x.operator}`;
      const e = rideEur(x);
      if (!others.has(k) || e < others.get(k).eur) others.set(k, { mode: x.mode, operator: x.operator, eur: e, minutes: x.arr - x.dep, est: !!x.est, dep: x.dep });
    }
    const priced = r.fare ? priceFare(r.fare, party) : null;
    return { kind: r.mode, from: placeName(r.from), to: placeName(r.to), fromCode: r.from, toCode: r.to, dep: r.dep, arr: r.arr, tzFrom, tzTo, approxTime: !!r.approx,
      minutes: r.arr - r.dep, eur, live: !!r.live && !r.est, est: !!r.est, operator: r.operator, url: r.url, free: priced?.free,
      note: r.est ? 'typical timetable and price, check exact times' : undefined,
      rideshare: STATIC_GROUND.blablacarUrl(cityLabel(r.from), cityLabel(r.to), dateLocal, n),
      alts: [...others.values()].sort((a, b) => a.eur - b.eur).slice(0, 4) };
  }

  function explainCar(c) {
    const p = idx.places[c.key] || {};
    const city = cityOf(c.key, idx);
    const maps = (from, to) => ({ from, to, mode: 'driving' });
    const legs = [
      { kind: 'drive', from: 'Home', to: p.name || city, dep: c.leave, arr: c.arrive, approxTime: true, minutes: c.cr.min, eur: c.fuel, est: true, km: c.cr.km,
        operator: 'Your car', note: `${c.cr.km} km · fuel ≈ ${car.litresPer100km} l/100 km × €${car.fuelEurPerLitre.toFixed(2)}`, maps: maps(home, p) },
      { kind: 'park', from: `Parking in ${city}`, to: '', dep: c.arrive, arr: c.arrive, approxTime: true, minutes: 0, eur: c.parkingEur, est: true,
        operator: 'Parking', note: [c.cr.note && !/toll|vignette/i.test(c.cr.note) ? c.cr.note : null, `≈ €${c.cr.parkPerDay}/day × ${c.parkDays}`].filter(Boolean).join(' · ') },
    ];
    if (c.cr.tolls) legs.push({ kind: 'toll', from: '', to: '', eur: c.cr.tolls, est: true, minutes: 0, note: c.cr.note || 'Tolls / vignettes' });
    legs.push({ kind: 'drive', from: p.name || city, to: 'Home', dep: c.backLeave, arr: backBy, approxTime: true, minutes: c.cr.min, eur: c.fuel, est: true, km: c.cr.km,
      operator: 'Your car', note: `${c.cr.km} km`, maps: maps(p, home) });
    return {
      id: `car-${c.key}`, total: c.total, perPerson: round2(c.total / n), travelers: n, mode: 'car', vehicle: 'car', city,
      country: p.countryName || '', countryCode: p.country || '',
      out: { hub: 'home', place: c.key, dep: c.leave, mode: 'car' }, back: { hub: 'home', place: c.key, dep: c.backLeave, mode: 'car' },
      leaveHome: c.leave, backHome: backBy, stayHours: Math.round((c.stay / 60) * 10) / 10, estimatedShare: 1,
      byMode: byCityMode.get(city) || {}, tags: ['by car', 'leave and return whenever you like'], alts: [], alt: null, legs,
    };
  }

  function explain(c) {
    const { f, r, z, a, o, b } = c;
    const legs = [];
    let t = o.leave;
    if (a.vehicle) {
      legs.push(vehicleLeg(a, 'Home', a.park.name, t, true));
      t += a.driveMin;
      if (a.vehicle === 'car') {
        legs.push({ kind: 'park', from: a.park.name, to: a.park.name, dep: t, arr: t + a.walkMin, approxTime: true, minutes: a.walkMin,
          eur: c.parking, est: !!a.park.est, note: [a.park.note, `parked ≈ ${Math.ceil((b.parkEnd - o.parkStart) / 1440)} day(s)`].filter(Boolean).join(' · '),
          url: a.park.src, operator: 'Parking' });
        if (a.park.toll) legs.push({ kind: 'toll', from: '', to: '', eur: a.park.toll.eur, est: true, note: a.park.toll.note, minutes: 0 });
      }
      t += a.walkMin;
    }
    legs.push(...staticLegs(o.p, t));
    if (o.timed) {
      const bt = o.timed;
      legs.push({ kind: 'bus', from: nodeName(bt.a), to: nodeName(bt.b), dep: bt.dep, arr: bt.arr, minutes: bt.arr - bt.dep, eur: round2(bt.eur * n),
        live: true, operator: bt.operator, url: bt.url, alts: graph.alternatives(bt.a, bt.b).slice(0, 3) });
    }
    legs.push(rideLeg(f, c.fEur));
    if (z.link) {
      const start = f.arr + (EXIT[f.mode] ?? 25);
      legs.push({ kind: 'transfer', from: placeName(f.to), to: placeName(z.R), minutes: z.minutes, eur: round2(z.eur * n), est: true, rough: !!z.link.rough,
        operator: z.link.operator, url: z.link.url, note: 'Any time during your stay', dep: start, arr: start + z.minutes, approxTime: true,
        tz: idx.places[f.to]?.tz, maps: { from: idx.places[f.to], to: idx.places[z.R], mode: 'transit' },
        rideshare: STATIC_GROUND.blablacarUrl(cityLabel(f.to), cityLabel(z.R), utcMinToLocal(start, idx.places[f.to]?.tz || 'UTC').date, n) });
    }
    legs.push(rideLeg(r, c.rEur));
    let tb = b.ready;
    if (b.timed) {
      const bt = b.timed;
      legs.push({ kind: 'bus', from: nodeName(bt.a), to: nodeName(bt.b), dep: bt.dep, arr: bt.arr, minutes: bt.arr - bt.dep, eur: round2(bt.eur * n),
        live: true, operator: bt.operator, url: bt.url, alts: graph.alternatives(bt.a, bt.b).slice(0, 3) });
      tb = bt.arr;
    }
    legs.push(...staticLegs(b.p, tb));
    if (a.vehicle) legs.push(vehicleLeg(a, a.park.name, 'Home', b.home - a.driveMin, false));

    const estEur = legs.filter((l) => l.est).reduce((s, l) => s + (l.eur || 0), 0);
    const dest = cityOf(f.to, idx);
    const mode = mainMode(c);
    const tags = [];
    tags.push(mode === 'flight' ? 'by plane' : mode === 'bus' ? 'by bus' : mode === 'train' ? 'by train' : `${f.mode === 'flight' ? 'plane' : f.mode} out, ${r.mode === 'flight' ? 'plane' : r.mode} back`);
    if (z.R !== f.to) tags.push(cityOf(z.R, idx) === dest ? 'different airport back' : `home from ${cityOf(z.R, idx)}`);
    if (r.to !== f.from && r.mode === 'flight' && f.mode === 'flight') tags.push(`land in ${H[r.to].name}`);
    tags.push(a.vehicle === 'car' ? 'car' : a.vehicle === 'bike' ? 'bike' : 'no car');
    if (o.timed || b.timed || f.operator === 'Flixbus' || r.operator === 'Flixbus') tags.push('Flixbus');
    if (legs.some((l) => l.kind === 'walk' && l.minutes >= 20)) tags.push('some walking');
    const othersByVehicle = new Map();
    for (const x of c.others || []) {
      const k = x.a.vehicle || 'public';
      if (!othersByVehicle.has(k) || x.total < othersByVehicle.get(k).total) othersByVehicle.set(k, x);
    }
    const alts = [...othersByVehicle.entries()].map(([k, x]) => ({ vehicle: k, car: k === 'car', total: x.total, via: x.a.park?.name || 'public transport' })).sort((x, y) => x.total - y.total);
    const p0 = idx.places[f.to] || {};
    return {
      id: `${f.uid}-${r.uid}-${a.id}`,
      total: c.total,
      perPerson: round2(c.total / n),
      travelers: n,
      mode,
      vehicle: a.vehicle || 'public',
      city: dest,
      country: p0.countryName || p0.country || '',
      countryCode: p0.country || '',
      out: { hub: f.from, place: f.to, dep: f.dep, mode: f.mode },
      back: { hub: r.to, place: z.R, dep: r.dep, mode: r.mode },
      leaveHome: o.leave,
      backHome: b.home,
      stayHours: Math.round((c.stay / 60) * 10) / 10,
      estimatedShare: c.total ? round2(estEur / c.total) : 0,
      byMode: byCityMode.get(dest) || {},
      tags,
      alts,
      alt: alts[0] || null,
      legs,
    };
  }
}

const CARRIERS = { FR: 'Ryanair', RK: 'Ryanair UK', AL: 'Malta Air', OE: 'Lauda', RR: 'Buzz', W6: 'Wizz Air', W4: 'Wizz Air Malta', W9: 'Wizz Air UK', W2: 'Wizz Air', U2: 'easyJet',
  EC: 'easyJet Europe', DS: 'easyJet Switzerland', EW: 'Eurowings', LH: 'Lufthansa', OS: 'Austrian', LX: 'Swiss', LS: 'Jet2', BA: 'British Airways', VY: 'Vueling', HV: 'Transavia',
  TO: 'Transavia France', V7: 'Volotea', DY: 'Norwegian', D8: 'Norwegian', BT: 'airBaltic', PC: 'Pegasus', TK: 'Turkish Airlines', JU: 'Air Serbia', AZ: 'ITA Airways',
  IB: 'Iberia', AF: 'Air France', KL: 'KLM', SK: 'SAS', AY: 'Finnair', LO: 'LOT', OK: 'Czech Airlines', A3: 'Aegean', DE: 'Condor', X3: 'TUIfly', '4U': 'Eurowings',
  EI: 'Aer Lingus', TP: 'TAP', FB: 'Bulgaria Air', RO: 'TAROM', '0B': 'Blue Air', XQ: 'SunExpress', W8: 'Wizz Air', FZ: 'flydubai', SN: 'Brussels Airlines' };
export function carrierName(code) {
  return CARRIERS[code] || code || 'Airline';
}

export function wizzUrl(from, to, dateLocal, adults) {
  return `https://wizzair.com/en-gb/booking/select-flight/${from}/${to}/${dateLocal}/null/${adults}/0/0/null`;
}

export function kiwiUrl(from, to, dateLocal, adults) {
  return `https://www.kiwi.com/en/search/results/${from}/${to}/${dateLocal}/no-return?adults=${adults}`;
}

export function bookingUrl(f, adults, dateLocal) {
  if (['FR', 'RK', 'AL', 'OE', undefined, null, ''].includes(f.carrier)) {
    return `https://www.ryanair.com/de/de/trip/flights/select?adults=${adults}&teens=0&children=0&infants=0&dateOut=${dateLocal}&isConnectedFlight=false&isReturn=false&discount=0&originIata=${f.from}&destinationIata=${f.to}`;
  }
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(`one way flight ${f.from} to ${f.to} on ${dateLocal}`)}`;
}

/** Weekend windows starting from `fromDate` (YYYY-MM-DD). */
export function weekendWindows(fromDate, count, opts = {}) {
  const o = { leaveDow: 5, leaveTime: '14:00', leaveUntilDays: 1, leaveUntilTime: '14:00', backDays: 3, backTime: '01:00', ...opts };
  const out = [];
  const d = new Date(`${fromDate}T12:00:00Z`);
  while (d.getUTCDay() !== o.leaveDow) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < count; i++) {
    const day = d.toISOString().slice(0, 10);
    const until = new Date(d); until.setUTCDate(until.getUTCDate() + o.leaveUntilDays);
    const back = new Date(d); back.setUTCDate(back.getUTCDate() + o.backDays);
    out.push({
      label: day,
      leaveAfter: `${day}T${o.leaveTime}`,
      leaveBefore: `${until.toISOString().slice(0, 10)}T${o.leaveUntilTime}`,
      backBy: `${back.toISOString().slice(0, 10)}T${o.backTime}`,
    });
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}
