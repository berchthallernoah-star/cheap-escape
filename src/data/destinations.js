// DESTINATION SIDE: a city is a set of airports, and nearby cities are linked by
// coach/train. This is what lets the planner fly you into Stansted and home from
// Heathrow, or into Stansted and home from Birmingham.
//
// Prices are per person, one way, typical when booked a few days ahead (≈ estimates).
// The app always shows them with "≈" and a link to check.

export const CHECKED = '2026-10-31';

// Metro areas: airports that count as "the same city" for display + grouping.
export const METROS = {
  London: ['STN', 'LTN', 'LGW', 'LHR', 'SEN', 'LCY'],
  Paris: ['BVA', 'ORY', 'CDG'],
  Milan: ['BGY', 'MXP', 'LIN'],
  Venice: ['TSF', 'VCE'],
  Rome: ['CIA', 'FCO'],
  Barcelona: ['BCN', 'GRO', 'REU'],
  Brussels: ['CRL', 'BRU'],
  Stockholm: ['ARN', 'NYO', 'BMA'],
  Oslo: ['OSL', 'TRF'],
  Warsaw: ['WAW', 'WMI'],
  Frankfurt: ['FRA', 'HHN'],
  Düsseldorf: ['DUS', 'NRN'],
  Glasgow: ['GLA', 'PIK'],
  Copenhagen: ['CPH', 'MMX'],
  Tenerife: ['TFS', 'TFN'],
  Belfast: ['BFS', 'BHD'],
};

// Curated ground links (symmetric). minutes = door-to-door between the two
// airports incl. typical waiting. eur = per person.
// [a, b, minutes, eur, operator, bookingUrl]
const L = (a, b, minutes, eur, operator, url) => ({ a, b, minutes, eur, operator, url, est: true });

export const GROUND_LINKS = [
  // London + Birmingham
  L('STN', 'LHR', 110, 22, 'National Express coach', 'https://www.nationalexpress.com'),
  L('STN', 'LTN', 80, 18, 'National Express coach', 'https://www.nationalexpress.com'),
  L('STN', 'LGW', 180, 28, 'National Express coach', 'https://www.nationalexpress.com'),
  L('STN', 'LCY', 90, 25, 'Stansted Express + DLR', 'https://www.stanstedexpress.com'),
  L('STN', 'SEN', 150, 30, 'Train via London', 'https://www.nationalrail.co.uk'),
  L('LTN', 'LHR', 75, 22, 'National Express coach', 'https://www.nationalexpress.com'),
  L('LTN', 'LGW', 110, 25, 'Thameslink train', 'https://www.nationalrail.co.uk'),
  L('LGW', 'LHR', 75, 28, 'National Express coach', 'https://www.nationalexpress.com'),
  L('LCY', 'LHR', 60, 14, 'DLR + Elizabeth line', 'https://tfl.gov.uk'),
  L('LGW', 'LCY', 75, 18, 'Train + DLR', 'https://tfl.gov.uk'),
  L('STN', 'BHX', 200, 25, 'National Express coach', 'https://www.nationalexpress.com'),
  L('LHR', 'BHX', 150, 20, 'National Express coach', 'https://www.nationalexpress.com'),
  L('LTN', 'BHX', 120, 18, 'National Express coach', 'https://www.nationalexpress.com'),
  L('LHR', 'BRS', 150, 30, 'National Express coach', 'https://www.nationalexpress.com'),
  L('MAN', 'LPL', 75, 15, 'Train', 'https://www.nationalrail.co.uk'),
  L('MAN', 'LBA', 100, 20, 'Train', 'https://www.nationalrail.co.uk'),
  L('BHX', 'MAN', 150, 20, 'National Express coach', 'https://www.nationalexpress.com'),
  L('BHX', 'EMA', 75, 15, 'Coach / train', 'https://www.nationalexpress.com'),
  L('EDI', 'GLA', 90, 15, 'Citylink coach / train', 'https://www.citylink.co.uk'),
  L('PIK', 'GLA', 60, 12, 'Bus + train', 'https://www.spt.co.uk'),
  L('EDI', 'PIK', 120, 20, 'Train via Glasgow', 'https://www.scotrail.co.uk'),
  L('BFS', 'BHD', 50, 10, 'Airport Express bus', 'https://www.translink.co.uk'),
  L('BFS', 'DUB', 150, 20, 'Aircoach / Translink', 'https://www.aircoach.ie'),
  L('BHD', 'DUB', 140, 20, 'Aircoach / Translink', 'https://www.aircoach.ie'),
  // France / Benelux
  L('BVA', 'CDG', 135, 30, 'Beauvais shuttle + RER B', 'https://www.aeroportparisbeauvais.com'),
  L('BVA', 'ORY', 150, 30, 'Beauvais shuttle + Orlyval', 'https://www.aeroportparisbeauvais.com'),
  L('CDG', 'ORY', 80, 20, 'RER B + Orlyval / bus', 'https://www.ratp.fr'),
  L('CRL', 'BRU', 75, 17, 'Flibco / bus via Brussels', 'https://www.flibco.com'),
  L('EIN', 'AMS', 105, 25, 'Bus + NS train', 'https://www.ns.nl'),
  L('EIN', 'CRL', 150, 25, 'Flibco / train', 'https://www.flibco.com'),
  L('NRN', 'DUS', 75, 17, 'Airport bus / train', 'https://www.airport-weeze.com'),
  L('CGN', 'DUS', 45, 12, 'Regional train', 'https://www.bahn.de'),
  L('NRN', 'CGN', 120, 25, 'Bus + regional train', 'https://www.bahn.de'),
  L('HHN', 'FRA', 105, 18, 'Flibco / bus', 'https://www.flibco.com'),
  L('LUX', 'HHN', 105, 20, 'Flibco', 'https://www.flibco.com'),
  // Italy
  L('BGY', 'MXP', 90, 20, 'Bus (Orio Shuttle / Autostradale)', 'https://www.autostradale.it'),
  L('BGY', 'LIN', 75, 12, 'Bus via Milano Centrale', 'https://www.autostradale.it'),
  L('MXP', 'LIN', 75, 13, 'Bus / Malpensa Express', 'https://www.malpensaexpress.it'),
  L('MXP', 'TRN', 105, 18, 'Bus', 'https://www.sadem.it'),
  L('BGY', 'TRN', 150, 20, 'Bus / train via Milan', 'https://www.flixbus.com'),
  L('BGY', 'VRN', 110, 15, 'Bus + regional train', 'https://www.trenitalia.com'),
  L('TSF', 'VCE', 60, 12, 'ATVO / bus via Venice Mestre', 'https://www.atvo.it'),
  L('VCE', 'TRS', 120, 15, 'Train', 'https://www.trenitalia.com'),
  L('VCE', 'BLQ', 120, 18, 'Train via Venezia Mestre', 'https://www.trenitalia.com'),
  L('CIA', 'FCO', 90, 12, 'Bus via Roma Termini', 'https://www.terravision.eu'),
  L('PSA', 'BLQ', 150, 25, 'Train via Florence', 'https://www.trenitalia.com'),
  L('FCO', 'NAP', 165, 25, 'Train via Roma Termini', 'https://www.italotreno.com'),
  L('PMO', 'TPS', 75, 11, 'Bus', 'https://www.segesta.it'),
  L('CTA', 'CIY', 90, 12, 'Bus', 'https://www.aststrasporti.it'),
  L('BRI', 'BDS', 105, 12, 'Train / bus', 'https://www.trenitalia.com'),
  // Spain / Portugal
  L('BCN', 'GRO', 90, 17, 'Sagalés airport bus', 'https://www.sagales.com'),
  L('BCN', 'REU', 90, 17, 'Hispano Igualadina bus', 'https://www.monbus.es'),
  L('AGP', 'SVQ', 165, 20, 'ALSA bus', 'https://www.alsa.com'),
  L('ALC', 'VLC', 150, 20, 'ALSA bus / train', 'https://www.alsa.com'),
  L('ALC', 'RMU', 60, 10, 'Bus', 'https://www.alsa.com'),
  L('OPO', 'LIS', 180, 25, 'CP train / Flixbus', 'https://www.cp.pt'),
  L('TFS', 'TFN', 75, 10, 'TITSA bus', 'https://titsa.com'),
  // Nordics / Baltics / Poland
  L('NYO', 'ARN', 120, 25, 'Flygbussarna via Stockholm', 'https://www.flygbussarna.se'),
  L('TRF', 'OSL', 120, 30, 'Torp-ekspressen / train', 'https://www.torpekspressen.no'),
  L('CPH', 'MMX', 60, 20, 'Øresund train + bus', 'https://www.skanetrafiken.se'),
  L('WMI', 'WAW', 80, 8, 'Bus / train via Warsaw', 'https://www.modlinbus.com'),
  L('KRK', 'KTW', 105, 12, 'Bus (Matuszek / Flixbus)', 'https://www.flixbus.com'),
  L('RIX', 'VNO', 270, 20, 'Lux Express bus', 'https://luxexpress.eu'),
  L('KUN', 'VNO', 90, 10, 'Bus', 'https://www.flixbus.com'),
  // Central / Balkans
  L('BUD', 'BTS', 180, 15, 'Flixbus / RegioJet', 'https://www.flixbus.com'),
  L('ZAG', 'LJU', 150, 15, 'Flixbus', 'https://www.flixbus.com'),
  L('SPU', 'ZAD', 165, 15, 'Bus', 'https://www.flixbus.com'),
  L('SKG', 'ATH', 300, 30, 'Train', 'https://www.hellenictrain.gr'),
];

// Any two airports in the SAME country closer than this (great-circle km) get an
// automatic estimated link if no curated link exists. Marked "≈ rough estimate".
export const AUTO_LINK = {
  maxKm: 120,
  minutes: (km) => Math.round(45 + km * 1.1),
  eur: (km) => Math.round(5 + km * 0.12),
};
