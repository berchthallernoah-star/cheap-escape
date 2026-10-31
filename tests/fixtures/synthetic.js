// SYNTHETIC test data — NOT real prices. Used only by the unit tests to check the
// planner's arithmetic and logic. Never shown in the app.
import { localToUtcMin } from '../../src/lib/time.js';

export const AIRPORTS = {
  SZG: { name: 'Salzburg', city: 'Salzburg', country: 'at', tz: 'Europe/Vienna', lat: 47.7933, lon: 13.0043 },
  MUC: { name: 'Munich', city: 'Munich', country: 'de', tz: 'Europe/Berlin', lat: 48.3538, lon: 11.7861 },
  STN: { name: 'London Stansted', city: 'London', country: 'gb', countryName: 'United Kingdom', tz: 'Europe/London', lat: 51.885, lon: 0.235 },
  LHR: { name: 'London Heathrow', city: 'London', country: 'gb', countryName: 'United Kingdom', tz: 'Europe/London', lat: 51.47, lon: -0.4543 },
  BHX: { name: 'Birmingham', city: 'Birmingham', country: 'gb', countryName: 'United Kingdom', tz: 'Europe/London', lat: 52.4539, lon: -1.748 },
  BGY: { name: 'Milan Bergamo', city: 'Milan', country: 'it', countryName: 'Italy', tz: 'Europe/Rome', lat: 45.6739, lon: 9.7042 },
};

/** flight(from, to, 'YYYY-MM-DDTHH:MM' local dep, minutes, eur) */
export function flight(from, to, depLocal, minutes, eur, carrier = 'FR', number = 'FR0000') {
  const dep = localToUtcMin(depLocal, AIRPORTS[from].tz);
  return [from, to, dep, dep + minutes, eur, carrier, number];
}

export function bus(a, b, depLocal, minutes, eur, tz = 'Europe/Vienna') {
  const dep = localToUtcMin(depLocal, tz);
  return [a, b, dep, dep + minutes, eur, 'Flixbus', 'https://www.flixbus.com'];
}

export function snapshot(flights, timed = []) {
  return { version: 1, live: false, synthetic: true, generatedAt: '2026-10-31T08:00:00Z', airports: AIRPORTS, flights, timed };
}

// A Friday -> Sunday weekend
export const WEEKEND = { leaveAfter: '2026-11-06T14:00', leaveBefore: '2026-11-07T14:00', backBy: '2026-11-09T01:00' };
