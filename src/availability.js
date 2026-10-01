const { db } = require("./db");
const { zonedToUtc, dateInTz, hm, addDays, weekday } = require("./time");

const ACTIVE = ["requested", "confirmed", "assigned"];

function isBlackout(settings, service, dateStr) {
  return (settings.blackouts || []).some((b) => b.date === dateStr && (b.service === "all" || b.service === service));
}

// Active bookings of a service overlapping [fromIso, toIso)
function activeBetween(service, fromIso, toIso, conn = db, excludeId = 0) {
  return conn.all(
    `SELECT start_utc, end_utc FROM bookings
     WHERE service = $1 AND status = ANY($2) AND start_utc < $3 AND end_utc > $4 AND id <> $5`,
    [service, ACTIVE, toIso, fromIso, excludeId]
  );
}

async function overlapping(service, startIso, endIso, conn = db, excludeId = 0) {
  return (await activeBetween(service, startIso, endIso, conn, excludeId)).length;
}

function candidateSlots(settings, service, dateStr, now) {
  const cfg = settings.services[service];
  const tz = settings.business.timezone;
  if (!cfg || !cfg.enabled || isBlackout(settings, service, dateStr)) return [];
  const todayBiz = dateInTz(now, tz);
  if (dateStr < todayBiz || dateStr > addDays(todayBiz, cfg.maxDaysAhead)) return [];
  const hours = cfg.hours[weekday(dateStr)];
  if (!hours) return [];
  const open = hm(hours[0]);
  const close = hm(hours[1]);
  const earliest = now.getTime() + cfg.leadMinutes * 60000;
  const out = [];
  for (let t = open; t + cfg.durationMin <= close; t += cfg.slotStepMin) {
    const start = zonedToUtc(dateStr, t, tz);
    if (start.getTime() < earliest) continue;
    out.push({ start, end: new Date(start.getTime() + cfg.durationMin * 60000) });
  }
  return out;
}

// All open slots for one business day, with remaining capacity. One query per day.
async function slotsForDate(settings, service, dateStr, now = new Date()) {
  const cands = candidateSlots(settings, service, dateStr, now);
  if (!cands.length) return [];
  const cap = settings.services[service].capacity;
  const taken = await activeBetween(service, cands[0].start.toISOString(), cands[cands.length - 1].end.toISOString());
  const spans = taken.map((b) => [Date.parse(b.start_utc), Date.parse(b.end_utc)]);
  const out = [];
  for (const c of cands) {
    const s = c.start.getTime(), e = c.end.getTime();
    const used = spans.filter(([bs, be]) => bs < e && be > s).length;
    if (used < cap) out.push({ start: c.start.toISOString(), end: c.end.toISOString(), remaining: cap - used });
  }
  return out;
}

async function openDays(settings, service, fromDate, days, now = new Date()) {
  const dates = Array.from({ length: days }, (_, i) => addDays(fromDate, i));
  const counts = await Promise.all(dates.map((d) => slotsForDate(settings, service, d, now)));
  return dates.map((date, i) => ({ date, open: counts[i].length }));
}

// Is this exact start time one of the configured slot times? (Capacity is re-checked inside the booking transaction.)
function validateSlot(settings, service, startIso, now = new Date()) {
  const start = new Date(startIso);
  if (isNaN(start)) return { ok: false, error: "Pick a valid appointment time." };
  const dateStr = dateInTz(start, settings.business.timezone);
  const slot = candidateSlots(settings, service, dateStr, now).find((s) => s.start.getTime() === start.getTime());
  if (!slot) return { ok: false, error: "That time is no longer available. Pick another time." };
  return { ok: true, slot: { start: slot.start.toISOString(), end: slot.end.toISOString() } };
}

module.exports = { slotsForDate, openDays, validateSlot, overlapping, ACTIVE };
