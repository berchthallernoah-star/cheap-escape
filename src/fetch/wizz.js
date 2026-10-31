// Wizz Air: route map + daily cheapest fare per route (the calendar wizzair.com shows).
// The API path contains the current website version, read from the wizzair.com homepage.
// Wizz only returns departure times, so arrival = departure + duration estimated from distance.

import { localToUtcMin } from '../lib/time.js';
import { haversineKm } from '../planner/graph.js';
import { tzForCountry } from '../data/tz.js';

const HEADERS = { origin: 'https://wizzair.com', referer: 'https://wizzair.com/' };

export function parseVersion(html) {
  const m = String(html).match(/be\.wizzair\.com\/([\d.]+)\/Api/);
  return m ? m[1] : null;
}

/** asset/map -> { airports: {iata: info}, routes: Map(iata -> [iata]) } */
export function parseMap(json) {
  const airports = {};
  const routes = new Map();
  for (const c of json?.cities || []) {
    if (!c.iata || c.isFakeStation) continue;
    const country = String(c.countryCode || '').toLowerCase();
    airports[c.iata] = { name: c.shortName, city: c.shortName, country, countryName: c.countryName || '', lat: c.latitude ?? null, lon: c.longitude ?? null, tz: tzForCountry(country, c.iata) };
    routes.set(c.iata, (c.connections || []).filter((x) => x.iata && x.isDirectFlight !== false).map((x) => x.iata));
  }
  return { airports, routes };
}

export function flightMinutes(a, b) {
  if (a?.lat == null || b?.lat == null) return 150;
  return Math.round((haversineKm(a, b) / 780) * 60 + 35);
}

/** timetable -> rows [from,to,depUtc,arrUtc,eur,'W6','', '', 'wizz'] */
export function parseTimetable(json, airports) {
  const rows = [];
  let skipped = 0;
  for (const f of [...(json?.outboundFlights || []), ...(json?.returnFlights || [])]) {
    const eur = f.price?.amount;
    if (f.priceType === 'checkPrice' || !eur || f.price?.currencyCode !== 'EUR') { skipped++; continue; }
    const a = airports[f.departureStation];
    const b = airports[f.arrivalStation];
    if (!a?.tz) { skipped++; continue; }
    const mins = flightMinutes(a, b);
    for (const d of f.departureDates?.length ? f.departureDates : [f.departureDate]) {
      const dep = localToUtcMin(d, a.tz);
      rows.push([f.departureStation, f.arrivalStation, dep, dep + mins, Number(eur), 'W6', '', '', 'wizz']);
    }
  }
  return { rows, skipped };
}

export async function fetchVersion(http) {
  const v = parseVersion(await http.get('https://wizzair.com/en-gb', { json: false, ttlMin: 360 }));
  if (!v) throw new Error('Wizz Air API version not found on wizzair.com');
  return v;
}

export async function fetchMap(http, ver) {
  return parseMap(await http.get(`https://be.wizzair.com/${ver}/Api/asset/map?languageCode=en-gb`, { ttlMin: 24 * 60, headers: HEADERS }));
}

/** Both directions of one route for one date range (one request). */
export async function fetchTimetable(http, ver, a, b, from, to, airports, ttlMin = 180) {
  const body = {
    flightList: [
      { departureStation: a, arrivalStation: b, from, to },
      { departureStation: b, arrivalStation: a, from, to },
    ],
    priceType: 'regular', adultCount: 1, childCount: 0, infantCount: 0,
  };
  return parseTimetable(await http.get(`https://be.wizzair.com/${ver}/Api/search/timetable`, { method: 'POST', body, ttlMin, headers: HEADERS }), airports);
}

export function wizzUrl(from, to, dateLocal, adults) {
  return `https://wizzair.com/en-gb/booking/select-flight/${from}/${to}/${dateLocal}/null/${adults}/0/0/null`;
}
