// The public-transport network on the home side (home, Salzburg Hbf, Freilassing,
// P+R lots, the airports). Edges: buses and trains with typical times, plus
// walking and bike sharing computed from coordinates. For a given group every
// edge gets a real price (cards applied); Dijkstra finds the best path.

import { priceFare } from './pricing.js';

export function homeNodeId(homeId) {
  return `home:${homeId}`;
}

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function walkMinutes(km, micro) {
  return Math.round(((km * micro.detour) / micro.walkKmh) * 60);
}
export function bikeMinutes(km, micro) {
  return Math.round(((km * micro.detour) / micro.bikeKmh) * 60);
}

/** Micro-mobility edges (walk + bike sharing) between all pairs of places. */
function microEdges(places, micro, bikeShare) {
  const out = [];
  const ids = Object.keys(places);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = places[ids[i]];
      const b = places[ids[j]];
      if (a?.lat == null || b?.lat == null) continue;
      const km = haversineKm(a, b);
      const walk = walkMinutes(km, micro);
      if (walk <= micro.maxWalkShownMin) {
        out.push({ a: ids[i], b: ids[j], minutes: Math.max(1, walk), mode: 'walk', operator: 'On foot', fare: [], km: Math.round(km * 10) / 10, walk: true });
      }
      for (const s of bikeShare || []) {
        if (haversineKm(a, s.center) > s.radiusKm || haversineKm(b, s.center) > s.radiusKm) continue;
        const ride = bikeMinutes(km, micro) + 5;
        const eur = s.per30min ? Math.ceil(ride / 30) * s.per30min : (s.unlock || 0) + (s.perMin || 0) * ride;
        out.push({ a: ids[i], b: ids[j], minutes: ride, mode: 'bikeshare', operator: s.label, fare: [{ eur: Math.round(eur * 100) / 100 }],
          est: true, note: s.note, src: s.url, km: Math.round(km * 10) / 10 });
      }
    }
  }
  return out;
}

/**
 * @param {object} data      static data (TRANSIT, HOMES, NODES, MICRO, BIKE_SHARE)
 * @param {string} homeId
 * @param {{name:string,cards:string[]}[]} travelers
 * @param {number} timeValuePerHour  € per hour, only to break ties between slow-cheap and fast paths
 * @param {{ maxWalkMin?: number }} [opts]
 */
export function buildGraph(data, homeId, travelers, timeValuePerHour, opts = {}) {
  const home = data.HOMES[homeId];
  const homeNode = homeNodeId(homeId);
  const maxWalkMin = opts.maxWalkMin ?? 30;
  const places = { ...data.NODES, [homeNode]: home };
  /** all edges incl. long walks (for alternatives) */
  const all = new Map();
  /** edges the router may use */
  const adj = new Map();
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  const add = (a, b, edge) => {
    const priced = priceFare(edge.fare, travelers);
    const item = { edge, eur: priced.eur, free: priced.free, notes: priced.notes, minutes: edge.minutes };
    const k = key(a, b);
    if (!all.has(k)) all.set(k, []);
    all.get(k).push(item);
    if (edge.walk && edge.minutes > maxWalkMin) return;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push({ to: b, ...item });
    adj.get(b).push({ to: a, ...item });
  };
  for (const e of data.TRANSIT) add(e.a, e.b, e);
  for (const e of home.transit || []) add(homeNode, e.to, { ...e, a: homeNode, b: e.to });
  if (data.MICRO) for (const e of microEdges(places, data.MICRO, data.BIKE_SHARE)) add(e.a, e.b, e);

  const perMin = timeValuePerHour / 60;
  const trees = new Map();

  function tree(src) {
    if (trees.has(src)) return trees.get(src);
    const best = new Map([[src, { w: 0, eur: 0, minutes: 0, prev: null, via: null }]]);
    const done = new Set();
    for (;;) {
      let cur = null;
      let curW = Infinity;
      for (const [k, v] of best) if (!done.has(k) && v.w < curW) { cur = k; curW = v.w; }
      if (cur === null) break;
      done.add(cur);
      const base = best.get(cur);
      for (const nb of adj.get(cur) || []) {
        const w = base.w + nb.eur + nb.minutes * perMin;
        const old = best.get(nb.to);
        if (!old || w < old.w - 1e-9) {
          best.set(nb.to, { w, eur: base.eur + nb.eur, minutes: base.minutes + nb.minutes, prev: cur, via: nb });
        }
      }
    }
    trees.set(src, best);
    return best;
  }

  /** Best path src -> dst. Returns null if unreachable. Graph is symmetric. */
  function path(src, dst) {
    if (src === dst) return { eur: 0, minutes: 0, steps: [] };
    const t = tree(src);
    const end = t.get(dst);
    if (!end) return null;
    const steps = [];
    let k = dst;
    while (k !== src) {
      const node = t.get(k);
      steps.push({ from: node.prev, to: k, ...node.via });
      k = node.prev;
    }
    steps.reverse();
    return { eur: Math.round(end.eur * 100) / 100, minutes: end.minutes, steps };
  }

  /** Every direct way between two places (incl. walks up to 4 h), cheapest first. */
  function alternatives(a, b) {
    return (all.get(key(a, b)) || [])
      .map((x) => ({ mode: x.edge.mode, operator: x.edge.operator, minutes: x.minutes, eur: x.eur, free: x.free, est: !!x.edge.est, note: x.edge.note }))
      .sort((x, y) => x.eur - y.eur || x.minutes - y.minutes);
  }

  return { homeNode, path, alternatives, places };
}
