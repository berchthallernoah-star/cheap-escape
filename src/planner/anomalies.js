// "Too cheap to be true?" — fares far below what the same route normally costs.
// Compares every fare with the median of all fares on that route in the snapshot
// (45 days of prices). A real price mistake is usually 70–95 % below normal.

import { haversineKm } from './graph.js';

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * @returns {{ from, to, dep, arr, eur, normal, ratio, savePct, km, level: 'mistake'|'unusual', carrier, via, src }[]}
 */
export function findAnomalies(snapshot, { limit = 25, minSamples = 5, minNormal = 35 } = {}) {
  const byRoute = new Map();
  for (const row of snapshot.flights || []) {
    const [from, to, dep, arr, eur, carrier, number, via, src] = row;
    if (via) continue; // compare direct flights with direct flights only
    const k = `${from}>${to}`;
    if (!byRoute.has(k)) byRoute.set(k, []);
    byRoute.get(k).push({ from, to, dep, arr, eur, carrier, number, via: via || '', src: src || 'ryanair' });
  }
  const ap = snapshot.airports || {};
  const out = [];
  for (const list of byRoute.values()) {
    if (list.length < minSamples) continue;
    const normal = median(list.map((x) => x.eur));
    if (normal < minNormal) continue;
    for (const x of list) {
      const ratio = x.eur / normal;
      if (ratio > 0.4 || normal - x.eur < 30) continue;
      const a = ap[x.from];
      const b = ap[x.to];
      const km = a?.lat != null && b?.lat != null ? Math.round(haversineKm(a, b)) : null;
      out.push({ ...x, normal: Math.round(normal), ratio: Math.round(ratio * 100) / 100, savePct: Math.round((1 - ratio) * 100), km, level: ratio <= 0.2 ? 'mistake' : 'unusual' });
    }
  }
  // one entry per route (its cheapest), strongest anomalies first
  const best = new Map();
  for (const x of out.sort((p, q) => p.ratio - q.ratio || p.eur - q.eur)) if (!best.has(`${x.from}>${x.to}`)) best.set(`${x.from}>${x.to}`, x);
  return [...best.values()].slice(0, limit);
}
