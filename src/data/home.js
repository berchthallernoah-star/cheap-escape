// HOME SIDE of every trip: how you get from your door to an airport and back.
//
// Every number here is either
//   est: true   -> an estimate from public price lists (shown with "≈" in the app)
//   live        -> replaced at refresh time by real prices (Flixbus, fuel, drive times)
// Each block says where the number came from and when it was checked, so it can
// be corrected in one place. Edit freely; the planner re-reads this file.

export const CHECKED = '2026-10-31';

// ---------------------------------------------------------------- travel cards
// `covers` is decided per fare part below (coveredBy lists), not here.
export const CARDS = {
  superschoolcard: {
    label: "SUPER s'COOL-CARD",
    info: 'All public transport inside Salzburg state incl. Freilassing (SVV zone). Not valid beyond the state border.',
    src: 'https://salzburg-verkehr.at',
  },
  klimaticket_sbg: {
    label: 'KlimaTicket Salzburg',
    info: 'All public transport inside Salzburg state incl. Freilassing (SVV).',
    src: 'https://salzburg-verkehr.at',
  },
  klimaticket_at: {
    label: 'KlimaTicket Österreich',
    info: 'All scheduled public transport in Austria (ÖBB incl. Railjet, WESTbahn, city buses, S7 to Vienna airport). Not Flixbus, not CAT.',
    src: 'https://www.klimaticket.at',
  },
  deutschlandticket: {
    label: 'Deutschlandticket',
    info: 'German local + regional transport, incl. BRB regional trains Munich–Salzburg Hbf and S-Bahn to Munich airport. Not ICE/IC/EC/Railjet.',
    src: 'https://www.bahn.de',
  },
  vorteilscard: {
    label: 'ÖBB Vorteilscard',
    info: 'Discount on ÖBB standard tickets (modelled as ≈ -20% on typical fares, since cheap Sparschiene fares are not reduced further).',
    src: 'https://www.oebb.at',
  },
  bahncard25: { label: 'BahnCard 25', info: '-25% on DB fares (not on Bayern-Ticket).', src: 'https://www.bahn.de' },
  bahncard50: { label: 'BahnCard 50', info: '-25% on DB Sparpreis, -50% on Flexpreis (not on Bayern-Ticket).', src: 'https://www.bahn.de' },
};

const SVV = ['superschoolcard', 'klimaticket_sbg', 'klimaticket_at'];
const AT_ALL = ['klimaticket_at'];
const DE_REGIO = ['deutschlandticket'];

// ---------------------------------------------------------------- airports we fly from
// checkinMin: how early you must be at the terminal before departure.
// exitMin: plane lands -> you are outside (no checked bag).
export const HUBS = {
  SZG: { name: 'Salzburg', tz: 'Europe/Vienna', lat: 47.7933, lon: 13.0043, checkinMin: 75, exitMin: 20 },
  MUC: { name: 'München', tz: 'Europe/Berlin', lat: 48.3538, lon: 11.7861, checkinMin: 105, exitMin: 35 },
  FMM: { name: 'Memmingen', tz: 'Europe/Berlin', lat: 47.9888, lon: 10.2395, checkinMin: 80, exitMin: 20 },
  LNZ: { name: 'Linz', tz: 'Europe/Vienna', lat: 48.2332, lon: 14.1875, checkinMin: 75, exitMin: 20 },
  VIE: { name: 'Wien', tz: 'Europe/Vienna', lat: 48.1103, lon: 16.5697, checkinMin: 105, exitMin: 30 },
  BTS: { name: 'Bratislava', tz: 'Europe/Bratislava', lat: 48.1702, lon: 17.2127, checkinMin: 85, exitMin: 20 },
  NUE: { name: 'Nürnberg', tz: 'Europe/Berlin', lat: 49.4987, lon: 11.0669, checkinMin: 85, exitMin: 20 },
  INN: { name: 'Innsbruck', tz: 'Europe/Vienna', lat: 47.2602, lon: 11.344, checkinMin: 75, exitMin: 20 },
};

// ---------------------------------------------------------------- places on the ground
export const NODES = {
  'sbg-hbf': { name: 'Salzburg Hbf', lat: 47.8128, lon: 13.0456 },
  freilassing: { name: 'Freilassing Bahnhof', lat: 47.8396, lon: 12.9775 },
  'pr-sued': { name: 'P+R Salzburg Süd (Alpensiedlung)', lat: 47.7708, lon: 13.0656 },
  'pr-messe': { name: 'P+R Messe Salzburg', lat: 47.8236, lon: 13.005 },
  ...Object.fromEntries(Object.entries(HUBS).map(([k, h]) => [k, { name: `${h.name} Airport (${k})`, lat: h.lat, lon: h.lon }])),
};

// ---------------------------------------------------------------- homes
// `transit`: how this home connects to the public-transport network.
// `drive`: car minutes/km to each car park (refresh replaces with live OSRM values).
export const HOMES = {
  salzburg: {
    name: 'Salzburg (city)',
    lat: 47.8095, lon: 13.055, tz: 'Europe/Vienna',
    transit: [
      { to: 'sbg-hbf', minutes: 20, mode: 'bus', operator: 'Salzburg Verkehr (O-Bus)', fare: [{ eur: 2.1, coveredBy: SVV }], est: true,
        note: '1h ticket €2.10 in the app / €2.60 at the machine', src: 'https://salzburg-verkehr.at/en/tickets-fares/single-ride-tickets/1h-ticket/' },
      { to: 'SZG', minutes: 35, mode: 'bus', operator: 'Salzburg Verkehr (bus 2 / 10)', fare: [{ eur: 2.1, coveredBy: SVV }], est: true,
        src: 'https://salzburg-verkehr.at' },
    ],
    drive: {
      'SZG-P3': { min: 15, km: 7 },
      'MUC-P51': { min: 115, km: 170 },
      'MUC-VALET': { min: 110, km: 165 },
      'FMM-P4': { min: 170, km: 275 },
      'LNZ-P': { min: 85, km: 130 },
      'VIE-C': { min: 185, km: 315 },
      'BTS-P': { min: 205, km: 360 },
      'NUE-P': { min: 170, km: 290 },
      'INN-P': { min: 115, km: 185 },
      'pr-sued': { min: 12, km: 5 },
      'pr-messe': { min: 12, km: 5 },
      freilassing: { min: 15, km: 8 },
    },
  },
};

// ---------------------------------------------------------------- car parks
// tariff: perDay (per started 24h) and optional weekCap (max for any 7 days).
// node: where you are after parking (+ walkMin / shuttle).
export const CARPARKS = {
  'SZG-P3': { node: 'SZG', name: 'Salzburg Airport P3 (long-term)', walkMin: 7, tariff: { perDay: 10, weekCap: 48 }, est: true,
    src: 'https://www.salzburg-airport.com/parken/parktarife/' },
  'MUC-P51': { node: 'MUC', name: 'Munich Airport P51 economy (book online)', walkMin: 15, tariff: { perDay: 22, weekCap: 75 }, est: true,
    note: 'Barrier price ≈ €34/day — always pre-book online', src: 'https://www.munich-airport.com/parken' },
  'MUC-VALET': { node: 'MUC', name: 'Off-airport park & shuttle near MUC', walkMin: 25, tariff: { perDay: 8, weekCap: 45 }, est: true,
    note: 'Third-party shuttle parking (e.g. via Holiday Extras / parkinglist) — check availability', src: 'https://www.parkinglist.de/flughafen-parken/parken-flughafen-muenchen' },
  'FMM-P4': { node: 'FMM', name: 'Memmingen Airport P4 (online)', walkMin: 8, tariff: { perDay: 8, weekCap: 56 }, est: true,
    src: 'https://www.memmingen-airport.com/home/transport/parking/' },
  'LNZ-P': { node: 'LNZ', name: 'Linz Airport parking', walkMin: 5, tariff: { perDay: 8, weekCap: 45 }, est: true,
    src: 'https://www.linz-airport.com' },
  'VIE-C': { node: 'VIE', name: 'Vienna Airport holiday parking C', walkMin: 15, tariff: { perDay: 20, weekCap: 90 }, est: true,
    src: 'https://www.viennaairport.com/parken' },
  'BTS-P': { node: 'BTS', name: 'Bratislava Airport parking', walkMin: 5, tariff: { perDay: 7, weekCap: 40 }, est: true,
    toll: { eur: 12, note: 'Slovak e-vignette (≈ €12 / 10 days) for the last motorway km' }, src: 'https://www.bts.aero' },
  'NUE-P': { node: 'NUE', name: 'Nuremberg Airport holiday parking', walkMin: 10, tariff: { perDay: 12, weekCap: 60 }, est: true,
    src: 'https://www.airport-nuernberg.de/parken' },
  'INN-P': { node: 'INN', name: 'Innsbruck Airport parking', walkMin: 5, tariff: { perDay: 12, weekCap: 60 }, est: true,
    src: 'https://www.innsbruck-airport.com' },
  'pr-sued': { node: 'pr-sued', name: 'P+R Salzburg Süd', walkMin: 3, tariff: { perDay: 6 }, est: true,
    note: 'Day combo €15 incl. bus day ticket for up to 5 people exists; multi-day price assumed ≈ €6/day — check', src: 'https://www.salzburg.info/de/reiseinfos/anreise-verkehr/auto/park-ride/salzburg-sued' },
  'pr-messe': { node: 'pr-messe', name: 'P+R Messe Salzburg', walkMin: 3, tariff: { perDay: 21 }, est: true,
    note: 'Daily max €21 (combo €15 incl. bus day ticket for up to 5)', src: 'https://www.salzburg.info/de/reiseinfos/anreise-verkehr/auto/park-ride/messe-salzburg' },
  freilassing: { node: 'freilassing', name: 'Freilassing station parking', walkMin: 4, tariff: { perDay: 3 }, est: true,
    note: 'Station lot in Germany — price unverified, check signage', src: 'https://www.freilassing.de' },
};

// ---------------------------------------------------------------- public transport (any departure, not timetabled)
// minutes include typical waiting/changing. fare parts are PER PERSON unless kind:'bayern'.
// kind 'bayern' = Bayern-Ticket group price: €34 first person + €10 each extra (max 5), 2nd class.
const BAYERN = { kind: 'bayern', first: 34, extra: 10, max: 5, coveredBy: DE_REGIO,
  note: 'Bayern-Ticket (regional trains + S-Bahn), Mon–Fri valid from 09:00', src: 'https://www.bahn.de/angebot/regio/laender-tickets/bayern-ticket' };

export const TRANSIT = [
  { a: 'sbg-hbf', b: 'SZG', minutes: 26, mode: 'bus', operator: 'Salzburg Verkehr bus 2', fare: [{ eur: 2.1, coveredBy: SVV }], est: true },
  { a: 'sbg-hbf', b: 'freilassing', minutes: 16, mode: 'train', operator: 'S-Bahn Salzburg', fare: [{ eur: 2.1, coveredBy: [...SVV, ...DE_REGIO] }], est: true },
  { a: 'pr-sued', b: 'sbg-hbf', minutes: 30, mode: 'bus', operator: 'Salzburg Verkehr bus 3 / 8', fare: [{ eur: 2.1, coveredBy: SVV }], est: true },
  { a: 'pr-messe', b: 'sbg-hbf', minutes: 20, mode: 'bus', operator: 'Salzburg Verkehr bus 1', fare: [{ eur: 2.1, coveredBy: SVV }], est: true },

  { a: 'sbg-hbf', b: 'MUC', minutes: 165, mode: 'train', operator: 'BRB regional train + S-Bahn S8/S1', fare: [BAYERN], est: true },
  { a: 'freilassing', b: 'MUC', minutes: 155, mode: 'train', operator: 'BRB regional train + S-Bahn S8/S1', fare: [BAYERN], est: true },
  { a: 'sbg-hbf', b: 'FMM', minutes: 255, mode: 'train', operator: 'Regional trains via München + bus to airport', fare: [BAYERN], est: true },
  { a: 'freilassing', b: 'FMM', minutes: 245, mode: 'train', operator: 'Regional trains via München + bus to airport', fare: [BAYERN], est: true },
  { a: 'sbg-hbf', b: 'NUE', minutes: 250, mode: 'train', operator: 'Regional trains via München + U2', fare: [BAYERN], est: true },
  { a: 'freilassing', b: 'NUE', minutes: 240, mode: 'train', operator: 'Regional trains via München + U2', fare: [BAYERN], est: true },

  { a: 'sbg-hbf', b: 'LNZ', minutes: 110, mode: 'train', operator: 'ÖBB / WESTbahn to Linz + bus 601', fare: [{ eur: 17, coveredBy: AT_ALL, discounts: { vorteilscard: 0.8 } }], est: true,
    note: 'Typical Sparschiene/WESTbahn price when booked a few days ahead', src: 'https://www.oebb.at' },
  { a: 'sbg-hbf', b: 'VIE', minutes: 180, mode: 'train', operator: 'ÖBB Railjet (some run direct to Vienna Airport)', fare: [{ eur: 25, coveredBy: AT_ALL, discounts: { vorteilscard: 0.8 } }], est: true,
    note: 'Typical Sparschiene price', src: 'https://www.oebb.at' },
  { a: 'sbg-hbf', b: 'BTS', minutes: 240, mode: 'train', operator: 'ÖBB Railjet to Wien Hbf + bus to Bratislava Airport',
    fare: [{ eur: 22, coveredBy: AT_ALL, discounts: { vorteilscard: 0.8 } }, { eur: 7, coveredBy: [] }], est: true, src: 'https://www.oebb.at' },
  { a: 'sbg-hbf', b: 'INN', minutes: 135, mode: 'train', operator: 'ÖBB Railjet + bus F', fare: [{ eur: 20, coveredBy: AT_ALL, discounts: { vorteilscard: 0.8 } }], est: true },
  { a: 'MUC', b: 'FMM', minutes: 150, mode: 'train', operator: 'S-Bahn to München + regional train + bus (or Allgäu Airport Express)', fare: [BAYERN], est: true },
  { a: 'MUC', b: 'NUE', minutes: 150, mode: 'train', operator: 'S-Bahn to München + regional express + U2', fare: [BAYERN], est: true },
  { a: 'VIE', b: 'BTS', minutes: 60, mode: 'bus', operator: 'Flixbus / Slovak Lines', fare: [{ eur: 7, coveredBy: [] }], est: true },
  { a: 'LNZ', b: 'VIE', minutes: 130, mode: 'train', operator: 'ÖBB Railjet', fare: [{ eur: 19, coveredBy: AT_ALL, discounts: { vorteilscard: 0.8 } }], est: true },
];

// ---------------------------------------------------------------- timetabled bus pairs fetched live (Flixbus)
// node <-> Flixbus city/station name. Refresh resolves names to Flixbus IDs.
export const FLIX_PAIRS = [
  { a: 'sbg-hbf', b: 'MUC', aName: 'Salzburg', bName: 'München Flughafen' },
  { a: 'sbg-hbf', b: 'VIE', aName: 'Salzburg', bName: 'Wien Flughafen' },
  { a: 'sbg-hbf', b: 'BTS', aName: 'Salzburg', bName: 'Bratislava Flughafen' },
  { a: 'sbg-hbf', b: 'FMM', aName: 'Salzburg', bName: 'Memmingen Flughafen' },
  { a: 'sbg-hbf', b: 'LNZ', aName: 'Salzburg', bName: 'Linz' , bExtraMin: 30, bExtraEur: 3, note: 'Linz city + bus 601 to the airport (≈ €3)' },
];

// ---------------------------------------------------------------- car running costs (refresh replaces fuel price)
export const CAR_DEFAULTS = {
  litresPer100km: 6.5,
  fuelEurPerLitre: 1.6,
  fuelSrc: 'Default; refresh uses E-Control Spritpreisrechner (Austria)',
  vignetteNote: 'Assumes you already have the Austrian vignette (needed for Linz/Vienna/Innsbruck routes).',
};

// ---------------------------------------------------------------- bags
// Low-cost fares include ONE small under-seat bag. Rough add-on prices per person per flight.
export const BAGS = {
  small: { label: 'Small bag only (free, 40×30×20)', perFlight: 0 },
  cabin: { label: '+ cabin trolley 10 kg (≈ priority)', perFlight: 18, est: true },
  checked: { label: '+ checked bag 20 kg', perFlight: 35, est: true },
};
