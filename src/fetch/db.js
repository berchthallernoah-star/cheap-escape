// Deutsche Bahn live train prices (cheapest ticket per connection) via the JSON
// API used by bahn.de / int.bahn.de. Best effort: if DB changes it, the source
// is marked failed and the typical-price train timetables still apply.

import { localToUtcMin } from '../lib/time.js';

const BASE = 'https://int.bahn.de/web/api';

export function parseLocations(json) {
  const list = Array.isArray(json) ? json : [];
  const st = list.find((x) => x && x.id && (x.type === 'ST' || !x.type));
  return st ? { id: st.id, name: st.name } : null;
}

/** -> rows [from, to, depUtc, arrUtc, eur, 'train', operator, url] */
export function parseJourneys(json, from, to, tzFrom, tzTo, url) {
  const rows = [];
  let skipped = 0;
  for (const v of json?.verbindungen || []) {
    const sec = v.verbindungsAbschnitte || [];
    const first = sec[0];
    const last = sec[sec.length - 1];
    const eur = v.angebotsPreis?.betrag ?? v.abPreis?.betrag;
    const cur = v.angebotsPreis?.waehrung ?? v.abPreis?.waehrung ?? 'EUR';
    const dep = first?.abfahrtsZeitpunkt;
    const arr = last?.ankunftsZeitpunkt;
    if (eur == null || cur !== 'EUR' || !dep || !arr) { skipped++; continue; }
    const products = [...new Set(sec.map((s) => s.verkehrsmittel?.produktGattung || s.verkehrsmittel?.name).filter(Boolean))].slice(0, 3).join(' + ');
    rows.push([from, to, localToUtcMin(dep, tzFrom), localToUtcMin(arr, tzTo), Number(eur), 'train', `DB / ÖBB train${products ? ` (${products})` : ''}`, url]);
  }
  return { rows, skipped };
}

export async function resolveStation(http, name) {
  return parseLocations(await http.get(`${BASE}/reiseloesung/orte?suchbegriff=${encodeURIComponent(name)}&typ=ALL&limit=5`, { ttlMin: 30 * 24 * 60 }));
}

export async function fetchJourneys(http, fromSt, toSt, localIso, ids, tzFrom, tzTo, ttlMin) {
  const body = {
    abfahrtsHalt: fromSt.id, ankunftsHalt: toSt.id, anfrageZeitpunkt: `${localIso}:00`, ankunftSuche: 'ABFAHRT', klasse: 'KLASSE_2',
    produktgattungen: ['ICE', 'EC_IC', 'IR', 'REGIONAL', 'SBAHN', 'BUS', 'SCHIFF', 'UBAHN', 'TRAM', 'ANRUFPFLICHTIG'],
    reisende: [{ typ: 'ERWACHSENER', ermaessigungen: [{ art: 'KEINE_ERMAESSIGUNG', klasse: 'KLASSENLOS' }], alter: [], anzahl: 1 }],
    schnelleVerbindungen: true, sitzplatzOnly: false, bikeCarriage: false, reservierungsKontingenteVorhanden: false,
    nurDeutschlandTicketVerbindungen: false, deutschlandTicketVorhanden: false,
  };
  const url = `https://www.bahn.de/buchung/fahrplan/suche#sts=true&so=${encodeURIComponent(fromSt.name)}&zo=${encodeURIComponent(toSt.name)}&hd=${localIso}:00`;
  const json = await http.get(`${BASE}/angebote/fahrplan`, { method: 'POST', body, ttlMin });
  return parseJourneys(json, ids[0], ids[1], tzFrom, tzTo, url);
}
