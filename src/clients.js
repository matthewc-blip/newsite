// Client accounts (title companies, lenders, law firms): portal login, orders, documents.
const crypto = require("crypto");
const { db, getSettings, logEvent } = require("./db");
const { str, emailOk, phoneOk, rateLimit, sign, verify, cookie, setCookie } = require("./util");
const storage = require("./storage");
const mail = require("./email");
const docs = require("./documents");

const DAY = 86400000;
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");

async function createClientLink(userId, minutes, hashPart = "") {
  const raw = crypto.randomBytes(24).toString("base64url");
  await db.run("INSERT INTO client_login_tokens(token_hash, user_id, expires_at) VALUES($1, $2, now() + make_interval(mins => $3::int))", [hash(raw), userId, minutes]);
  return `${mail.BASE}/client/?t=${raw}${hashPart}`;
}

async function sendClientLink(u, link, welcome) {
  const s = await getSettings();
  await mail.send({
    to: u.email,
    subject: welcome ? `Your ${s.business.name} client account is ready` : `Your ${s.business.name} sign-in link`,
    text: `Hi ${u.name},\n\n${welcome ? `Your company now has an account with ${s.business.name}. Place signing orders, upload closing packages and download scanbacks in one place.\n\n` : ""}Sign in: ${link}\n\nThis link expires in ${welcome ? "7 days" : "30 minutes"}. After that, sign in at ${mail.BASE}/client/ with this email address.`,
  });
}

// Link a booking to a client account when the contact email belongs to a client user.
async function autoLink(booking) {
  if (booking.client_account_id || !booking.contact_email) return booking;
  const u = await db.one("SELECT id, account_id FROM client_users WHERE lower(email) = lower($1) AND active = 1", [booking.contact_email]);
  if (!u) return booking;
  return db.one("UPDATE bookings SET client_account_id = $1, client_user_id = $2 WHERE id = $3 RETURNING *", [u.account_id, u.id, booking.id]);
}

function requireClient(req, res, next) {
  const s = verify(cookie(req, "mcc_client"));
  if (!s || !s.uid) return res.status(401).json({ error: "Sign in to your client account." });
  if (req.method !== "GET" && req.get("X-Requested-With") !== "mcc-client") return res.status(403).json({ error: "Forbidden" });
  req.clientUserId = s.uid;
  next();
}
async function loadClient(req, res, next) {
  const u = await db.one(`SELECT u.*, a.company, a.active AS account_active FROM client_users u JOIN client_accounts a ON a.id = u.account_id WHERE u.id = $1`, [req.clientUserId]);
  if (!u || !u.active || !u.account_active) return res.status(401).json({ error: "This account is inactive. Contact the desk." });
  req.client = u;
  next();
}

const CLIENT_EVENT = /^(Booking requested online|Order placed|Status: |Accepted by|Assigned directly|Marked complete|Scanbacks approved|Closing documents uploaded|Canceled|Rescheduled)/;

function orderView(b, notaryName) {
  return {
    id: b.id, ref: b.ref, service: b.service, category: b.category, signers: b.signers, start: b.start_utc, tz: b.customer_tz,
    status: b.status, notary: b.notary_status === "accepted" ? notaryName || null : null,
    location: b.service === "mobile" ? [b.address, b.city, b.state, b.zip].filter(Boolean).join(", ") : b.signer_location,
    signer_names: b.signer_names, file_number: b.file_number, contact_name: b.contact_name, contact_phone: b.contact_phone,
    scanback_status: b.scanback_status, return_tracking: b.return_tracking, mailing_address: b.mailing_address, notes: b.notes,
    quoted_fee: b.quoted_fee ?? b.est_fee, created_at: b.created_at,
    addons: (Array.isArray(b.addons) ? b.addons : []).map((a) => `${a.label}${a.qty > 1 ? " ×" + a.qty : ""} ($${(a.qty * a.price).toFixed(2)})`).join(", "),
    can_cancel: ["requested", "confirmed", "assigned"].includes(b.status) && Date.parse(b.start_utc) > Date.now(),
  };
}

function register(app, { requireAdmin, insertBooking, readBookingInput }) {
  /* ----- client auth ----- */
  app.post("/api/client/request-link", rateLimit(5, 15 * 60000), async (req, res) => {
    const email = str(req.body.email, 160).toLowerCase();
    if (!emailOk(email)) return res.status(400).json({ error: "Enter your work email." });
    const u = await db.one(`SELECT u.* FROM client_users u JOIN client_accounts a ON a.id = u.account_id WHERE lower(u.email) = $1 AND u.active = 1 AND a.active = 1`, [email]);
    if (u) sendClientLink(u, await createClientLink(u.id, 30), false);
    res.json({ ok: true });
  });
  app.post("/api/client/login", rateLimit(20, 15 * 60000), async (req, res) => {
    const t = str(req.body.token, 100);
    const row = t && (await db.one("SELECT * FROM client_login_tokens WHERE token_hash = $1 AND expires_at > now()", [hash(t)]));
    if (!row) return res.status(401).json({ error: "That sign-in link has expired. Enter your email to get a new one." });
    await db.run("UPDATE client_users SET last_login_at = now() WHERE id = $1", [row.user_id]);
    setCookie(req, res, "mcc_client", sign({ uid: row.user_id, exp: Date.now() + 30 * DAY }), 30 * 86400);
    res.json({ ok: true });
  });
  app.post("/api/client/logout", (req, res) => { setCookie(req, res, "mcc_client", "", 0); res.json({ ok: true }); });

  app.get("/api/client/me", requireClient, loadClient, async (req, res) => {
    const a = await db.one("SELECT id, company, phone, instructions FROM client_accounts WHERE id = $1", [req.client.account_id]);
    const team = await db.all("SELECT name, email, last_login_at FROM client_users WHERE account_id = $1 AND active = 1 ORDER BY name", [a.id]);
    const s = await getSettings();
    res.json({ user: { name: req.client.name, email: req.client.email }, account: a, team, business: s.business, timezone: s.business.timezone });
  });

  /* ----- orders ----- */
  app.get("/api/client/orders", requireClient, loadClient, async (req, res) => {
    const rows = await db.all(`SELECT b.*, n.name AS notary_name,
        (SELECT COUNT(*) FROM booking_documents d WHERE d.booking_id = b.id AND d.kind = 'package')::int AS package_count
      FROM bookings b LEFT JOIN notaries n ON n.id = b.notary_id
      WHERE b.client_account_id = $1 ORDER BY b.start_utc DESC LIMIT 300`, [req.client.account_id]);
    res.json({ orders: rows.map((b) => ({ ...orderView(b, b.notary_name), package_count: b.package_count })) });
  });

  async function myOrder(req, res) {
    const b = await db.one("SELECT b.*, n.name AS notary_name FROM bookings b LEFT JOIN notaries n ON n.id = b.notary_id WHERE b.id = $1 AND b.client_account_id = $2", [Number(req.params.id) || 0, req.client.account_id]);
    if (!b) { res.status(404).json({ error: "Order not found." }); return null; }
    return b;
  }

  app.get("/api/client/orders/:id", requireClient, loadClient, async (req, res) => {
    const b = await myOrder(req, res); if (!b) return;
    const events = (await db.all("SELECT at, text FROM booking_events WHERE booking_id = $1 ORDER BY id", [b.id]))
      .filter((e) => CLIENT_EVENT.test(e.text)).map((e) => ({ at: e.at, text: e.text.replace(/^Status: \w+ → /, "Status: ") }));
    const files = (await docs.listDocs(b.id)).filter((d) => d.kind !== "scanback" || d.review_status === "approved");
    res.json({ order: orderView(b, b.notary_name), events, documents: files });
  });

  app.post("/api/client/orders", requireClient, loadClient, rateLimit(30, 10 * 60000), async (req, res) => {
    const settings = await getSettings();
    // Order emails go to the client user; the signer's email is kept in the notes for the notary/RON invite.
    const signerEmail = str(req.body.signerEmail, 160);
    const notes = [str(req.body.notes, 1800), signerEmail ? `Signer email: ${signerEmail}` : ""].filter(Boolean).join("\n");
    const body = { ...req.body, notes, contactName: req.body.signerNames ? str(req.body.signerNames, 120) : req.client.name, contactEmail: req.client.email, company: req.client.company };
    const { b, errors } = readBookingInput(body);
    if (Object.keys(errors).length) return res.status(400).json({ error: "Check the highlighted fields.", fields: errors });
    let row;
    try { row = await insertBooking(b, settings, { admin: false, source: "client" }); }
    catch (e) { if (!e.status) throw e; return res.status(e.status).json({ error: e.message, fields: e.field ? { [e.field]: e.message } : undefined }); }
    row = await db.one("UPDATE bookings SET client_account_id = $1, client_user_id = $2 WHERE id = $3 RETURNING *", [req.client.account_id, req.client.id, row.id]);
    mail.deskNotice(`New client order ${row.ref} · ${req.client.company}`, `${req.client.name} (${req.client.company}) ordered ${row.category} for ${row.start_utc}.`);
    app.emit("booking:created", row);
    res.status(201).json({ order: orderView(row) });
  });

  app.post("/api/client/orders/:id/cancel", requireClient, loadClient, async (req, res) => {
    const b = await myOrder(req, res); if (!b) return;
    if (!orderView(b).can_cancel) return res.status(400).json({ error: "This order can no longer be canceled online. Call the desk." });
    await db.run("UPDATE bookings SET status = 'canceled', offer_expires_at = NULL, updated_at = now() WHERE id = $1", [b.id]);
    await logEvent(b.id, "client", `Canceled by ${req.client.name}${str(req.body.reason, 300) ? ": " + str(req.body.reason, 300) : ""}`);
    if (b.notary_id) {
      const n = await db.one("SELECT * FROM notaries WHERE id = $1", [b.notary_id]);
      if (n?.email) mail.send({ to: n.email, subject: `Canceled · ${b.ref}`, text: `Hi ${n.name},\n\n${b.ref} (${b.category}) was canceled by the client. Please don't go to the appointment.` });
    }
    mail.deskNotice(`Client canceled ${b.ref}`, `${req.client.name} (${req.client.company}) canceled ${b.ref}.`);
    res.json({ ok: true });
  });

  app.post("/api/client/orders/:id/documents", requireClient, loadClient, docs.raw, async (req, res) => {
    const b = await myOrder(req, res); if (!b) return;
    if (["completed", "canceled", "no_show"].includes(b.status)) return res.status(400).json({ error: "This order is closed. Contact the desk to add documents." });
    try {
      const d = await storage.saveBookingFile({ bookingId: b.id, kind: req.query.kind === "other" ? "other" : "package", filename: str(req.query.filename, 200), contentType: (req.get("Content-Type") || "").split(";")[0], buffer: req.body, by: "client", byName: req.client.name });
      await docs.afterPackageUpload(b, "client");
      res.status(201).json({ document: docs.publicDoc(d) });
    } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : "Upload failed. Try again." }); if (!e.status) console.error(e); }
  });

  app.get("/api/client/booking-documents/:docId", requireClient, loadClient, async (req, res) => {
    const d = await db.one(`SELECT ${docs.DOC_COLS} FROM booking_documents d WHERE d.id = $1
      AND d.booking_id IN (SELECT id FROM bookings WHERE client_account_id = $2) AND (d.kind <> 'scanback' OR d.review_status = 'approved')`, [Number(req.params.docId) || 0, req.client.account_id]);
    if (!d) return res.status(404).json({ error: "Not found" });
    await docs.sendFile(res, d);
  });

  app.delete("/api/client/booking-documents/:docId", requireClient, loadClient, async (req, res) => {
    const d = await db.one(`SELECT ${docs.DOC_COLS} FROM booking_documents d WHERE d.id = $1 AND d.uploaded_by = 'client' AND d.downloaded_at IS NULL
      AND d.booking_id IN (SELECT id FROM bookings WHERE client_account_id = $2)`, [Number(req.params.docId) || 0, req.client.account_id]);
    if (!d) return res.status(400).json({ error: "You can only remove files you uploaded that the notary hasn't downloaded yet." });
    await storage.deleteBookingFile(d);
    await logEvent(d.booking_id, "client", `Removed ${d.filename}`);
    res.json({ ok: true });
  });

  /* ----- desk: client accounts ----- */
  app.get("/api/admin/clients", requireAdmin, async (req, res) => {
    const accounts = await db.all(`SELECT a.*,
        (SELECT COUNT(*) FROM bookings b WHERE b.client_account_id = a.id)::int AS orders,
        (SELECT COUNT(*) FROM bookings b WHERE b.client_account_id = a.id AND b.status IN ('requested','confirmed','assigned') AND b.start_utc > now())::int AS open_orders
      FROM client_accounts a ORDER BY a.active DESC, a.company`);
    const users = await db.all("SELECT id, account_id, name, email, active, last_login_at FROM client_users ORDER BY name");
    res.json({ accounts: accounts.map((a) => ({ ...a, users: users.filter((u) => u.account_id === a.id) })) });
  });
  const readAccount = (b) => [str(b.company, 160), str(b.phone, 40), str(b.billing_email, 160).toLowerCase(), str(b.instructions, 3000), str(b.notes, 3000), b.active === false ? 0 : 1,
    Math.max(0, Math.min(120, parseInt(b.payment_terms_days, 10) || 30))];
  app.post("/api/admin/clients", requireAdmin, async (req, res) => {
    const a = readAccount(req.body);
    if (!a[0]) return res.status(400).json({ error: "Company name is required." });
    if (a[2] && !emailOk(a[2])) return res.status(400).json({ error: "Billing email looks wrong." });
    const r = await db.one("INSERT INTO client_accounts(company, phone, billing_email, instructions, notes, active, payment_terms_days) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id", a);
    res.status(201).json({ id: r.id });
  });
  app.patch("/api/admin/clients/:id", requireAdmin, async (req, res) => {
    const a = readAccount(req.body);
    if (!a[0]) return res.status(400).json({ error: "Company name is required." });
    if (a[2] && !emailOk(a[2])) return res.status(400).json({ error: "Billing email looks wrong." });
    await db.run("UPDATE client_accounts SET company=$1, phone=$2, billing_email=$3, instructions=$4, notes=$5, active=$6, payment_terms_days=$7 WHERE id=$8", [...a, Number(req.params.id) || 0]);
    res.json({ ok: true });
  });
  app.post("/api/admin/clients/:id/users", requireAdmin, async (req, res) => {
    const name = str(req.body.name, 120), email = str(req.body.email, 160).toLowerCase();
    if (!name || !emailOk(email)) return res.status(400).json({ error: "Enter a name and a valid email." });
    const acct = await db.one("SELECT id FROM client_accounts WHERE id = $1", [Number(req.params.id) || 0]);
    if (!acct) return res.status(404).json({ error: "Not found" });
    try {
      const u = await db.one("INSERT INTO client_users(account_id, name, email) VALUES($1,$2,$3) RETURNING *", [acct.id, name, email]);
      // link their past bookings
      await db.run("UPDATE bookings SET client_account_id = $1, client_user_id = $2 WHERE client_account_id IS NULL AND lower(contact_email) = $3", [acct.id, u.id, email]);
      if (req.body.invite !== false) await sendClientLink(u, await createClientLink(u.id, 7 * 24 * 60), true);
      res.status(201).json({ id: u.id });
    } catch (e) { if (e.code === "23505") return res.status(400).json({ error: "That email already belongs to a client user." }); throw e; }
  });
  app.patch("/api/admin/client-users/:id", requireAdmin, async (req, res) => {
    await db.run("UPDATE client_users SET active = $1 WHERE id = $2", [req.body.active ? 1 : 0, Number(req.params.id) || 0]);
    res.json({ ok: true });
  });
  app.post("/api/admin/client-users/:id/login-link", requireAdmin, async (req, res) => {
    const u = await db.one("SELECT * FROM client_users WHERE id = $1", [Number(req.params.id) || 0]);
    if (!u) return res.status(404).json({ error: "Not found" });
    const link = await createClientLink(u.id, 7 * 24 * 60);
    if (req.body.send) await sendClientLink(u, link, true);
    res.json({ link });
  });
}

module.exports = { register, autoLink, requireClient, loadClient };
