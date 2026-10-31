// Hostelworld: cheapest bed per city, read from the public city page title
// ("Best Hostels in Vienna from €2.92"). One request per city, no key needed.
// The city page address comes from Hostelworld's own city search.

const SUGGEST = 'https://prod.apigee.hostelworld.com/legacy-hwapi-service/2.2/suggestions/?text=';
const UK = ['england', 'scotland', 'wales', 'northern ireland', 'united kingdom'];
const AFRICA = ['morocco', 'egypt', 'tunisia', 'algeria'];
const ASIA = ['israel', 'jordan', 'georgia', 'armenia', 'azerbaijan', 'cyprus', 'lebanon', 'united arab emirates'];

export function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Best Hostelworld city for `city` in `countryName` (English names). */
export function pickCity(json, city, countryName) {
  const want = slug(city);
  const country = String(countryName || '').toLowerCase();
  const cities = (Array.isArray(json) ? json : []).filter((x) => x?.type === 'city' && x.city?.name);
  const sameCountry = (x) => {
    const c = String(x.city.country || '').toLowerCase();
    return !country || c === country || (country === 'united kingdom' && UK.includes(c)) || c.includes(country) || country.includes(c);
  };
  return cities.find((x) => slug(x.city.name) === want && sameCountry(x)) || cities.find(sameCountry) || null;
}

export function cityPageUrl(hwCity) {
  const country = String(hwCity.city.country || '');
  const lc = country.toLowerCase();
  const continent = AFRICA.includes(lc) ? 'africa' : ASIA.includes(lc) ? 'asia' : 'europe';
  return `https://www.hostelworld.com/hostels/${continent}/${slug(country)}/${slug(hwCity.city.name)}/`;
}

/** "<title>Best Hostels in Vienna from €2.92 | 2026</title>" -> 2.92 */
export function parseLeadPrice(html) {
  const t = (String(html).match(/<title>([^<]*)<\/title>/i) || [])[1] || '';
  const m = t.match(/from\s*€\s*([\d.,]+)/i) || t.match(/ab\s*([\d.,]+)\s*€/i);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

// Hostelworld's country names where they differ from the usual English ones.
const COUNTRY_ALIAS = { czechia: 'czech-republic', 'north-macedonia': 'macedonia', turkiye: 'turkey', 'bosnia-and-herzegovina': 'bosnia-and-herzegovina' };
const UK_PART = { edinburgh: 'scotland', glasgow: 'scotland', aberdeen: 'scotland', inverness: 'scotland', prestwick: 'scotland', belfast: 'northern-ireland', derry: 'northern-ireland', cardiff: 'wales' };

/** Hostelworld city page address(es) to try for a city, without their (blocked) search API. */
export function cityPageCandidates(city, countryName) {
  const c = slug(city);
  let country = slug(countryName);
  if (country === 'united-kingdom') country = UK_PART[c] || 'england';
  country = COUNTRY_ALIAS[country] || country;
  const continent = AFRICA.includes(String(countryName).toLowerCase()) ? 'africa' : ASIA.includes(String(countryName).toLowerCase()) ? 'asia' : 'europe';
  return [`https://www.hostelworld.com/hostels/${continent}/${country}/${c}/`];
}

/**
 * @param {{key:string, city:string, countryName:string}[]} cities
 * @returns {Promise<{ hostels: Record<string, {from:number, url:string, name:string}>, failed:number }>}
 */
export async function fetchHostels(http, cities) {
  const hostels = {};
  let failed = 0;
  await Promise.all(cities.map(async (c) => {
    for (const url of cityPageCandidates(c.city, c.countryName)) {
      try {
        const from = parseLeadPrice(await http.get(url, { json: false, ttlMin: 6 * 60, retries: 0 }));
        if (from != null) { hostels[c.key] = { from, url, name: c.city }; return; }
      } catch { /* try the next address */ }
    }
    failed++;
  }));
  return { hostels, failed };
}
