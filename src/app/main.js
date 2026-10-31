// Phone app: re-plans instantly in the browser from the embedded fare snapshot.
import { plan, weekendWindows, bookingUrl, kiwiUrl } from '../planner/plan.js';
import { findAnomalies } from '../planner/anomalies.js';
import { CARDS, BAGS, HOMES } from '../data/home.js';
import { utcMinToLocal, todayIn, addDays, fmtDuration } from '../lib/time.js';

const HOME_TZ = 'Europe/Vienna';
const REFRESH_TRIGGER = 'trig_012xaCsREe9Lfi1Wq4XEA8tX';
const CONNECTOR = 'Claude Code Remote';
const SNAP = JSON.parse(document.getElementById('snapshot').textContent);
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (x) => `€${(Math.round(x * 100) / 100).toFixed(2).replace(/\.00$/, '')}`;
const eur0 = (x) => `€${Math.round(x)}`;

const DEFAULTS = {
  when: 'this',
  leaveTime: '14:00',
  backBy: 'sun-night',
  customLeave: '',
  customLeaveBefore: '',
  customBack: '',
  travelers: [{ name: 'Me', cards: ['superschoolcard'] }],
  car: true,
  bike: false,
  ground: true,
  maxWalk: 30,
  bags: 'small',
  minStay: 20,
  dest: '',
  maxPrice: '',
  sort: 'price',
  picked: null,
};

let state = load();
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('cheap-escape') || 'null');
    if (s && Array.isArray(s.travelers)) return { ...DEFAULTS, ...s, picked: null };
  } catch { /* storage blocked */ }
  return structuredClone(DEFAULTS);
}
function save() {
  try { localStorage.setItem('cheap-escape', JSON.stringify(state)); } catch { /* ignore */ }
}

const BACK_OPTIONS = {
  'sun-eve': { label: 'Sunday 21:00', days: 2, time: '21:00' },
  'sun-night': { label: 'Sunday night', days: 3, time: '01:00' },
  'mon-noon': { label: 'Monday noon', days: 3, time: '12:00' },
  'mon-night': { label: 'Monday night', days: 4, time: '01:00' },
};

function today() {
  return todayIn(HOME_TZ);
}

/** All weekend windows the radar shows. */
function radarWindows() {
  const b = BACK_OPTIONS[state.backBy] || BACK_OPTIONS['sun-night'];
  return weekendWindows(today(), 6, { leaveTime: state.leaveTime, backDays: b.days, backTime: b.time });
}

function baseQuery() {
  return {
    home: 'salzburg',
    travelers: state.travelers.map((t, i) => ({ name: t.name || `Person ${i + 1}`, cards: t.cards })),
    car: state.car,
    bike: state.bike,
    ground: state.ground,
    maxWalkMin: Number(state.maxWalk),
    bags: state.bags,
    minStayHours: Number(state.minStay),
    destinations: state.dest.trim() ? state.dest.split(',').map((s) => s.trim()).filter(Boolean) : null,
    maxPrice: state.maxPrice ? Number(state.maxPrice) : null,
    limit: 40,
    perCity: 3,
  };
}

function windowsForState() {
  const radar = radarWindows();
  if (state.when === 'custom') {
    if (!state.customLeave || !state.customBack || state.customBack <= state.customLeave) return [];
    // every trip that fits between "from" and "to": latest start = "to" minus the minimum stay
    const latest = new Date(Date.parse(`${state.customBack}:00Z`) - Number(state.minStay) * 3600000).toISOString().slice(0, 16);
    return [{ label: state.customLeave.slice(0, 10), leaveAfter: state.customLeave, leaveBefore: latest > state.customLeave ? latest : state.customLeave, backBy: state.customBack }];
  }
  if (state.when === 'flex') return state.picked != null ? [radar[state.picked]] : radar;
  return [radar[state.when === 'next' ? 1 : 0]];
}

// ---------------------------------------------------------------- render: form
function renderPeople() {
  const box = $('people');
  box.innerHTML = state.travelers.map((t, i) => `
    <fieldset class="person">
      <legend class="sr">Traveller ${i + 1}</legend>
      <div class="person-top">
        <input id="name-${i}" class="name" value="${esc(t.name)}" aria-label="Name of traveller ${i + 1}" maxlength="20">
        ${state.travelers.length > 1 ? `<button type="button" class="ghost small" data-remove="${i}" aria-label="Remove ${esc(t.name)}">Remove</button>` : ''}
      </div>
      <div class="cards">
        ${Object.entries(CARDS).map(([id, c]) => `
          <label class="chip" title="${esc(c.info)}">
            <input type="checkbox" id="card-${i}-${id}" data-person="${i}" data-card="${id}" ${t.cards.includes(id) ? 'checked' : ''}>
            <span>${esc(c.label)}</span>
          </label>`).join('')}
      </div>
    </fieldset>`).join('');
}

function syncForm() {
  for (const el of document.querySelectorAll('[name="when"]')) el.checked = el.value === state.when;
  $('leave-time').value = state.leaveTime;
  $('back-by').value = state.backBy;
  $('car').checked = state.car;
  $('bike').checked = state.bike;
  $('ground').checked = state.ground;
  $('max-walk').value = String(state.maxWalk);
  $('bags').value = state.bags;
  $('min-stay').value = String(state.minStay);
  $('dest').value = state.dest;
  $('max-price').value = state.maxPrice;
  $('sort').value = state.sort;
  $('custom').hidden = state.when !== 'custom';
  $('weekend-opts').hidden = state.when === 'custom';
  if (!state.customLeave) {
    const w = radarWindows()[0];
    state.customLeave = w.leaveAfter; state.customLeaveBefore = w.leaveBefore; state.customBack = w.backBy;
  }
  $('custom-leave').value = state.customLeave;
  $('custom-back').value = state.customBack;
  renderPeople();
}

// ---------------------------------------------------------------- render: radar (cheapest per weekend)
function renderRadar(radarResults) {
  const box = $('radar');
  const max = Math.max(1, ...radarResults.map((r) => r.best?.total || 0));
  const minTotal = Math.min(...radarResults.filter((r) => r.best).map((r) => r.best.total));
  box.innerHTML = radarResults.map((r, i) => {
    const l = utcMinToLocal(Math.floor(Date.parse(`${r.w.leaveAfter}:00Z`) / 60000), 'UTC');
    const h = r.best ? Math.max(14, Math.round((r.best.total / max) * 100)) : 0;
    const selected = (state.when === 'this' && i === 0) || (state.when === 'next' && i === 1) || (state.when === 'flex' && state.picked === i);
    return `<button type="button" class="wk${selected ? ' on' : ''}${r.best && r.best.total === minTotal ? ' low' : ''}" data-week="${i}"
      aria-label="Weekend ${l.date}: ${r.best ? `from ${eur0(r.best.total)} to ${esc(r.best.city)}` : 'no trip found'}">
      <span class="wk-bar" style="--h:${h}%"></span>
      ${r.best ? `<span class="wk-price">${r.best.approx ? '≈' : ''}${eur0(r.best.total)}</span>` : '<span class="wk-none">—</span>'}
      <span class="wk-date">${l.date.slice(8, 10)}.${l.date.slice(5, 7)}.</span>
      <span class="wk-city">${r.best ? esc(r.best.city) : 'none'}</span>
    </button>`;
  }).join('');
}


// ---------------------------------------------------------------- where to sleep (Hostelworld beds + trivago hotels)
function nightsBetween(a, b) {
  return Math.max(0, Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000));
}
function stayFor(t) {
  const rides = t.legs.filter((l) => ['flight', 'bus', 'train'].includes(l.kind) && l.fromCode);
  if (!rides.length || t.mode === 'car') return null;
  const out = rides[0];
  const back = rides[rides.length - 1];
  const inDate = utcMinToLocal(out.arr, out.tzTo || 'UTC').date;
  const outDate = utcMinToLocal(back.dep, back.tzFrom || 'UTC').date;
  const nights = nightsBetween(inDate, outDate);
  if (!nights) return { nights: 0 };
  const keys = [t.city, (SNAP.airports || {})[out.toCode]?.city].filter(Boolean);
  const hw = keys.map((k) => SNAP.hostels?.[k]).find(Boolean) || null;
  const st = keys.map((k) => SNAP.stays?.[k]).find(Boolean) || [];
  const exact = st.find((x) => x.arrival === inDate && x.departure === outDate) || st.find((x) => x.arrival === inDate);
  const hotel = exact?.items?.[0] || null;
  const people = t.travelers || 1;
  // lead prices under €6 are usually promos or mistakes: shown, but not used for the total
  const bed = hw && hw.from >= 6 ? Math.round(hw.from * nights * people * 100) / 100 : null;
  const hotelTotal = hotel ? Math.round(hotel.perNight * nights * Math.max(1, Math.ceil(people / 2)) * 100) / 100 : null;
  const cheapest = [bed, hotelTotal].filter((x) => x != null).sort((a, b) => a - b)[0] ?? null;
  return { nights, inDate, outDate, hw, hotel, hotelExact: !!exact, bed, hotelTotal, cheapest, others: exact?.items?.slice(1, 4) || [] };
}
function stayHtml(t, s) {
  if (!s || !s.nights) return '';
  const parts = [];
  if (s.hw) parts.push(`<a href="${esc(s.hw.url)}" target="_blank" rel="noopener">Bed from ${eur(s.hw.from)}/night</a> <span class="muted">Hostelworld${s.hw.from < 6 ? ', looks like a mistake or promo: check' : ''}</span>`);
  if (s.hotel) parts.push(`<a href="${esc(s.hotel.url)}" target="_blank" rel="noopener">${esc(s.hotel.name)} ${eur(s.hotel.perNight)}/night</a> <span class="muted">${esc(s.hotel.advertiser || 'trivago')}</span>`);
  if (!parts.length) return `<span class="stay"><span class="muted">${s.nights} night${s.nights > 1 ? 's' : ''} · no stay prices for these dates yet</span></span>`;
  return `<span class="stay"><b>${s.nights} night${s.nights > 1 ? 's' : ''}:</b> ${parts.join(' · ')}${s.cheapest != null ? ` <span class="stay-total">Trip + bed ≈ ${eur(t.total + s.cheapest)}</span>` : ''}</span>`;
}

// ---------------------------------------------------------------- render: trips
const KIND = { flight: 'Flight', bus: 'Bus', train: 'Train', drive: 'Drive', park: 'Park', transfer: 'Coach / train', toll: 'Toll',
  walk: 'Walk', bike: 'Your bike', bikeshare: 'Bike sharing' };
const MODE_LABEL = { flight: 'Plane', bus: 'Bus', train: 'Train', mixed: 'Mixed', car: 'Car', drive: 'Car' };
const ALT_LABEL = { walk: 'Walk', bikeshare: 'Bike sharing', bus: 'Bus', train: 'Train', bike: 'Bike' };

function altsHtml(l) {
  if (!l.alts?.length) return '';
  const items = l.alts.map((a) => {
    const diff = Math.round(((a.eur || 0) - (l.eur || 0)) * 100) / 100;
    const cls = diff < 0 ? ' cheaper' : '';
    const d = diff === 0 ? 'same price' : diff < 0 ? `saves ${eur(-diff)}` : `+${eur(diff)}`;
    const name = a.operator && a.mode !== 'walk' ? a.operator : ALT_LABEL[a.mode] || a.mode;
    return `<li class="alt-item${cls}"><span>${esc(name)}</span><span>${fmtDuration(a.minutes)}</span><span>${a.est ? '≈' : ''}${eur(a.eur)}</span><span>${d}</span></li>`;
  }).join('');
  return `<details class="alts"><summary>Other ways for this step (${l.alts.length})</summary><ul>${items}</ul></details>`;
}

function shortPlace(code, fallback) {
  if (!code) return fallback;
  if (code === 'sbg-hbf') return 'Salzburg';
  if (code.startsWith('C:')) return code.slice(2);
  return code;
}

function timeOf(utc, tz, approx) {
  if (utc == null) return '';
  const l = utcMinToLocal(utc, tz || HOME_TZ);
  return `${approx ? '≈' : ''}${l.time}`;
}
function dayOf(utc, tz) {
  const l = utcMinToLocal(utc, tz || HOME_TZ);
  return `${l.dow} ${l.date.slice(8, 10)}.${l.date.slice(5, 7)}.`;
}
function mapsUrl(m) {
  if (!m?.from || !m?.to || m.from.lat == null) return null;
  return `https://www.google.com/maps/dir/?api=1&origin=${m.from.lat},${m.from.lon}&destination=${m.to.lat},${m.to.lon}&travelmode=${m.mode || 'transit'}`;
}

function legHtml(l) {
  const tzDep = l.kind === 'flight' ? l.tzFrom : l.tz;
  const tzArr = l.kind === 'flight' ? l.tzTo : l.tz;
  const badge = l.live ? '<span class="badge live">live price</span>' : l.est ? `<span class="badge est">${l.rough ? '≈ rough estimate' : '≈ estimate'}</span>` : '';
  const free = l.free?.length && !l.eur ? `<span class="free">free with card</span>` : l.free?.length ? `<span class="free">free for ${esc(l.free.join(', '))}</span>` : '';
  const map = mapsUrl(l.maps);
  const links = [
    l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener">${l.kind === 'flight' ? `Book on ${esc(l.bookWith || 'Ryanair')}` : l.live && /flixbus/i.test(l.operator || '') ? 'Book Flixbus' : l.live && l.kind === 'train' ? 'Book train' : 'Details'}</a>` : '',
    map ? `<a href="${esc(map)}" target="_blank" rel="noopener">Google Maps</a>` : '',
    l.rideshare ? `<a href="${esc(l.rideshare)}" target="_blank" rel="noopener">BlaBlaCar</a>` : '',
  ].filter(Boolean).join('');
  const route = l.kind === 'park' || l.kind === 'toll' ? esc(l.from || 'Toll') : `${esc(l.from)} → ${esc(l.to)}`;
  return `<li class="leg k-${l.kind}">
    <div class="leg-time">${l.dep != null && l.kind !== 'toll' ? `<b>${timeOf(l.dep, tzDep, l.approxTime)}</b><span>${timeOf(l.arr, tzArr, l.approxTime)}</span>` : ''}</div>
    <div class="leg-body">
      <div class="leg-kind">${KIND[l.kind] || l.kind}${l.stops ? ` · ${l.stops} stop${l.stops > 1 ? 's' : ''}` : ''}${l.number ? ` · ${esc(l.number)}` : ''}${l.minutes ? ` · ${fmtDuration(l.minutes)}` : ''}</div>
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
  return `<span class="compare">${entries.map(([m, v], i) => `<span class="${m === t.mode ? 'cur' : ''}${i === 0 ? ' best' : ''}">${MODE_LABEL[m] || m} ${eur0(v)}</span>`).join('')}</span>`;
}

function tripHtml(t, i) {
  const rides = t.mode === 'car' ? t.legs.filter((l) => l.kind === 'drive') : t.legs.filter((l) => ['flight', 'bus', 'train'].includes(l.kind) && l.fromCode);
  const out = rides[0];
  const back = rides.at(-1);
  const people = t.travelers > 1 ? `<span class="pp">${eur(t.perPerson)} each</span>` : '';
  const VEH = { car: 'With the car', bike: 'With your bike', public: 'Without car or bike' };
  const alts = (t.alts || []).length ? `<p class="alt">${t.alts.map((a) => `${VEH[a.vehicle] || a.vehicle}: ${eur(a.total)} (${a.total > t.total ? '+' : ''}${eur(a.total - t.total)}) via ${esc(a.via)}`).join('<br>')}</p>` : '';
  const ride = (l) => `${dayOf(l.dep, l.tzFrom)} ${timeOf(l.dep, l.tzFrom, l.approxTime)} ${esc(shortPlace(l.fromCode, l.from))}→${esc(shortPlace(l.toCode, l.to))} <b class="mode-${l.kind}">${MODE_LABEL[l.kind] || l.kind}</b>`;
  return `<article class="trip">
    <button type="button" class="trip-head" aria-expanded="false" aria-controls="legs-${i}" id="trip-${i}">
      <span class="dest"><span class="city">${esc(t.city)}</span><span class="country">${esc(t.country)}</span></span>
      <span class="price"><span class="total">${eur(t.total)}</span>${people}</span>
      <span class="when">
        <span><i>Out</i> ${ride(out)}</span>
        <span><i>Back</i> ${ride(back)}</span>
      </span>
      ${compareHtml(t)}
      ${stayHtml(t, t.stay)}
      <span class="tags">
        <span class="tag">${Math.round(t.stayHours)} h there</span>
        <span class="tag">leave home ≈${timeOf(t.leaveHome, HOME_TZ)}</span>
        <span class="tag">home ≈${dayOf(t.backHome, HOME_TZ)} ${timeOf(t.backHome, HOME_TZ)}</span>
        ${t.tags.map((x, k) => `<span class="tag${k === 0 ? ' tag-mode' : /airport|from|land/.test(x) ? ' tag-hl' : ''}">${esc(x)}</span>`).join('')}
        ${t.estimatedShare > 0.25 ? `<span class="tag tag-est">${Math.round(t.estimatedShare * 100)}% estimated</span>` : ''}
      </span>
    </button>
    <div class="trip-detail" id="legs-${i}" hidden>
      <ol class="legs">${t.legs.map(legHtml).join('')}</ol>
      ${alts}
      <p class="check">Book the main rides first, then the buses and trains. Prices change all the time; the booking page shows the real price.</p>
    </div>
  </article>`;
}

// ---------------------------------------------------------------- compute
let timer = null;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(compute, 60);
}

let radarToken = 0;
function computeRadar(q) {
  const token = ++radarToken;
  const wins = radarWindows();
  const out = [];
  const step = (i) => {
    if (token !== radarToken) return; // settings changed meanwhile
    if (i >= wins.length) { renderRadar(out); return; }
    const r = plan(SNAP, { ...q, ...wins[i], limit: 60, perCity: 1 });
    const live = r.trips.find((t) => t.estimatedShare <= 0.5);
    const best = live || r.trips[0] || null;
    out.push({ w: wins[i], best: best ? { ...best, approx: !live } : null });
    setTimeout(() => step(i + 1), 0);
  };
  setTimeout(() => step(0), 30);
}

function compute() {
  save();
  const q = baseQuery();

  const wins = windowsForState();
  let trips = [];
  for (const w of wins) {
    const r = plan(SNAP, { ...q, ...w });
    trips.push(...r.trips.map((t) => ({ ...t, window: w.label })));
  }
  if (wins.length > 1) {
    // flexible: keep variety across weekends
    const seen = new Map();
    trips = trips.sort((a, b) => a.total - b.total).filter((t) => {
      const k = t.city;
      const n = seen.get(k) || 0;
      seen.set(k, n + 1);
      return n < 2;
    });
  }
  for (const t of trips) t.stay = stayFor(t);
  if (state.sort === 'bed') trips.sort((a, b) => (a.total + (a.stay?.cheapest ?? 0)) - (b.total + (b.stay?.cheapest ?? 0)));
  else if (state.sort === 'stay') trips.sort((a, b) => b.stayHours - a.stayHours || a.total - b.total);
  else if (state.sort === 'live') trips.sort((a, b) => (a.estimatedShare > 0.5) - (b.estimatedShare > 0.5) || a.total - b.total);
  else if (state.sort === 'value') trips.sort((a, b) => a.total / Math.max(1, a.stayHours) - b.total / Math.max(1, b.stayHours));
  else trips.sort((a, b) => a.total - b.total);
  trips = trips.slice(0, 40);

  const list = $('trips');
  const label = state.when === 'custom' ? `${state.customLeave.replace('T', ' ')} → ${state.customBack.replace('T', ' ')}` : state.when === 'flex' ? (state.picked != null ? `weekend of ${dayOf(Math.floor(Date.parse(`${wins[0].leaveAfter}:00Z`) / 60000), 'UTC')}` : 'the next 6 weekends') : state.when === 'next' ? 'next weekend' : 'this weekend';
  const demo = SNAP.live === false ? ' (demo prices)' : '';
  $('result-title').textContent = (trips.length ? `${trips.length} trips for ${label}` : `No trip found for ${label}`) + demo;
  computeRadar(q);
  list.innerHTML = trips.length
    ? trips.map((t, i) => tripHtml(t, i)).join('')
    : `<div class="empty"><p>${SNAP.flights.length ? 'Nothing fits these settings.' : 'No prices loaded yet.'}</p>
       <p>${SNAP.flights.length ? 'Try a later "back by", a shorter minimum stay, or switch the car on.' : 'The first price refresh has not run yet. Once it has, this page fills itself.'}</p></div>`;
}

// ---------------------------------------------------------------- data status
function renderStatus() {
  const s = $('status');
  const at = SNAP.generatedAt ? new Date(SNAP.generatedAt) : null;
  const when = at ? at.toLocaleString('de-AT', { timeZone: HOME_TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'never';
  const src = (SNAP.sources || []).map((x) => `<li class="${x.ok ? 'ok' : 'bad'}">${esc(x.id)}${x.ok ? '' : ` — ${esc(x.error || 'failed')}`}</li>`).join('');
  s.innerHTML = `<p><b>Prices checked ${esc(when)}</b>${SNAP.live === false ? ' · <span class="badge est">demo data, invented prices</span>' : ''} · ${SNAP.flights.length.toLocaleString('de-AT')} flights · ${(SNAP.ground || []).length.toLocaleString('de-AT')} bus/train trips · ${(SNAP.timed || []).length.toLocaleString('de-AT')} airport buses</p>
    ${src ? `<ul class="sources">${src}</ul>` : ''}`;
  if (SNAP.live === false) { $('demo-banner').hidden = false; $('radar-title').textContent += ' (invented demo prices)'; }
}

// ---------------------------------------------------------------- events
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.name === 'when') { state.when = el.value; state.picked = null; syncForm(); }
  else if (el.id === 'leave-time') state.leaveTime = el.value;
  else if (el.id === 'back-by') state.backBy = el.value;
  else if (el.id === 'car') state.car = el.checked;
  else if (el.id === 'bike') state.bike = el.checked;
  else if (el.id === 'ground') state.ground = el.checked;
  else if (el.id === 'max-walk') state.maxWalk = Number(el.value);
  else if (el.id === 'bags') state.bags = el.value;
  else if (el.id === 'min-stay') state.minStay = Number(el.value);
  else if (el.id === 'dest') state.dest = el.value;
  else if (el.id === 'max-price') state.maxPrice = el.value;
  else if (el.id === 'sort') state.sort = el.value;
  else if (el.id === 'custom-leave') state.customLeave = el.value;
  else if (el.id === 'custom-back') state.customBack = el.value;
  else if (el.dataset.card) {
    const t = state.travelers[Number(el.dataset.person)];
    t.cards = el.checked ? [...new Set([...t.cards, el.dataset.card])] : t.cards.filter((c) => c !== el.dataset.card);
  } else if (el.id?.startsWith('name-')) { state.travelers[Number(el.id.slice(5))].name = el.value; save(); return; }
  else return;
  schedule();
});

document.addEventListener('click', (e) => {
  const head = e.target.closest('.trip-head');
  if (head) {
    const open = head.getAttribute('aria-expanded') === 'true';
    head.setAttribute('aria-expanded', String(!open));
    $(head.getAttribute('aria-controls')).hidden = open;
    return;
  }
  const wk = e.target.closest('[data-week]');
  if (wk) {
    const i = Number(wk.dataset.week);
    if (i === 0) { state.when = 'this'; state.picked = null; }
    else if (i === 1) { state.when = 'next'; state.picked = null; }
    else { state.when = 'flex'; state.picked = i; }
    syncForm(); schedule();
    $('results').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  if (e.target.id === 'add-person') {
    if (state.travelers.length < 6) state.travelers.push({ name: `Person ${state.travelers.length + 1}`, cards: [] });
    renderPeople(); schedule();
    return;
  }
  const df = e.target.closest('[data-deal-filter]');
  if (df) { dealFilter = df.dataset.dealFilter; renderCheap(); return; }
  const rm = e.target.closest('[data-remove]');
  if (rm) { state.travelers.splice(Number(rm.dataset.remove), 1); renderPeople(); schedule(); }
});


// ---------------------------------------------------------------- too cheap to be true?
let dealFilter = 'top';
function renderCheap() {
  const ap = SNAP.airports || {};
  const name = (c) => (ap[c]?.city || c);
  const an = findAnomalies(SNAP, { limit: 6 });
  $('anomalies').innerHTML = an.length ? an.map((a) => {
    const tz = ap[a.from]?.tz || 'UTC';
    const d = utcMinToLocal(a.dep, tz);
    const url = a.src === 'kiwi' ? kiwiUrl(a.from, a.to, d.date, 1) : bookingUrl({ ...a, carrier: a.carrier }, 1, d.date);
    return `<li class="cheap-item"><span class="cheap-badge ${a.level}">${a.level === 'mistake' ? 'possible mistake' : 'unusually cheap'}</span>
      <a href="${esc(url)}" target="_blank" rel="noopener"><b>${esc(name(a.from))} → ${esc(name(a.to))}</b></a>
      <span class="cheap-meta">${d.dow} ${d.date.slice(8, 10)}.${d.date.slice(5, 7)}. ${d.time} · ${esc(a.from)}→${esc(a.to)}</span>
      <span class="cheap-price">${eur(a.eur)} <s>≈ ${eur0(a.normal)}</s> −${a.savePct}%</span></li>`;
  }).join('') : '<li class="cheap-empty">Nothing unusual in the current fares.</li>';

  const allBeds = Object.entries(SNAP.hostels || {}).sort((a, b) => a[1].from - b[1].from);
  const odd = allBeds.filter(([, h]) => h.from < 3);
  const beds = allBeds.filter(([, h]) => h.from >= 3).slice(0, 8);
  $('beds').innerHTML = (beds.length ? beds.map(([city, h]) => `<li class="cheap-item">${h.from < 6 ? '<span class="cheap-badge mistake">possible mistake or promo</span>' : ''}
      <a href="${esc(h.url)}" target="_blank" rel="noopener"><b>${esc(city)}: bed from ${eur(h.from)}/night</b></a>
      <span class="cheap-meta">Hostelworld, cheapest bed in town</span></li>`).join('')
    : '<li class="cheap-empty">No hostel prices loaded yet.</li>')
    + (odd.length ? `<li class="cheap-item"><span class="cheap-badge">probably a display error, check</span>
      <span class="cheap-meta">Hostelworld shows under €3 for: ${odd.slice(0, 10).map(([city, h]) => `<a href="${esc(h.url)}" target="_blank" rel="noopener">${esc(city)} ${eur(h.from)}</a>`).join(', ')}</span></li>` : '');

  const all = SNAP.deals || [];
  const pick = dealFilter === 'mistake' ? all.filter((d) => d.mistake)
    : dealFilter === 'hotel' ? all.filter((d) => d.hotel)
    : dealFilter === 'near' ? all.filter((d) => d.nearHome)
    : all.filter((d) => d.mistake || d.nearHome || d.hotel);
  for (const b of document.querySelectorAll('[data-deal-filter]')) b.setAttribute('aria-pressed', String(b.dataset.dealFilter === dealFilter));
  $('deals').innerHTML = pick.length ? pick.slice(0, 8).map((d) => `<li class="cheap-item">
      ${d.mistake ? '<span class="cheap-badge mistake">reported price mistake</span>' : d.hotel ? '<span class="cheap-badge stay">stay</span>' : ''}
      <a href="${esc(d.link)}" target="_blank" rel="noopener"><b>${esc(d.title)}</b></a>
      <span class="cheap-meta">${esc(d.source)}${d.date ? ` · ${new Date(d.date).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}` : ''}</span>
      ${d.price != null ? `<span class="cheap-price">${eur(d.price)}</span>` : ''}</li>`).join('')
    : `<li class="cheap-empty">${all.length ? 'Nothing in this filter right now.' : 'No deal feeds loaded yet.'}</li>`;
}

// ---------------------------------------------------------------- refresh only when the page is opened
function setRefresh(text, busy) {
  $('refresh-status').textContent = text;
  $('refresh-btn').disabled = !!busy;
}
async function startRefresh(mcp, manual) {
  setRefresh('Checking…', true);
  try {
    const r = await mcp.callTool(CONNECTOR, 'get_trigger', { trigger_id: REFRESH_TRIGGER }, { cache: false });
    const t = r.payload?.trigger || {};
    const fired = Date.parse(t.last_run?.fired_at || t.last_fired_at || 0) || 0;
    const finished = Date.parse(t.last_run?.finished_at || 0) || 0;
    const running = fired > finished && Date.now() - fired < 15 * 60000;
    if (running) { setRefresh('New prices are on the way (started ' + Math.max(1, Math.round((Date.now() - fired) / 60000)) + ' min ago). This page reloads by itself.', true); return; }
  } catch { /* a failed status read is not a reason to stop */ }
  try {
    await mcp.callTool(CONNECTOR, 'fire_trigger', { trigger_id: REFRESH_TRIGGER, text: manual ? 'Started with the Refresh button.' : 'Started automatically: the page was opened with prices older than 6 hours.' }, { cache: false });
    setRefresh('Getting new prices… about 3 minutes. This page reloads by itself when they are ready.', true);
  } catch (e) {
    const code = e?.code;
    if (code === 'approval_required' || code === 'not_in_manifest' || code === 'consent_required') setRefresh('To refresh from here, allow "Claude Code Remote" for this page (claude.ai asks the first time), then tap Refresh.', false);
    else if (code === 'server_not_connected' || code === 'needs_reauth') setRefresh('Refreshing needs the "Claude Code Remote" connector in claude.ai Settings → Connectors. Or tell Claude: "refresh Cheap Escape".', false);
    else if (code === 'tool_error') setRefresh('The refresh could not start: ' + String(e?.message || '').slice(0, 160), false);
    else setRefresh('The refresh could not start right now. Try again in a minute, or tell Claude: "refresh Cheap Escape".', false);
  }
}
async function initRefresh() {
  const ageH = SNAP.generatedAt ? (Date.now() - Date.parse(SNAP.generatedAt)) / 3600000 : Infinity;
  if (SNAP.hosting?.kind === 'github') {
    const btn = $('refresh-btn');
    btn.hidden = !SNAP.hosting.runUrl;
    btn.textContent = 'Update now';
    btn.onclick = () => window.open(SNAP.hosting.runUrl, '_blank', 'noopener');
    setRefresh(`Prices are ${ageH < 1 ? 'less than an hour' : `${Math.round(ageH)} h`} old and update by themselves every ${SNAP.hosting.every} hours. "Update now" opens GitHub: tap "Run workflow".`, false);
    return;
  }
  const mcp = window.claude?.use ? await window.claude.use('mcp').catch(() => null) : null;
  if (!mcp) {
    $('refresh-btn').hidden = true;
    setRefresh('To get new prices, open this page in claude.ai or the Claude app, or tell Claude: "refresh Cheap Escape".', false);
    return;
  }
  $('refresh-btn').hidden = false;
  $('refresh-btn').onclick = () => startRefresh(mcp, true);
  if (SNAP.live !== false && ageH > 6) startRefresh(mcp, false);
  else setRefresh(ageH < 1 ? 'Prices are fresh.' : `Prices are ${Math.round(ageH)} h old. They refresh by themselves when you open the page after 6 h.`, false);
}

// ---------------------------------------------------------------- boot
$('bags').innerHTML = Object.entries(BAGS).map(([k, b]) => `<option value="${k}">${esc(b.label)}</option>`).join('');
$('back-by').innerHTML = Object.entries(BACK_OPTIONS).map(([k, b]) => `<option value="${k}">${esc(b.label)}</option>`).join('');
$('home-name').textContent = HOMES.salzburg.name;
syncForm();
renderStatus();
renderCheap();
compute();
initRefresh();
