// Time-zone helpers built on Intl (no extra libraries).

function tzOffsetMs(date, tz) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

// Wall-clock time in `tz` -> Date (UTC instant). minutes may be 1440 (= next midnight).
function zonedToUtc(dateStr, minutes, tz) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let off = tzOffsetMs(new Date(guess), tz);
  let utc = guess - off;
  const off2 = tzOffsetMs(new Date(utc), tz);
  if (off2 !== off) utc = guess - off2;
  return new Date(utc);
}

// Date -> "YYYY-MM-DD" as seen in tz
function dateInTz(date, tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function hm(str) {
  const [h, m] = String(str).split(":").map(Number);
  return h * 60 + (m || 0);
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function weekday(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function fmt(date, tz, opts = {}) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short", ...opts,
  }).format(date);
}

module.exports = { tzOffsetMs, zonedToUtc, dateInTz, hm, addDays, weekday, fmt };
