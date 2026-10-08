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
const addons = require("./src/addons");
const fees = require("./src/fees");
const { buildIcs } = require("./src/ics");
const notary = require("./src/notary");
const dispatch = require("./src/dispatch");
const documents = require("./src/documents");
const clients = require("./src/clients");
const billing = require("./src/billing");
const bookkeeping = require("./src/bookkeeping");
const { str, emailOk, phoneOk, httpError, rateLimit, sign, verify, cookie, STATE_CODES } = require("./src/util");

const PORT = Number(process.env.PORT || 3000);

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(require("compression")());

// One web address for search engines: if PUBLIC_URL is https://www.example.com, visits to example.com
// (or the reverse) are sent to it permanently. Only the www/non-www twin is redirected, never other hosts.
const PUBLIC_ORIGIN = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
const PUBLIC_HOST = (() => { try { return PUBLIC_ORIGIN ? new URL(PUBLIC_ORIGIN).host : ""; } catch { return ""; } })();
// Security headers on every response, including static files.
const CSP = [
  "default-src 'self'", "base-uri 'self'", "object-src 'none'", "frame-ancestors 'self'", "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'", "img-src 'self' data: https://www.googletagmanager.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://stats.g.doubleclick.net https://www.google.com",
  "font-src 'self' data:", "connect-src 'self' https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com https://stats.g.doubleclick.net https://www.google.com/g/collect https://www.google.com/ccm/collect",
  "frame-src 'none'", "manifest-src 'self'", "worker-src 'self'",
].join("; ");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), publickey-credentials-get=(self), publickey-credentials-create=(self)");
  if (req.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000");
  next();
});
app.use((req, res, next) => {
  // Off unless REDIRECT_WWW=1: Render or Cloudflare may already redirect between www and non-www,
  // and two redirects pointing opposite ways loop forever.
  if (process.env.REDIRECT_WWW !== "1") return next();
  if (!PUBLIC_HOST || (req.method !== "GET" && req.method !== "HEAD") || req.path.startsWith("/api/")) return next();
  const host = (req.get("host") || "").toLowerCase();
  if (host !== PUBLIC_HOST && (host === "www." + PUBLIC_HOST || "www." + host === PUBLIC_HOST)) return res.redirect(301, PUBLIC_ORIGIN + req.originalUrl);
  next();
});
// The bookkeeping page is unlisted (noindex) until it is opened in Settings → Bookkeeping, then search engines may index it.
app.get(["/bookkeeping", "/bookkeeping/"], async (req, res, next) => {
  if (req.path === "/bookkeeping") {
    const q = req.originalUrl.indexOf("?");
    return res.redirect(301, "/bookkeeping/" + (q >= 0 ? req.originalUrl.slice(q) : ""));
  }
  const settings = await getSettings().catch(() => null);
  require("fs").readFile(path.join(__dirname, "public", "bookkeeping", "index.html"), "utf8", (err, html) => {
    if (err) return next();
    if (PUBLIC_ORIGIN && PUBLIC_ORIGIN !== "https://www.mcc-solutionsnj.com") html = html.replaceAll("https://www.mcc-solutionsnj.com", PUBLIC_ORIGIN);
    if (settings?.bookkeeping?.open) html = html.replace('<meta name="robots" content="noindex">\n', "");
    res.type("html").send(html);
  });
});
// The homepage and notary page are static files written with www.mcc-solutionsnj.com links; serve them
// with PUBLIC_URL instead so every page points search engines at the same address.
const cssCache = {};
const inlineCss = (f) => (cssCache[f] ??= require("fs").readFileSync(path.join(__dirname, "public", "css", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").trim());
const STATIC_CANON = { "/": "index.html", "/index.html": "index.html", "/notary/": "notary/index.html", "/notary/index.html": "notary/index.html" };
app.get(Object.keys(STATIC_CANON), (req, res, next) => {
  // Express matches /notary and /notary/ alike; send the no-slash form to the folder URL like the static server does.
  if (!STATIC_CANON[req.path] && STATIC_CANON[req.path + "/"]) {
    const q = req.originalUrl.indexOf("?");
    return res.redirect(301, req.path + "/" + (q >= 0 ? req.originalUrl.slice(q) : ""));
  }
  const file = STATIC_CANON[req.path];
  if (!file || !PUBLIC_ORIGIN || PUBLIC_ORIGIN === "https://www.mcc-solutionsnj.com") return next();
  require("fs").readFile(path.join(__dirname, "public", file), "utf8", (err, html) => {
    if (err) return next();
    html = html.replaceAll("https://www.mcc-solutionsnj.com", PUBLIC_ORIGIN);
    // Inline the two small stylesheets so they don't block the first paint (the files stay the source of truth).
    for (const f of ["fonts.css", "firm.css"]) {
      const tag = `<link rel="stylesheet" href="/css/${f}">`;
      if (html.includes(tag)) html = html.replace(tag, () => `<style>${inlineCss(f)}</style>`);
    }
    res.type("html").send(html);
  });
});
// Stripe webhooks need the raw body for signature checks, so this route comes before the JSON parser.
app.post("/api/webhooks/stripe", express.raw({ type: "application/json", limit: "1mb" }), (req, res) => require("./src/billing").handleStripeWebhook(req, res));
app.use(express.json({ limit: "100kb" }));

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
    addons: addons.list(b).filter((a) => a.kind !== "fee").map((a) => ({ label: a.label, qty: a.qty, price: a.price })),
    fees: fees.ofKind(addons.list(b)).map((a) => ({ label: a.label, qty: a.qty, price: a.price })), addonsTotal: Number(b.addons_total) || 0,
    cardRequested: payments.wantsCard(b, settings),
    cardRequired: payments.cardRequired(settings) && payments.wantsCard(b, settings),
    lateCancelFee: (() => { const f = ["requested", "confirmed", "assigned"].includes(b.status) ? fees.lateCancel(settings, b) : null; return f ? f.price : null; })(),
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
  res.json({ business: s.business, services, pricing: s.pricing, startingPrices: require("./src/prices").list(s), addons: addons.catalog(s), fees: fees.publicCatalog(s), bookkeeping: bookkeeping.publicConfig(s), rinStates: s.rinStates, liveStates: s.coverage?.liveStates || [], today: dateInTz(new Date(), s.business.timezone) });
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

// Next open mobile slot, shown as a small line on public pages. Cached for a minute; it is the same data the booking form uses.
let nextOpenCache = { at: 0, v: null };
app.get("/api/next-open", async (req, res) => {
  res.set("Cache-Control", "public, max-age=60");
  if (Date.now() - nextOpenCache.at < 60000) return res.json(nextOpenCache.v);
  let v = { slot: null };
  try {
    const s = await getSettings(); const tz = s.business.timezone; const today = dateInTz(new Date(), tz);
    for (let i = 0; i < 14 && !v.slot; i++) {
      const date = addDays(today, i); const slots = await slotsForDate(s, "mobile", date);
      if (slots.length) v = { slot: slots[0].start, timezone: tz };
    }
  } catch (e) { console.error("next-open:", e.message); }
  nextOpenCache = { at: Date.now(), v };
  res.json(v);
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
    heard_from: require("./src/heard").clean(str(body.heardFrom, 20)), heard_note: str(body.heardNote, 120) || null,
    signer_names: str(body.signerNames, 300), company: str(body.company, 160), file_number: str(body.fileNumber, 60), notes: str(body.notes, 2000),
    addons_in: body.addons, no_auto_fees: !!body.noAutoFees,
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
  "signer_names", "company", "file_number", "notes", "est_fee", "source", "addons", "addons_total", "heard_from", "heard_note"];

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
    const extras = addons.pick(b.addons_in, b.service, settings);
    // Rush, after-hours, weekend and extra-signer fees apply automatically (the desk can remove them).
    const skipAuto = (source === "client" && settings.billing?.autoFeesForAccounts === false) || (admin && b.no_auto_fees);
    if (!skipAuto) extras.push(...fees.auto(settings, { ...b, start_utc: startIso }));
    row.addons = JSON.stringify(extras); row.addons_total = addons.total(extras);
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
  // Under 2 hours' notice: the late-cancellation fee goes on the booking (the desk charges or waives it).
  const late = row.invoice_id ? null : fees.lateCancel(settings, row);
  const items = late && !fees.ofKind(addons.list(row)).some((a) => a.id === late.id) ? [...addons.list(row), late] : null;
  const updated = items
    ? await db.one("UPDATE bookings SET status='canceled', addons=$2, addons_total=$3, updated_at=now() WHERE id=$1 RETURNING *", [row.id, JSON.stringify(items), addons.total(items)])
    : await db.one("UPDATE bookings SET status='canceled', updated_at=now() WHERE id=$1 RETURNING *", [row.id]);
  const reason = str(req.body.reason, 300);
  await logEvent(row.id, "customer", "Canceled by customer" + (reason ? `: ${reason}` : ""));
  if (items) await logEvent(row.id, "system", `${late.label}: $${late.price.toFixed(2)} added (canceled under 2 hours before the start). Charge or waive it from the booking.`);
  mail.bookingStatusChanged(updated, settings);
  mail.deskNotice(`Customer canceled ${row.ref}`, `${row.contact_name} canceled ${row.ref} (${row.category}).${reason ? " Reason: " + reason : ""}${items ? `\n${late.label} of $${late.price.toFixed(2)} was added. Charge it or remove it from the booking.` : ""}`);
  res.json({ booking: await publicBooking(updated, settings) });
});

// Card on file: start Stripe Checkout (setup mode) for an individual booking, then record the result.
app.post("/api/bookings/:ref/card", rateLimit(10, 10 * 60000), async (req, res) => {
  const row = await findByToken(req);
  if (!row) return res.status(404).json({ error: "Booking not found." });
  try { res.json({ url: await payments.startCardSetup(row) }); }
  catch (e) {
    if (!e.status) console.error(`Card setup failed for ${row.ref}:`, e.message);
    res.status(e.status || 502).json({ error: e.status ? e.message : "We couldn't open the payment page. Try again or call the desk." });
  }
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
    role: ["witness", "process_server"].includes(d.role) ? d.role : "notary",
    name: str(d.name, 120), email: str(d.email, 160), phone: str(d.phone, 40), zip: str(d.zip, 10), radius: str(d.radius, 20),
    commissionState: str(d.commissionState, 40), commissionExpires: str(d.commissionExpires, 10), eo: str(d.eo, 20),
    backgroundDate: str(d.backgroundDate, 10), signings: str(d.signings, 30), languages: str(d.languages, 120), availability: str(d.availability, 80),
    nsa: !!d.nsa, ron: !!d.ron, rin: !!d.rin, laser: !!d.laser, reverse: !!d.reverse,
  };
  const fields = {};
  if (!data.name) fields.name = "Enter your name.";
  if (!emailOk(data.email)) fields.email = "Enter a valid email.";
  if (!phoneOk(data.phone)) fields.phone = "Enter a phone number.";
  if (data.role === "notary" && !data.commissionState) fields.commissionState = "Choose your commission state.";
  if (data.role !== "notary" && !/^\d{5}$/.test(data.zip)) fields.zip = "Enter your 5-digit home ZIP code.";
  if (data.role === "process_server") { data.vehicle = str(d.vehicle, 40); data.experience = str(d.experience, 40); if (!/^Yes/.test(data.vehicle)) fields.vehicle = "Process servers need a registered, insured vehicle."; }
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
  const company = str(req.body.company, 160), note = str(req.body.note, 1000);
  await db.run("INSERT INTO messages(name,email,topic,message) VALUES($1,$2,$3,$4)",
    [name || "(no name)", email, `Waitlist: ${labels}`, `${name || "This person"}${company ? ` (${company})` : ""} wants to hear when ${labels} launches.${note ? `\n\n${note}` : ""}`]);
  mail.deskNotice(`Waitlist signup: ${labels}`, `${name} <${email}>`);
  res.status(201).json({ ok: true });
});

app.post("/api/messages", rateLimit(5, 10 * 60000), async (req, res) => {
  if (req.body.website) return res.status(400).json({ error: "Rejected" });
  const m = { name: str(req.body.name, 120), email: str(req.body.email, 160), topic: str(req.body.topic, 80), message: str(req.body.message, 4000), heard: require("./src/heard").clean(str(req.body.heardFrom, 20)), heardNote: str(req.body.heardNote, 120) || null };
  const fields = {};
  if (!m.name) fields.name = "Enter your name.";
  if (!emailOk(m.email)) fields.email = "Enter a valid email.";
  if (!m.message) fields.message = "Enter a message.";
  if (Object.keys(fields).length) return res.status(400).json({ error: "Check the highlighted fields.", fields });
  await db.run("INSERT INTO messages(name,email,topic,message,heard_from,heard_note) VALUES($1,$2,$3,$4,$5,$6)", [m.name, m.email, m.topic, m.message, m.heard, m.heardNote]);
  mail.deskNotice(`Website message: ${m.topic}`, `${m.name} <${m.email}>${m.heard ? `\nFound us: ${require("./src/heard").label(m.heard)}${m.heardNote ? " (" + m.heardNote + ")" : ""}` : ""}\n\n${m.message}`);
  res.status(201).json({ ok: true });
});

/* ---------------- admin auth ---------------- */
const adminAuth = require("./src/admin-auth");
const requireAdmin = adminAuth.requireAdmin;
adminAuth.register(app); // login, passkey and setup routes; the account lives in the database

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
    (SELECT COUNT(*) FROM bookkeeping_leads WHERE status = 'new')::int AS "newBookkeeping",
    (SELECT COUNT(*) FROM bookings WHERE notary_status = 'offered' AND status IN ('requested','confirmed','assigned') AND start_utc >= $4)::int AS "openOffers",
    ((SELECT coalesce(sum(notary_fee),0) FROM bookings WHERE status = 'completed' AND notary_paid_at IS NULL)
      + (SELECT coalesce(sum(w.fee),0) FROM booking_witnesses w JOIN bookings b ON b.id = w.booking_id WHERE w.status = 'accepted' AND b.status = 'completed' AND w.paid_at IS NULL)
      + (SELECT coalesce(sum(assignee_fee),0) FROM service_requests WHERE status = 'completed' AND assignee_status = 'accepted' AND assignee_paid_at IS NULL))::float AS "unpaidPayouts",
    (SELECT COUNT(*)::int FROM service_requests WHERE status = 'new') AS "newRequests",
    (SELECT COUNT(*) FROM bookings WHERE scanback_status = 'pending')::int AS "scanbacksToReview",
    (SELECT COUNT(*) FROM bookings WHERE notary_status = 'unfilled' AND status IN ('requested','confirmed','assigned') AND start_utc >= $4)::int AS unfilled`, [t0, t1, t7, now]);
  const ns = await notary.notariesForStats();
  res.json({ ...r, credentialIssues: ns });
});

/* ---------------- admin: witnesses on a booking ---------------- */
async function witnessCost(bookingId) {
  return (await db.one("SELECT coalesce(sum(fee),0)::float AS c FROM booking_witnesses WHERE booking_id = $1 AND status IN ('offered','accepted')", [bookingId])).c;
}
async function witnessData(bookingId) {
  const list = await db.all(`SELECT w.id, w.witness_id, w.status, w.fee, w.paid_at, n.name, n.phone, n.email FROM booking_witnesses w JOIN notaries n ON n.id = w.witness_id
    WHERE w.booking_id = $1 AND w.status <> 'removed' ORDER BY w.id`, [bookingId]);
  const pool = (await db.all("SELECT * FROM notaries WHERE active = 1 AND role = 'witness' ORDER BY name"));
  const docs = pool.length ? await db.all("SELECT notary_id, kind FROM notary_documents WHERE notary_id = ANY($1)", [pool.map((n) => n.id)]) : [];
  const today = dateInTz(new Date(), (await getSettings()).business.timezone);
  return { list, pool: pool.map((n) => ({ id: n.id, name: n.name, home_zip: n.home_zip, ready: notary.compliance(n, docs, today).ready })) };
}
app.post("/api/admin/bookings/:id/witnesses", requireAdmin, async (req, res) => {
  const settings = await getSettings();
  const b = await db.one("SELECT * FROM bookings WHERE id = $1", [Number(req.params.id) || 0]);
  if (!b) return res.status(404).json({ error: "Not found" });
  if (!["requested", "confirmed", "assigned"].includes(b.status)) return res.status(400).json({ error: "This booking is no longer open." });
  const w = await db.one("SELECT * FROM notaries WHERE id = $1 AND active = 1 AND role = 'witness'", [Number(req.body.witness_id) || 0]);
  if (!w) return res.status(400).json({ error: "Choose an active witness." });
  const fee = req.body.fee === "" || req.body.fee == null ? null : Number(req.body.fee);
  if (fee !== null && !(fee >= 0 && fee <= 1000)) return res.status(400).json({ error: "Witness fee must be between $0 and $1,000." });
  const mg = margin.check(margin.clientPrice(b), b.notary_fee == null ? null : Number(b.notary_fee) + (await witnessCost(b.id)) + (fee || 0), settings, Number(b.addons_total) || 0);
  if (!mg.ok && !req.body.override_margin) return res.status(400).json({ error: mg.message.replace("Pay the notary at most", "Keep notary + witness pay at or under"), code: "margin", margin: mg });
  const row = await db.one(`INSERT INTO booking_witnesses(booking_id, witness_id, fee, status) VALUES($1,$2,$3,'offered')
    ON CONFLICT (booking_id, witness_id) DO UPDATE SET status = 'offered', fee = EXCLUDED.fee, responded_at = NULL RETURNING *`, [b.id, w.id, fee]);
  await logEvent(b.id, "desk", `Witness request sent to ${w.name}${fee != null ? ` at $${fee.toFixed(2)}` : ""}${!mg.ok ? ` (margin override: ${mg.pct}%)` : ""}`);
  if (w.email) mail.witnessOffer(w, b, await notary.createLoginLink(w.id, 72 * 60, `#job-${b.id}`), fee, settings);
  res.json({ ok: true, id: row.id });
});
app.delete("/api/admin/bookings/:id/witnesses/:wid", requireAdmin, async (req, res) => {
  const r = await db.one(`UPDATE booking_witnesses w SET status = 'removed' FROM notaries n WHERE w.id = $1 AND w.booking_id = $2 AND n.id = w.witness_id AND w.paid_at IS NULL RETURNING n.name`,
    [Number(req.params.wid) || 0, Number(req.params.id) || 0]);
  if (!r) return res.status(404).json({ error: "Not found, or already paid." });
  await logEvent(Number(req.params.id), "desk", `Witness ${r.name} removed`);
  res.json({ ok: true });
});

app.get("/api/admin/bookings/:id", requireAdmin, async (req, res) => {
  const row = await db.one("SELECT * FROM bookings WHERE id = $1", [Number(req.params.id) || 0]);
  if (!row) return res.status(404).json({ error: "Not found" });
  const events = await db.all("SELECT at, actor, text FROM booking_events WHERE booking_id = $1 ORDER BY id", [row.id]);
  const { token, ...rest } = row;
  const inv = row.invoice_id ? await db.one("SELECT id, number, status, payment_url, provider, error FROM invoices WHERE id = $1", [row.invoice_id]) : null;
  const settings = await getSettings();
  res.json({ booking: { ...rest, default_notarial: billing.notarialFor({ ...row, notarial_fee: null }, settings) }, invoice: inv, events, cardsOn: payments.cardsOn(settings), margin: margin.check(margin.clientPrice(row), row.notary_fee == null ? null : Number(row.notary_fee) + (await witnessCost(row.id)), settings, Number(row.addons_total) || 0), witnesses: await witnessData(row.id), feeCatalog: fees.catalog(settings), notaryFeeShare: fees.notaryShare(addons.list(row)), manageUrl: `/manage.html?ref=${row.ref}&token=${token}` });
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
  // Extra fees (rush, waiting, trip fee…): the desk sends the full list of fees for the job.
  let feeItems = null;
  if (req.body.fees !== undefined) {
    if (row.invoice_id) return res.status(400).json({ error: "This job is already invoiced. Void the invoice to change fees." });
    try { feeItems = fees.apply(addons.list(row), req.body.fees, settings); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message }); }
  }
  const feeTotal = feeItems ? addons.total(feeItems) : null;
  const rowForMargin = feeItems ? { ...row, addons_total: feeTotal } : row;
  // Margin protection: block fee changes that leave less than the minimum margin, unless the desk overrides.
  let mg = margin.checkPatch(rowForMargin, req.body, settings, await witnessCost(row.id));
  if (feeItems && mg.unknown && row.notary_fee != null && req.body.notary_fee === undefined && req.body.notary_id === undefined) {
    mg = margin.check(margin.clientPrice(rowForMargin), Number(row.notary_fee) + (await witnessCost(row.id)), settings, feeTotal);
  }
  if (!mg.ok && !req.body.override_margin) return res.status(400).json({ error: mg.message, code: "margin", margin: mg });
  if (!mg.ok) await logEvent(row.id, "desk", `Margin override: ${mg.pct}% ($${mg.kept.toFixed(2)}), below the ${mg.min}% minimum`);
  const sets = {}, notes = [];
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });
    if (["confirmed", "assigned"].includes(req.body.status) && req.body.status !== row.status && payments.needsCardToConfirm(row, settings)) {
      if (!req.body.override_card) return res.status(400).json({ error: "This customer hasn't saved a card yet. Send them the card link first, or override.", code: "card" });
      await logEvent(row.id, "desk", "Card requirement overridden: confirmed without a card on file");
    }
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
  // A job can't be completed until it has a client fee (the quoted fee, or the booking's estimate). Enter 0 for a no-charge job.
  if (sets.status === "completed") {
    const bodyFee = req.body.quoted_fee === undefined ? undefined : (req.body.quoted_fee === "" || req.body.quoted_fee === null ? null : Number(req.body.quoted_fee));
    const effective = (bodyFee !== undefined ? bodyFee : row.quoted_fee) ?? row.est_fee;
    if (effective == null) return res.status(400).json({ error: "Set the client fee before marking this job completed. Enter 0 if there's no charge.", code: "fee_required" });
  }
  if (feeItems && JSON.stringify(feeItems) !== JSON.stringify(addons.list(row))) {
    sets.addons = JSON.stringify(feeItems); sets.addons_total = feeTotal;
    const f = fees.ofKind(feeItems);
    notes.push(f.length ? `Extra fees: ${addons.describe(f)}` : "Extra fees removed");
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
      `INSERT INTO notaries(name,email,phone,states,ron,rin,notes,commission_expires,eo_amount,background_date,home_zip,travel_miles,role)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [d.name, (d.email || "").toLowerCase() || null, d.phone, d.role === "witness" || d.role === "process_server" ? "" : STATE_CODES[d.commissionState] || (d.commissionState || "").slice(0, 2).toUpperCase(), d.ron ? 1 : 0, d.rin ? 1 : 0,
       d.role === "witness" || d.role === "process_server" ? `${d.role === "witness" ? "Witness" : "Process server"}, from application #${a.id}. ZIP ${d.zip}, radius ${d.radius}${d.experience ? `, ${d.experience} experience` : ""}` : `From application #${a.id}. ZIP ${d.zip}, radius ${d.radius}, ${d.signings} signings`, /^\d{4}-\d{2}-\d{2}$/.test(d.commissionExpires || "") ? d.commissionExpires : null,
       d.eo && d.eo !== "None yet" ? d.eo : null, /^\d{4}-\d{2}-\d{2}$/.test(d.backgroundDate || "") ? d.backgroundDate : null,
       /^\d{5}$/.test(d.zip || "") ? d.zip : null, parseInt(d.radius, 10) || 30, ["witness", "process_server"].includes(d.role) ? d.role : "notary"])).id;
    const n = await db.one("SELECT * FROM notaries WHERE id = $1", [nid]);
    if (n.email) mail.notaryWelcome(n, await notary.createLoginLink(n.id, 7 * 24 * 60), await getSettings());
  }
  res.json({ ok: true });
});
// Where customers say they found us (last 90 days), counted across bookings, requests, messages and bookkeeping leads.
app.get("/api/admin/lead-sources", requireAdmin, async (req, res) => {
  const heard = require("./src/heard");
  const rows = await db.all(`SELECT src, heard, count(*)::int AS n FROM (
      SELECT 'booking' AS src, heard_from AS heard FROM bookings WHERE created_at > now() - interval '90 days'
      UNION ALL SELECT 'request', heard_from FROM service_requests WHERE created_at > now() - interval '90 days'
      UNION ALL SELECT 'message', heard_from FROM messages WHERE created_at > now() - interval '90 days'
      UNION ALL SELECT 'bookkeeping', NULLIF(data->>'heard','') FROM bookkeeping_leads WHERE created_at > now() - interval '90 days'
    ) t GROUP BY src, heard`);
  const by = {}; let total = 0, answered = 0;
  for (const r of rows) { total += r.n; if (r.heard && heard.LABELS[r.heard]) { answered += r.n; by[r.heard] = (by[r.heard] || 0) + r.n; } }
  res.json({ total, answered, sources: heard.OPTIONS.map(([id, label]) => ({ id, label, n: by[id] || 0 })).filter((s) => s.n).sort((a, b) => b.n - a.n) });
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
  if (s.publicPrices !== undefined) {
    if (!s.publicPrices || typeof s.publicPrices !== "object") return res.status(400).json({ error: "Invalid starting prices." });
    for (const k of Object.keys(s.publicPrices)) {
      if (!require("./src/prices").DEFAULTS.hasOwnProperty(k)) { delete s.publicPrices[k]; continue; }
      const v = s.publicPrices[k];
      if (v === null || v === "") { s.publicPrices[k] = null; continue; }
      if (!(Number(v) >= 0 && Number(v) <= 10000)) return res.status(400).json({ error: "Starting prices must be between $0 and $10,000." });
      s.publicPrices[k] = Math.round(Number(v) * 100) / 100;
    }
  }
  if (s.addons !== undefined) {
    if (!Array.isArray(s.addons) || s.addons.length > 20) return res.status(400).json({ error: "Add-ons must be a list of up to 20 items." });
    for (const a of s.addons) {
      if (!a || !/^[a-z0-9_-]{1,30}$/.test(String(a.id || "")) || !String(a.label || "").trim()) return res.status(400).json({ error: "Each add-on needs an id and a label." });
      const price = Number(a.price);
      if (!(price >= 0 && price <= 5000)) return res.status(400).json({ error: `Price for ${a.label} must be between $0 and $5,000.` });
      a.price = Math.round(price * 100) / 100;
    }
  }
  if (s.fees !== undefined) {
    const e = fees.validateSettings(s.fees);
    if (e) return res.status(400).json({ error: e });
  }
  if (s.requestFees !== undefined) {
    const e = fees.validateSettings(s.requestFees);
    if (e) return res.status(400).json({ error: e.replace("Extra fees", "Request extras") });
  }
  if (s.billing && s.billing.lateFeePct !== undefined) {
    const p = Number(s.billing.lateFeePct);
    if (!(p >= 0 && p <= 5)) return res.status(400).json({ error: "Late fee must be between 0 and 5% a month." });
    s.billing.lateFeePct = p;
  }
  if (s.bookkeeping !== undefined) {
    const e = bookkeeping.validateSettings(s.bookkeeping);
    if (e) return res.status(400).json({ error: e });
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
bookkeeping.register(app, { requireAdmin });
require("./src/requests").register(app, { requireAdmin, requireNotary: notary.requireNotary, loadMe: notary.loadMe });

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
app.use("/fonts", express.static(path.join(__dirname, "public", "fonts"), { maxAge: "365d", immutable: true }));
// Images and fonts rarely change, so browsers keep them a month. CSS and JS keep a short cache since file names aren't versioned. Pages always revalidate.
app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"],
  setHeaders: (res, file) => {
    if (/\.(png|jpe?g|webp|svg|ico|woff2?)$/i.test(file)) res.setHeader("Cache-Control", "public, max-age=2592000");
    else if (/\.(css|js)$/i.test(file)) res.setHeader("Cache-Control", "public, max-age=3600");
  },
}));
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
