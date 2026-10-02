// Notary onboarding, compliance, assignment offers, notary portal and payouts.
const crypto = require("crypto");
const express = require("express");
const { db, getSettings, logEvent } = require("./db");
const { str, emailOk, phoneOk, dateOk, rateLimit, sign, verify, cookie, setCookie } = require("./util");
const { dateInTz } = require("./time");
const storage = require("./storage");
const mail = require("./email");
const { sendSms } = require("./sms");
const agreement = require("./agreement");
const { rulesFor } = require("./state-rules");

const DOC_KINDS = { commission: "Commission certificate", eo: "E&O insurance", background: "Background check", w9: "W-9", certification: "Signing agent certification", other: "Other" };
const ACTIVE = ["requested", "confirmed", "assigned"];
const DAY = 86400000;

/* ---------------- compliance ---------------- */
function daysUntil(dateStr, today) {
  if (!dateStr) return null;
  return Math.round((Date.parse(dateStr) - Date.parse(today)) / DAY);
}

// Returns { ready, items: [{ key, label, state: ok|warn|missing|expired, detail }] }
function compliance(n, docs, today) {
  const has = (k) => docs.some((d) => d.notary_id === n.id && d.kind === k);
  const items = [];
  const dated = (key, label, date, docKind) => {
    const d = daysUntil(date, today);
    let state = "ok", detail = date ? `Expires ${date}` : "No expiration date";
    if (!date || !has(docKind)) { state = "missing"; detail = !has(docKind) ? "Document not uploaded" : "Expiration date missing"; }
    else if (d < 0) { state = "expired"; detail = `Expired ${date}`; }
    else if (d <= 30) { state = "warn"; detail = `Expires in ${d} day${d === 1 ? "" : "s"} (${date})`; }
    items.push({ key, label, state, detail });
  };
  dated("commission", "Notary commission", n.commission_expires, "commission");
  dated("eo", "E&O insurance", n.eo_expires, "eo");
  // Background checks are treated as good for 12 months.
  const bgExpiry = n.background_date ? new Date(Date.parse(n.background_date) + 365 * DAY).toISOString().slice(0, 10) : null;
  const bg = { key: "background", label: "Background check (last 12 months)" };
  const bd = daysUntil(bgExpiry, today);
  if (!n.background_date || !has("background")) items.push({ ...bg, state: "missing", detail: !has("background") ? "Document not uploaded" : "Date missing" });
  else if (bd < 0) items.push({ ...bg, state: "expired", detail: `Over 12 months old (${n.background_date})` });
  else if (bd <= 30) items.push({ ...bg, state: "warn", detail: `Renew within ${bd} days` });
  else items.push({ ...bg, state: "ok", detail: `Completed ${n.background_date}` });
  items.push({ key: "area", label: "Service area", state: n.home_zip ? "ok" : "missing", detail: n.home_zip ? `Within ${n.travel_miles || 30} miles of ${n.home_zip}` : "Home ZIP not set" });
  items.push({ key: "w9", label: "W-9", state: has("w9") ? "ok" : "missing", detail: has("w9") ? "On file" : "Not uploaded" });
  const att = n.attestations || {};
  for (const r of rulesFor(n)) {
    const a = att[r.key];
    items.push({ key: r.key, label: r.label, state: a && a.at ? "ok" : "missing", detail: a && a.at ? `Confirmed ${String(a.at).slice(0, 10)}${a.value ? " · " + a.value : ""}` : "Confirmation needed" });
  }
  const signed = !!n.agreement_at;
  items.push({
    key: "agreement", label: "Contractor agreement",
    state: !signed ? "missing" : n.agreement_version !== agreement.VERSION ? "warn" : "ok",
    detail: !signed ? "Not signed" : n.agreement_version !== agreement.VERSION ? "Signed an older version" : `Signed ${n.agreement_at.slice(0, 10)}`,
  });
  return { ready: items.every((i) => i.state === "ok" || i.state === "warn"), items };
}

async function today() {
  const s = await getSettings();
  return dateInTz(new Date(), s.business.timezone);
}

async function notaryWithCompliance(n) {
  const docs = await db.all("SELECT id, notary_id, kind, filename, content_type, size_bytes, uploaded_at, uploaded_by FROM notary_documents WHERE notary_id = $1 ORDER BY uploaded_at DESC", [n.id]);
  return { ...n, documents: docs, compliance: compliance(n, docs, await today()) };
}

// Count of active notaries whose credentials are missing, expired or expiring within 30 days.
async function notariesForStats() {
  const ns = await db.all("SELECT * FROM notaries WHERE active = 1");
  if (!ns.length) return 0;
  const docs = await db.all("SELECT notary_id, kind FROM notary_documents");
  const t = await today();
  return ns.filter((n) => compliance(n, docs, t).items.some((i) => i.state !== "ok")).length;
}

/* ---------------- login links ---------------- */
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
async function createLoginLink(notaryId, minutes, hashPart = "") {
  const raw = crypto.randomBytes(24).toString("base64url");
  await db.run("INSERT INTO notary_login_tokens(token_hash, notary_id, expires_at) VALUES($1, $2, now() + make_interval(mins => $3::int))", [hash(raw), notaryId, minutes]);
  return `${mail.BASE}/portal/?t=${raw}${hashPart}`;
}

/* ---------------- assignment offers ---------------- */
// Offer (or directly assign) a booking to a notary. Returns the updated booking row.
async function assignNotary(row, { notaryId, direct = false, fee, notify = true, expiresAt = null, auto = false }) {
  const settings = await getSettings();
  if (!notaryId) {
    const updated = await db.one("UPDATE bookings SET notary_id = NULL, notary_status = NULL, offer_expires_at = NULL, auto_dispatch = 0, updated_at = now() WHERE id = $1 RETURNING *", [row.id]);
    await logEvent(row.id, "desk", "Notary removed");
    return updated;
  }
  const n = await db.one("SELECT * FROM notaries WHERE id = $1", [notaryId]);
  if (!n) throw Object.assign(new Error("Unknown notary"), { status: 400 });
  const feeVal = fee === undefined ? row.notary_fee : fee === "" || fee === null ? null : Number(fee);
  if (feeVal !== null && feeVal !== undefined && (isNaN(feeVal) || feeVal < 0)) throw Object.assign(new Error("Notary fee must be a number"), { status: 400 });
  const newStatus = direct && ["requested", "confirmed"].includes(row.status) ? "assigned" : row.status;
  const updated = await db.one(
    `UPDATE bookings SET notary_id = $1, notary_status = $2, notary_fee = $3, status = $4, offer_count = offer_count + 1,
       notary_responded_at = CASE WHEN $2 = 'accepted' THEN now() ELSE NULL END, offer_expires_at = $6, auto_dispatch = $7, updated_at = now() WHERE id = $5 RETURNING *`,
    [n.id, direct ? "accepted" : "offered", feeVal ?? null, newStatus, row.id, expiresAt, auto ? 1 : 0]);
  await logEvent(row.id, auto ? "system" : "desk", direct ? `Assigned directly to ${n.name}` : `${auto ? "Auto-offered" : "Offered"} to ${n.name}${feeVal != null ? ` at $${Number(feeVal).toFixed(2)}` : ""}${expiresAt ? ` · answer by ${new Date(expiresAt).toLocaleTimeString("en-US", { timeZone: settings.business.timezone, hour: "numeric", minute: "2-digit" })}` : ""}`);
  if (newStatus !== row.status) await logEvent(row.id, "desk", `Status: ${row.status} → ${newStatus}`);
  if (notify) {
    const link = await createLoginLink(n.id, 72 * 60, `#job-${row.id}`);
    if (direct) {
      if (n.email) await mail.send({ to: n.email, subject: `Assignment confirmed · ${row.ref}`, text: `Hi ${n.name},\n\nYou're assigned to ${row.ref} (${row.category}). Details: ${link}` });
      if (newStatus === "assigned") mail.bookingStatusChanged(updated, settings, n);
    } else if (n.email) {
      mail.notaryOffer(updated, n, settings, link);
    }
    if (n.phone && n.sms_ok) {
      sendSms(n.phone, `${settings.business.name}: ${direct ? "You're assigned to" : "New offer"} ${row.ref}, ${row.category}, ${new Date(row.start_utc).toLocaleString("en-US", { timeZone: settings.business.timezone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} ET. ${direct ? "Details" : "Accept/decline"}: ${link}`);
    }
  }
  return updated;
}

/* ---------------- credential reminders ---------------- */
async function runReminders() {
  const t = await today();
  const notaries = await db.all("SELECT * FROM notaries WHERE active = 1");
  const deskLines = [];
  for (const n of notaries) {
    const checks = [
      ["commission", "Your notary commission", n.commission_expires],
      ["eo", "Your E&O insurance", n.eo_expires],
      ["background", "Your background check", n.background_date ? new Date(Date.parse(n.background_date) + 365 * DAY).toISOString().slice(0, 10) : null],
    ];
    const items = [];
    for (const [kind, label, date] of checks) {
      const d = daysUntil(date, t);
      if (d === null) continue;
      const threshold = d < 0 ? "expired" : d <= 7 ? "7d" : d <= 30 ? "30d" : null;
      if (!threshold) continue;
      const ins = await db.one("INSERT INTO reminders_sent(notary_id, kind, threshold, for_date) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING notary_id", [n.id, kind, threshold, date]);
      if (!ins) continue;
      items.push(d < 0 ? `${label} expired on ${date}.` : `${label} expires on ${date} (${d} day${d === 1 ? "" : "s"}).`);
    }
    if (items.length) {
      if (n.email) await mail.credentialReminder(n, items);
      deskLines.push(`${n.name}: ${items.join(" ")}`);
    }
  }
  if (deskLines.length) await mail.deskNotice(`Notary credentials need attention (${deskLines.length})`, deskLines.join("\n"));
  return deskLines.length;
}

function startReminderJob() {
  const tick = () => runReminders().catch((e) => console.error("Reminder job failed:", e.message));
  setTimeout(tick, 60 * 1000).unref();
  setInterval(tick, 6 * 3600 * 1000).unref();
}

/* ---------------- routes ---------------- */
function requireNotary(req, res, next) {
  const s = verify(cookie(req, "mcc_notary"));
  if (!s || !s.nid) return res.status(401).json({ error: "Sign in to the notary portal." });
  if (req.method !== "GET" && req.get("X-Requested-With") !== "mcc-portal") return res.status(403).json({ error: "Forbidden" });
  req.notaryId = s.nid;
  next();
}
async function loadMe(req, res, next) {
  const n = await db.one("SELECT * FROM notaries WHERE id = $1", [req.notaryId]);
  if (!n || !n.active) return res.status(401).json({ error: "Your notary account is inactive. Contact the desk." });
  req.notary = n;
  next();
}


function register(app, { requireAdmin }) {
  const raw = express.raw({ type: () => true, limit: storage.MAX_BYTES + 1024 });

  async function sendDoc(res, doc) {
    const buf = await storage.readDocument(doc);
    res.setHeader("Content-Type", doc.content_type);
    res.setHeader("Content-Disposition", `inline; filename="${doc.filename.replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buf);
  }

  /* ----- portal auth ----- */
  app.post("/api/portal/request-link", rateLimit(5, 15 * 60000), async (req, res) => {
    const email = str(req.body.email, 160).toLowerCase();
    if (!emailOk(email)) return res.status(400).json({ error: "Enter the email address you applied with." });
    const n = await db.one("SELECT * FROM notaries WHERE lower(email) = $1 AND active = 1", [email]);
    if (n) mail.notarySignIn(n, await createLoginLink(n.id, 30), await getSettings());
    res.json({ ok: true }); // same answer either way, so emails can't be probed
  });

  app.post("/api/portal/login", rateLimit(20, 15 * 60000), async (req, res) => {
    const t = str(req.body.token, 100);
    const row = t && (await db.one("SELECT * FROM notary_login_tokens WHERE token_hash = $1 AND expires_at > now()", [hash(t)]));
    if (!row) return res.status(401).json({ error: "That sign-in link has expired. Enter your email to get a new one." });
    const n = await db.one("SELECT * FROM notaries WHERE id = $1 AND active = 1", [row.notary_id]);
    if (!n) return res.status(401).json({ error: "Your notary account is inactive. Contact the desk." });
    await db.run("UPDATE notary_login_tokens SET used_at = coalesce(used_at, now()) WHERE token_hash = $1", [hash(t)]);
    await db.run("UPDATE notaries SET last_login_at = now() WHERE id = $1", [n.id]);
    setCookie(req, res, "mcc_notary", sign({ nid: n.id, exp: Date.now() + 30 * DAY }), 30 * 86400);
    res.json({ ok: true });
  });

  app.post("/api/portal/logout", (req, res) => { setCookie(req, res, "mcc_notary", "", 0); res.json({ ok: true }); });

  /* ----- portal profile ----- */
  app.get("/api/portal/me", requireNotary, loadMe, async (req, res) => {
    const n = await notaryWithCompliance(req.notary);
    const s = await getSettings();
    res.json({
      notary: {
        id: n.id, name: n.name, email: n.email, phone: n.phone, states: n.states, ron: n.ron, rin: n.rin, sms_ok: n.sms_ok,
        commission_number: n.commission_number, commission_expires: n.commission_expires, eo_amount: n.eo_amount, eo_expires: n.eo_expires,
        background_date: n.background_date, home_zip: n.home_zip, travel_miles: n.travel_miles, agreement_name: n.agreement_name, agreement_at: n.agreement_at, agreement_version: n.agreement_version,
      },
      documents: n.documents, compliance: n.compliance, docKinds: DOC_KINDS,
      agreement: { version: agreement.VERSION, text: agreement.TEXT },
      stateRules: rulesFor(req.notary), attestations: req.notary.attestations || {},
      business: s.business, timezone: s.business.timezone,
    });
  });

  app.patch("/api/portal/me", requireNotary, loadMe, async (req, res) => {
    const b = req.body || {};
    const fields = {};
    for (const k of ["commission_expires", "eo_expires", "background_date"]) if (b[k] && !dateOk(b[k])) fields[k] = "Enter a valid date.";
    if (b.phone !== undefined && b.phone && !phoneOk(b.phone)) fields.phone = "Enter a phone number with area code.";
    if (b.home_zip && !/^\d{5}$/.test(b.home_zip)) fields.home_zip = "Enter a 5-digit ZIP.";
    if (Object.keys(fields).length) return res.status(400).json({ error: "Check the highlighted fields.", fields });
    const n = req.notary;
    const v = (k, max = 80) => (b[k] === undefined ? n[k] : str(b[k], max) || null);
    const miles = b.travel_miles === undefined ? n.travel_miles : Math.max(1, Math.min(200, parseInt(b.travel_miles, 10) || 30));
    await db.run(`UPDATE notaries SET phone = $1, commission_number = $2, commission_expires = $3, eo_amount = $4, eo_expires = $5, background_date = $6, sms_ok = $7, home_zip = $8, travel_miles = $9 WHERE id = $10`,
      [v("phone", 40), v("commission_number"), v("commission_expires", 10), v("eo_amount", 40), v("eo_expires", 10), v("background_date", 10), b.sms_ok === undefined ? n.sms_ok : b.sms_ok ? 1 : 0, v("home_zip", 5), miles, n.id]);
    res.json({ ok: true });
  });

  app.post("/api/portal/documents", requireNotary, loadMe, raw, async (req, res) => {
    const kind = str(req.query.kind, 20);
    if (!DOC_KINDS[kind]) return res.status(400).json({ error: "Choose a document type." });
    try {
      const doc = await storage.saveDocument({ notaryId: req.notary.id, kind, filename: str(req.query.filename, 200), contentType: (req.get("Content-Type") || "").split(";")[0], buffer: req.body, uploadedBy: "notary" });
      mail.deskNotice(`${req.notary.name} uploaded: ${DOC_KINDS[kind]}`, `${req.notary.name} uploaded ${doc.filename}. Review it in the dashboard under Notaries.`);
      res.status(201).json({ document: doc });
    } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : "Upload failed. Try again." }); if (!e.status) console.error(e); }
  });

  app.get("/api/portal/documents/:id", requireNotary, async (req, res) => {
    const doc = await db.one("SELECT id, notary_id, kind, filename, content_type, storage, path FROM notary_documents WHERE id = $1 AND notary_id = $2", [Number(req.params.id) || 0, req.notaryId]);
    if (!doc) return res.status(404).json({ error: "Not found" });
    await sendDoc(res, doc);
  });

  app.delete("/api/portal/documents/:id", requireNotary, async (req, res) => {
    const doc = await db.one("SELECT id, storage, path FROM notary_documents WHERE id = $1 AND notary_id = $2", [Number(req.params.id) || 0, req.notaryId]);
    if (!doc) return res.status(404).json({ error: "Not found" });
    await storage.deleteDocument(doc);
    res.json({ ok: true });
  });

  app.post("/api/portal/attest", requireNotary, loadMe, async (req, res) => {
    const rule = rulesFor(req.notary).find((r) => r.key === req.body.key);
    if (!rule) return res.status(400).json({ error: "Unknown item." });
    const value = str(req.body.value, 120);
    if (rule.input && !value) return res.status(400).json({ error: `Enter the ${rule.input.toLowerCase()}.` });
    if (!req.body.confirm) return res.status(400).json({ error: "Check the box to confirm." });
    const att = { ...(req.notary.attestations || {}), [rule.key]: { at: new Date().toISOString(), value: value || null, ip: req.ip } };
    await db.run("UPDATE notaries SET attestations = $1 WHERE id = $2", [JSON.stringify(att), req.notary.id]);
    res.json({ ok: true });
  });

  app.post("/api/portal/agreement", requireNotary, loadMe, async (req, res) => {
    const name = str(req.body.name, 120);
    if (!req.body.agree) return res.status(400).json({ error: "Check the box to agree.", fields: { agree: "Check the box to agree." } });
    if (name.replace(/[^a-zA-Z]/g, "").length < 4 || !/\s/.test(name)) return res.status(400).json({ error: "Type your full legal name.", fields: { name: "Type your full legal name (first and last)." } });
    await db.run("UPDATE notaries SET agreement_name = $1, agreement_at = now(), agreement_ip = $2, agreement_version = $3 WHERE id = $4", [name, req.ip, agreement.VERSION, req.notary.id]);
    mail.deskNotice(`${req.notary.name} signed the contractor agreement`, `Signed as "${name}" (version ${agreement.VERSION}) from ${req.ip}.`);
    res.json({ ok: true });
  });

  /* ----- portal jobs ----- */
  function jobView(b, full) {
    const base = {
      id: b.id, ref: b.ref, service: b.service, category: b.category, signers: b.signers, start: b.start_utc, end: b.end_utc,
      tz: b.customer_tz, status: b.status, notary_status: b.notary_status, notary_fee: b.notary_fee, notary_paid_at: b.notary_paid_at,
      completed_at: b.completed_at, return_tracking: b.return_tracking,
      area: b.service === "mobile" ? [b.city, b.state, b.zip].filter(Boolean).join(", ") : b.signer_location,
      docs_delivery: b.docs_delivery, is_loan: b.is_loan, offer_expires_at: b.offer_expires_at, scanback_status: b.scanback_status,
    };
    if (!full) return base;
    return {
      ...base, address: b.address, signer_location: b.signer_location, mailing_address: b.mailing_address, in_us: b.in_us,
      contact_name: b.contact_name, contact_phone: b.contact_phone, contact_email: b.contact_email, signer_names: b.signer_names,
      company: b.company, file_number: b.file_number, notes: b.notes,
    };
  }

  app.get("/api/portal/jobs", requireNotary, loadMe, async (req, res) => {
    const rows = await db.all(`SELECT * FROM bookings WHERE notary_id = $1 ORDER BY start_utc`, [req.notary.id]);
    const now = Date.now();
    const offers = [], upcoming = [], past = [];
    for (const b of rows) {
      const active = ACTIVE.includes(b.status);
      if (active && b.notary_status === "offered" && Date.parse(b.end_utc) > now) offers.push(jobView(b, false));
      else if (active && b.notary_status === "accepted") upcoming.push(jobView(b, true));
      else if (b.status === "completed" || b.status === "no_show") past.push(jobView(b, true));
    }
    past.reverse();
    const ids = upcoming.map((j) => j.id).concat(past.slice(0, 30).map((j) => j.id));
    if (ids.length) {
      const docs = await db.all(`SELECT id, booking_id, kind, filename, size_bytes, uploaded_by, review_status, review_note, created_at, downloaded_at, purged_at
        FROM booking_documents WHERE booking_id = ANY($1) AND (kind <> 'scanback' OR uploaded_by = 'notary') ORDER BY created_at`, [ids]);
      const instr = await db.all(`SELECT b.id, a.company, a.instructions FROM bookings b JOIN client_accounts a ON a.id = b.client_account_id WHERE b.id = ANY($1)`, [ids]);
      for (const j of upcoming.concat(past)) {
        j.documents = docs.filter((d) => d.booking_id === j.id);
        const ins = instr.find((x) => x.id === j.id);
        if (ins && ins.instructions) j.client_instructions = ins.instructions;
      }
    }
    const earned = past.filter((j) => j.status === "completed").reduce((a, j) => a + (j.notary_fee || 0), 0);
    const unpaid = past.filter((j) => j.status === "completed" && !j.notary_paid_at).reduce((a, j) => a + (j.notary_fee || 0), 0);
    res.json({ offers, upcoming, past: past.slice(0, 100), totals: { earned, unpaid } });
  });

  async function myJob(req, res) {
    const b = await db.one("SELECT * FROM bookings WHERE id = $1 AND notary_id = $2", [Number(req.params.id) || 0, req.notary.id]);
    if (!b) { res.status(404).json({ error: "This job is no longer assigned to you." }); return null; }
    return b;
  }

  app.post("/api/portal/jobs/:id/accept", requireNotary, loadMe, async (req, res) => {
    const b = await myJob(req, res); if (!b) return;
    if (b.notary_status !== "offered" || !ACTIVE.includes(b.status)) return res.status(400).json({ error: "This offer is no longer open." });
    if (b.offer_expires_at && Date.parse(b.offer_expires_at) < Date.now()) return res.status(400).json({ error: "This offer expired and may have gone to another notary. Call the desk if you can still take it." });
    const me = await notaryWithCompliance(req.notary);
    if (!me.compliance.ready) return res.status(400).json({ error: "Finish your onboarding checklist (documents, dates and agreement) before accepting jobs." });
    const updated = await db.one("UPDATE bookings SET notary_status = 'accepted', status = 'assigned', notary_responded_at = now(), offer_expires_at = NULL, updated_at = now() WHERE id = $1 RETURNING *", [b.id]);
    await logEvent(b.id, "notary", `Accepted by ${req.notary.name}`);
    if (b.status !== "assigned") await logEvent(b.id, "notary", `Status: ${b.status} → assigned`);
    const s = await getSettings();
    mail.bookingStatusChanged(updated, s, req.notary);
    mail.deskNotice(`${req.notary.name} accepted ${b.ref}`, `${req.notary.name} accepted ${b.ref} (${b.category}).`);
    res.json({ job: jobView(updated, true) });
  });

  app.post("/api/portal/jobs/:id/decline", requireNotary, loadMe, async (req, res) => {
    const b = await myJob(req, res); if (!b) return;
    if (b.notary_status !== "offered") return res.status(400).json({ error: "This offer is no longer open. Call the desk if you can't make an accepted job." });
    const reason = str(req.body.reason, 300);
    await db.run(`UPDATE bookings SET notary_id = NULL, notary_status = 'declined', notary_responded_at = now(), offer_expires_at = NULL,
      declined_notary_ids = array_append(coalesce(declined_notary_ids, '{}'), $2), updated_at = now() WHERE id = $1`, [b.id, req.notary.id]);
    await logEvent(b.id, "notary", `Declined by ${req.notary.name}${reason ? `: ${reason}` : ""}`);
    if (b.auto_dispatch) require("./dispatch").autoOffer(b.id).catch((e) => console.error("Auto-dispatch failed:", e.message));
    else mail.deskNotice(`${req.notary.name} declined ${b.ref}: reassign`, `${req.notary.name} declined ${b.ref} (${b.category}).${reason ? " Reason: " + reason : ""}\nAssign another notary in the dashboard.`);
    res.json({ ok: true });
  });

  app.post("/api/portal/jobs/:id/complete", requireNotary, loadMe, async (req, res) => {
    const b = await myJob(req, res); if (!b) return;
    if (b.notary_status !== "accepted" || !ACTIVE.includes(b.status)) return res.status(400).json({ error: "Only accepted, open jobs can be marked complete." });
    if (Date.parse(b.start_utc) > Date.now() + 15 * 60000) return res.status(400).json({ error: "You can mark this complete after the appointment starts." });
    const tracking = str(req.body.tracking, 80);
    const note = str(req.body.note, 1000);
    if (b.service !== "ron" && b.is_loan && !tracking) return res.status(400).json({ error: "Enter the return shipping tracking number.", fields: { tracking: "Enter the tracking number." } });
    if (b.service !== "ron" && b.is_loan && !(await db.one("SELECT 1 FROM booking_documents WHERE booking_id = $1 AND kind = 'scanback' AND purged_at IS NULL", [b.id])))
      return res.status(400).json({ error: "Upload the scanbacks before marking this loan signing complete." });
    const updated = await db.one("UPDATE bookings SET status = 'completed', completed_at = now(), return_tracking = $1, updated_at = now() WHERE id = $2 RETURNING *", [tracking || null, b.id]);
    await logEvent(b.id, "notary", `Marked complete by ${req.notary.name}${tracking ? ` · tracking ${tracking}` : ""}${note ? ` · ${note}` : ""}`);
    require("./payments").onCompleted(b.id).catch((e) => console.error("Auto-charge:", e.message));
    mail.bookingStatusChanged(updated, await getSettings(), req.notary);
    mail.deskNotice(`${b.ref} completed by ${req.notary.name}`, `${b.ref} (${b.category}) marked complete.${tracking ? "\nTracking: " + tracking : ""}${note ? "\nNote: " + note : ""}`);
    res.json({ job: jobView(updated, true) });
  });

  /* ----- admin: notaries ----- */
  async function allNotaries() {
    const ns = await db.all(`SELECT n.*,
        (SELECT COUNT(*) FROM bookings b WHERE b.notary_id = n.id AND b.status = 'completed')::int AS completed,
        (SELECT COUNT(*) FROM bookings b WHERE b.notary_id = n.id AND b.notary_status = 'offered' AND b.status = ANY($1))::int AS open_offers,
        (SELECT coalesce(sum(notary_fee),0) FROM bookings b WHERE b.notary_id = n.id AND b.status = 'completed' AND b.notary_paid_at IS NULL)::float AS unpaid
      FROM notaries n ORDER BY active DESC, name`, [ACTIVE]);
    const docs = await db.all("SELECT id, notary_id, kind, filename, content_type, size_bytes, uploaded_at, uploaded_by FROM notary_documents ORDER BY uploaded_at DESC");
    const t = await today();
    return ns.map((n) => ({ ...n, documents: docs.filter((d) => d.notary_id === n.id), compliance: compliance(n, docs, t) }));
  }
  app.get("/api/admin/notaries", requireAdmin, async (req, res) => res.json({ notaries: await allNotaries(), docKinds: DOC_KINDS, agreementVersion: agreement.VERSION, storage: storage.storageMode }));

  function readNotary(body) {
    const d = (k) => (body[k] && dateOk(body[k]) ? body[k] : null);
    return {
      name: str(body.name, 120), email: str(body.email, 160).toLowerCase() || null, phone: str(body.phone, 40),
      states: str(body.states, 200).toUpperCase().replace(/[^A-Z,]/g, ""), ron: body.ron ? 1 : 0, rin: body.rin ? 1 : 0,
      active: body.active === false ? 0 : 1, notes: str(body.notes, 2000),
      commission_number: str(body.commission_number, 80) || null, commission_expires: d("commission_expires"),
      eo_amount: str(body.eo_amount, 40) || null, eo_expires: d("eo_expires"), background_date: d("background_date"),
      home_zip: /^\d{5}$/.test(str(body.home_zip, 5)) ? str(body.home_zip, 5) : null, travel_miles: Math.max(1, Math.min(200, parseInt(body.travel_miles, 10) || 30)),
    };
  }
  const NCOLS = ["name", "email", "phone", "states", "ron", "rin", "active", "notes", "commission_number", "commission_expires", "eo_amount", "eo_expires", "background_date", "home_zip", "travel_miles"];
  const dupEmail = (e) => e.code === "23505";

  app.post("/api/admin/notaries", requireAdmin, async (req, res) => {
    const n = readNotary(req.body);
    if (!n.name) return res.status(400).json({ error: "Name is required" });
    if (n.email && !emailOk(n.email)) return res.status(400).json({ error: "Email looks wrong" });
    try {
      const r = await db.one(`INSERT INTO notaries(${NCOLS.join(",")}) VALUES(${NCOLS.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING id`, NCOLS.map((c) => n[c]));
      res.status(201).json({ id: r.id });
    } catch (e) { if (dupEmail(e)) return res.status(400).json({ error: "A notary with that email already exists." }); throw e; }
  });

  app.patch("/api/admin/notaries/:id", requireAdmin, async (req, res) => {
    const n = readNotary(req.body);
    if (!n.name) return res.status(400).json({ error: "Name is required" });
    try {
      await db.run(`UPDATE notaries SET ${NCOLS.map((c, i) => `${c} = $${i + 1}`).join(", ")} WHERE id = $${NCOLS.length + 1}`, [...NCOLS.map((c) => n[c]), Number(req.params.id) || 0]);
      res.json({ ok: true });
    } catch (e) { if (dupEmail(e)) return res.status(400).json({ error: "A notary with that email already exists." }); throw e; }
  });

  app.post("/api/admin/notaries/:id/documents", requireAdmin, raw, async (req, res) => {
    const kind = str(req.query.kind, 20);
    if (!DOC_KINDS[kind]) return res.status(400).json({ error: "Choose a document type." });
    const n = await db.one("SELECT id FROM notaries WHERE id = $1", [Number(req.params.id) || 0]);
    if (!n) return res.status(404).json({ error: "Not found" });
    try {
      const doc = await storage.saveDocument({ notaryId: n.id, kind, filename: str(req.query.filename, 200), contentType: (req.get("Content-Type") || "").split(";")[0], buffer: req.body, uploadedBy: "desk" });
      res.status(201).json({ document: doc });
    } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : "Upload failed." }); if (!e.status) console.error(e); }
  });
  app.get("/api/admin/documents/:id", requireAdmin, async (req, res) => {
    const doc = await db.one("SELECT id, notary_id, kind, filename, content_type, storage, path FROM notary_documents WHERE id = $1", [Number(req.params.id) || 0]);
    if (!doc) return res.status(404).json({ error: "Not found" });
    await sendDoc(res, doc);
  });
  app.delete("/api/admin/documents/:id", requireAdmin, async (req, res) => {
    const doc = await db.one("SELECT id, storage, path FROM notary_documents WHERE id = $1", [Number(req.params.id) || 0]);
    if (!doc) return res.status(404).json({ error: "Not found" });
    await storage.deleteDocument(doc);
    res.json({ ok: true });
  });

  app.post("/api/admin/notaries/:id/login-link", requireAdmin, async (req, res) => {
    const n = await db.one("SELECT * FROM notaries WHERE id = $1", [Number(req.params.id) || 0]);
    if (!n) return res.status(404).json({ error: "Not found" });
    const link = await createLoginLink(n.id, 7 * 24 * 60);
    if (req.body.send) {
      if (!n.email) return res.status(400).json({ error: "Add an email address for this notary first." });
      await mail.notaryWelcome(n, link, await getSettings());
    }
    res.json({ link });
  });

  /* ----- admin: payouts ----- */
  app.get("/api/admin/payouts", requireAdmin, async (req, res) => {
    const unpaid = await db.all(`SELECT b.id, b.ref, b.service, b.category, b.start_utc, b.completed_at, b.notary_fee, b.notary_id, n.name AS notary_name, n.email AS notary_email
      FROM bookings b JOIN notaries n ON n.id = b.notary_id
      WHERE b.status = 'completed' AND b.notary_paid_at IS NULL ORDER BY n.name, b.start_utc`);
    const paid = await db.all(`SELECT b.id, b.ref, b.category, b.start_utc, b.notary_fee, b.notary_paid_at, n.name AS notary_name
      FROM bookings b JOIN notaries n ON n.id = b.notary_id WHERE b.notary_paid_at IS NOT NULL ORDER BY b.notary_paid_at DESC LIMIT 100`);
    res.json({ unpaid, paid });
  });
  app.post("/api/admin/payouts/mark-paid", requireAdmin, async (req, res) => {
    const ids = (Array.isArray(req.body.bookingIds) ? req.body.bookingIds : []).map(Number).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: "Choose at least one job." });
    const rows = await db.all("UPDATE bookings SET notary_paid_at = now() WHERE id = ANY($1) AND status = 'completed' AND notary_paid_at IS NULL RETURNING id", [ids]);
    for (const r of rows) await logEvent(r.id, "desk", "Notary marked paid");
    res.json({ updated: rows.length });
  });
  app.post("/api/admin/payouts/mark-unpaid", requireAdmin, async (req, res) => {
    const id = Number(req.body.bookingId) || 0;
    await db.run("UPDATE bookings SET notary_paid_at = NULL WHERE id = $1", [id]);
    await logEvent(id, "desk", "Notary payment undone");
    res.json({ ok: true });
  });
  app.get("/api/admin/payouts.csv", requireAdmin, async (req, res) => {
    const rows = await db.all(`SELECT n.name, n.email, b.ref, b.category, b.start_utc, b.completed_at, b.notary_fee, b.notary_paid_at
      FROM bookings b JOIN notaries n ON n.id = b.notary_id WHERE b.status = 'completed' ORDER BY n.name, b.start_utc`);
    const cols = ["name", "email", "ref", "category", "start_utc", "completed_at", "notary_fee", "notary_paid_at"];
    const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="mcc-notary-payouts.csv"');
    res.send([cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n"));
  });

  app.post("/api/admin/reminders/run", requireAdmin, async (req, res) => res.json({ notified: await runReminders() }));
}

module.exports = { requireNotary, loadMe, notariesForStats, register, assignNotary, compliance, createLoginLink, startReminderJob, runReminders, notaryWithCompliance, DOC_KINDS };
