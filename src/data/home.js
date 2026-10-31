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
    info: 'Alle Öffis im Land Salzburg inkl. Freilassing (SVV-Zone). Nicht über die Landesgrenze hinaus.',
    src: 'https://salzburg-verkehr.at',
  },
  klimaticket_sbg: {
    label: 'KlimaTicket Salzburg',
    info: 'Alle Öffis im Land Salzburg inkl. Freilassing (SVV).',
    src: 'https://salzburg-verkehr.at',
  },
  klimaticket_at: {
    label: 'KlimaTicket Österreich',
    info: 'Alle Öffis in Österreich (ÖBB inkl. Railjet, WESTbahn, Stadtbusse, S7 zum Flughafen Wien). Nicht Flixbus, nicht CAT.',
    src: 'https://www.klimaticket.at',
  },
  deutschlandticket: {
    label: 'Deutschlandticket',
    info: 'Nah- und Regionalverkehr in Deutschland, inkl. BRB München–Salzburg Hbf und S-Bahn zum Flughafen München. Nicht ICE/IC/EC/Railjet.',
    src: 'https://www.bahn.de',
  },
  vorteilscard: {
    label: 'ÖBB Vorteilscard',
    info: 'Rabatt auf ÖBB-Standardtickets (gerechnet als ≈ -20 %, weil Sparschiene nicht weiter reduziert wird).',
    src: 'https://www.oebb.at',
  },
  bahncard25: { label: 'BahnCard 25', info: '-25 % auf DB-Tickets (nicht auf Bayern-Ticket).', src: 'https://www.bahn.de' },
  bahncard50: { label: 'BahnCard 50', info: '-25 % auf DB-Sparpreis, -50 % auf Flexpreis (nicht auf Bayern-Ticket).', src: 'https://www.bahn.de' },
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
  ...Object.fromEntries(Object.entries(HUBS).map(([k, h]) => [k, { name: `Flughafen ${h.name} (${k})`, lat: h.lat, lon: h.lon }])),
};

// ---------------------------------------------------------------- homes
// `transit`: how this home connects to the public-transport network.
// `drive`: car minutes/km to each car park (refresh replaces with live OSRM values).
export const HOMES = {
  salzburg: {
    name: 'Salzburg (Stadt)',
    lat: 47.8095, lon: 13.055, tz: 'Europe/Vienna',
    transit: [
      { to: 'sbg-hbf', minutes: 20, mode: 'bus', operator: 'Salzburg Verkehr (O-Bus)', fare: [{ eur: 2.1, coveredBy: SVV }], est: true,
        note: '1-Stunden-Ticket €2,10 in der App / €2,60 am Automaten', src: 'https://salzburg-verkehr.at/en/tickets-fares/single-ride-tickets/1h-ticket/' },
      { to: 'SZG', minutes: 35, mode: 'bus', operator: 'Salzburg Verkehr (Bus 2 / 10)', fare: [{ eur: 2.1, coveredBy: SVV }], est: true,
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
  'SZG-P3': { node: 'SZG', name: 'Flughafen Salzburg P3 (Langzeit)', walkMin: 7, tariff: { perDay: 10, weekCap: 48 }, est: true,
    src: 'https://www.salzburg-airport.com/parken/parktarife/' },
  'MUC-P51': { node: 'MUC', name: 'Flughafen München P51 Economy (online buchen)', walkMin: 15, tariff: { perDay: 22, weekCap: 75 }, est: true,
    note: 'Schrankenpreis ≈ €34/Tag, immer online vorbuchen', src: 'https://www.munich-airport.com/parken' },
  'MUC-VALET': { node: 'MUC', name: 'Parken mit Shuttle nahe Flughafen München', walkMin: 25, tariff: { perDay: 8, weekCap: 45 }, est: true,
    note: 'Fremdanbieter mit Shuttle (z. B. Holiday Extras / parkinglist), Verfügbarkeit prüfen', src: 'https://www.parkinglist.de/flughafen-parken/parken-flughafen-muenchen' },
  'FMM-P4': { node: 'FMM', name: 'Flughafen Memmingen P4 (online)', walkMin: 8, tariff: { perDay: 8, weekCap: 56 }, est: true,
    src: 'https://www.memmingen-airport.com/home/transport/parking/' },
  'LNZ-P': { node: 'LNZ', name: 'Parken Flughafen Linz', walkMin: 5, tariff: { perDay: 8, weekCap: 45 }, est: true,
    src: 'https://www.linz-airport.com' },
  'VIE-C': { node: 'VIE', name: 'Urlauberparken Flughafen Wien C', walkMin: 15, tariff: { perDay: 20, weekCap: 90 }, est: true,
    src: 'https://www.viennaairport.com/parken' },
  'BTS-P': { node: 'BTS', name: 'Parken Flughafen Bratislava', walkMin: 5, tariff: { perDay: 7, weekCap: 40 }, est: true,
    toll: { eur: 12, note: 'Slowakische E-Vignette (≈ €12 / 10 Tage) für die letzten Autobahn-km' }, src: 'https://www.bts.aero' },
  'NUE-P': { node: 'NUE', name: 'Urlauberparken Flughafen Nürnberg', walkMin: 10, tariff: { perDay: 12, weekCap: 60 }, est: true,
    src: 'https://www.airport-nuernberg.de/parken' },
  'INN-P': { node: 'INN', name: 'Parken Flughafen Innsbruck', walkMin: 5, tariff: { perDay: 12, weekCap: 60 }, est: true,
    src: 'https://www.innsbruck-airport.com' },
  'pr-sued': { node: 'pr-sued', name: 'P+R Salzburg Süd', walkMin: 3, tariff: { perDay: 6 }, est: true,
    note: 'Tageskombi €15 inkl. Bus-Tageskarte für bis zu 5 Personen; Mehrtagespreis angenommen ≈ €6/Tag, bitte prüfen', src: 'https://www.salzburg.info/de/reiseinfos/anreise-verkehr/auto/park-ride/salzburg-sued' },
  'pr-messe': { node: 'pr-messe', name: 'P+R Messe Salzburg', walkMin: 3, tariff: { perDay: 21 }, est: true,
    note: 'Tagesmax. €21 (Kombi €15 inkl. Bus-Tageskarte für bis zu 5)', src: 'https://www.salzburg.info/de/reiseinfos/anreise-verkehr/auto/park-ride/messe-salzburg' },
  freilassing: { node: 'freilassing', name: 'Parken Bahnhof Freilassing', walkMin: 4, tariff: { perDay: 3 }, est: true,
    note: 'Bahnhofsparkplatz in Deutschland, Preis unbestätigt, Schilder prüfen', src: 'https://www.freilassing.de' },
};

// ---------------------------------------------------------------- public transport (any departure, not timetabled)
// minutes include typical waiting/changing. fare parts are PER PERSON unless kind:'bayern'.
// kind 'bayern' = Bayern-Ticket group price: €34 first person + €10 each extra (max 5), 2nd class.
const BAYERN = { kind: 'bayern', first: 34, extra: 10, max: 5, coveredBy: DE_REGIO,
  note: 'Bayern-Ticket (Regionalzüge + S-Bahn), Mo–Fr erst ab 09:00 gültig', src: 'https://www.bahn.de/angebot/regio/laender-tickets/bayern-ticket' };

export const TRANSIT = [
  { a: 'sbg-hbf', b: 'SZG', minutes: 26, mode: 'bus', operator: 'Salzburg Verkehr Bus 2', fare: [{ eur: 2.1, coveredBy: SVV }], est: true },
  { a: 'sbg-hbf', b: 'freilassing', minutes: 16, mode: 'train', operator: 'S-Bahn Salzburg', fare: [{ eur: 2.1, coveredBy: [...SVV, ...DE_REGIO] }], est: true },
  { a: 'pr-sued', b: 'sbg-hbf', minutes: 30, mode: 'bus', operator: 'Salzburg Verkehr Bus 3 / 8', fare: [{ eur: 2.1, coveredBy: SVV }], est: true },
  { a: 'pr-messe', b: 'sbg-hbf', minutes: 20, mode: 'bus', operator: 'Salzburg Verkehr Bus 1', fare: [{ eur: 2.1, coveredBy: SVV }], est: true },

  { a: 'sbg-hbf', b: 'MUC', minutes: 165, mode: 'train', operator: 'BRB-Regionalzug + S-Bahn S8/S1', fare: [BAYERN], est: true },
  { a: 'freilassing', b: 'MUC', minutes: 155, mode: 'train', operator: 'BRB-Regionalzug + S-Bahn S8/S1', fare: [BAYERN], est: true },
  { a: 'sbg-hbf', b: 'FMM', minutes: 255, mode: 'train', operator: 'Regionalzüge über München + Bus zum Flughafen', fare: [BAYERN], est: true },
  { a: 'freilassing', b: 'FMM', minutes: 245, mode: 'train', operator: 'Regionalzüge über München + Bus zum Flughafen', fare: [BAYERN], est: true },
  { a: 'sbg-hbf', b: 'NUE', minutes: 250, mode: 'train', operator: 'Regionalzüge über München + U2', fare: [BAYERN], est: true },
  { a: 'freilassing', b: 'NUE', minutes: 240, mode: 'train', operator: 'Regionalzüge über München + U2', fare: [BAYERN], est: true },

  { a: 'sbg-hbf', b: 'LNZ', minutes: 110, mode: 'train', operator: 'ÖBB / WESTbahn nach Linz + Bus 601', fare: [{ eur: 17, coveredBy: AT_ALL, discounts: { vorteilscard: 0.8 } }], est: true,
    note: 'Typischer Sparschiene-/WESTbahn-Preis, ein paar Tage vorher gebucht', src: 'https://www.oebb.at' },
  { a: 'sbg-hbf', b: 'VIE', minutes: 180, mode: 'train', operator: 'ÖBB Railjet (manche fahren direkt zum Flughafen Wien)', fare: [{ eur: 25, coveredBy: AT_ALL, discounts: { vorteilscard: 0.8 } }], est: true,
    note: 'Typischer Sparschiene-Preis', src: 'https://www.oebb.at' },
  { a: 'sbg-hbf', b: 'BTS', minutes: 240, mode: 'train', operator: 'ÖBB Railjet nach Wien Hbf + Bus zum Flughafen Bratislava',
    fare: [{ eur: 22, coveredBy: AT_ALL, discounts: { vorteilscard: 0.8 } }, { eur: 7, coveredBy: [] }], est: true, src: 'https://www.oebb.at' },
  { a: 'sbg-hbf', b: 'INN', minutes: 135, mode: 'train', operator: 'ÖBB Railjet + bus F', fare: [{ eur: 20, coveredBy: AT_ALL, discounts: { vorteilscard: 0.8 } }], est: true },
  { a: 'MUC', b: 'FMM', minutes: 150, mode: 'train', operator: 'S-Bahn nach München + Regionalzug + Bus (oder Allgäu Airport Express)', fare: [BAYERN], est: true },
  { a: 'MUC', b: 'NUE', minutes: 150, mode: 'train', operator: 'S-Bahn nach München + Regionalexpress + U2', fare: [BAYERN], est: true },
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
  { a: 'sbg-hbf', b: 'LNZ', aName: 'Salzburg', bName: 'Linz' , bExtraMin: 30, bExtraEur: 3, note: 'Linz Stadt + Bus 601 zum Flughafen (≈ €3)' },
];

// ---------------------------------------------------------------- car running costs (refresh replaces fuel price)
export const CAR_DEFAULTS = {
  litresPer100km: 6.5,
  fuelEurPerLitre: 1.6,
  fuelSrc: 'Standard; beim Aktualisieren kommt der Preis vom E-Control-Spritpreisrechner',
  vignetteNote: 'Annahme: du hast schon die österreichische Vignette (für Linz/Wien/Innsbruck nötig).',
};

// ---------------------------------------------------------------- bags
// Low-cost fares include ONE small under-seat bag. Rough add-on prices per person per flight.
export const BAGS = {
  small: { label: 'Nur kleine Tasche (gratis, 40×30×20)', perFlight: 0 },
  cabin: { label: '+ Handgepäck-Trolley 10 kg (≈ Priority)', perFlight: 18, est: true },
  checked: { label: '+ Aufgabegepäck 20 kg', perFlight: 35, est: true },
};
