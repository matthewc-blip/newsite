require("./src/env");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { db, init, getSettings, saveSettings, logEvent } = require("./src/db");
const { slotsForDate, openDays, validateSlot, overlapping } = require("./src/availability");
const { dateInTz, zonedToUtc, addDays } = require("./src/time");
const mail = require("./src/email");
const payments = require("./src/payments");
const margin = require("./src/margin");
const { buildIcs } = require("./src/ics");
const notary = require("./src/notary");
const dispatch = require("./src/dispatch");
const documents = require("./src/documents");
const clients = require("./src/clients");
const billing = require("./src/billing");
const { str, emailOk, phoneOk, httpError, rateLimit, sign, verify, cookie, STATE_CODES } = require("./src/util");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
if (!ADMIN_PASSWORD) console.warn("ADMIN_PASSWORD is not set. The dispatch dashboard is locked until you set it.");

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
// Stripe webhooks need the raw body for signature checks, so this route comes before the JSON parser.
app.post("/api/webhooks/stripe", express.raw({ type: "application/json", limit: "1mb" }), (req, res) => require("./src/billing").handleStripeWebhook(req, res));
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

/* ---------------- helpers ---------------- */
const SERVICES = ["mobile", "ron", "rin"];
const STATUSES = ["requested", "confirmed", "assigned", "completed", "canceled", "no_show"];
const LOAN_CATEGORIES = new Set(["Refinance", "Purchase · buyer", "Purchase · seller", "HELOC", "Reverse mortgage", "Loan modification", "Hybrid e-closing", "Real estate closing"]);

const isTz = (tz) => { try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; } };
function newRefCandidate() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "MCC-";
  for (let i = 0; i < 6; i++) r += alphabet[crypto.randomInt(alphabet.length)];
  return r;
}

function estimateFee(settings, service, isLoan, signers) {
  const p = settings.pricing[service] || {};
  const base = service === "mobile" ? (isLoan ? p.loan : p.general) : p.base;
  if (base == null || base === "") return null;
  const extra = p.perExtraSigner ? Math.max(0, signers - 1) * Number(p.perExtraSigner) : 0;
  return Number(base) + extra;
}

async function publicBooking(b, settings) {
  const notary = b.notary_id ? await db.one("SELECT name, phone FROM notaries WHERE id = $1", [b.notary_id]) : null;
  return {
    ref: b.ref, service: b.service, category: b.category, signers: b.signers,
    start: b.start_utc, end: b.end_utc, tz: b.customer_tz || settings.business.timezone,
    location: b.service === "mobile" ? [b.address, b.city, b.state, b.zip].filter(Boolean).join(", ") : b.signer_location,
    mailingAddress: b.mailing_address, status: b.status, estFee: b.quoted_fee ?? b.est_fee,
    feeIsQuote: b.quoted_fee != null, contactName: b.contact_name,
    notary: ["assigned", "completed"].includes(b.status) && notary ? notary : null,
    canCancel: ["requested", "confirmed", "assigned"].includes(b.status) && new Date(b.start_utc).getTime() > Date.now(),
    card: payments.cardView(b),
    cardRequested: payments.wantsCard(b, settings),
  };
}

/* ---------------- public API ---------------- */
app.get("/api/config", async (req, res) => {
  const s = await getSettings();
  const services = {};
  for (const k of SERVICES) {
    const c = s.services[k];
    services[k] = { label: c.label, enabled: c.enabled, durationMin: c.durationMin, maxDaysAhead: c.maxDaysAhead };
  }
  res.json({ business: s.business, services, pricing: s.pricing, rinStates: s.rinStates, liveStates: s.coverage?.liveStates || [], today: dateInTz(new Date(), s.business.timezone) });
});

app.get("/api/health", async (req, res) => {
  await db.one("SELECT 1 AS ok");
  res.json({ ok: true });
});

app.get("/api/availability", async (req, res) => {
  const s = await getSettings();
  const service = str(req.query.service);
  const date = str(req.query.date, 10);
  if (!SERVICES.includes(service) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "service and date (YYYY-MM-DD) are required" });
  res.json({ date, timezone: s.business.timezone, slots: await slotsForDate(s, service, date) });
});

app.get("/api/availability/days", async (req, res) => {
  const s = await getSettings();
  const service = str(req.query.service);
  const from = str(req.query.from, 10) || dateInTz(new Date(), s.business.timezone);
  const days = Math.min(Number(req.query.days) || 14, 62);
  if (!SERVICES.includes(service) || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return res.status(400).json({ error: "Invalid service or date" });
  res.json({ timezone: s.business.timezone, days: await openDays(s, service, from, days) });
});

function readBookingInput(body, { admin = false } = {}) {
  const errors = {};
  const b = {
    service: str(body.service, 10),
    category: str(body.category, 80),
    signers: Math.max(1, Math.min(10, parseInt(body.signers, 10) || 1)),
    start: str(body.start, 40),
    customer_tz: str(body.tz, 60),
    address: str(body.address, 200), city: str(body.city, 80), state: str(body.state, 2).toUpperCase(), zip: str(body.zip, 10),
    signer_location: str(body.signerLocation, 200), signer_state: str(body.signerState, 2).toUpperCase(),
    in_us: body.inUS === undefined ? null : body.inUS ? 1 : 0,
    mailing_address: str(body.mailingAddress, 300),
    docs_delivery: str(body.docsDelivery, 60),
    contact_name: str(body.contactName, 120), contact_email: str(body.contactEmail, 160).toLowerCase(), contact_phone: str(body.contactPhone, 40),
    signer_names: str(body.signerNames, 300), company: str(body.company, 160), file_number: str(body.fileNumber, 60), notes: str(body.notes, 2000),
  };
  if (!SERVICES.includes(b.service)) errors.service = "Choose mobile, RON or RIN.";
  if (!b.category) errors.category = "Choose what you need notarized.";
  if (!b.start) errors.start = "Pick an appointment time.";
  if (!isTz(b.customer_tz)) b.customer_tz = null;
  if (b.service === "mobile") {
    if (!b.address) errors.address = "Enter the street address for the signing.";
    if (!b.city) errors.city = "Enter the city.";
    if (!/^[A-Z]{2}$/.test(b.state)) errors.state = "Choose the state.";
    if (!/^\d{5}$/.test(b.zip)) errors.zip = "Enter a 5-digit ZIP code.";
  } else if (b.service === "ron" || b.service === "rin") {
    if (!b.signer_location) errors.signerLocation = "Tell us where the signer will be during the session.";
  }
  if (b.service === "rin" && !b.mailing_address) errors.mailingAddress = "Enter where the paper documents should be sent.";
  if (!b.contact_name) errors.contactName = "Enter your name.";
  if (!emailOk(b.contact_email)) errors.contactEmail = "Enter a valid email address.";
  if (!admin && !phoneOk(b.contact_phone)) errors.contactPhone = "Enter a phone number with area code.";
  b.is_loan = LOAN_CATEGORIES.has(b.category) ? 1 : 0;
  return { b, errors };
}

const BOOKING_COLS = ["ref", "token", "service", "category", "is_loan", "signers", "start_utc", "end_utc", "customer_tz", "address", "city", "state", "zip",
  "signer_location", "signer_state", "in_us", "mailing_address", "docs_delivery", "contact_name", "contact_email", "contact_phone",
  "signer_names", "company", "file_number", "notes", "est_fee", "source"];

async function insertBooking(b, settings, { admin, force, source }) {
  const cfg = settings.services[b.service];
  let startIso, endIso;
  if (admin && force) {
    const start = new Date(b.start);
    if (isNaN(start)) throw httpError(400, "Invalid start time");
    startIso = start.toISOString();
    endIso = new Date(start.getTime() + cfg.durationMin * 60000).toISOString();
  } else {
    const v = validateSlot(settings, b.service, b.start);
    if (!v.ok) throw httpError(409, v.error, "start");
    startIso = v.slot.start; endIso = v.slot.end;
  }
  return db.tx(async (t) => {
    // One booking per service at a time passes this point, so two people can't take the last seat together.
    await t.run("SELECT pg_advisory_xact_lock(hashtext($1))", ["mcc-booking-" + b.service]);
    if (!(admin && force) && (await overlapping(b.service, startIso, endIso, t)) >= cfg.capacity) {
      throw httpError(409, "That time was just taken. Pick another time.", "start");
    }
    let ref;
    for (;;) { ref = newRefCandidate(); if (!(await t.one("SELECT 1 FROM bookings WHERE ref = $1", [ref]))) break; }
    const row = {
      ...b, ref, token: crypto.randomBytes(18).toString("base64url"), start_utc: startIso, end_utc: endIso,
      est_fee: estimateFee(settings, b.service, b.is_loan, b.signers), source: source || (admin ? "desk" : "web"),
    };
    const inserted = await t.one(
      `INSERT INTO bookings (${BOOKING_COLS.join(",")}) VALUES (${BOOKING_COLS.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`,
      BOOKING_COLS.map((c) => (row[c] === undefined ? null : row[c]))
    );
    await logEvent(inserted.id, admin ? "desk" : source === "client" ? "client" : "customer", admin ? "Booking entered by desk" : source === "client" ? "Order placed by client" : "Booking requested online", t);
    return inserted;
  });
}

app.post("/api/bookings", rateLimit(10, 10 * 60000), async (req, res) => {
  if (req.body.website) return res.status(400).json({ error: "Rejected" }); // honeypot
  const settings = await getSettings();
  const { b, errors } = readBookingInput(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ error: "Check the highlighted fields.", fields: errors });
  if (!settings.services[b.service].enabled) return res.status(400).json({ error: "That service is not taking online bookings right now. Call the desk." });
  let row;
  try { row = await insertBooking(b, settings, { admin: false }); }
  catch (e) {
    if (!e.status) throw e;
    return res.status(e.status).json({ error: e.message, fields: e.field ? { [e.field]: e.message } : undefined });
  }
  row = await clients.autoLink(row);
  mail.bookingCreated(row, settings, buildIcs(row, settings));
  app.emit("booking:created", row);
  res.status(201).json({ booking: await publicBooking(row, settings), manageUrl: `/manage.html?ref=${row.ref}&token=${row.token}` });
});

async function findByToken(req) {
  const row = await db.one("SELECT * FROM bookings WHERE ref = $1", [str(req.params.ref, 20)]);
  const token = str(req.query.token || req.body?.token, 60);
  if (!row || !token || row.token.length !== token.length || !crypto.timingSafeEqual(Buffer.from(row.token), Buffer.from(token))) return null;
  return row;
}

app.get("/api/bookings/:ref", async (req, res) => {
  const row = await findByToken(req);
  if (!row) return res.status(404).json({ error: "We couldn't find that booking. Check the link in your confirmation email." });
  res.json({ booking: await publicBooking(row, await getSettings()) });
});

app.get("/api/bookings/:ref/ics", async (req, res) => {
  const row = await findByToken(req);
  if (!row) return res.status(404).send("Not found");
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${row.ref}.ics"`);
  res.send(buildIcs(row, await getSettings()));
});

app.post("/api/bookings/:ref/cancel", rateLimit(10, 10 * 60000), async (req, res) => {
  const row = await findByToken(req);
  if (!row) return res.status(404).json({ error: "Booking not found." });
  const settings = await getSettings();
  if (!(await publicBooking(row, settings)).canCancel) return res.status(400).json({ error: "This booking can no longer be canceled online. Call the desk." });
  const updated = await db.one("UPDATE bookings SET status='canceled', updated_at=now() WHERE id=$1 RETURNING *", [row.id]);
  const reason = str(req.body.reason, 300);
  await logEvent(row.id, "customer", "Canceled by customer" + (reason ? `: ${reason}` : ""));
  mail.bookingStatusChanged(updated, settings);
  mail.deskNotice(`Customer canceled ${row.ref}`, `${row.contact_name} canceled ${row.ref} (${row.category}).${reason ? " Reason: " + reason : ""}`);
  res.json({ booking: await publicBooking(updated, settings) });
});

// Card on file: start Stripe Checkout (setup mode) for an individual booking, then record the result.
app.post("/api/bookings/:ref/card", rateLimit(10, 10 * 60000), async (req, res) => {
  const row = await findByToken(req);
  if (!row) return res.status(404).json({ error: "Booking not found." });
  try { res.json({ url: await payments.startCardSetup(row) }); }
  catch (e) { res.status(e.status || 502).json({ error: e.status ? e.message : "We couldn't open the payment page. Try again or call the desk." }); }
});
app.post("/api/bookings/:ref/card/confirm", rateLimit(20, 10 * 60000), async (req, res) => {
  const row = await findByToken(req);
  if (!row) return res.status(404).json({ error: "Booking not found." });
  const sid = str(req.body.sessionId, 200);
  if (sid && sid === row.checkout_session_id) {
    try { await payments.recordFromSession(sid, row.id); } catch (e) { console.error("Card confirm failed:", e.message); }
  }
  const fresh = await db.one("SELECT * FROM bookings WHERE id = $1", [row.id]);
  res.json({ booking: await publicBooking(fresh, await getSettings()) });
});

app.post("/api/applications", rateLimit(5, 10 * 60000), async (req, res) => {
  if (req.body.website) return res.status(400).json({ error: "Rejected" });
  const d = req.body || {};
  const data = {
    name: str(d.name, 120), email: str(d.email, 160), phone: str(d.phone, 40), zip: str(d.zip, 10), radius: str(d.radius, 20),
    commissionState: str(d.commissionState, 40), commissionExpires: str(d.commissionExpires, 10), eo: str(d.eo, 20),
    backgroundDate: str(d.backgroundDate, 10), signings: str(d.signings, 30), languages: str(d.languages, 120),
    nsa: !!d.nsa, ron: !!d.ron, rin: !!d.rin, laser: !!d.laser, reverse: !!d.reverse,
  };
  const fields = {};
  if (!data.name) fields.name = "Enter your name.";
  if (!emailOk(data.email)) fields.email = "Enter a valid email.";
  if (!phoneOk(data.phone)) fields.phone = "Enter a phone number.";
  if (!data.commissionState) fields.commissionState = "Choose your commission state.";
  if (Object.keys(fields).length) return res.status(400).json({ error: "Check the highlighted fields.", fields });
  await db.run("INSERT INTO applications(data) VALUES($1)", [JSON.stringify(data)]);
  mail.deskNotice(`New notary application: ${data.name}`, JSON.stringify(data, null, 2));
  res.status(201).json({ ok: true });
});

const WAITLIST = { bookkeeping: "Bookkeeping", tax: "Tax preparation", investing: "Investment advising" };
app.post("/api/waitlist", rateLimit(5, 10 * 60000), async (req, res) => {
  if (req.body.website) return res.status(400).json({ error: "Rejected" });
  const name = str(req.body.name, 120), email = str(req.body.email, 160).toLowerCase();
  const picks = (Array.isArray(req.body.services) ? req.body.services : []).filter((s) => WAITLIST[s]);
  const fields = {};
  if (!emailOk(email)) fields.email = "Enter a valid email.";
  if (!picks.length) fields.services = "Choose at least one service.";
  if (Object.keys(fields).length) return res.status(400).json({ error: "Check the highlighted fields.", fields });
  const labels = picks.map((s) => WAITLIST[s]).join(", ");
  await db.run("INSERT INTO messages(name,email,topic,message) VALUES($1,$2,$3,$4)",
    [name || "(no name)", email, `Waitlist: ${labels}`, `${name || "This person"} wants to hear when ${labels} launches.`]);
  mail.deskNotice(`Waitlist signup: ${labels}`, `${name} <${email}>`);
  res.status(201).json({ ok: true });
});

app.post("/api/messages", rateLimit(5, 10 * 60000), async (req, res) => {
  if (req.body.website) return res.status(400).json({ error: "Rejected" });
  const m = { name: str(req.body.name, 120), email: str(req.body.email, 160), topic: str(req.body.topic, 80), message: str(req.body.message, 4000) };
  const fields = {};
  if (!m.name) fields.name = "Enter your name.";
  if (!emailOk(m.email)) fields.email = "Enter a valid email.";
  if (!m.message) fields.message = "Enter a message.";
  if (Object.keys(fields).length) return res.status(400).json({ error: "Check the highlighted fields.", fields });
  await db.run("INSERT INTO messages(name,email,topic,message) VALUES($1,$2,$3,$4)", [m.name, m.email, m.topic, m.message]);
  mail.deskNotice(`Website message: ${m.topic}`, `${m.name} <${m.email}>\n\n${m.message}`);
  res.status(201).json({ ok: true });
});

/* ---------------- admin auth ---------------- */
function requireAdmin(req, res, next) {
  if (!verify(cookie(req, "mcc_admin"))) return res.status(401).json({ error: "Sign in to the dashboard." });
  if (req.method !== "GET" && req.get("X-Requested-With") !== "mcc-admin") return res.status(403).json({ error: "Forbidden" });
  next();
}

app.post("/api/admin/login", rateLimit(8, 15 * 60000), (req, res) => {
  const pw = str(req.body.password, 200);
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: "Set ADMIN_PASSWORD on the server first." });
  const a = crypto.createHash("sha256").update(pw).digest();
  const b = crypto.createHash("sha256").update(ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Wrong password." });
  const token = sign({ exp: Date.now() + 12 * 3600 * 1000 });
  res.setHeader("Set-Cookie", `mcc_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${req.secure ? "; Secure" : ""}`);
  res.json({ ok: true });
});
app.post("/api/admin/logout", (req, res) => {
  res.setHeader("Set-Cookie", "mcc_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  res.json({ ok: true });
});
app.post("/api/admin/test-email", requireAdmin, rateLimit(10, 15 * 60000), async (req, res) => {
  const to = str(req.body.to, 200) || process.env.DESK_EMAIL || "";
  if (!emailOk(to)) return res.status(400).json({ error: "Enter a valid email address." });
  const r = await mail.sendTest(to);
  if (!r.ok) return res.status(502).json({ error: "Email failed: " + r.error });
  res.json(r);
});
app.get("/api/admin/me", requireAdmin, (req, res) => res.json({ ok: true, emailEnabled: mail.emailEnabled, smsEnabled: require("./src/sms").smsEnabled }));

/* ---------------- admin: bookings ---------------- */
app.get("/api/admin/bookings", requireAdmin, async (req, res) => {
  const where = [], args = [];
  const p = (v) => "$" + args.push(v);
  if (req.query.from) where.push(`start_utc >= ${p(new Date(req.query.from).toISOString())}`);
  if (req.query.to) where.push(`start_utc < ${p(new Date(req.query.to).toISOString())}`);
  if (SERVICES.includes(req.query.service)) where.push(`service = ${p(req.query.service)}`);
  if (STATUSES.includes(req.query.status)) where.push(`status = ${p(req.query.status)}`);
  if (req.query.active === "1") where.push("status IN ('requested','confirmed','assigned')");
  if (req.query.scanbacks === "pending") where.push("scanback_status = 'pending'");
  if (req.query.unfilled === "1") where.push("notary_status IN ('unfilled','declined','expired') AND notary_id IS NULL AND status IN ('requested','confirmed','assigned')");
  if (req.query.q) {
    const q = p(`%${str(req.query.q, 80)}%`);
    where.push(`(ref ILIKE ${q} OR contact_name ILIKE ${q} OR contact_email ILIKE ${q} OR company ILIKE ${q} OR file_number ILIKE ${q} OR signer_names ILIKE ${q} OR zip ILIKE ${q})`);
  }
  const order = req.query.order === "desc" ? "DESC" : "ASC";
  const rows = await db.all(`SELECT b.*, n.name AS notary_name, ca.company AS client_company,
      (SELECT COUNT(*) FROM booking_documents d WHERE d.booking_id = b.id AND d.kind = 'package')::int AS package_count
    FROM bookings b LEFT JOIN notaries n ON n.id = b.notary_id LEFT JOIN client_accounts ca ON ca.id = b.client_account_id
    ${where.length ? "WHERE " + where.map((w) => w.replace(/\b(start_utc|status|service|scanback_status|notary_status|notary_id|ref|contact_name|contact_email|company|file_number|signer_names|zip)\b/g, "b.$1")).join(" AND ") : ""} ORDER BY b.start_utc ${order} LIMIT 500`, args);
  res.json({ bookings: rows.map(({ token, ...r }) => r) });
});

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  const s = await getSettings();
  const tz = s.business.timezone;
  const today = dateInTz(new Date(), tz);
  const t0 = zonedToUtc(today, 0, tz).toISOString(), t1 = zonedToUtc(addDays(today, 1), 0, tz).toISOString(), t7 = zonedToUtc(addDays(today, 7), 0, tz).toISOString();
  const now = new Date().toISOString();
  const r = await db.one(`SELECT
    (SELECT COUNT(*) FROM bookings WHERE start_utc >= $1 AND start_utc < $2 AND status <> 'canceled')::int AS today,
    (SELECT COUNT(*) FROM bookings WHERE status = 'requested' AND start_utc >= $4)::int AS "needsAction",
    (SELECT COUNT(*) FROM bookings WHERE status IN ('requested','confirmed','assigned') AND notary_id IS NULL AND start_utc >= $4)::int AS unassigned,
    (SELECT COUNT(*) FROM bookings WHERE start_utc >= $1 AND start_utc < $3 AND status <> 'canceled')::int AS next7,
    (SELECT COUNT(*) FROM applications WHERE status = 'new')::int AS "newApplications",
    (SELECT COUNT(*) FROM messages WHERE handled = 0)::int AS "openMessages",
    (SELECT COUNT(*) FROM bookings WHERE notary_status = 'offered' AND status IN ('requested','confirmed','assigned') AND start_utc >= $4)::int AS "openOffers",
    (SELECT coalesce(sum(notary_fee),0) FROM bookings WHERE status = 'completed' AND notary_paid_at IS NULL)::float AS "unpaidPayouts",
    (SELECT COUNT(*) FROM bookings WHERE scanback_status = 'pending')::int AS "scanbacksToReview",
    (SELECT COUNT(*) FROM bookings WHERE notary_status = 'unfilled' AND status IN ('requested','confirmed','assigned') AND start_utc >= $4)::int AS unfilled`, [t0, t1, t7, now]);
  const ns = await notary.notariesForStats();
  res.json({ ...r, credentialIssues: ns });
});

app.get("/api/admin/bookings/:id", requireAdmin, async (req, res) => {
  const row = await db.one("SELECT * FROM bookings WHERE id = $1", [Number(req.params.id) || 0]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const events = await db.all("SELECT at, actor, text FROM booking_events WHERE booking_id = $1 ORDER BY id", [row.id]);
  const { token, ...rest } = row;
  const inv = row.invoice_id ? await db.one("SELECT id, number, status, payment_url, provider, error FROM invoices WHERE id = $1", [row.invoice_id]) : null;
  const settings = await getSettings();
  res.json({ booking: { ...rest, default_notarial: billing.notarialFor({ ...row, notarial_fee: null }, settings) }, invoice: inv, events, cardsOn: payments.cardsOn(settings), margin: margin.check(margin.clientPrice(row), row.notary_fee, settings), manageUrl: `/manage.html?ref=${row.ref}&token=${token}` });
});

app.post("/api/admin/bookings", requireAdmin, async (req, res) => {
  const settings = await getSettings();
  const { b, errors } = readBookingInput(req.body, { admin: true });
  if (Object.keys(errors).length) return res.status(400).json({ error: "Check the highlighted fields.", fields: errors });
  try {
    const row = await insertBooking(b, settings, { admin: true, force: !!req.body.force });
    if (req.body.notify) mail.bookingCreated(row, settings, buildIcs(row, settings));
    res.status(201).json({ id: row.id, ref: row.ref });
  } catch (e) {
    if (!e.status) throw e;
    res.status(e.status).json({ error: e.message });
  }
});

app.patch("/api/admin/bookings/:id", requireAdmin, async (req, res) => {
  const settings = await getSettings();
  const row = await db.one("SELECT * FROM bookings WHERE id = $1", [Number(req.params.id) || 0]);
  if (!row) return res.status(404).json({ error: "Not found" });
  // Margin protection: block fee changes that leave less than the minimum margin, unless the desk overrides.
  const mg = margin.checkPatch(row, req.body, settings);
  if (!mg.ok && !req.body.override_margin) return res.status(400).json({ error: mg.message, code: "margin", margin: mg });
  if (!mg.ok) await logEvent(row.id, "desk", `Margin override: ${mg.pct}% ($${mg.kept.toFixed(2)}), below the ${mg.min}% minimum`);
  const sets = {}, notes = [];
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });
    if (req.body.status !== row.status) { sets.status = req.body.status; notes.push(`Status: ${row.status} → ${req.body.status}`); }
  }
  let row2 = row;
  if (req.body.notary_id !== undefined && (Number(req.body.notary_id) || null) !== row.notary_id) {
    row2 = await notary.assignNotary(row, { notaryId: Number(req.body.notary_id) || null, direct: !!req.body.direct, fee: req.body.notary_fee, notify: req.body.notify !== false });
  } else if (req.body.notary_fee !== undefined) {
    const nf = req.body.notary_fee === "" || req.body.notary_fee === null ? null : Number(req.body.notary_fee);
    if (nf !== null && (isNaN(nf) || nf < 0)) return res.status(400).json({ error: "Notary fee must be a number" });
    if (nf !== row.notary_fee) { sets.notary_fee = nf; notes.push(`Notary fee: ${nf == null ? "cleared" : "$" + nf.toFixed(2)}`); }
  }
  if (req.body.auto_dispatch) {
    const r = await dispatch.enable(row.id);
    return res.json({ ok: true, dispatch: r });
  }
  if (req.body.client_account_id !== undefined) {
    const cid = Number(req.body.client_account_id) || null;
    if (cid !== row.client_account_id) { sets.client_account_id = cid; notes.push(cid ? "Linked to client account" : "Unlinked from client account"); }
  }
  if (req.body.resend_offer && row.notary_id && row.notary_status === "offered") {
    await notary.assignNotary(row, { notaryId: row.notary_id, direct: false, fee: row.notary_fee, notify: true });
  }
  if (req.body.quoted_fee !== undefined) {
    const f = req.body.quoted_fee === "" || req.body.quoted_fee === null ? null : Number(req.body.quoted_fee);
    if (f !== null && (isNaN(f) || f < 0)) return res.status(400).json({ error: "Fee must be a number" });
    if (row.invoice_id && f !== row.quoted_fee) return res.status(400).json({ error: "This job is already invoiced. Void the invoice to change fees." });
    if (f !== row.quoted_fee) { sets.quoted_fee = f; notes.push(`Fee quoted: ${f == null ? "cleared" : "$" + f.toFixed(2)}`); }
  }
  if (req.body.internal_notes !== undefined) sets.internal_notes = str(req.body.internal_notes, 5000);
  if (req.body.notarial_fee !== undefined) {
    const nf = req.body.notarial_fee === "" || req.body.notarial_fee === null ? null : Number(req.body.notarial_fee);
    if (nf !== null && (isNaN(nf) || nf < 0)) return res.status(400).json({ error: "Notarial fee must be a number" });
    if (row.invoice_id) return res.status(400).json({ error: "This job is already invoiced. Void the invoice to change fees." });
    if (nf !== row.notarial_fee) { sets.notarial_fee = nf; notes.push(`Notarial fee: ${nf == null ? "default" : "$" + nf.toFixed(2)}`); }
  }
  if (req.body.start !== undefined) {
    const start = new Date(req.body.start);
    if (isNaN(start)) return res.status(400).json({ error: "Invalid time" });
    const dur = settings.services[row.service].durationMin;
    sets.start_utc = start.toISOString();
    sets.end_utc = new Date(start.getTime() + dur * 60000).toISOString();
    notes.push(`Rescheduled to ${sets.start_utc}`);
  }
  if (!Object.keys(sets).length) return res.json({ ok: true });
  if (sets.status === "completed" && row2.status !== "completed") { sets.completed_at = new Date().toISOString(); }
  const keys = Object.keys(sets);
  const updated = await db.one(
    `UPDATE bookings SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`,
    [...keys.map((k) => sets[k]), row.id]
  );
  for (const t of notes) await logEvent(row.id, "desk", t);
  if (sets.status === "completed" && row.status !== "completed") payments.onCompleted(row.id).catch((e) => console.error("Auto-charge:", e.message));
  if (sets.status && req.body.notify !== false) {
    const notary = updated.notary_id ? await db.one("SELECT * FROM notaries WHERE id = $1", [updated.notary_id]) : null;
    mail.bookingStatusChanged(updated, settings, notary);
  }
  res.json({ ok: true });
});

app.post("/api/admin/bookings/:id/charge", requireAdmin, async (req, res) => {
  try { res.json(await payments.charge(Number(req.params.id), { kind: req.body.kind === "fee" ? "fee" : "service", amount: Number(req.body.amount), note: str(req.body.note, 120) })); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});
app.post("/api/admin/bookings/:id/card-link", requireAdmin, async (req, res) => {
  const b = await db.one("SELECT * FROM bookings WHERE id = $1", [Number(req.params.id)]);
  if (!b) return res.status(404).json({ error: "Not found" });
  const settings = await getSettings();
  if (!payments.cardsOn(settings)) return res.status(400).json({ error: "Connect Stripe and turn on card payments in Settings first." });
  const url = `${mail.BASE}/manage.html?ref=${encodeURIComponent(b.ref)}&token=${encodeURIComponent(b.token)}`;
  await mail.send({ to: b.contact_email, subject: `Add a card for booking ${b.ref}`,
    text: `Hi ${b.contact_name},\n\nPlease add a payment card for your ${settings.business.name} appointment (${b.ref}). Your card is saved securely with Stripe and charged only after the appointment.\n\nAdd your card: ${url}\n\nQuestions? ${settings.business.phone} · ${settings.business.email}` });
  await logEvent(b.id, "desk", "Emailed the customer a link to add a card");
  res.json({ ok: true });
});

app.get("/api/admin/export.csv", requireAdmin, async (req, res) => {
  const rows = await db.all("SELECT b.*, n.name AS notary_name FROM bookings b LEFT JOIN notaries n ON n.id = b.notary_id ORDER BY start_utc");
  const cols = ["ref", "status", "service", "category", "signers", "start_utc", "contact_name", "contact_email", "contact_phone", "company", "file_number", "address", "city", "state", "zip", "signer_location", "mailing_address", "notary_name", "est_fee", "quoted_fee", "created_at"];
  const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="mcc-bookings.csv"');
  res.send([cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n"));
});

/* ---------------- admin: applications & messages ---------------- */
app.get("/api/admin/applications", requireAdmin, async (req, res) => {
  res.json({ applications: await db.all("SELECT * FROM applications ORDER BY id DESC LIMIT 300") });
});
app.patch("/api/admin/applications/:id", requireAdmin, async (req, res) => {
  const status = str(req.body.status, 20);
  if (!["new", "approved", "declined"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  const a = await db.one("SELECT * FROM applications WHERE id = $1", [Number(req.params.id) || 0]);
  if (!a) return res.status(404).json({ error: "Not found" });
  await db.run("UPDATE applications SET status = $1 WHERE id = $2", [status, a.id]);
  if (status === "approved" && req.body.addToRoster) {
    const d = a.data;
    const existing = d.email ? await db.one("SELECT id FROM notaries WHERE lower(email) = lower($1)", [d.email]) : null;
    const nid = existing ? existing.id : (await db.one(
      `INSERT INTO notaries(name,email,phone,states,ron,rin,notes,commission_expires,eo_amount,background_date,home_zip,travel_miles)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [d.name, (d.email || "").toLowerCase() || null, d.phone, STATE_CODES[d.commissionState] || (d.commissionState || "").slice(0, 2).toUpperCase(), d.ron ? 1 : 0, d.rin ? 1 : 0,
       `From application #${a.id}. ZIP ${d.zip}, radius ${d.radius}, ${d.signings} signings`, /^\d{4}-\d{2}-\d{2}$/.test(d.commissionExpires || "") ? d.commissionExpires : null,
       d.eo && d.eo !== "None yet" ? d.eo : null, /^\d{4}-\d{2}-\d{2}$/.test(d.backgroundDate || "") ? d.backgroundDate : null,
       /^\d{5}$/.test(d.zip || "") ? d.zip : null, parseInt(d.radius, 10) || 30])).id;
    const n = await db.one("SELECT * FROM notaries WHERE id = $1", [nid]);
    if (n.email) mail.notaryWelcome(n, await notary.createLoginLink(n.id, 7 * 24 * 60), await getSettings());
  }
  res.json({ ok: true });
});
app.get("/api/admin/messages", requireAdmin, async (req, res) => {
  res.json({ messages: await db.all("SELECT * FROM messages ORDER BY handled, id DESC LIMIT 300") });
});
app.patch("/api/admin/messages/:id", requireAdmin, async (req, res) => {
  await db.run("UPDATE messages SET handled = $1 WHERE id = $2", [req.body.handled ? 1 : 0, Number(req.params.id) || 0]);
  res.json({ ok: true });
});

/* ---------------- admin: settings ---------------- */
app.get("/api/admin/settings", requireAdmin, async (req, res) => res.json({ settings: await getSettings() }));
app.put("/api/admin/settings", requireAdmin, async (req, res) => {
  const s = req.body.settings;
  if (!s || typeof s !== "object") return res.status(400).json({ error: "settings required" });
  if (s.business?.timezone && !isTz(s.business.timezone)) return res.status(400).json({ error: "Unknown time zone" });
  for (const k of SERVICES) {
    const c = s.services?.[k];
    if (!c) continue;
    for (const f of ["durationMin", "slotStepMin", "capacity", "leadMinutes", "maxDaysAhead"]) {
      if (c[f] === undefined) continue;
      if (!(Number.isFinite(Number(c[f])) && Number(c[f]) >= (f === "leadMinutes" ? 0 : 1))) return res.status(400).json({ error: `${k}.${f} must be a positive number` });
      c[f] = Number(c[f]);
    }
  }
  if (s.billing && s.billing.minMarginPct !== undefined) {
    const p = Number(s.billing.minMarginPct);
    if (!(p >= 0 && p <= 90)) return res.status(400).json({ error: "Minimum margin must be between 0 and 90%." });
    s.billing.minMarginPct = p;
  }
  if (s.reviews) {
    const u = String(s.reviews.googleUrl || "").trim();
    if (u && !/^https:\/\/[^\s]+$/.test(u)) return res.status(400).json({ error: "The Google review link must start with https://" });
    if (s.reviews.enabled && !u) return res.status(400).json({ error: "Add your Google review link before turning on review requests." });
    s.reviews.delayHours = Math.min(168, Math.max(0, Number(s.reviews.delayHours) || 0));
    s.reviews.repeatDays = Math.max(30, Number(s.reviews.repeatDays) || 180);
  }
  res.json({ settings: await saveSettings(s) });
});

notary.register(app, { requireAdmin });
documents.register(app, { requireAdmin, requireNotary: notary.requireNotary, loadNotary: notary.loadMe });
clients.register(app, { requireAdmin, insertBooking, readBookingInput });
billing.register(app, { requireAdmin, requireClient: clients.requireClient, loadClient: clients.loadClient });
require("./src/reviews").register(app, { requireAdmin });

app.get("/api/admin/bookings/:id/candidates", requireAdmin, async (req, res) => {
  const b = await db.one("SELECT * FROM bookings WHERE id = $1", [Number(req.params.id) || 0]);
  if (!b) return res.status(404).json({ error: "Not found" });
  const { ok, skipped } = await dispatch.candidates(b, await getSettings());
  res.json({ eligible: ok.map((n) => ({ id: n.id, name: n.name, miles: n.miles, load: n.load })), skipped });
});

// New web and client orders go straight to auto-dispatch when it's on.
app.on("booking:created", async (row) => {
  try {
    const s = await getSettings();
    if (s.dispatch?.auto) await dispatch.enable(row.id);
  } catch (e) { console.error("Auto-dispatch failed:", e.message); }
});

/* ---------------- search landing pages, sitemap, robots ---------------- */
require("./src/seo").register(app);
require("./src/pages").register(app);

/* ---------------- static ---------------- */
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));
app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong on our side. Try again or call the desk." });
});

if (require.main === module) {
  init()
    .then(() => { app.listen(PORT, () => console.log(`MCC Solutions running on http://localhost:${PORT}`)); notary.startReminderJob(); dispatch.start(); documents.startRetentionJob(); billing.startSyncJob(); require("./src/reviews").startJob(); })
    .catch((e) => { console.error("Could not connect to the database:", e.message); process.exit(1); });
}
module.exports = app;
