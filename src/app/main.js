// Phone app: re-plans instantly in the browser from the embedded fare snapshot.
// Flow: pick WHEN (a weekend from the strip, or a few days ± flexible) -> the list shows the
// cheapest door-to-door trips; in the background every other weekend / start day is planned
// too, so the strip shows prices and a tip appears when another time is clearly cheaper.
import { plan, weekendWindows, bookingUrl, kiwiUrl } from '../planner/plan.js';
import { findAnomalies } from '../planner/anomalies.js';
import { CARDS, BAGS, HOMES } from '../data/home.js';
import { GROUND_CITIES } from '../data/ground.js';
import { haversineKm } from '../planner/graph.js';
import { utcMinToLocal, todayIn, addDays, dowOf, fmtDuration, localToUtcMin } from '../lib/time.js';

const HOME = HOMES.salzburg;
const HOME_TZ = HOME.tz;
const SNAP = JSON.parse(document.getElementById('snapshot').textContent);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (x) => `€${(Math.round(x * 100) / 100).toFixed(2).replace(/\.00$/, '').replace('.', ',')}`;
const eur0 = (x) => `€${Math.round(x)}`;
const RIDES = new Set(['flight', 'bus', 'train']);

// ---------------------------------------------------------------- German dates
const DOW = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const DOW_EN = { Sun: 'So', Mon: 'Mo', Tue: 'Di', Wed: 'Mi', Thu: 'Do', Fri: 'Fr', Sat: 'Sa' };
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const dm = (d) => `${+d.slice(8, 10)}.${+d.slice(5, 7)}.`;
const dowD = (d) => DOW[dowOf(d)];
const dayLabel = (d) => `${dowD(d)} ${dm(d)}`;
function rangeLabel(a, b) {
  if (a === b) return `${+a.slice(8, 10)}. ${MON[+a.slice(5, 7) - 1]}`;
  return a.slice(5, 7) === b.slice(5, 7)
    ? `${+a.slice(8, 10)}.–${+b.slice(8, 10)}. ${MON[+b.slice(5, 7) - 1]}`
    : `${+a.slice(8, 10)}. ${MON[+a.slice(5, 7) - 1]}–${+b.slice(8, 10)}. ${MON[+b.slice(5, 7) - 1]}`;
}
const nightsWord = (n) => `${n} ${n === 1 ? 'Nacht' : 'Nächte'}`;
const nightsBetween = (a, b) => Math.max(0, Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000));
const today = () => todayIn(HOME_TZ);
const localIso = (utcMin) => utcMinToLocal(utcMin, HOME_TZ).iso;
function soonLocal() {
  const m = Math.floor(Date.now() / 60000) + 45;
  return localIso(Math.ceil(m / 15) * 15);
}
const minutesBetween = (a, b) => localToUtcMin(b, HOME_TZ) - localToUtcMin(a, HOME_TZ);
function timeOf(utc, tz, approx) {
  if (utc == null) return '';
  return `${approx ? '≈' : ''}${utcMinToLocal(utc, tz || HOME_TZ).time}`;
}
function dayOf(utc, tz) {
  const l = utcMinToLocal(utc, tz || HOME_TZ);
  return `${DOW_EN[l.dow]} ${dm(l.date)}`;
}

// how far the fare data reaches (last flight / bus in the snapshot)
const LAST_DATA = (() => {
  let max = 0;
  for (const r of SNAP.flights || []) if (r[2] > max) max = r[2];
  for (const r of SNAP.ground || []) if (r[2] > max) max = r[2];
  return max ? utcMinToLocal(max, HOME_TZ).date : addDays(today(), 45);
})();

// ---------------------------------------------------------------- German names for places
const CITY_DE = {
  Munich: 'München', Vienna: 'Wien', Nuremberg: 'Nürnberg', Milan: 'Mailand', Rome: 'Rom', Naples: 'Neapel', Venice: 'Venedig', Florence: 'Florenz',
  Genoa: 'Genua', Turin: 'Turin', Trieste: 'Triest', Lisbon: 'Lissabon', Brussels: 'Brüssel', Copenhagen: 'Kopenhagen', Warsaw: 'Warschau', Krakow: 'Krakau',
  Prague: 'Prag', Athens: 'Athen', Bucharest: 'Bukarest', Belgrade: 'Belgrad', Seville: 'Sevilla', Moscow: 'Moskau', Geneva: 'Genf', Zurich: 'Zürich',
  Cologne: 'Köln', Nice: 'Nizza', Gothenburg: 'Göteborg', Antwerp: 'Antwerpen', Gdansk: 'Danzig', Hanover: 'Hannover', Tenerife: 'Teneriffa',
  Palma: 'Palma de Mallorca', Malaga: 'Málaga', Marrakesh: 'Marrakesch', Rhodes: 'Rhodos', Corfu: 'Korfu', Crete: 'Kreta', Heraklion: 'Heraklion (Kreta)',
  Chania: 'Chania (Kreta)', Prishtina: 'Pristina', Tbilisi: 'Tiflis', Yerevan: 'Jerewan', Luxembourg: 'Luxemburg', Strasbourg: 'Straßburg', 'Tel-Aviv': 'Tel Aviv',
  'Paris Orly': 'Paris (Orly)', 'Basel-Mulhouse-Freiburg': 'Basel', Kyiv: 'Kiew', Kiev: 'Kiew', 'Saint Petersburg': 'Sankt Petersburg', 'St Petersburg': 'Sankt Petersburg',
  Cyprus: 'Zypern', Sicily: 'Sizilien', Sardinia: 'Sardinien', 'Comiso (Sicily)': 'Comiso (Sizilien)', IASI: 'Iași', Tromso: 'Tromsø', Nis: 'Niš', Izmir: 'İzmir',
};
const cityDe = (c) => CITY_DE[String(c || '').trim()] || String(c || '').trim();
let regionNames = null;
try { regionNames = new Intl.DisplayNames(['de'], { type: 'region' }); } catch { /* old browser */ }
function countryDe(code, fallback) {
  if (code && regionNames) {
    try { const n = regionNames.of(String(code).toUpperCase()); if (n && n.length > 2) return n; } catch { /* unknown code */ }
  }
  return fallback || code || '';
}
const placeOf = (code) => SNAP.airports?.[code] || SNAP.places?.[code] || GROUND_CITIES[code] || null;
function kmOf(code) {
  const p = placeOf(code);
  return p && p.lat != null ? Math.round(haversineKm(HOME, p)) : null;
}

// destination search: German or English city / country names, country codes, airport codes
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').trim();
const DEST = (() => {
  const index = new Map();
  const labels = new Map();
  const add = (name, value, label) => {
    const k = norm(name);
    if (!k) return;
    if (!index.has(k)) index.set(k, new Set());
    index.get(k).add(value);
    if (label) labels.set(label, true);
  };
  const countries = new Map();
  const cityRows = [
    ...Object.entries(SNAP.airports || {}).map(([code, a]) => ({ code, ...a })),
    ...Object.values(GROUND_CITIES), ...Object.values(SNAP.places || {}),
  ];
  for (const a of cityRows) {
    const city = String(a.city || '').trim();
    if (city) { add(city, city, cityDe(city)); add(cityDe(city), city); }
    if (a.code && /^[A-Z]{3}$/.test(a.code)) add(a.code, a.code);
    if (a.country) countries.set(String(a.country).toLowerCase(), a.countryName || '');
  }
  for (const [code, en] of countries) {
    const de = countryDe(code, en);
    add(code, code); add(en, code); add(de, code, de);
  }
  for (const [alias, code] of [['england', 'gb'], ['schottland', 'gb'], ['wales', 'gb'], ['uk', 'gb'], ['grossbritannien', 'gb'], ['britain', 'gb'], ['holland', 'nl'],
    ['tschechien', 'cz'], ['turkei', 'tr'], ['mallorca', 'es'], ['kanaren', 'es'], ['sizilien', 'it'], ['sardinien', 'it']]) if (countries.has(code)) add(alias, code);
  return { index, labels: [...labels.keys()].sort((x, y) => x.localeCompare(y, 'de')) };
})();
function resolveDest(text) {
  const toks = String(text || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!toks.length) return null;
  const out = new Set();
  for (const tok of toks) {
    const k = norm(tok);
    const exact = DEST.index.get(k);
    if (exact) { for (const v of exact) out.add(v); continue; }
    let hit = false;
    if (k.length >= 3) for (const [name, vals] of DEST.index) if (name.startsWith(k)) { hit = true; for (const v of vals) out.add(v); }
    if (!hit) out.add(tok);
  }
  return [...out];
}

// ---------------------------------------------------------------- state (remembered on this phone)
const LEAVE = {
  'thu-17': { label: 'Do ab 17 Uhr', dow: 4, time: '17:00', untilDays: 1, untilTime: '23:59' },
  'fri-12': { label: 'Fr ab 12 Uhr', dow: 5, time: '12:00', untilDays: 1, untilTime: '14:00' },
  'fri-14': { label: 'Fr ab 14 Uhr', dow: 5, time: '14:00', untilDays: 1, untilTime: '14:00' },
  'fri-16': { label: 'Fr ab 16 Uhr', dow: 5, time: '16:00', untilDays: 1, untilTime: '14:00' },
  'fri-18': { label: 'Fr ab 18 Uhr', dow: 5, time: '18:00', untilDays: 1, untilTime: '14:00' },
  'sat-06': { label: 'Sa ab 6 Uhr', dow: 6, time: '06:00', untilDays: 0, untilTime: '18:00' },
};
const BACK = {
  'sun-eve': { label: 'So 21 Uhr', fromFri: 2, time: '21:00' },
  'sun-night': { label: 'So Nacht (1 Uhr)', fromFri: 3, time: '01:00' },
  'mon-noon': { label: 'Mo 12 Uhr', fromFri: 3, time: '12:00' },
  'mon-night': { label: 'Mo Nacht (1 Uhr)', fromFri: 4, time: '01:00' },
};
const BAG_SHORT = { small: 'nur kleine Tasche', cabin: '+ Trolley', checked: '+ Koffer' };
const DEFAULTS = {
  tab: 'trips', when: 'weekend', week: null, leave: 'fri-14', backBy: 'sun-night',
  daysFrom: '', daysTo: '', flex: 1, daysLeave: '08:00',
  travelers: [{ name: 'Ich', cards: ['superschoolcard'] }],
  car: true, bike: false, ground: true, maxWalk: 30, bags: 'small', minStay: 20,
  dest: '', maxPP: '', minKm: 200, mode: 'all', sort: 'price', stayDate: null,
};
const KEY = 'cheap-escape-2';
let state = load();
function load() {
  let s = null;
  try {
    s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s) {
      const old = JSON.parse(localStorage.getItem('cheap-escape') || 'null'); // first version: keep people + cards
      if (old && Array.isArray(old.travelers)) {
        s = { travelers: old.travelers.map((t) => ({ name: t.name === 'Me' ? 'Ich' : t.name, cards: t.cards || [] })), car: old.car ?? true, bike: !!old.bike, ground: old.ground ?? true, bags: old.bags || 'small' };
      }
    }
  } catch { /* storage blocked */ }
  const st = { ...structuredClone(DEFAULTS), ...(s && Array.isArray(s.travelers) ? s : {}) };
  if (!LEAVE[st.leave]) st.leave = DEFAULTS.leave;
  if (!BACK[st.backBy]) st.backBy = DEFAULTS.backBy;
  if (!BAGS[st.bags]) st.bags = 'small';
  if (!st.travelers.length) st.travelers = structuredClone(DEFAULTS.travelers);
  const t = today();
  if (!st.daysFrom || st.daysFrom < t || st.daysFrom > LAST_DATA) {
    let d = addDays(t, 1);
    while (dowOf(d) !== 4) d = addDays(d, 1);
    st.daysFrom = d;
    st.daysTo = addDays(d, 3);
  }
  if (!st.daysTo || st.daysTo < st.daysFrom) st.daysTo = addDays(st.daysFrom, 2);
  return st;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- time windows
function weekends() {
  const L = LEAVE[state.leave];
  const B = BACK[state.backBy];
  const wins = weekendWindows(addDays(today(), -3), 12, { leaveDow: L.dow, leaveTime: L.time, leaveUntilDays: L.untilDays, leaveUntilTime: L.untilTime, backDays: B.fromFri + (5 - L.dow), backTime: B.time });
  const soon = soonLocal();
  const out = [];
  for (const w0 of wins) {
    if (w0.label > LAST_DATA) break;
    const w = { kind: 'weekend', key: w0.label, leaveAfter: w0.leaveAfter, leaveBefore: w0.leaveBefore, backBy: w0.backBy };
    if (w.leaveAfter < soon) {
      w.now = true;
      w.leaveAfter = soon;
      if (w.leaveBefore < soon) w.leaveBefore = localIso(localToUtcMin(soon, HOME_TZ) + 6 * 60);
    }
    if (minutesBetween(w.leaveAfter, w.backBy) < Number(state.minStay) * 60 + 4 * 60) continue;
    w.start = w.leaveAfter.slice(0, 10);
    w.end = w.backBy.slice(11, 13) < '06' ? addDays(w.backBy.slice(0, 10), -1) : w.backBy.slice(0, 10);
    w.title = rangeLabel(w.start, w.end);
    w.dows = `${dowD(w.start)}–${dowD(w.end)}`;
    out.push(w);
  }
  return out.slice(0, 10);
}
function selectedWeekend(ws = weekends()) {
  const hit = ws.find((w) => w.key === state.week);
  if (hit) return hit;
  const d = dowOf(today());
  return ws[0]?.now && (d === 6 || d === 0) && ws[1] ? ws[1] : ws[0] || null;
}
function dayWindow(a, b) {
  const nights = nightsBetween(a, b);
  const soon = soonLocal();
  const w = { kind: 'days', key: `${a}|${b}`, start: a, end: b, nights,
    leaveAfter: `${a}T${state.daysLeave}`, leaveBefore: `${a}T23:59`, backBy: `${addDays(b, 1)}T02:00`,
    returnAfter: nights ? `${b}T00:00` : null, minStayHours: nights ? Number(state.minStay) : 4 };
  if (w.leaveBefore < soon || a > LAST_DATA) return null;
  if (w.leaveAfter < soon) { w.leaveAfter = soon; w.now = true; }
  w.title = rangeLabel(a, b);
  w.dows = `${dowD(a)}–${dowD(b)}`;
  return w;
}
const tripNights = () => nightsBetween(state.daysFrom, state.daysTo);
function selectedWindows() {
  if (state.when === 'weekend') { const w = selectedWeekend(); return w ? [w] : []; }
  const out = [];
  for (let k = -Number(state.flex); k <= Number(state.flex); k++) {
    const w = dayWindow(addDays(state.daysFrom, k), addDays(state.daysTo, k));
    if (w) out.push(w);
  }
  return out;
}
function scanWindows() {
  const n = tripNights();
  const out = [];
  for (let d = today(); d <= LAST_DATA && out.length < 70; d = addDays(d, 1)) {
    const w = dayWindow(d, addDays(d, n));
    if (w) out.push(w);
  }
  return out;
}

// ---------------------------------------------------------------- planning (cached per settings + window)
function baseQuery() {
  const n = state.travelers.length;
  const m = state.mode;
  return {
    home: 'salzburg',
    travelers: state.travelers.map((t, i) => ({ name: t.name || `Person ${i + 1}`, cards: t.cards })),
    car: state.car || m === 'car',
    bike: state.bike,
    ground: m === 'flight' ? false : state.ground || ['bus', 'train', 'car'].includes(m),
    maxWalkMin: Number(state.maxWalk),
    bags: state.bags,
    minStayHours: Number(state.minStay),
    destinations: resolveDest(state.dest),
    maxPrice: Number(state.maxPP) > 0 ? Number(state.maxPP) * n : null,
    minKm: state.dest.trim() ? 0 : Number(state.minKm), // a named destination wins over the distance filter
    limit: 100,
    perCity: 3,
  };
}
let cacheKey = '';
let cache = new Map();
const winKey = (w) => `${w.leaveAfter}|${w.leaveBefore}|${w.backBy}|${w.returnAfter || ''}|${w.minStayHours ?? ''}`;
function useQuery(q) {
  const k = JSON.stringify(q);
  if (k !== cacheKey) { cacheKey = k; cache = new Map(); }
}
const cached = (w) => cache.get(winKey(w));
function planFor(q, w) {
  useQuery(q);
  const k = winKey(w);
  let r = cache.get(k);
  if (!r) {
    const win = { leaveAfter: w.leaveAfter, leaveBefore: w.leaveBefore, backBy: w.backBy };
    if (w.returnAfter) win.returnAfter = w.returnAfter;
    if (w.minStayHours != null) win.minStayHours = w.minStayHours;
    try { r = plan(SNAP, { ...q, ...win }).trips; } catch (e) { console.error(e); r = []; }
    for (const t of r) t.win = w;
    cache.set(k, r);
  }
  return r;
}
const rideKinds = (t) => (t.mode === 'car' ? ['car'] : t.legs.filter((l) => RIDES.has(l.kind) && l.fromCode).map((l) => l.kind));
const passMode = (t, m = state.mode) => m === 'all' || rideKinds(t).includes(m);
const bestOf = (trips) => trips.find((t) => passMode(t)) || null;

// ---------------------------------------------------------------- words
const MODE_WORD = { flight: 'Flug', bus: 'Bus', train: 'Zug', mixed: 'gemischt', car: 'Auto', drive: 'Auto' };
const KIND = { flight: 'Flug', bus: 'Bus', train: 'Zug', drive: 'Auto', park: 'Parken', transfer: 'Bus / Zug vor Ort', toll: 'Maut',
  walk: 'Zu Fuß', bike: 'Eigenes Rad', bikeshare: 'Leihrad' };
const ALT_WORD = { walk: 'Zu Fuß', bikeshare: 'Leihrad', bus: 'Bus', train: 'Zug', bike: 'Rad' };
const MODE_PLAIN = { plane: 'Flug', flight: 'Flug', bus: 'Bus', train: 'Zug' };
function modeWord(t) {
  const k = [...new Set(rideKinds(t))];
  return k.length === 1 ? MODE_WORD[k[0]] : k.map((x) => MODE_WORD[x]).join(' + ');
}
function tagDe(x) {
  const fixed = { 'by plane': 'Flugzeug', 'by bus': 'Bus', 'by train': 'Zug', 'different airport back': 'anderer Flughafen zurück', car: 'mit Auto', bike: 'mit Rad',
    'no car': 'ohne Auto', Flixbus: 'Flixbus', 'some walking': 'etwas zu Fuß', 'by car': 'ganz mit dem Auto', 'leave and return whenever you like': 'Abfahrt und Rückkehr frei wählbar' };
  if (fixed[x]) return fixed[x];
  let m = /^(\w+) out, (\w+) back$/.exec(x);
  if (m) return `hin ${MODE_PLAIN[m[1]] || m[1]}, zurück ${MODE_PLAIN[m[2]] || m[2]}`;
  m = /^home from (.+)$/.exec(x);
  if (m) return `zurück ab ${cityDe(m[1])}`;
  m = /^land in (.+)$/.exec(x);
  if (m) return `Landung in ${m[1]}`;
  return x;
}
function shortPlace(code, fallback) {
  if (!code) return fallback;
  if (code === 'sbg-hbf') return 'Salzburg';
  if (code.startsWith('C:')) return cityDe(GROUND_CITIES[code]?.city || code.slice(2));
  return code;
}
function mapsUrl(m) {
  if (!m?.from || !m?.to || m.from.lat == null) return null;
  return `https://www.google.com/maps/dir/?api=1&origin=${m.from.lat},${m.from.lon}&destination=${m.to.lat},${m.to.lon}&travelmode=${m.mode || 'transit'}`;
}

// ---------------------------------------------------------------- where to sleep (Hostelworld beds + trivago hotels)
function stayFor(t) {
  const rides = t.legs.filter((l) => RIDES.has(l.kind) && l.fromCode);
  if (!rides.length || t.mode === 'car') return null;
  const out = rides[0];
  const back = rides[rides.length - 1];
  const inDate = utcMinToLocal(out.arr, out.tzTo || 'UTC').date;
  const outDate = utcMinToLocal(back.dep, back.tzFrom || 'UTC').date;
  const nights = nightsBetween(inDate, outDate);
  if (!nights) return { nights: 0 };
  const keys = [t.city, SNAP.airports?.[out.toCode]?.city].filter(Boolean).map((k) => String(k).trim());
  const hw = keys.map((k) => SNAP.hostels?.[k]).find(Boolean) || null;
  const st = keys.map((k) => SNAP.stays?.[k]).find(Boolean) || [];
  const exact = st.find((x) => x.arrival === inDate && x.departure === outDate) || st.find((x) => x.arrival === inDate);
  // otherwise: the price from the nearest weekend we checked (hotel prices per night move less than flights)
  const near = exact || [...st].sort((a, b) => Math.abs(nightsBetween(a.arrival, inDate)) - Math.abs(nightsBetween(b.arrival, inDate)))[0];
  const nearOk = near && Math.abs(Date.parse(near.arrival) - Date.parse(inDate)) <= 21 * 86400000;
  const hotel = nearOk ? near.items?.[0] || null : null;
  const people = t.travelers || 1;
  // lead prices under €6 are usually promos or display errors: shown, but not added to the total
  const bed = hw && hw.from >= 6 ? Math.round(hw.from * nights * people * 100) / 100 : null;
  const hotelTotal = hotel ? Math.round(hotel.perNight * nights * Math.max(1, Math.ceil(people / 2)) * 100) / 100 : null;
  const cheapest = [bed, hotelTotal].filter((x) => x != null).sort((a, b) => a - b)[0] ?? null;
  return { nights, inDate, outDate, hw, hotel, hotelExact: !!exact, hotelDate: near?.arrival, bed, hotelTotal, cheapest };
}
// on the card itself only text (the whole card is one button: links in it would steal the tap);
// the booking links for beds and hotels sit in the opened part
function stayHtml(t, s) {
  if (!s || !s.nights) return '';
  const parts = [];
  if (s.hw) parts.push(`<span class="stay-hl">Bett ab ${eur(s.hw.from)}/Nacht</span> <span class="muted">Hostelworld${s.hw.from < 6 ? ', wirkt wie Fehler oder Aktion' : ''}</span>`);
  if (s.hotel) parts.push(`<span class="stay-hl">Hotel ${s.hotelExact ? '' : '≈'}${eur(s.hotel.perNight)}/Nacht</span> <span class="muted">${esc(s.hotel.advertiser || 'trivago')}</span>`);
  const n = nightsWord(s.nights);
  if (!parts.length) return `<span class="stay"><span class="muted">${n} · für diese Stadt noch keine Unterkunftspreise</span></span>`;
  return `<span class="stay"><b>${n}:</b> ${parts.join(' · ')}${s.cheapest != null ? ` <span class="stay-total">Reise + Schlafen ≈ ${eur(t.total + s.cheapest)}</span>` : ''}</span>`;
}
function stayLinksHtml(s) {
  if (!s || !s.nights || (!s.hw && !s.hotel)) return '';
  const items = [];
  if (s.hw) items.push(`<li><a href="${esc(s.hw.url)}" target="_blank" rel="noopener">Hostelbetten ab ${eur(s.hw.from)}/Nacht</a> <span class="muted">Hostelworld, billigstes Bett der Stadt${s.hw.from < 6 ? '; so billig ist meist ein Anzeigefehler oder eine Aktion, prüfen' : ''}</span></li>`);
  if (s.hotel) items.push(`<li><a href="${esc(s.hotel.url)}" target="_blank" rel="noopener">${esc(s.hotel.name)}, ${s.hotelExact ? '' : '≈'}${eur(s.hotel.perNight)}/Nacht</a> <span class="muted">${esc(s.hotel.advertiser || 'trivago')}${s.hotelExact ? '' : `, Preis vom Wochenende ${dm(s.hotelDate)}`}</span></li>`);
  return `<div class="sleep"><p class="sleep-title">Schlafen (${nightsWord(s.nights)})</p><ul>${items.join('')}</ul></div>`;
}

// ---------------------------------------------------------------- render: trips
function altsHtml(l) {
  if (!l.alts?.length) return '';
  const items = l.alts.map((a) => {
    const diff = Math.round(((a.eur || 0) - (l.eur || 0)) * 100) / 100;
    const d = diff === 0 ? 'gleich teuer' : diff < 0 ? `spart ${eur(-diff)}` : `+${eur(diff)}`;
    const name = a.operator && a.mode !== 'walk' ? a.operator : ALT_WORD[a.mode] || a.mode;
    return `<li class="alt-item${diff < 0 ? ' cheaper' : ''}"><span>${esc(name)}</span><span>${fmtDuration(a.minutes)}</span><span>${a.est ? '≈' : ''}${eur(a.eur)}</span><span>${d}</span></li>`;
  }).join('');
  return `<details class="alts"><summary>Andere Wege (${l.alts.length})</summary><ul>${items}</ul></details>`;
}
function legHtml(l) {
  const tzDep = l.kind === 'flight' ? l.tzFrom : l.tz || l.tzFrom;
  const tzArr = l.kind === 'flight' ? l.tzTo : l.tz || l.tzTo;
  const badge = l.live ? '<span class="badge live">Live-Preis</span>' : l.est ? `<span class="badge est">${l.rough ? '≈ grob geschätzt' : '≈ geschätzt'}</span>` : '';
  const free = l.free?.length && !l.eur ? '<span class="free">gratis mit Karte</span>' : l.free?.length ? `<span class="free">gratis für ${esc(l.free.join(', '))}</span>` : '';
  const map = mapsUrl(l.maps);
  const book = l.kind === 'flight' ? `Bei ${esc(l.bookWith || 'Ryanair')} buchen` : l.live && /flixbus/i.test(l.operator || '') ? 'Flixbus buchen' : l.live && l.kind === 'train' ? 'Zug buchen' : 'Details';
  const links = [
    l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${book}</a>` : '',
    map ? `<a href="${esc(map)}" target="_blank" rel="noopener">Google Maps</a>` : '',
    l.rideshare ? `<a href="${esc(l.rideshare)}" target="_blank" rel="noopener">BlaBlaCar</a>` : '',
  ].filter(Boolean).join('');
  const route = l.kind === 'park' || l.kind === 'toll' ? esc(l.from || 'Maut') : `${esc(l.from)} → ${esc(l.to)}`;
  const stops = l.stops ? ` · ${l.stops} Umstieg${l.stops > 1 ? 'e' : ''}` : '';
  return `<li class="leg k-${l.kind}">
    <div class="leg-time">${l.dep != null && l.kind !== 'toll' ? `<b>${timeOf(l.dep, tzDep, l.approxTime)}</b><span>${timeOf(l.arr, tzArr, l.approxTime || l.approxArr)}</span>` : ''}</div>
    <div class="leg-body">
      <div class="leg-kind">${KIND[l.kind] || l.kind}${stops}${l.number ? ` · ${esc(l.number)}` : ''}${l.minutes ? ` · ${fmtDuration(l.minutes)}` : ''}</div>
      <div class="leg-route">${route}</div>
      <div class="leg-meta">${esc(l.operator || '')}${l.note ? ` · ${esc(l.note)}` : ''}</div>
      <div class="leg-foot">${badge}${free}${links ? `<span class="links">${links}</span>` : ''}</div>
      ${altsHtml(l)}
    </div>
    <div class="leg-eur">${l.eur ? eur(l.eur) : '€0'}</div>
  </li>`;
}
function compareHtml(t) {
  const entries = Object.entries(t.byMode || {}).sort((a, b) => a[1] - b[1]);
  if (entries.length < 2) return '';
  return `<span class="compare">${entries.map(([m, v], i) => `<span class="${m === t.mode ? 'cur' : ''}${i === 0 ? ' best' : ''}">${MODE_WORD[m] || m} ${eur0(v)}</span>`).join('')}</span>`;
}
function tripHtml(t, i, multiWin) {
  const rides = t.mode === 'car' ? t.legs.filter((l) => l.kind === 'drive') : t.legs.filter((l) => RIDES.has(l.kind) && l.fromCode);
  const out = rides[0];
  const back = rides.at(-1);
  const people = t.travelers > 1 ? `<span class="pp">${eur(t.perPerson)} p. P.</span>` : '';
  const VEH = { car: 'Mit Auto', bike: 'Mit Rad', public: 'Ohne Auto und Rad' };
  const alts = (t.alts || []).length ? `<p class="alt">${t.alts.map((a) => `${VEH[a.vehicle] || a.vehicle}: ${eur(a.total)} (${a.total > t.total ? '+' : ''}${eur(a.total - t.total)}) über ${esc(a.via)}`).join('<br>')}</p>` : '';
  const ride = (l) => (t.mode === 'car'
    ? `<b class="m-car">Auto</b>${dayOf(l.dep, HOME_TZ)} ${timeOf(l.dep, HOME_TZ, true)} · ${esc(l.from === 'Zuhause' ? 'Salzburg' : cityDe(t.city))} → ${esc(l.to === 'Zuhause' ? 'Salzburg' : cityDe(t.city))}`
    : `<b class="m-${l.kind}">${MODE_WORD[l.kind] || l.kind}</b>${dayOf(l.dep, l.tzFrom)} ${timeOf(l.dep, l.tzFrom, l.approxTime)} · ${esc(shortPlace(l.fromCode, l.from))} → ${esc(shortPlace(l.toCode, l.to))}`);
  const km = kmOf(t.out.place);
  return `<article class="trip">
    <button type="button" class="trip-head" aria-expanded="false" aria-controls="legs-${i}" id="trip-${i}">
      <span class="dest"><span class="city">${esc(cityDe(t.city))}</span><span class="country">${esc(countryDe(t.countryCode, t.country))}${km ? ` · ${km.toLocaleString('de-AT')} km` : ''}</span></span>
      <span class="price"><span class="total">${eur(t.total)}</span>${people}</span>
      <span class="when">
        <span><i>Hin</i><span>${ride(out)}</span></span>
        <span><i>Zurück</i><span>${ride(back)}</span></span>
      </span>
      ${compareHtml(t)}
      ${stayHtml(t, t.stay)}
      <span class="tags">
        ${multiWin && t.win ? `<span class="tag tag-win">${esc(`${t.win.dows} ${t.win.title}`)}</span>` : ''}
        <span class="tag">${Math.round(t.stayHours)} h dort</span>
        <span class="tag">los ≈ ${timeOf(t.leaveHome, HOME_TZ)}</span>
        <span class="tag">daheim ≈ ${dayOf(t.backHome, HOME_TZ)} ${timeOf(t.backHome, HOME_TZ)}</span>
        ${t.tags.map((x, k) => `<span class="tag${k === 0 ? ' tag-mode' : /airport|from|land/.test(x) ? ' tag-hl' : ''}">${esc(tagDe(x))}</span>`).join('')}
        ${t.estimatedShare > 0.25 ? `<span class="tag tag-est">${Math.round(t.estimatedShare * 100)} % geschätzt</span>` : ''}
        <span class="open-hint">Antippen für alle Schritte und Buchungslinks</span>
      </span>
    </button>
    <div class="trip-detail" id="legs-${i}" hidden>
      <ol class="legs">${t.legs.map(legHtml).join('')}</ol>
      ${stayLinksHtml(t.stay)}
      ${alts}
      <p class="check">Zuerst die Hauptfahrten buchen (Flug, Fernbus), dann Busse und Züge. Preise ändern sich laufend; der echte Preis steht auf der Buchungsseite.</p>
    </div>
  </article>`;
}

// ---------------------------------------------------------------- render: when (strips + tip)
function stripCard(w, b, cls, top, dows) {
  const price = b === undefined ? '…' : b === null ? 'nichts' : `ab ${b.estimatedShare > 0.5 ? '≈' : ''}${eur0(state.travelers.length > 1 ? b.perPerson : b.total)}${state.travelers.length > 1 ? ' p. P.' : ''}`;
  return `<span class="wk-top">${top}</span>
      <span class="wk-date">${w.kind === 'days' ? dayLabel(w.start) : w.title}</span>
      <span class="wk-dow">${dows}</span>
      <span class="wk-price">${price}</span>
      <span class="wk-city">${b ? `${esc(cityDe(b.city))} · ${modeWord(b)}` : '&nbsp;'}</span>`;
}
let lastSelKey = null;
function renderWeekendStrip() {
  const ws = weekends();
  const sel = selectedWeekend(ws);
  const bests = ws.map((w) => { const r = cached(w); return r ? bestOf(r) : undefined; });
  const known = bests.filter(Boolean);
  const min = known.length > 1 ? Math.min(...known.map((b) => b.total)) : null;
  $('weekends').innerHTML = ws.length ? ws.map((w, i) => {
    const b = bests[i];
    const on = sel && w.key === sel.key;
    const low = b && min != null && b.total === min;
    const top = w.now ? 'jetzt los' : low ? 'billigstes' : '';
    return `<button type="button" class="wk${on ? ' on' : ''}${low ? ' low' : ''}${b === undefined ? ' wait' : ''}${b === null ? ' none' : ''}" data-week="${w.key}" aria-pressed="${!!on}">${stripCard(w, b, '', top, w.dows)}</button>`;
  }).join('') : '<p class="hint-text">Keine Wochenenden mehr in den Preisdaten.</p>';
  if (sel && sel.key !== lastSelKey) {
    lastSelKey = sel.key;
    const el = $('weekends').querySelector('.wk.on');
    if (el) $('weekends').scrollLeft = Math.max(0, el.offsetLeft - 16);
  }
}
let scanState = { done: 0, total: 0 };
function renderScanStrip() {
  const ws = scanWindows();
  const n = tripNights();
  const lo = addDays(state.daysFrom, -Number(state.flex));
  const hi = addDays(state.daysFrom, Number(state.flex));
  const bests = ws.map((w) => { const r = cached(w); return r ? bestOf(r) : undefined; });
  const known = bests.filter(Boolean);
  const min = known.length > 1 ? Math.min(...known.map((b) => b.total)) : null;
  $('scan-title').textContent = `Gleich lange Reise (${n ? nightsWord(n) : 'Tagesausflug'}), anderer Start`;
  $('scan').innerHTML = ws.map((w, i) => {
    const b = bests[i];
    const on = w.start === state.daysFrom;
    const inr = w.start >= lo && w.start <= hi;
    const low = b && min != null && b.total === min;
    return `<button type="button" class="wk${on ? ' on' : ''}${inr && !on ? ' inrange' : ''}${low ? ' low' : ''}${b === undefined ? ' wait' : ''}${b === null ? ' none' : ''}" data-day="${w.start}" aria-pressed="${on}">${stripCard(w, b, '', low ? 'billigster' : inr ? 'gewählt' : '', `bis ${dayLabel(w.end)}`)}</button>`;
  }).join('');
  $('scan-progress').textContent = scanState.done < scanState.total ? `prüfe ${scanState.done}/${scanState.total} Tage…` : '';
  const key = `${state.daysFrom}|${n}`;
  if (key !== lastSelKey) {
    lastSelKey = key;
    const el = $('scan').querySelector('.wk.on');
    if (el) $('scan').scrollLeft = Math.max(0, el.offsetLeft - 16);
  }
}
function renderTip() {
  const tip = $('tip');
  tip.hidden = true;
  const sel = selectedWindows();
  const selBest = sel.map((w) => cached(w)).filter(Boolean).map(bestOf).filter(Boolean).sort((a, b) => a.total - b.total)[0] || null;
  const pool = (state.when === 'weekend' ? weekends() : scanWindows()).filter((w) => !sel.some((s) => s.key === w.key));
  let best = null;
  for (const w of pool) {
    const r = cached(w);
    if (!r) return; // not finished yet
    const b = bestOf(r);
    if (b && (!best || b.total < best.b.total)) best = { w, b };
  }
  if (!best) return;
  const pp = state.travelers.length > 1;
  const price = (t) => (pp ? `${eur0(t.perPerson)} p. P.` : eur0(t.total));
  const where = `${cityDe(best.b.city)} (${modeWord(best.b)})`;
  const label = state.when === 'weekend' ? `am Wochenende ${best.w.title}` : `mit Start ${dayLabel(best.w.start)} (${best.w.title})`;
  if (!selBest) {
    $('tip-text').textContent = `Für deine Tage passt nichts. Aber ${label}: ab ${price(best.b)} nach ${where}.`;
  } else {
    const diff = selBest.total - best.b.total;
    if (diff < Math.max(10, selBest.total * 0.15)) return;
    $('tip-text').textContent = `Anderswann billiger: ${label} ab ${price(best.b)} nach ${where}, ${eur0(pp ? diff / state.travelers.length : diff)}${pp ? ' p. P.' : ''} weniger.`;
  }
  $('tip-btn').dataset.goto = state.when === 'weekend' ? best.w.key : best.w.start;
  tip.hidden = false;
}
function renderStrip() {
  if (state.when === 'weekend') renderWeekendStrip(); else renderScanStrip();
}

// ---------------------------------------------------------------- render: results
let shown = 20;
let lastTrips = [];
function renderResults(wins) {
  const all = wins.flatMap((w) => cached(w) || []);
  const seen = new Set();
  let trips = [];
  for (const t of all) {
    const k = t.mode === 'car' ? `${t.id}|${t.win.key}` : t.id;
    if (seen.has(k)) continue;
    seen.add(k);
    trips.push(t);
  }
  // cheapest per way of travel (for the filter chips)
  const per = {};
  for (const t of trips) for (const k of new Set(rideKinds(t))) if (per[k] == null || t.total < per[k]) per[k] = t.total;
  const any = trips.length ? Math.min(...trips.map((t) => t.total)) : null;
  const MODES = [['all', 'Alle', any], ['flight', 'Flug', per.flight], ['bus', 'Bus', per.bus], ['train', 'Zug', per.train], ['car', 'Auto', per.car]];
  const n = state.travelers.length;
  $('mode-chips').innerHTML = MODES.map(([k, label, v]) => `<button type="button" class="chip" data-mode="${k}" aria-pressed="${state.mode === k}">${label}${v != null && (state.mode === 'all' || state.mode === k) ? ` <small>ab ${eur0(n > 1 ? v / n : v)}</small>` : ''}</button>`).join('');

  trips = trips.filter((t) => passMode(t));
  if (wins.length > 1) {
    const perCity = new Map();
    trips = trips.sort((a, b) => a.total - b.total).filter((t) => {
      const c = perCity.get(t.city) || 0;
      perCity.set(t.city, c + 1);
      return c < 2;
    });
  }
  for (const t of trips) if (t.stay === undefined) t.stay = stayFor(t);
  if (state.sort === 'bed') trips.sort((a, b) => (a.total + (a.stay?.cheapest ?? 0)) - (b.total + (b.stay?.cheapest ?? 0)));
  else if (state.sort === 'stay') trips.sort((a, b) => b.stayHours - a.stayHours || a.total - b.total);
  else if (state.sort === 'live') trips.sort((a, b) => (a.estimatedShare > 0.5) - (b.estimatedShare > 0.5) || a.total - b.total);
  else if (state.sort === 'value') trips.sort((a, b) => a.total / Math.max(1, a.stayHours) - b.total / Math.max(1, b.stayHours));
  else trips.sort((a, b) => a.total - b.total);
  lastTrips = trips.slice(0, 60);

  const label = !wins.length ? '' : state.when === 'weekend'
    ? `${wins[0].now ? 'ab jetzt, ' : ''}${wins[0].dows} ${wins[0].title}`
    : `${dayLabel(state.daysFrom)}–${dayLabel(state.daysTo)}${Number(state.flex) ? ` ± ${state.flex} Tag${Number(state.flex) > 1 ? 'e' : ''}` : ''}`;
  const demo = SNAP.live === false ? ' (Demo-Preise)' : '';
  $('result-title').textContent = (lastTrips.length ? `${lastTrips.length} Reisen · ${label}` : `Nichts gefunden · ${label}`) + demo;
  renderTripList(wins);
}
function renderTripList(wins) {
  const list = $('trips');
  if (!lastTrips.length) {
    const fixes = [];
    if (state.mode !== 'all') fixes.push(['mode-all', 'Alle Verkehrsmittel']);
    if (Number(state.maxPP) > 0) fixes.push(['no-max', 'Ohne Preisgrenze']);
    if (state.dest.trim()) fixes.push(['no-dest', 'Überall hin']);
    else if (Number(state.minKm) > 0) fixes.push(['km-0', 'Auch Ziele in der Nähe']);
    if (state.when === 'days' && Number(state.flex) < 3) fixes.push(['flex-3', '± 3 Tage']);
    if (Number(state.minStay) > 8) fixes.push(['stay-8', 'Nur 8 h dort reicht']);
    if (!state.car) fixes.push(['car-on', 'Mit Auto']);
    const beyond = wins.length && wins.every((w) => w.start > addDays(LAST_DATA, -2));
    list.innerHTML = `<div class="empty"><p>${!SNAP.flights.length ? 'Noch keine Preise geladen.' : beyond ? `Für diese Tage gibt es noch keine Preise. Die Daten reichen bis ${dayLabel(LAST_DATA)}.` : 'Mit diesen Einstellungen passt nichts.'}</p>
      ${fixes.length ? `<p>Probier:</p><div class="chips">${fixes.map(([k, l]) => `<button type="button" class="chip" data-fix="${k}">${l}</button>`).join('')}</div>` : ''}</div>`;
    return;
  }
  const multi = wins.length > 1;
  list.innerHTML = lastTrips.slice(0, shown).map((t, i) => tripHtml(t, i, multi)).join('')
    + (lastTrips.length > shown ? `<button type="button" class="ghost more-btn" id="more-btn">${lastTrips.length - shown} weitere zeigen</button>` : '');
}

// ---------------------------------------------------------------- compute (main list first, then the strip in the background)
let job = 0;
let timer = null;
function schedule(delay = 60) {
  clearTimeout(timer);
  timer = setTimeout(compute, delay);
}
function compute() {
  save();
  renderControls();
  const my = ++job;
  const q = baseQuery();
  useQuery(q);
  const wins = selectedWindows();
  shown = 20;
  $('tip').hidden = true;
  let i = 0;
  const step = () => {
    if (my !== job) return;
    while (i < wins.length && cached(wins[i])) i++;
    if (i < wins.length) { planFor(q, wins[i]); i++; setTimeout(step, 0); return; }
    renderResults(wins);
    renderStrip();
    background(q, my);
  };
  if (wins.every((w) => cached(w))) step();
  else { $('trips').innerHTML = '<p class="busy">Suche die billigsten Wege…</p>'; renderStrip(); setTimeout(step, 20); }
}
function background(q, my) {
  const wins = state.when === 'weekend' ? weekends() : scanWindows();
  scanState = { done: wins.filter((w) => cached(w)).length, total: wins.length };
  let i = 0;
  let painted = 0;
  const tick = () => {
    if (my !== job) return;
    while (i < wins.length && cached(wins[i])) i++;
    if (i < wins.length) {
      planFor(q, wins[i]);
      i++;
      scanState.done = wins.filter((w) => cached(w)).length;
      if (++painted % (state.when === 'weekend' ? 1 : 3) === 0) renderStrip();
      setTimeout(tick, 0);
      return;
    }
    scanState.done = scanState.total;
    renderStrip();
    renderTip();
  };
  renderTip();
  setTimeout(tick, 0);
}

// ---------------------------------------------------------------- render: controls
function renderPeople() {
  $('people').innerHTML = state.travelers.map((t, i) => `
    <fieldset class="person">
      <legend class="sr">Person ${i + 1}</legend>
      <div class="person-top">
        <input id="name-${i}" class="name" value="${esc(t.name)}" aria-label="Name von Person ${i + 1}" maxlength="20">
        ${state.travelers.length > 1 ? `<button type="button" class="ghost small" data-remove="${i}" aria-label="${esc(t.name)} entfernen">Entfernen</button>` : ''}
      </div>
      <div class="chips">
        ${Object.entries(CARDS).map(([id, c]) => `
          <label class="chip" title="${esc(c.info)}">
            <input type="checkbox" id="card-${i}-${id}" data-person="${i}" data-card="${id}" ${t.cards.includes(id) ? 'checked' : ''}>
            <span>${esc(c.label)}</span>
          </label>`).join('')}
      </div>
    </fieldset>`).join('');
}
function whoSummary() {
  const n = state.travelers.length;
  const cards = [...new Set(state.travelers.flatMap((t) => t.cards))].map((c) => CARDS[c]?.label).filter(Boolean);
  const parts = [n === 1 ? (state.travelers[0].name && state.travelers[0].name !== 'Ich' ? state.travelers[0].name : '1 Person') : `${n} Personen`];
  parts.push(cards.length ? cards.join(', ') : 'keine Karte');
  parts.push(state.car ? 'mit Auto' : 'ohne Auto');
  if (state.bike) parts.push('mit Rad');
  if (!state.ground) parts.push('nur Flüge');
  parts.push(BAG_SHORT[state.bags] || '');
  return parts.filter(Boolean).join(' · ');
}
function renderControls() {
  for (const b of document.querySelectorAll('[data-when]')) b.setAttribute('aria-pressed', String(b.dataset.when === state.when));
  $('when-weekend').hidden = state.when !== 'weekend';
  $('when-days').hidden = state.when !== 'days';
  for (const b of document.querySelectorAll('[data-km]')) b.setAttribute('aria-pressed', String(Number(b.dataset.km) === Number(state.minKm)));
  $('km-chips').hidden = !!state.dest.trim();
  $('who-sum').textContent = whoSummary();
  const n = tripNights();
  $('days-sum').textContent = `${n ? nightsWord(n) : 'Tagesausflug'}: hin ${dayLabel(state.daysFrom)}, zurück ${dayLabel(state.daysTo)}${Number(state.flex) ? `, oder bis ${state.flex} Tag${Number(state.flex) > 1 ? 'e' : ''} früher oder später` : ''}`;
}
function syncForm() {
  $('leave').value = state.leave;
  $('back-by').value = state.backBy;
  $('days-from').value = state.daysFrom;
  $('days-to').value = state.daysTo;
  $('days-from').min = today(); $('days-from').max = LAST_DATA;
  $('days-to').min = state.daysFrom;
  $('flex').value = String(state.flex);
  $('days-leave').value = state.daysLeave;
  $('car').checked = state.car;
  $('bike').checked = state.bike;
  $('ground').checked = state.ground;
  $('max-walk').value = String(state.maxWalk);
  $('bags').value = state.bags;
  $('min-stay').value = String(state.minStay);
  $('dest').value = state.dest;
  $('max-pp').value = state.maxPP;
  $('sort').value = state.sort;
  renderPeople();
  renderControls();
}
function showTab(tab) {
  state.tab = tab;
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const id of ['trips', 'cheap', 'beds']) $(`view-${id}`).hidden = id !== tab;
  save();
}

// ---------------------------------------------------------------- events
let typing = null;
document.addEventListener('input', (e) => {
  const el = e.target;
  const id = el.id;
  if (id === 'leave') { state.leave = el.value; state.week = null; }
  else if (id === 'back-by') { state.backBy = el.value; state.week = null; }
  else if (id === 'days-from') {
    if (!el.value) return;
    const n = tripNights();
    state.daysFrom = el.value;
    if (!state.daysTo || state.daysTo < state.daysFrom) state.daysTo = addDays(el.value, n);
    $('days-to').value = state.daysTo; $('days-to').min = state.daysFrom;
  } else if (id === 'days-to') { if (!el.value) return; state.daysTo = el.value < state.daysFrom ? state.daysFrom : el.value; }
  else if (id === 'flex') state.flex = Number(el.value);
  else if (id === 'days-leave') state.daysLeave = el.value;
  else if (id === 'car') state.car = el.checked;
  else if (id === 'bike') state.bike = el.checked;
  else if (id === 'ground') state.ground = el.checked;
  else if (id === 'max-walk') state.maxWalk = Number(el.value);
  else if (id === 'bags') state.bags = el.value;
  else if (id === 'min-stay') state.minStay = Number(el.value);
  else if (id === 'dest') { state.dest = el.value; clearTimeout(typing); typing = setTimeout(compute, 450); renderControls(); return; }
  else if (id === 'max-pp') { state.maxPP = el.value; clearTimeout(typing); typing = setTimeout(compute, 450); return; }
  else if (id === 'sort') { state.sort = el.value; save(); renderResults(selectedWindows()); return; }
  else if (el.dataset.card) {
    const t = state.travelers[Number(el.dataset.person)];
    t.cards = el.checked ? [...new Set([...t.cards, el.dataset.card])] : t.cards.filter((c) => c !== el.dataset.card);
  } else if (id?.startsWith('name-')) { state.travelers[Number(id.slice(5))].name = el.value; save(); $('who-sum').textContent = whoSummary(); return; }
  else return;
  schedule();
});

const FIX = {
  'mode-all': () => { state.mode = 'all'; },
  'no-max': () => { state.maxPP = ''; $('max-pp').value = ''; },
  'no-dest': () => { state.dest = ''; $('dest').value = ''; },
  'km-0': () => { state.minKm = 0; },
  'flex-3': () => { state.flex = 3; $('flex').value = '3'; },
  'stay-8': () => { state.minStay = 8; $('min-stay').value = '8'; },
  'car-on': () => { state.car = true; $('car').checked = true; },
};
document.addEventListener('click', (e) => {
  const t = e.target;
  const head = t.closest('.trip-head');
  if (head && !t.closest('a')) {
    const open = head.getAttribute('aria-expanded') === 'true';
    head.setAttribute('aria-expanded', String(!open));
    $(head.getAttribute('aria-controls')).hidden = open;
    return;
  }
  const hit = (sel) => t.closest(sel);
  let x;
  if ((x = hit('[data-tab]'))) { showTab(x.dataset.tab); window.scrollTo({ top: 0 }); return; }
  if ((x = hit('[data-when]'))) { state.when = x.dataset.when; lastSelKey = null; compute(); return; }
  if ((x = hit('[data-week]'))) { state.week = x.dataset.week; compute(); return; }
  if ((x = hit('[data-day]'))) {
    const n = tripNights();
    state.daysFrom = x.dataset.day; state.daysTo = addDays(x.dataset.day, n);
    $('days-from').value = state.daysFrom; $('days-to').value = state.daysTo; $('days-to').min = state.daysFrom;
    compute(); return;
  }
  if ((x = hit('#tip-btn'))) {
    const g = x.dataset.goto;
    if (state.when === 'weekend') state.week = g;
    else { const n = tripNights(); state.daysFrom = g; state.daysTo = addDays(g, n); $('days-from').value = g; $('days-to').value = state.daysTo; }
    compute();
    $('results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  if ((x = hit('[data-km]'))) { state.minKm = Number(x.dataset.km); compute(); return; }
  if ((x = hit('[data-mode]'))) { state.mode = x.dataset.mode; compute(); return; }
  if ((x = hit('[data-fix]'))) { FIX[x.dataset.fix]?.(); compute(); return; }
  if ((x = hit('#more-btn'))) { shown += 20; renderTripList(selectedWindows()); return; }
  if ((x = hit('#who-btn'))) {
    const open = x.getAttribute('aria-expanded') === 'true';
    x.setAttribute('aria-expanded', String(!open));
    $('who-panel').hidden = open;
    return;
  }
  if (t.id === 'add-person') {
    if (state.travelers.length < 6) state.travelers.push({ name: `Person ${state.travelers.length + 1}`, cards: [] });
    renderPeople(); schedule();
    return;
  }
  if ((x = hit('[data-remove]'))) { state.travelers.splice(Number(x.dataset.remove), 1); renderPeople(); schedule(); return; }
  if ((x = hit('[data-deal-filter]'))) { dealFilter = x.dataset.dealFilter; renderCheap(); return; }
  if ((x = hit('[data-stay-date]'))) { state.stayDate = x.dataset.stayDate; save(); renderBeds(); }
});

// ---------------------------------------------------------------- tab: price mistakes + deals
let dealFilter = 'top';
function renderCheap() {
  const ap = SNAP.airports || {};
  const name = (c) => cityDe(ap[c]?.city || c);
  const an = findAnomalies(SNAP, { limit: 8 });
  $('anomalies').innerHTML = an.length ? an.map((a) => {
    const tz = ap[a.from]?.tz || 'UTC';
    const d = utcMinToLocal(a.dep, tz);
    const url = a.src === 'kiwi' ? kiwiUrl(a.from, a.to, d.date, 1) : bookingUrl({ ...a, carrier: a.carrier }, 1, d.date);
    return `<li class="cheap-item"><span class="cheap-badge ${a.level}">${a.level === 'mistake' ? 'möglicher Preisfehler' : 'ungewöhnlich billig'}</span>
      <a href="${esc(url)}" target="_blank" rel="noopener"><b>${esc(name(a.from))} → ${esc(name(a.to))}</b></a>
      <span class="cheap-meta">${DOW_EN[d.dow]} ${dm(d.date)} ${d.time} · ${esc(a.from)}→${esc(a.to)} · nur Flug, 1 Person</span>
      <span class="cheap-price">${eur(a.eur)} <s>sonst ≈ ${eur0(a.normal)}</s> −${a.savePct} %</span></li>`;
  }).join('') : '<li class="cheap-empty">Gerade nichts Ungewöhnliches in den Flugpreisen.</li>';

  const all = SNAP.deals || [];
  const pick = dealFilter === 'mistake' ? all.filter((d) => d.mistake)
    : dealFilter === 'hotel' ? all.filter((d) => d.hotel)
    : dealFilter === 'near' ? all.filter((d) => d.nearHome)
    : dealFilter === 'all' ? all
    : all.filter((d) => d.mistake || d.nearHome || d.hotel);
  for (const b of document.querySelectorAll('[data-deal-filter]')) b.setAttribute('aria-pressed', String(b.dataset.dealFilter === dealFilter));
  $('deals').innerHTML = pick.length ? pick.slice(0, 15).map((d) => `<li class="cheap-item">
      ${d.mistake ? '<span class="cheap-badge mistake">gemeldeter Preisfehler</span>' : d.hotel ? '<span class="cheap-badge stay">Unterkunft</span>' : ''}
      <a href="${esc(d.link)}" target="_blank" rel="noopener"><b>${esc(d.title)}</b></a>
      <span class="cheap-meta">${esc(d.source)}${d.date ? ` · ${new Date(d.date).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}` : ''}</span>
      ${d.price != null ? `<span class="cheap-price">${eur(d.price)}</span>` : ''}</li>`).join('')
    : `<li class="cheap-empty">${all.length ? 'In diesem Filter gerade nichts.' : 'Noch keine Deal-Feeds geladen.'}</li>`;
  const recent = all.filter((d) => d.mistake && d.date && Date.now() - Date.parse(d.date) < 3 * 86400000).length;
  const count = an.filter((a) => a.level === 'mistake').length + recent;
  $('cheap-count').hidden = !count;
  $('cheap-count').textContent = String(count);
}

// ---------------------------------------------------------------- tab: beds + hotels
const whereDe = (w) => String(w || '').replace(/(\d)\.(\d)/g, '$1,$2').replace(/ km to (the )?city cent(re|er)/i, ' km zum Zentrum').replace(/ km to /i, ' km bis ');
function renderBeds() {
  const stays = SNAP.stays || {};
  const dates = [...new Set(Object.values(stays).flatMap((l) => l.map((x) => x.arrival)))].sort();
  if (!dates.includes(state.stayDate)) state.stayDate = dates[0] || null;
  $('stay-dates').innerHTML = dates.map((d) => {
    const dep = Object.values(stays).flatMap((l) => l).find((x) => x.arrival === d)?.departure || addDays(d, 2);
    return `<button type="button" class="chip" data-stay-date="${d}" aria-pressed="${d === state.stayDate}">${dowD(d)}–${dowD(dep)} ${rangeLabel(d, dep)}</button>`;
  }).join('');
  const rows = [];
  for (const [city, list] of Object.entries(stays)) {
    const s = list.find((x) => x.arrival === state.stayDate);
    if (!s) continue;
    for (const it of s.items.slice(0, 2)) rows.push({ city, ...it, nights: nightsBetween(s.arrival, s.departure) });
  }
  rows.sort((a, b) => a.perNight - b.perNight);
  $('hotels').innerHTML = rows.length ? rows.slice(0, 24).map((h) => `<li class="cheap-item">
      <a href="${esc(h.url)}" target="_blank" rel="noopener"><b>${esc(cityDe(h.city))} · ${esc(h.name)}</b></a>
      <span class="cheap-meta">${h.stars ? `<span class="stars">${'★'.repeat(Math.min(5, h.stars))}</span> · ` : ''}${h.rating ? `${String(h.rating).replace('.', ',')}/10 · ` : ''}${esc(whereDe(h.where))} · ${esc(h.advertiser || 'trivago')}</span>
      <span class="cheap-price">${eur(h.perNight)}/Nacht${h.perStay ? ` <span class="muted">(${eur(h.perStay)} für ${h.nights} Nächte)</span>` : ''}</span></li>`).join('')
    : '<li class="cheap-empty">Noch keine Hotelpreise geladen.</li>';

  const allBeds = Object.entries(SNAP.hostels || {}).sort((a, b) => a[1].from - b[1].from);
  const odd = allBeds.filter(([, h]) => h.from < 3);
  const beds = allBeds.filter(([, h]) => h.from >= 3).slice(0, 20);
  $('beds').innerHTML = (beds.length ? beds.map(([city, h]) => `<li class="cheap-item">${h.from < 6 ? '<span class="cheap-badge mistake">Preisfehler oder Aktion?</span>' : ''}
      <a href="${esc(h.url)}" target="_blank" rel="noopener"><b>${esc(cityDe(city))}: Bett ab ${eur(h.from)}/Nacht</b></a>
      <span class="cheap-meta">Hostelworld, billigstes Bett der Stadt</span></li>`).join('')
    : '<li class="cheap-empty">Noch keine Hostelpreise geladen.</li>')
    + (odd.length ? `<li class="cheap-item"><span class="cheap-badge">wahrscheinlich Anzeigefehler</span>
      <span class="cheap-meta">Hostelworld zeigt unter €3 für: ${odd.slice(0, 10).map(([city, h]) => `<a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(cityDe(city))} ${eur(h.from)}</a>`).join(', ')}</span></li>` : '');
}

// ---------------------------------------------------------------- price freshness + update button
function initRefresh() {
  const at = SNAP.generatedAt ? new Date(SNAP.generatedAt) : null;
  const ageH = at ? (Date.now() - at.getTime()) / 3600000 : Infinity;
  const when = at ? at.toLocaleString('de-AT', { timeZone: HOME_TZ, weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'nie';
  const age = !at ? '' : ageH < 1 ? 'vor weniger als 1 h' : `vor ${Math.round(ageH)} h`;
  const every = SNAP.hosting?.every;
  $('refresh-status').textContent = `Preise von ${when}${age ? ` (${age})` : ''}${every ? `, neu alle ${every} h von selbst` : ''}.`;
  const btn = $('refresh-btn');
  if (SNAP.hosting?.kind === 'github' && SNAP.hosting.runUrl) {
    btn.hidden = false;
    btn.onclick = () => {
      window.open(SNAP.hosting.runUrl, '_blank', 'noopener');
      $('refresh-status').textContent = 'GitHub ist offen: dort „Run workflow“ antippen. Nach ca. 7 Minuten diese Seite neu laden.';
    };
  } else btn.hidden = true;
}
function renderStatus() {
  const src = (SNAP.sources || []).map((x) => `<li class="${x.ok ? 'ok' : 'bad'}">${esc(x.id)}${x.ok ? '' : ` (${esc(x.error || 'Fehler')})`}</li>`).join('');
  $('status').innerHTML = `<p><b>Datenstand:</b> ${SNAP.flights.length.toLocaleString('de-AT')} Flüge, ${(SNAP.ground || []).length.toLocaleString('de-AT')} Bus- und Zugfahrten, ${(SNAP.timed || []).length.toLocaleString('de-AT')} Flughafenbusse, Preise bis ${dayLabel(LAST_DATA)}.${SNAP.live === false ? ' <span class="badge est">Demo, erfundene Preise</span>' : ''}</p>
    ${src ? `<ul class="sources">${src}</ul>` : ''}`;
  if (SNAP.live === false) $('demo-banner').hidden = false;
}

// ---------------------------------------------------------------- boot
$('bags').innerHTML = Object.entries(BAGS).map(([k, b]) => `<option value="${k}">${esc(b.label)}</option>`).join('');
$('leave').innerHTML = Object.entries(LEAVE).map(([k, b]) => `<option value="${k}">${esc(b.label)}</option>`).join('');
$('back-by').innerHTML = Object.entries(BACK).map(([k, b]) => `<option value="${k}">${esc(b.label)}</option>`).join('');
$('dest-list').innerHTML = DEST.labels.map((l) => `<option value="${esc(l)}">`).join('');
$('home-name').textContent = 'Salzburg';
syncForm();
showTab(state.tab || 'trips');
renderStatus();
initRefresh();
renderCheap();
renderBeds();
compute();
