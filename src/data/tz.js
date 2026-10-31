// Time zone per country (lowercase ISO code), with the few airports that differ.
const BY_COUNTRY = {
  at: 'Europe/Vienna', de: 'Europe/Berlin', ch: 'Europe/Zurich', it: 'Europe/Rome', fr: 'Europe/Paris', es: 'Europe/Madrid', pt: 'Europe/Lisbon',
  gb: 'Europe/London', ie: 'Europe/Dublin', nl: 'Europe/Amsterdam', be: 'Europe/Brussels', lu: 'Europe/Luxembourg', dk: 'Europe/Copenhagen',
  se: 'Europe/Stockholm', no: 'Europe/Oslo', fi: 'Europe/Helsinki', is: 'Atlantic/Reykjavik', ee: 'Europe/Tallinn', lv: 'Europe/Riga',
  lt: 'Europe/Vilnius', pl: 'Europe/Warsaw', cz: 'Europe/Prague', sk: 'Europe/Bratislava', hu: 'Europe/Budapest', si: 'Europe/Ljubljana',
  hr: 'Europe/Zagreb', ba: 'Europe/Sarajevo', rs: 'Europe/Belgrade', me: 'Europe/Podgorica', mk: 'Europe/Skopje', al: 'Europe/Tirane',
  xk: 'Europe/Belgrade', gr: 'Europe/Athens', bg: 'Europe/Sofia', ro: 'Europe/Bucharest', md: 'Europe/Chisinau', ua: 'Europe/Kyiv',
  by: 'Europe/Minsk', ru: 'Europe/Moscow', tr: 'Europe/Istanbul', cy: 'Asia/Nicosia', mt: 'Europe/Malta', ge: 'Asia/Tbilisi',
  am: 'Asia/Yerevan', az: 'Asia/Baku', il: 'Asia/Jerusalem', jo: 'Asia/Amman', lb: 'Asia/Beirut', eg: 'Africa/Cairo', ma: 'Africa/Casablanca',
  tn: 'Africa/Tunis', dz: 'Africa/Algiers', ae: 'Asia/Dubai', sa: 'Asia/Riyadh', qa: 'Asia/Qatar', kw: 'Asia/Kuwait', bh: 'Asia/Bahrain',
  om: 'Asia/Muscat', ad: 'Europe/Andorra', mc: 'Europe/Monaco', gi: 'Europe/Gibraltar', fo: 'Atlantic/Faroe',
};
const BY_AIRPORT = {
  LPA: 'Atlantic/Canary', TFS: 'Atlantic/Canary', TFN: 'Atlantic/Canary', ACE: 'Atlantic/Canary', FUE: 'Atlantic/Canary', SPC: 'Atlantic/Canary',
  VDE: 'Atlantic/Canary', GMZ: 'Atlantic/Canary', PDL: 'Atlantic/Azores', TER: 'Atlantic/Azores', HOR: 'Atlantic/Azores', FNC: 'Atlantic/Madeira',
  KGD: 'Europe/Kaliningrad', LED: 'Europe/Moscow', SVO: 'Europe/Moscow', DME: 'Europe/Moscow', VKO: 'Europe/Moscow',
};

export function tzForCountry(country, airport) {
  return BY_AIRPORT[airport] || BY_COUNTRY[country] || 'UTC';
}
