// Time helpers. Everything inside the planner is "UTC minutes since epoch"
// (integers), so flights in London, Lisbon and Athens compare correctly.
// Local wall-clock strings are only used at the edges (input + display).
// Works in Node and every modern browser (uses Intl, no libraries).

const dtfCache = new Map();

function dtf(tz) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

// Offsets only change at DST switches, which always happen on a quarter hour, so one
// lookup per time zone and 15-minute block is exact (Intl is slow, this runs a lot).
const offsetCache = new Map();
const QUARTER = 15 * 60000;

/** Offset of `tz` from UTC at instant `utcMs`, in minutes (Vienna winter = +60). */
export function tzOffsetMin(utcMs, tz) {
  const key = `${tz}|${Math.floor(utcMs / QUARTER)}`;
  let off = offsetCache.get(key);
  if (off === undefined) {
    off = rawOffsetMin(Math.floor(utcMs / QUARTER) * QUARTER, tz);
    if (offsetCache.size > 200000) offsetCache.clear();
    offsetCache.set(key, off);
  }
  return off;
}

function rawOffsetMin(utcMs, tz) {
  const parts = {};
  for (const p of dtf(tz).formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(utcMs / 1000) * 1000) / 60000);
}

/** '2026-11-06T17:25[:00]' wall-clock in `tz` -> UTC minutes. */
export function localToUtcMin(local, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local);
  if (!m) throw new Error(`Bad local time: ${local}`);
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = naive - tzOffsetMin(naive, tz) * 60000;
  // second pass handles DST boundaries
  guess = naive - tzOffsetMin(guess, tz) * 60000;
  return Math.round(guess / 60000);
}

/** UTC minutes -> { date:'2026-11-06', time:'17:25', dow:'Fri' } in `tz`. */
export function utcMinToLocal(utcMin, tz) {
  const ms = utcMin * 60000;
  const off = tzOffsetMin(ms, tz);
  const d = new Date(ms + off * 60000);
  const iso = d.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16),
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()],
    iso: iso.slice(0, 16),
  };
}

export function fmtLocal(utcMin, tz) {
  const l = utcMinToLocal(utcMin, tz);
  return `${l.dow} ${l.date.slice(8, 10)}.${l.date.slice(5, 7)}. ${l.time}`;
}

export function fmtDuration(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m}min`;
}

/** Add days to a 'YYYY-MM-DD' string. */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Day of week (0=Sun) of a 'YYYY-MM-DD'. */
export function dowOf(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

/** Today's date in `tz` as 'YYYY-MM-DD'. */
export function todayIn(tz, nowMs = Date.now()) {
  return utcMinToLocal(Math.floor(nowMs / 60000), tz).date;
}
