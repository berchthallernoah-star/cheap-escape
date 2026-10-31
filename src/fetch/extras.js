// Drive times (OpenStreetMap routing, OSRM) and current Austrian fuel prices (E-Control).

/** OSRM table: one origin, many destinations -> [{min, km}] */
export function parseOsrmTable(json) {
  const dur = json?.durations?.[0] || [];
  const dist = json?.distances?.[0] || [];
  return dur.slice(1).map((s, i) => (s == null ? null : { min: Math.round(s / 60) + 5, km: Math.round((dist[i + 1] || 0) / 1000) }));
}

export async function fetchDriveTimes(http, from, targets) {
  const coords = [from, ...targets].map((p) => `${p.lon},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/table/v1/driving/${coords}?sources=0&annotations=duration,distance`;
  return parseOsrmTable(await http.get(url, { ttlMin: 30 * 24 * 60 }));
}

/** E-Control "by-address" result -> median of the 5 cheapest prices (€/l). */
export function parseFuel(json, fuelType = 'SUP') {
  const prices = [];
  for (const st of Array.isArray(json) ? json : []) {
    for (const p of st.prices || []) if ((p.fuelType || fuelType) === fuelType && p.amount) prices.push(Number(p.amount));
  }
  if (!prices.length) return null;
  prices.sort((a, b) => a - b);
  const top = prices.slice(0, 5);
  return Math.round(top[Math.floor(top.length / 2)] * 1000) / 1000;
}

export async function fetchFuel(http, lat, lon, fuelType = 'SUP') {
  const url = `https://api.e-control.at/sprit/1.0/search/gas-stations/by-address?latitude=${lat}&longitude=${lon}&fuelType=${fuelType}&includeClosed=false`;
  return parseFuel(await http.get(url, { ttlMin: 6 * 60 }), fuelType);
}
