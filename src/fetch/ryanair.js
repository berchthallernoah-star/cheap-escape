// Ryanair group (FR / RK / AL / OE) fares via the public fare-finder endpoints the
// ryanair.com website itself calls. No key needed. Times are local to each
// airport; we convert to UTC with the airport's IANA time zone.
//
// Parsers are tolerant: Ryanair occasionally renames fields, so each parser
// tries the known variants and skips rows it cannot understand (counted).

import { localToUtcMin } from '../lib/time.js';

const BASE = 'https://www.ryanair.com/api';

export function parseAirports(json) {
  const list = Array.isArray(json) ? json : json?.airports || [];
  const out = {};
  for (const a of list) {
    const code = a.code || a.iataCode;
    if (!code) continue;
    out[code] = {
      name: a.name,
      city: a.city?.name || a.cityName || a.name,
      country: (a.country?.code || a.countryCode || '').toLowerCase(),
      countryName: a.country?.name || a.countryName || '',
      lat: a.coordinates?.latitude ?? a.latitude ?? null,
      lon: a.coordinates?.longitude ?? a.longitude ?? null,
      tz: a.timeZone || a.timezone || null,
    };
  }
  return out;
}

export function parseRoutes(json) {
  const list = Array.isArray(json) ? json : json?.routes || [];
  const out = new Set();
  for (const r of list) {
    if (r.connectingAirport) continue;
    const code = r.arrivalAirport?.code || r.arrivalAirport?.iataCode || (typeof r === 'string' ? r.split(':')[1] : null);
    if (code) out.add(code);
  }
  return [...out];
}

function priceOf(p) {
  if (p == null) return null;
  if (typeof p === 'number') return { eur: p, cur: 'EUR' };
  const v = p.value ?? p.amount;
  if (v == null) return null;
  return { eur: Number(v), cur: p.currencyCode || p.currency || 'EUR' };
}

/** cheapestPerDay -> rows [from,to,depUtc,arrUtc,eur,'FR',''] */
export function parseCheapestPerDay(json, from, to, tzFrom, tzTo) {
  const fares = json?.outbound?.fares || json?.fares || [];
  const rows = [];
  let skipped = 0;
  for (const f of fares) {
    if (f.unavailable || f.soldOut) continue;
    const pr = priceOf(f.price);
    if (!pr || pr.cur !== 'EUR' || !f.departureDate || !f.arrivalDate) { if (f.price) skipped++; continue; }
    rows.push([from, to, localToUtcMin(f.departureDate, tzFrom), localToUtcMin(f.arrivalDate, tzTo), pr.eur, 'FR', '']);
  }
  return { rows, skipped };
}

/** oneWayFares (fare finder, many destinations) -> rows */
export function parseOneWayFares(json, tzOf) {
  const rows = [];
  let skipped = 0;
  for (const item of json?.fares || []) {
    const o = item.outbound || item;
    const from = o.departureAirport?.iataCode || o.departureAirport?.code;
    const to = o.arrivalAirport?.iataCode || o.arrivalAirport?.code;
    const pr = priceOf(o.price);
    const tf = tzOf(from);
    const tt = tzOf(to);
    if (!from || !to || !pr || pr.cur !== 'EUR' || !o.departureDate || !o.arrivalDate || !tf || !tt) { skipped++; continue; }
    rows.push([from, to, localToUtcMin(o.departureDate, tf), localToUtcMin(o.arrivalDate, tt), pr.eur, 'FR', (o.flightNumber || '').replace(/\s+/g, '')]);
  }
  return { rows, skipped };
}

export async function fetchAirports(http) {
  return parseAirports(await http.get(`${BASE}/views/locate/5/airports/en/active`, { ttlMin: 24 * 60 }));
}

export async function fetchRoutes(http, code) {
  return parseRoutes(await http.get(`${BASE}/views/locate/searchWidget/routes/en/airport/${code}`, { ttlMin: 24 * 60 }));
}

export async function fetchCheapestPerDay(http, from, to, monthFirstDay, tzFrom, tzTo, ttlMin) {
  const url = `${BASE}/farfnd/v4/oneWayFares/${from}/${to}/cheapestPerDay?outboundMonthOfDate=${monthFirstDay}&currency=EUR`;
  return parseCheapestPerDay(await http.get(url, { ttlMin }), from, to, tzFrom, tzTo);
}

export async function fetchDayWindow(http, from, date, timeFrom, timeTo, tzOf, ttlMin) {
  const url = `${BASE}/farfnd/v4/oneWayFares?departureAirportIataCode=${from}&outboundDepartureDateFrom=${date}&outboundDepartureDateTo=${date}`
    + `&outboundDepartureTimeFrom=${timeFrom}&outboundDepartureTimeTo=${timeTo}&currency=EUR&market=de-at&language=de&adultPaxCount=1`;
  return parseOneWayFares(await http.get(url, { ttlMin }), tzOf);
}
