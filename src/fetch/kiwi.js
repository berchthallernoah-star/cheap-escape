// Kiwi.com search (all airlines, incl. combinations of different airlines with a
// self-transfer) via the GraphQL API that kiwi.com itself uses. No key needed.
// Max 50 itineraries per search; a fixed origin is required.

import { tzForCountry } from '../data/tz.js';

const URL = 'https://api.skypicker.com/umbrella/v2/graphql?featureName=SearchOneWayItinerariesQuery';

const STATION = 'station { code name gps { lat lng } city { name } country { code name } }';
const QUERY = `query SearchOneWayItinerariesQuery($search: SearchOnewayInput, $filter: ItinerariesFilterInput, $options: ItinerariesOptionsInput) {
  onewayItineraries(search: $search, filter: $filter, options: $options) {
    __typename
    ... on AppError { error: message }
    ... on Itineraries {
      metadata { itinerariesCount }
      itineraries {
        __typename
        ... on ItineraryOneWay {
          id
          priceEur { amount }
          sector { sectorSegments { segment { source { localTime utcTimeIso ${STATION} } destination { localTime utcTimeIso ${STATION} } carrier { code name } code } } }
        }
      }
    }
  }
}`;

export function buildBody(sourceCodes, destCodes, date) {
  const ids = (codes) => codes.map((c) => `Station:airport:${c}`);
  return {
    query: QUERY,
    variables: {
      search: {
        itinerary: { source: { ids: ids(sourceCodes) }, destination: { ids: ids(destCodes) }, outboundDepartureDate: { start: `${date}T00:00:00`, end: `${date}T23:59:59` } },
        passengers: { adults: 1, children: 0, infants: 0, adultsHoldBags: [0], adultsHandBags: [0], childrenHoldBags: [], childrenHandBags: [] },
        cabinClass: { cabinClass: 'ECONOMY', applyMixedClasses: false },
      },
      filter: { allowChangeInboundDestination: true, allowChangeInboundSource: true, allowDifferentStationConnection: false, enableSelfTransfer: true,
        enableThrowAwayTicketing: false, enableTrueHiddenCity: false, transportTypes: ['FLIGHT'], contentProviders: ['KIWI', 'FRESH'], limit: 50 },
      options: { sortBy: 'PRICE', currency: 'eur', locale: 'en', market: 'at', partner: 'skypicker', partnerMarket: 'at', storeSearch: false },
    },
  };
}

function stationInfo(st) {
  const country = (st.country?.code || '').toLowerCase();
  return { name: st.name, city: st.city?.name || st.name, country, countryName: st.country?.name || '', lat: st.gps?.lat ?? null, lon: st.gps?.lng ?? null, tz: tzForCountry(country, st.code) };
}

/** -> { rows: [from,to,dep,arr,eur,carrier,number,via,'kiwi'], airports: {code: info}, skipped } */
export function parseItineraries(json) {
  const res = json?.data?.onewayItineraries;
  if (!res) throw new Error(json?.errors?.[0]?.message || 'unexpected Kiwi response');
  if (res.__typename === 'AppError') throw new Error(res.error || 'Kiwi error');
  const rows = [];
  const airports = {};
  let skipped = 0;
  for (const it of res.itineraries || []) {
    const segs = (it.sector?.sectorSegments || []).map((s) => s.segment).filter(Boolean);
    const eur = Number(it.priceEur?.amount);
    if (!segs.length || !Number.isFinite(eur)) { skipped++; continue; }
    const first = segs[0];
    const last = segs[segs.length - 1];
    const dep = Date.parse(first.source.utcTimeIso);
    const arr = Date.parse(last.destination.utcTimeIso);
    if (!Number.isFinite(dep) || !Number.isFinite(arr)) { skipped++; continue; }
    for (const s of segs) {
      for (const end of [s.source, s.destination]) if (end?.station?.code && !airports[end.station.code]) airports[end.station.code] = stationInfo(end.station);
    }
    const carriers = [...new Set(segs.map((s) => s.carrier?.code).filter(Boolean))];
    rows.push([
      first.source.station.code, last.destination.station.code, Math.round(dep / 60000), Math.round(arr / 60000), eur,
      carriers.join('+'), segs.map((s) => `${s.carrier?.code || ''}${s.code || ''}`).join(' / '),
      segs.slice(1).map((s) => s.source.station.code).join(','), 'kiwi',
    ]);
  }
  return { rows, airports, skipped };
}

export async function search(http, sourceCodes, destCodes, date, ttlMin = 180) {
  return parseItineraries(await http.get(URL, { method: 'POST', body: buildBody(sourceCodes, destCodes, date), ttlMin }));
}

export function kiwiUrl(from, to, dateLocal, adults) {
  return `https://www.kiwi.com/en/search/results/${from}/${to}/${dateLocal}/no-return?adults=${adults}`;
}
