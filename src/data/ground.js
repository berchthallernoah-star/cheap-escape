// TRIPS WITHOUT A PLANE + SHORT HOPS ON FOOT / BY BIKE.
// Every number marked est is a typical price, shown with "≈" in the app.

export const CHECKED = '2026-10-31';
const AT = ['klimaticket_at'];
const DE_REGIO = ['deutschlandticket'];
const BAYERN = { kind: 'bayern', first: 34, extra: 10, max: 5, coveredBy: DE_REGIO };

// Cities reachable by bus/train from Salzburg Hbf. Keys start with "C:".
// country uses the same lowercase codes as the airport list (for nearby-airport links).
export const GROUND_CITIES = {
  'C:Wien': { name: 'Wien Hbf', city: 'Vienna', country: 'at', countryName: 'Austria', tz: 'Europe/Vienna', lat: 48.1852, lon: 16.3761, flix: 'Wien', db: 'Wien Hbf' },
  'C:Linz': { name: 'Linz Hbf', city: 'Linz', country: 'at', countryName: 'Austria', tz: 'Europe/Vienna', lat: 48.2903, lon: 14.2915, flix: 'Linz' },
  'C:Graz': { name: 'Graz Hbf', city: 'Graz', country: 'at', countryName: 'Austria', tz: 'Europe/Vienna', lat: 47.0727, lon: 15.4166, flix: 'Graz' },
  'C:Innsbruck': { name: 'Innsbruck Hbf', city: 'Innsbruck', country: 'at', countryName: 'Austria', tz: 'Europe/Vienna', lat: 47.2633, lon: 11.4009, flix: 'Innsbruck' },
  'C:Klagenfurt': { name: 'Klagenfurt Hbf', city: 'Klagenfurt', country: 'at', countryName: 'Austria', tz: 'Europe/Vienna', lat: 46.6156, lon: 14.3122, flix: 'Klagenfurt' },
  'C:München': { name: 'München Hbf', city: 'Munich', country: 'de', countryName: 'Germany', tz: 'Europe/Berlin', lat: 48.1403, lon: 11.56, flix: 'München', db: 'München Hbf' },
  'C:Nürnberg': { name: 'Nürnberg Hbf', city: 'Nuremberg', country: 'de', countryName: 'Germany', tz: 'Europe/Berlin', lat: 49.4456, lon: 11.0825, flix: 'Nürnberg', db: 'Nürnberg Hbf' },
  'C:Berlin': { name: 'Berlin Hbf', city: 'Berlin', country: 'de', countryName: 'Germany', tz: 'Europe/Berlin', lat: 52.5251, lon: 13.3694, flix: 'Berlin', db: 'Berlin Hbf' },
  'C:Frankfurt': { name: 'Frankfurt Hbf', city: 'Frankfurt', country: 'de', countryName: 'Germany', tz: 'Europe/Berlin', lat: 50.107, lon: 8.6633, flix: 'Frankfurt am Main', db: 'Frankfurt(Main)Hbf' },
  'C:Prag': { name: 'Praha hl.n.', city: 'Prague', country: 'cz', countryName: 'Czechia', tz: 'Europe/Prague', lat: 50.0833, lon: 14.4353, flix: 'Prag', db: 'Praha hl.n.' },
  'C:Budapest': { name: 'Budapest Keleti', city: 'Budapest', country: 'hu', countryName: 'Hungary', tz: 'Europe/Budapest', lat: 47.5, lon: 19.0836, flix: 'Budapest', db: 'Budapest-Keleti' },
  'C:Bratislava': { name: 'Bratislava hl.st.', city: 'Bratislava', country: 'sk', countryName: 'Slovakia', tz: 'Europe/Bratislava', lat: 48.1588, lon: 17.1063, flix: 'Bratislava' },
  'C:Ljubljana': { name: 'Ljubljana', city: 'Ljubljana', country: 'si', countryName: 'Slovenia', tz: 'Europe/Ljubljana', lat: 46.0582, lon: 14.5108, flix: 'Ljubljana' },
  'C:Zagreb': { name: 'Zagreb Glavni kolodvor', city: 'Zagreb', country: 'hr', countryName: 'Croatia', tz: 'Europe/Zagreb', lat: 45.8044, lon: 15.9786, flix: 'Zagreb' },
  'C:Venedig': { name: 'Venezia Mestre', city: 'Venice', country: 'it', countryName: 'Italy', tz: 'Europe/Rome', lat: 45.4825, lon: 12.2318, flix: 'Venedig' },
  'C:Verona': { name: 'Verona Porta Nuova', city: 'Verona', country: 'it', countryName: 'Italy', tz: 'Europe/Rome', lat: 45.4291, lon: 10.9822, flix: 'Verona' },
  'C:Mailand': { name: 'Milano Centrale', city: 'Milan', country: 'it', countryName: 'Italy', tz: 'Europe/Rome', lat: 45.4862, lon: 9.2045, flix: 'Mailand' },
  'C:Bologna': { name: 'Bologna Centrale', city: 'Bologna', country: 'it', countryName: 'Italy', tz: 'Europe/Rome', lat: 44.506, lon: 11.343, flix: 'Bologna' },
  'C:Triest': { name: 'Trieste Centrale', city: 'Trieste', country: 'it', countryName: 'Italy', tz: 'Europe/Rome', lat: 45.6578, lon: 13.7728, flix: 'Triest' },
  'C:Zürich': { name: 'Zürich HB', city: 'Zurich', country: 'ch', countryName: 'Switzerland', tz: 'Europe/Zurich', lat: 47.3782, lon: 8.5402, flix: 'Zürich', db: 'Zürich HB' },
};

// Typical trains Salzburg Hbf <-> city (any of the listed departure hours, both ways).
// fare parts per person; coveredBy = cards that make that part free. Prices are
// typical cheap-ticket prices a few days ahead (ÖBB Sparschiene / DB Sparpreis).
const H = (from, to, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
export const TRAIN_ROUTES = [
  { to: 'C:Wien', minutes: 145, hours: H(6, 20), fare: [{ eur: 25, coveredBy: AT, discounts: { vorteilscard: 0.8 } }], operator: 'ÖBB Railjet / WESTbahn', url: 'https://www.oebb.at' },
  { to: 'C:Linz', minutes: 75, hours: H(6, 21), fare: [{ eur: 15, coveredBy: AT, discounts: { vorteilscard: 0.8 } }], operator: 'ÖBB / WESTbahn', url: 'https://www.oebb.at' },
  { to: 'C:Graz', minutes: 245, hours: H(6, 18, 2), fare: [{ eur: 30, coveredBy: AT, discounts: { vorteilscard: 0.8 } }], operator: 'ÖBB Intercity', url: 'https://www.oebb.at' },
  { to: 'C:Innsbruck', minutes: 115, hours: H(6, 20), fare: [{ eur: 20, coveredBy: AT, discounts: { vorteilscard: 0.8 } }], operator: 'ÖBB Railjet (über Rosenheim)', url: 'https://www.oebb.at' },
  { to: 'C:Klagenfurt', minutes: 185, hours: H(6, 18, 2), fare: [{ eur: 25, coveredBy: AT, discounts: { vorteilscard: 0.8 } }], operator: 'ÖBB Railjet / IC', url: 'https://www.oebb.at' },
  { to: 'C:München', minutes: 115, hours: H(6, 21), fare: [BAYERN], operator: 'BRB-Regionalzug (Bayern-Ticket)', url: 'https://www.bahn.de' },
  { to: 'C:Nürnberg', minutes: 245, hours: H(6, 18, 2), fare: [BAYERN], operator: 'Regionalzüge über München (Bayern-Ticket)', url: 'https://www.bahn.de' },
  { to: 'C:Berlin', minutes: 420, hours: H(6, 16, 2), fare: [{ eur: 45, discounts: { bahncard25: 0.75, bahncard50: 0.75 } }], operator: 'DB ICE über München', url: 'https://www.bahn.de' },
  { to: 'C:Frankfurt', minutes: 345, hours: H(6, 16, 2), fare: [{ eur: 40, discounts: { bahncard25: 0.75, bahncard50: 0.75 } }], operator: 'DB ICE über München', url: 'https://www.bahn.de' },
  { to: 'C:Prag', minutes: 370, hours: [6, 10, 14], fare: [{ eur: 15, coveredBy: AT }, { eur: 15 }], operator: 'ÖBB nach Linz + ČD / Bus nach Prag', url: 'https://www.oebb.at' },
  { to: 'C:Budapest', minutes: 330, hours: H(6, 16, 2), fare: [{ eur: 20, coveredBy: AT, discounts: { vorteilscard: 0.8 } }, { eur: 15 }], operator: 'ÖBB Railjet', url: 'https://www.oebb.at' },
  { to: 'C:Bratislava', minutes: 225, hours: H(6, 18, 2), fare: [{ eur: 22, coveredBy: AT, discounts: { vorteilscard: 0.8 } }, { eur: 6 }], operator: 'ÖBB Railjet + REX über Wien', url: 'https://www.oebb.at' },
  { to: 'C:Ljubljana', minutes: 275, hours: [8, 14], fare: [{ eur: 18, coveredBy: AT }, { eur: 12 }], operator: 'ÖBB EC über Villach', url: 'https://www.oebb.at' },
  { to: 'C:Zagreb', minutes: 450, hours: [8], fare: [{ eur: 18, coveredBy: AT }, { eur: 22 }], operator: 'ÖBB EC über Villach + Ljubljana', url: 'https://www.oebb.at' },
  { to: 'C:Venedig', minutes: 330, hours: [6, 10, 14], fare: [{ eur: 15, coveredBy: AT }, { eur: 20 }], operator: 'ÖBB-Zug nach Villach + ÖBB-Intercitybus', url: 'https://www.oebb.at' },
  { to: 'C:Verona', minutes: 335, hours: [7, 9, 11, 13, 15], fare: [{ eur: 18, coveredBy: AT }, { eur: 22 }], operator: 'ÖBB über Innsbruck + EC über den Brenner', url: 'https://www.oebb.at' },
  { to: 'C:Bologna', minutes: 400, hours: [7, 11], fare: [{ eur: 18, coveredBy: AT }, { eur: 27 }], operator: 'ÖBB über Innsbruck + EC', url: 'https://www.oebb.at' },
  { to: 'C:Mailand', minutes: 450, hours: [7, 11], fare: [{ eur: 18, coveredBy: AT }, { eur: 32 }], operator: 'ÖBB über Innsbruck + Verona', url: 'https://www.oebb.at' },
  { to: 'C:Zürich', minutes: 335, hours: H(6, 16, 2), fare: [{ eur: 25, coveredBy: AT, discounts: { vorteilscard: 0.8 } }, { eur: 15 }], operator: 'ÖBB Railjet', url: 'https://www.oebb.at' },
];

// Walking / own bike / bike sharing on the home side (computed from coordinates).
export const MICRO = {
  walkKmh: 4.8,
  bikeKmh: 15,
  detour: 1.25, // real paths are longer than straight lines
  maxWalkShownMin: 240, // always show walking alternatives up to 4 hours
  maxBikeKm: 35,
};

// Bike sharing on the home side. est: price not confirmed.
export const BIKE_SHARE = [
  { id: 's-bike', label: 'S-Bike (E-Bike-Verleih Salzburg)', center: { lat: 47.8, lon: 13.045 }, radiusKm: 6, per30min: 3, unlock: 0, est: true,
    note: 'Stadtsystem seit Aug. 2026, ≈ bis €3 pro 30 Min. (unbestätigt); Stationen in der Stadt', url: 'https://www.salzburg.info/en/travel-info/infos/s-bike-e-bike-sharing-system_az_42092324' },
  { id: 'lime', label: 'Lime E-Bike', center: { lat: 47.8, lon: 13.045 }, radiusKm: 6, perMin: 0.3, unlock: 1, est: true,
    note: '≈ €1 Entsperren + €0,30/Min. (typischer Lime-Preis)', url: 'https://www.li.me' },
];

export function blablacarUrl(fromName, toName, dateLocal, seats) {
  return `https://www.blablacar.de/search?fn=${encodeURIComponent(fromName)}&tn=${encodeURIComponent(toName)}&db=${dateLocal}&seats=${seats}`;
}

// Driving the whole way from Salzburg (est): road km, minutes, tolls/vignettes for the
// return trip (Austrian vignette assumed owned), city parking per day (P+R where cheap).
export const CAR_ROUTES = {
  'C:Wien': { km: 300, min: 180, tolls: 0, parkPerDay: 5, note: 'P+R an einer U-Bahn-Endstation ≈ €4–5/Tag' },
  'C:Linz': { km: 135, min: 85, tolls: 0, parkPerDay: 8 },
  'C:Graz': { km: 280, min: 180, tolls: 0, parkPerDay: 10 },
  'C:Innsbruck': { km: 185, min: 125, tolls: 0, parkPerDay: 12 },
  'C:Klagenfurt': { km: 225, min: 145, tolls: 30, parkPerDay: 8, note: 'Tauernmaut hin und zurück' },
  'C:München': { km: 145, min: 105, tolls: 0, parkPerDay: 3, note: 'MVV-P+R an einer S-Bahn-Station ≈ €1,50–3/Tag' },
  'C:Nürnberg': { km: 280, min: 175, tolls: 0, parkPerDay: 10 },
  'C:Berlin': { km: 720, min: 420, tolls: 0, parkPerDay: 15 },
  'C:Frankfurt': { km: 540, min: 320, tolls: 0, parkPerDay: 15 },
  'C:Prag': { km: 380, min: 245, tolls: 12, parkPerDay: 10, note: 'Tschechische E-Vignette (10 Tage)' },
  'C:Budapest': { km: 530, min: 310, tolls: 16, parkPerDay: 10, note: 'Ungarische E-Vignette (10 Tage)' },
  'C:Bratislava': { km: 360, min: 220, tolls: 12, parkPerDay: 8, note: 'Slowakische E-Vignette (10 Tage)' },
  'C:Ljubljana': { km: 290, min: 180, tolls: 63, parkPerDay: 10, note: 'Tauern- + Karawankentunnel hin und zurück + slowenische E-Vignette (7 Tage)' },
  'C:Zagreb': { km: 430, min: 270, tolls: 93, parkPerDay: 8, note: 'Tauern- + Karawankenmaut, slowenische Vignette, kroatische Autobahnmaut' },
  'C:Venedig': { km: 420, min: 270, tolls: 70, parkPerDay: 15, note: 'Tauernmaut + italienische Autobahnmaut hin und zurück; in Mestre parken' },
  'C:Verona': { km: 410, min: 250, tolls: 54, parkPerDay: 10, note: 'Brennermaut + italienische Maut hin und zurück' },
  'C:Mailand': { km: 560, min: 330, tolls: 84, parkPerDay: 15, note: 'Brennermaut + italienische Maut hin und zurück' },
  'C:Bologna': { km: 530, min: 310, tolls: 74, parkPerDay: 12, note: 'Brennermaut + italienische Maut hin und zurück' },
  'C:Triest': { km: 400, min: 245, tolls: 46, parkPerDay: 10 },
  'C:Zürich': { km: 430, min: 270, tolls: 40, parkPerDay: 20, note: 'Schweizer Autobahnvignette (Jahr, ≈ €40)' },
};

// Automatic city discovery (refresh job): every destination city in the airline
// network within these straight-line distances from Salzburg is also checked by
// bus (Flixbus), train (DB) and car.
export const DISCOVERY = { maxKmBusTrain: 900, maxKmCar: 1100, from: { lat: 47.8128, lon: 13.0456 } };

// Rough motorway cost per return trip for cities without a curated route:
// flat vignettes + per-km tolls for the destination country (≈, Austrian vignette assumed owned).
export const TOLLS_BY_COUNTRY = {
  it: { perKm: 0.075, flat: 12 }, fr: { perKm: 0.09, flat: 0 }, es: { perKm: 0.04, flat: 0 }, pt: { perKm: 0.08, flat: 0 },
  hr: { perKm: 0.07, flat: 40 }, si: { perKm: 0, flat: 40 }, cz: { perKm: 0, flat: 12 }, hu: { perKm: 0, flat: 16 },
  sk: { perKm: 0, flat: 12 }, ch: { perKm: 0, flat: 40 }, pl: { perKm: 0.03, flat: 0 }, gr: { perKm: 0.05, flat: 0 },
  rs: { perKm: 0.04, flat: 0 }, ro: { perKm: 0, flat: 8 }, bg: { perKm: 0, flat: 8 }, ba: { perKm: 0.03, flat: 0 },
};
export const DEFAULT_CITY_PARKING = 15;

export function estimateCarTolls(country, km) {
  const t = TOLLS_BY_COUNTRY[country];
  if (!t) return 0;
  return Math.round(t.flat + t.perKm * km * 0.6 * 2);
}
