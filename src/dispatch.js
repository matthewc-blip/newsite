// Automatic dispatch: offer a booking to the best ready notary; on decline or timeout, move to the next one.
const zipcodes = require("zipcodes");
const { db, getSettings, logEvent } = require("./db");
const { compliance, assignNotary } = require("./notary");
const { dateInTz } = require("./time");
const mail = require("./email");

const ACTIVE = ["requested", "confirmed", "assigned"];
const MIN = 60000;

function milesBetween(zipA, zipB) {
  if (!zipA || !zipB) return null;
  if (!zipcodes.lookup(zipA) || !zipcodes.lookup(zipB)) return null;
  return zipcodes.distance(zipA, zipB);
}

function defaultFee(settings, b) {
  const f = settings.notaryFees || {};
  if (b.service === "mobile") return (b.is_loan ? f.mobile?.loan : f.mobile?.general) ?? null;
  return f[b.service] ?? null;
}

// Ranked list of notaries who can take this booking, with the reason others were skipped.
async function candidates(b, settings) {
  const notaries = await db.all("SELECT * FROM notaries WHERE active = 1");
  const docs = await db.all("SELECT notary_id, kind FROM notary_documents");
  const today = dateInTz(new Date(), settings.business.timezone);
  const buffer = (b.service === "mobile" ? 60 : 15) * MIN;
  const from = new Date(Date.parse(b.start_utc) - buffer).toISOString();
  const to = new Date(Date.parse(b.end_utc) + buffer).toISOString();
  const busy = await db.all(
    `SELECT DISTINCT notary_id FROM bookings WHERE id <> $1 AND notary_id IS NOT NULL AND notary_status IN ('offered','accepted')
       AND status = ANY($2) AND start_utc < $3 AND end_utc > $4`, [b.id, ACTIVE, to, from]);
  const busyIds = new Set(busy.map((r) => r.notary_id));
  const load = await db.all(
    `SELECT notary_id, COUNT(*)::int AS n FROM bookings WHERE notary_status = 'accepted' AND status = ANY($1) AND start_utc > now() GROUP BY notary_id`, [ACTIVE]);
  const loadOf = (id) => load.find((l) => l.notary_id === id)?.n || 0;
  const declined = new Set(b.declined_notary_ids || []);

  const ok = [], skipped = [];
  for (const n of notaries) {
    const why = [];
    if (declined.has(n.id)) why.push("declined or let an offer expire");
    if (!compliance(n, docs, today).ready) why.push("onboarding incomplete or credentials expired");
    if (b.service === "ron" && !n.ron) why.push("not RON-authorized");
    if (b.service === "rin" && !n.rin) why.push("not RIN-capable");
    let miles = null;
    if (b.service === "mobile") {
      const states = (n.states || "").split(",").filter(Boolean);
      if (states.length && b.state && !states.includes(b.state)) why.push(`not commissioned in ${b.state}`);
      miles = milesBetween(n.home_zip, b.zip);
      if (miles === null) why.push("home ZIP or signing ZIP unknown");
      else if (miles > (n.travel_miles || 30)) why.push(`${miles} mi away (travels ${n.travel_miles || 30})`);
    }
    if (busyIds.has(n.id)) why.push("booked at that time");
    if (why.length) skipped.push({ id: n.id, name: n.name, why });
    else ok.push({ ...n, miles, load: loadOf(n.id) });
  }
  ok.sort((a, c) => (b.service === "mobile" ? a.miles - c.miles : 0) || a.load - c.load || a.id - c.id);
  return { ok, skipped };
}

// Offer the booking to the next best notary. Safe to call repeatedly.
async function autoOffer(bookingId) {
  const settings = await getSettings();
  const b = await db.one("SELECT * FROM bookings WHERE id = $1", [bookingId]);
  if (!b || !ACTIVE.includes(b.status) || b.notary_status === "accepted") return { done: true };
  if (b.notary_status === "offered" && b.offer_expires_at && Date.parse(b.offer_expires_at) > Date.now()) return { waiting: true };
  if (Date.parse(b.start_utc) < Date.now()) return { past: true };

  const cfg = settings.dispatch || {};
  if ((b.offer_count || 0) >= (cfg.maxOffers || 6)) return unfilled(b, `No one accepted after ${b.offer_count} offers.`);
  const { ok, skipped } = await candidates(b, settings);
  if (!ok.length) {
    return unfilled(b, skipped.length ? `No eligible notary. ${skipped.slice(0, 6).map((s) => `${s.name}: ${s.why.join(", ")}`).join("; ")}` : "No active notaries on the roster.");
  }
  const pick = ok[0];
  const rush = Date.parse(b.start_utc) - Date.now() < 4 * 3600 * 1000;
  const minutes = rush ? cfg.rushOfferMinutes || 10 : cfg.offerMinutes || 30;
  const expiresAt = new Date(Date.now() + minutes * MIN).toISOString();
  const fee = b.notary_fee ?? defaultFee(settings, b);
  await assignNotary(b, { notaryId: pick.id, direct: false, fee, notify: true, expiresAt, auto: true });
  return { offered: pick.id, miles: pick.miles, expiresAt };
}

async function unfilled(b, reason) {
  if (b.notary_status === "unfilled") return { unfilled: true };
  await db.run("UPDATE bookings SET notary_id = NULL, notary_status = 'unfilled', offer_expires_at = NULL, updated_at = now() WHERE id = $1", [b.id]);
  await logEvent(b.id, "system", `Auto-dispatch stopped: ${reason}`);
  mail.deskNotice(`Needs a notary: ${b.ref}`, `Auto-dispatch couldn't fill ${b.ref} (${b.category}, ${b.city || b.signer_location || ""}).\n${reason}\nAssign someone in the dashboard.`);
  return { unfilled: true, reason };
}

// Expire unanswered offers and move on. Runs every minute.
async function tick() {
  const expired = await db.all(
    `SELECT b.id, b.notary_id, n.name FROM bookings b LEFT JOIN notaries n ON n.id = b.notary_id
     WHERE b.auto_dispatch = 1 AND b.notary_status = 'offered' AND b.offer_expires_at < now() AND b.status = ANY($1)`, [ACTIVE]);
  for (const e of expired) {
    const r = await db.one(
      `UPDATE bookings SET notary_id = NULL, notary_status = 'expired', offer_expires_at = NULL,
         declined_notary_ids = array_append(coalesce(declined_notary_ids, '{}'), $2), updated_at = now()
       WHERE id = $1 AND notary_status = 'offered' AND offer_expires_at < now() RETURNING id`, [e.id, e.notary_id]);
    if (!r) continue;
    await logEvent(e.id, "system", `Offer to ${e.name || "notary"} expired with no answer`);
    await autoOffer(e.id).catch((err) => console.error("Auto-dispatch failed:", err.message));
  }
}

function start() {
  setInterval(() => tick().catch((e) => console.error("Dispatch tick failed:", e.message)), MIN).unref();
}

// Turn on auto-dispatch for a booking and make the first offer.
async function enable(bookingId) {
  await db.run("UPDATE bookings SET auto_dispatch = 1, offer_count = 0, notary_status = CASE WHEN notary_status IN ('unfilled','expired','declined') THEN NULL ELSE notary_status END WHERE id = $1", [bookingId]);
  return autoOffer(bookingId);
}

module.exports = { autoOffer, enable, candidates, tick, start, milesBetween, defaultFee };
