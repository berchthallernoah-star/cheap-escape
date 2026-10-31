// Flixbus timetables + live prices via the public search API used by flixbus.com.
// Used for the home side (Salzburg <-> Munich/Vienna/Bratislava/Memmingen airports).

const BASE = 'https://global.api.flixbus.com';

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Pick the best city match for `name` from an autocomplete result. */
export function pickCity(json, name) {
  const list = Array.isArray(json) ? json : json?.cities || json?.data || [];
  const want = norm(name);
  const scored = list
    .filter((c) => c && (c.id || c.uuid))
    .map((c) => {
      const n = norm(c.name);
      const score = n === want ? 3 : n.startsWith(want) || want.startsWith(n) ? 2 : n.includes(want) || want.includes(n) ? 1 : 0;
      return { id: c.id || c.uuid, name: c.name, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

/** Search result -> timed rows [a, b, depUtc, arrUtc, eur, 'Flixbus', url] */
export function parseSearch(json, a, b, bookUrl, extra = { min: 0, eur: 0 }) {
  const rows = [];
  let skipped = 0;
  for (const trip of json?.trips || []) {
    const results = trip.results ? Object.values(trip.results) : trip.items || [];
    for (const r of results) {
      const status = String(r.status || 'available').toLowerCase();
      if (status !== 'available') continue;
      const dep = Date.parse(r.departure?.date || r.departure?.timestamp);
      const arr = Date.parse(r.arrival?.date || r.arrival?.timestamp);
      const eur = r.price?.total ?? r.price?.amount;
      if (!Number.isFinite(dep) || !Number.isFinite(arr) || eur == null) { skipped++; continue; }
      rows.push([a, b, Math.round(dep / 60000), Math.round(arr / 60000) + extra.min, Math.round((Number(eur) + extra.eur) * 100) / 100, 'Flixbus', bookUrl]);
    }
  }
  return { rows, skipped };
}

export async function resolveCity(http, name, lang = 'de') {
  const url = `${BASE}/search/autocomplete/cities?q=${encodeURIComponent(name)}&lang=${lang}&country=at&flixbus_cities_only=false`;
  return pickCity(await http.get(url, { ttlMin: 30 * 24 * 60 }), name);
}

/** date 'YYYY-MM-DD' */
export async function fetchDay(http, fromId, toId, date, a, b, extra, ttlMin) {
  const [y, m, d] = date.split('-');
  const ddmmyyyy = `${d}.${m}.${y}`;
  const url = `${BASE}/search/service/v4/search?from_city_id=${fromId}&to_city_id=${toId}&departure_date=${ddmmyyyy}`
    + `&products=%7B%22adult%22%3A1%7D&currency=EUR&locale=de&search_by=cities&include_after_midnight_rides=1`;
  const book = `https://shop.flixbus.de/search?departureCity=${fromId}&arrivalCity=${toId}&rideDate=${ddmmyyyy}&adult=1`;
  return parseSearch(await http.get(url, { ttlMin }), a, b, book, extra);
}
