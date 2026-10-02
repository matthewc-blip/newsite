// Service requests: process serving, recording, legalization, translation, shredding, estate scanning,
// lien waivers and inspections. Customers request them from the service pages; the desk quotes, assigns
// a team member (or handles it through a partner), tracks attempts and documents, invoices, and pays out.
const crypto = require("crypto");
const express = require("express");
const { db, getSettings } = require("./db");
const { str, emailOk, phoneOk, rateLimit } = require("./util");
const { dateInTz } = require("./time");
const storage = require("./storage");
const mail = require("./email");
const margin = require("./margin");
const { TYPES, ROLE_LABEL, publicCatalog } = require("./request-types");

const raw = express.raw({ type: () => true, limit: storage.MAX_CLOSING + 1024 });
const STATUSES = ["new", "quoted", "in_progress", "completed", "canceled"];
const OPEN = ["new", "quoted", "in_progress"];
const RESULTS = { served: "Served", not_home: "No one home", refused: "Refused / evading", bad_address: "Bad address", other: "Other" };
const num = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));
const err = (message, status = 400, extra) => Object.assign(new Error(message), { status, ...extra });

async function logReq(id, actor, text) { await db.run("INSERT INTO request_events(request_id, actor, text) VALUES($1,$2,$3)", [id, actor, text]); }
function newRef() { const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s = "SR-"; for (const b of crypto.randomBytes(6)) s += A[b % A.length]; return s; }

// Margin for a request: client fee vs team-member pay plus partner cost.
function marginFor(r, settings, over = {}) {
  const fee = over.fee !== undefined ? num(over.fee) : num(r.fee);
  const pay = over.assignee_fee !== undefined ? num(over.assignee_fee) : num(r.assignee_fee);
  const vendor = over.vendor_cost !== undefined ? num(over.vendor_cost) : num(r.vendor_cost);
  const assigned = over.assignee_id !== undefined ? !!over.assignee_id : !!r.assignee_id;
  const cost = (assigned ? pay || 0 : 0) + (vendor || 0);
  const known = (assigned && pay != null) || vendor != null;
  return margin.check(fee, known ? cost : null, settings);
}

function view(r) {
  const t = TYPES[r.type] || { label: r.type, fields: [] };
  return { ...r, type_label: t.label, roles: t.roles || [] };
}

// What a team member sees. Before accepting: type, area, due date and fee only.
function jobView(r, full) {
  const t = TYPES[r.type] || { label: r.type, fields: [] };
  const d = r.details || {};
  const addr = d.serve_address || d.pickup_address || d.property || d.project || "";
  const area = ((addr.match(/([A-Za-z .'-]+),?\s*(NJ|New Jersey)\b/i) || [])[0] || "New Jersey").trim();
  const base = { id: r.id, ref: r.ref, type: r.type, type_label: t.label, status: r.status, due_date: r.due_date, fee: r.assignee_fee,
    paid_at: r.assignee_paid_at, assignee_status: r.assignee_status, area, completed_at: r.completed_at };
  if (!full) return base;
  return { ...base, details: t.fields.filter((f) => d[f.key]).map((f) => ({ label: f.label, value: d[f.key] })), notes: r.notes,
    contact_name: r.contact_name, contact_phone: r.contact_phone, company: r.company };
}

async function detail(id, settings) {
  const r = await db.one("SELECT * FROM service_requests WHERE id = $1", [id]);
  if (!r) return null;
  const [events, docs, attempts] = await Promise.all([
    db.all("SELECT at, actor, text FROM request_events WHERE request_id = $1 ORDER BY id", [id]),
    db.all("SELECT id, kind, filename, size_bytes, uploaded_by, uploaded_by_name, created_at FROM request_documents WHERE request_id = $1 ORDER BY id", [id]),
    db.all("SELECT * FROM request_attempts WHERE request_id = $1 ORDER BY at", [id]),
  ]);
  const t = TYPES[r.type] || { roles: [] };
  let pool = [];
  if (t.roles.length) {
    const ppl = await db.all("SELECT * FROM notaries WHERE active = 1 AND coalesce(role,'notary') = ANY($1) ORDER BY name", [t.roles]);
    const pdocs = ppl.length ? await db.all("SELECT notary_id, kind FROM notary_documents WHERE notary_id = ANY($1)", [ppl.map((p) => p.id)]) : [];
    const today = dateInTz(new Date(), settings.business.timezone);
    const { compliance } = require("./notary");
    pool = ppl.map((p) => ({ id: p.id, name: p.name, role: p.role || "notary", role_label: ROLE_LABEL[p.role || "notary"], home_zip: p.home_zip, ready: compliance(p, pdocs, today).ready }));
  }
  const assignee = r.assignee_id ? await db.one("SELECT id, name, phone, email, role FROM notaries WHERE id = $1", [r.assignee_id]) : null;
  const inv = r.invoice_id ? await db.one("SELECT id, number, status, provider, error FROM invoices WHERE id = $1", [r.invoice_id]) : null;
  return { request: view(r), fields: (TYPES[r.type] || {}).fields || [], events, documents: docs, attempts, pool, assignee, invoice: inv, margin: marginFor(r, settings), results: RESULTS };
}

async function sendDoc(res, doc) {
  const buf = await storage.readRequestFile(doc);
  res.setHeader("Content-Type", doc.content_type);
  res.setHeader("Content-Disposition", `inline; filename="${doc.filename.replace(/"/g, "")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(buf);
}

async function invoiceRequest(id) {
  const settings = await getSettings();
  const r = await db.one("SELECT * FROM service_requests WHERE id = $1", [id]);
  if (!r) throw err("Request not found.", 404);
  if (r.invoice_id) throw err("This request is already invoiced.");
  if (r.status === "canceled") throw err("Canceled requests can't be invoiced.");
  if (num(r.fee) == null) throw err("Set the client fee first.");
  const billing = require("./billing");
  const today = dateInTz(new Date(), settings.business.timezone);
  let to = { name: r.company || r.contact_name, email: r.contact_email, termsDays: null, accountId: null };
  if (r.client_account_id) {
    const a = await db.one("SELECT * FROM client_accounts WHERE id = $1", [r.client_account_id]);
    if (a) to = { name: a.company, email: a.billing_email || r.contact_email, termsDays: a.payment_terms_days, accountId: a.id };
  }
  const terms = to.accountId ? to.termsDays ?? settings.billing.termsDays ?? 30 : settings.billing.individualTermsDays ?? 0;
  const due = require("./time").addDays(today, terms);
  const name = `${(TYPES[r.type] || {}).label || r.type} · ${r.ref}`.slice(0, 195);
  const inv = await db.tx(async (t) => {
    const row = await t.one(`INSERT INTO invoices(client_account_id, bill_to_name, bill_to_email, invoice_date, due_date, period_start, period_end, amount, status, provider)
      VALUES($1,$2,$3,$4,$5,$4,$4,$6,'draft',$7) RETURNING *`, [to.accountId, to.name, to.email, today, due, num(r.fee), billing.PROVIDER]);
    const number = `MCC-${today.replace(/-/g, "").slice(0, 6)}-${String(row.id).padStart(4, "0")}`;
    await t.run("UPDATE invoices SET number = $1 WHERE id = $2", [number, row.id]);
    await t.run("INSERT INTO invoice_items(invoice_id, request_id, name, quantity, unit_price) VALUES($1,$2,$3,1,$4)", [row.id, r.id, name, num(r.fee)]);
    const claimed = await t.one("UPDATE service_requests SET invoice_id = $1 WHERE id = $2 AND invoice_id IS NULL RETURNING id", [row.id, r.id]);
    if (!claimed) throw err("This request was just invoiced.", 409);
    return { ...row, number };
  });
  await logReq(r.id, "desk", `Billed on invoice ${inv.number}`);
  try { await billing.sendInvoice(inv.id); } catch (e) { console.error("Sending request invoice failed:", e.message); }
  return (await db.one("SELECT id, number, status, provider, error FROM invoices WHERE id = $1", [inv.id]));
}

function register(app, { requireAdmin, requireNotary, loadMe }) {
  /* ---------- public ---------- */
  app.get("/api/request-types", (req, res) => res.json({ types: publicCatalog() }));

  app.post("/api/requests", rateLimit(8, 10 * 60000), async (req, res) => {
    if (req.body.website) return res.status(400).json({ error: "Rejected" });
    const type = str(req.body.type, 30);
    const t = TYPES[type];
    if (!t) return res.status(400).json({ error: "Choose a service." });
    const c = { name: str(req.body.contactName, 120), email: str(req.body.contactEmail, 160).toLowerCase(), phone: str(req.body.contactPhone, 40), company: str(req.body.company, 160) };
    const fields = {};
    if (!c.name) fields.contactName = "Enter your name.";
    if (!emailOk(c.email)) fields.contactEmail = "Enter a valid email.";
    if (!phoneOk(c.phone)) fields.contactPhone = "Enter a phone number with area code.";
    const d = {};
    const inDetails = req.body.details && typeof req.body.details === "object" ? req.body.details : {};
    for (const f of t.fields) {
      let v = str(inDetails[f.key], f.textarea ? 1000 : 300);
      if (f.options && v && !f.options.includes(v)) v = "";
      if (f.required && !v) fields[f.key] = `Enter ${f.label.toLowerCase().replace(/\s*\(.*\)$/, "")}.`;
      if (v) d[f.key] = v;
    }
    const due = str(req.body.dueDate, 10);
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) fields.dueDate = "Pick a valid date.";
    if (Object.keys(fields).length) return res.status(400).json({ error: "Check the highlighted fields.", fields });
    const acct = await db.one("SELECT account_id FROM client_users WHERE lower(email) = $1 AND active = 1", [c.email]);
    let row;
    for (let i = 0; i < 5 && !row; i++) {
      try {
        row = await db.one(`INSERT INTO service_requests(ref, type, contact_name, contact_email, contact_phone, company, client_account_id, details, notes, due_date)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [newRef(), type, c.name, c.email, c.phone, c.company || null, acct ? acct.account_id : null, JSON.stringify(d), str(req.body.notes, 2000) || null, due || null]);
      } catch (e) { if (e.code !== "23505") throw e; }
    }
    await logReq(row.id, "customer", "Requested online");
    const settings = await getSettings();
    const lines = t.fields.filter((f) => d[f.key]).map((f) => `${f.label}: ${d[f.key]}`).join("\n");
    mail.deskNotice(`New request ${row.ref}: ${t.label}`, `${c.name}${c.company ? ` (${c.company})` : ""} · ${c.phone} · ${c.email}\n${lines}${due ? `\nNeeded by: ${due}` : ""}${row.notes ? `\nNotes: ${row.notes}` : ""}\n\nOpen the Requests tab to quote and assign it.`);
    mail.send({ to: c.email, subject: `We received your request ${row.ref} · ${t.label}`,
      text: `Hi ${c.name},\n\nThanks for your ${t.label.toLowerCase()} request (${row.ref}). The desk will confirm the details and the price, usually within one business day.\n\n${lines}\n\nQuestions? ${settings.business.phone} · ${settings.business.email}\n\n${settings.business.name}` });
    res.status(201).json({ ref: row.ref });
  });

  /* ---------- desk ---------- */
  app.get("/api/admin/requests", requireAdmin, async (req, res) => {
    const st = str(req.query.status, 20);
    const rows = await db.all(`SELECT r.*, n.name AS assignee_name FROM service_requests r LEFT JOIN notaries n ON n.id = r.assignee_id
      ${st === "open" ? "WHERE r.status = ANY($1)" : st && STATUSES.includes(st) ? "WHERE r.status = $1" : ""} ORDER BY r.created_at DESC LIMIT 300`,
      st === "open" ? [OPEN] : st && STATUSES.includes(st) ? [st] : []);
    res.json({ requests: rows.map(view), statuses: STATUSES });
  });
  app.get("/api/admin/requests/:id", requireAdmin, async (req, res) => {
    const d = await detail(Number(req.params.id) || 0, await getSettings());
    if (!d) return res.status(404).json({ error: "Not found" });
    res.json(d);
  });
  app.patch("/api/admin/requests/:id", requireAdmin, async (req, res) => {
    const settings = await getSettings();
    const r = await db.one("SELECT * FROM service_requests WHERE id = $1", [Number(req.params.id) || 0]);
    if (!r) return res.status(404).json({ error: "Not found" });
    const sets = {}, notes = [];
    if (req.body.status !== undefined) {
      if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: "Invalid status" });
      if (req.body.status === "completed" && r.type === "process_serve" && !(await db.one("SELECT 1 FROM request_attempts WHERE request_id = $1 AND result = 'served'", [r.id])) && !req.body.force)
        return res.status(400).json({ error: "Log a successful serve before completing this request.", code: "no_serve" });
      if (req.body.status !== r.status) { sets.status = req.body.status; notes.push(`Status: ${r.status} → ${req.body.status}`); if (req.body.status === "completed") sets.completed_at = new Date().toISOString(); }
    }
    for (const k of ["fee", "vendor_cost", "assignee_fee"]) {
      if (req.body[k] === undefined) continue;
      const v = num(req.body[k]);
      if (req.body[k] !== "" && req.body[k] !== null && !(v >= 0 && v <= 50000)) return res.status(400).json({ error: "Amounts must be between $0 and $50,000." });
      if (r.invoice_id && k === "fee" && v !== num(r.fee)) return res.status(400).json({ error: "Already invoiced. Void the invoice to change the fee." });
      if (v !== num(r[k])) { sets[k] = v; notes.push(`${k === "fee" ? "Client fee" : k === "vendor_cost" ? "Partner cost" : "Assignee pay"}: ${v == null ? "cleared" : "$" + v.toFixed(2)}`); }
    }
    if (req.body.due_date !== undefined) { const v = str(req.body.due_date, 10); if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return res.status(400).json({ error: "Invalid date" }); sets.due_date = v || null; notes.push(`Due date: ${v || "cleared"}`); }
    if (req.body.internal_notes !== undefined) sets.internal_notes = str(req.body.internal_notes, 5000);
    const mg = marginFor(r, settings, sets);
    if (!mg.ok && !req.body.override_margin) return res.status(400).json({ error: mg.message.replace("Pay the notary at most", "Keep team + partner cost at or under"), code: "margin", margin: mg });
    if (!Object.keys(sets).length) return res.json({ ok: true });
    const keys = Object.keys(sets);
    await db.run(`UPDATE service_requests SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")}, updated_at = now() WHERE id = $${keys.length + 1}`, [...keys.map((k) => (k === "details" ? JSON.stringify(sets[k]) : sets[k])), r.id]);
    for (const n of notes) await logReq(r.id, "desk", n);
    if (!mg.ok) await logReq(r.id, "desk", `Margin override: ${mg.pct}%`);
    if (sets.status && req.body.notify !== false && ["quoted", "completed", "canceled"].includes(sets.status)) {
      const t = TYPES[r.type] || { label: r.type };
      const msg = { quoted: `We've reviewed your ${t.label.toLowerCase()} request${num(sets.fee ?? r.fee) != null ? ` and the price is $${num(sets.fee ?? r.fee).toFixed(2)}` : ""}. Reply to this email or call ${settings.business.phone} to confirm.`,
        completed: `Your ${t.label.toLowerCase()} request is complete.${r.type === "process_serve" ? " The affidavit of service will be sent to you." : ""}`, canceled: `Your ${t.label.toLowerCase()} request was canceled.` }[sets.status];
      mail.send({ to: r.contact_email, subject: `${t.label} ${r.ref}: ${sets.status === "quoted" ? "your quote" : sets.status}`, text: `Hi ${r.contact_name},\n\n${msg}\n\n${settings.business.name} · ${settings.business.phone}` });
    }
    res.json({ ok: true });
  });

  app.post("/api/admin/requests/:id/assign", requireAdmin, async (req, res) => {
    const settings = await getSettings();
    const r = await db.one("SELECT * FROM service_requests WHERE id = $1", [Number(req.params.id) || 0]);
    if (!r) return res.status(404).json({ error: "Not found" });
    if (!OPEN.includes(r.status)) return res.status(400).json({ error: "This request is closed." });
    const t = TYPES[r.type] || { roles: [] };
    const p = await db.one("SELECT * FROM notaries WHERE id = $1 AND active = 1 AND coalesce(role,'notary') = ANY($2)", [Number(req.body.assignee_id) || 0, t.roles]);
    if (!p) return res.status(400).json({ error: "Choose an active team member who can take this request." });
    const pay = num(req.body.assignee_fee);
    if (req.body.assignee_fee !== "" && req.body.assignee_fee != null && !(pay >= 0 && pay <= 10000)) return res.status(400).json({ error: "Enter a valid pay amount." });
    const mg = marginFor(r, settings, { assignee_id: p.id, assignee_fee: pay });
    if (!mg.ok && !req.body.override_margin) return res.status(400).json({ error: mg.message.replace("Pay the notary at most", "Keep team + partner cost at or under"), code: "margin", margin: mg });
    await db.run("UPDATE service_requests SET assignee_id = $1, assignee_fee = $2, assignee_status = 'offered', assignee_paid_at = NULL, status = CASE WHEN status = 'new' THEN 'quoted' ELSE status END, updated_at = now() WHERE id = $3", [p.id, pay, r.id]);
    await logReq(r.id, "desk", `Offered to ${p.name}${pay != null ? ` at $${pay.toFixed(2)}` : ""}${!mg.ok ? ` (margin override: ${mg.pct}%)` : ""}`);
    if (p.email) {
      const { createLoginLink } = require("./notary");
      const link = await createLoginLink(p.id, 72 * 60, `#req-${r.id}`);
      const v = jobView(r, false);
      mail.send({ to: p.email, subject: `New ${t.label.toLowerCase()} request ${r.ref}`,
        text: `Hi ${p.name},\n\nNew request: ${t.label}\nArea: ${v.area}${r.due_date ? `\nNeeded by: ${r.due_date}` : ""}${pay != null ? `\nYour pay: $${pay.toFixed(2)}` : ""}\n\nAccept or decline: ${link}\n\nFull details appear after you accept.` });
    }
    res.json({ ok: true });
  });
  app.delete("/api/admin/requests/:id/assign", requireAdmin, async (req, res) => {
    const r = await db.one("UPDATE service_requests SET assignee_id = NULL, assignee_status = NULL, assignee_fee = NULL, updated_at = now() WHERE id = $1 AND assignee_paid_at IS NULL RETURNING id", [Number(req.params.id) || 0]);
    if (!r) return res.status(400).json({ error: "Not found, or the assignee was already paid." });
    await logReq(r.id, "desk", "Assignee removed");
    res.json({ ok: true });
  });

  app.post("/api/admin/requests/:id/documents", requireAdmin, raw, async (req, res) => {
    const r = await db.one("SELECT id FROM service_requests WHERE id = $1", [Number(req.params.id) || 0]);
    if (!r) return res.status(404).json({ error: "Not found" });
    const kind = ["papers", "proof", "other"].includes(req.query.kind) ? req.query.kind : "papers";
    try {
      const doc = await storage.saveRequestFile({ requestId: r.id, kind, filename: str(req.query.filename, 200), contentType: req.get("Content-Type"), buffer: req.body, by: "desk", byName: "Desk" });
      await logReq(r.id, "desk", `Uploaded ${kind === "papers" ? "papers to serve" : kind}: ${doc.filename}`);
      res.status(201).json({ document: doc });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.get("/api/admin/request-documents/:id", requireAdmin, async (req, res) => {
    const doc = await db.one("SELECT id, filename, content_type, storage, path FROM request_documents WHERE id = $1", [Number(req.params.id) || 0]);
    if (!doc) return res.status(404).send("Not found");
    await sendDoc(res, doc);
  });
  app.delete("/api/admin/request-documents/:id", requireAdmin, async (req, res) => {
    const doc = await db.one("SELECT id, request_id, filename, storage, path FROM request_documents WHERE id = $1", [Number(req.params.id) || 0]);
    if (!doc) return res.status(404).json({ error: "Not found" });
    await storage.deleteRequestFile(doc);
    await logReq(doc.request_id, "desk", `Deleted ${doc.filename}`);
    res.json({ ok: true });
  });

  app.post("/api/admin/requests/:id/attempts", requireAdmin, async (req, res) => {
    const r = await db.one("SELECT id FROM service_requests WHERE id = $1", [Number(req.params.id) || 0]);
    if (!r) return res.status(404).json({ error: "Not found" });
    try { res.status(201).json({ attempt: await addAttempt(r.id, req.body, "Desk") }); } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.post("/api/admin/requests/:id/invoice", requireAdmin, async (req, res) => {
    try { res.json({ invoice: await invoiceRequest(Number(req.params.id) || 0) }); } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });

  /* ---------- team portal ---------- */
  async function mine(req, res, needAccepted) {
    const r = await db.one("SELECT * FROM service_requests WHERE id = $1 AND assignee_id = $2", [Number(req.params.id) || 0, req.notary.id]);
    if (!r) { res.status(404).json({ error: "This request is no longer assigned to you." }); return null; }
    if (needAccepted && r.assignee_status !== "accepted") { res.status(400).json({ error: "Accept the request first." }); return null; }
    return r;
  }
  app.get("/api/portal/requests", requireNotary, loadMe, async (req, res) => {
    const rows = await db.all("SELECT * FROM service_requests WHERE assignee_id = $1 AND assignee_status IN ('offered','accepted') ORDER BY coalesce(due_date, created_at::date), id", [req.notary.id]);
    const offers = [], active = [], past = [];
    for (const r of rows) {
      if (r.assignee_status === "offered" && OPEN.includes(r.status)) offers.push(jobView(r, false));
      else if (r.assignee_status === "accepted" && OPEN.includes(r.status)) active.push(jobView(r, true));
      else if (r.assignee_status === "accepted" && r.status === "completed") past.push(jobView(r, true));
    }
    const ids = active.map((j) => j.id);
    if (ids.length) {
      const docs = await db.all("SELECT id, request_id, kind, filename, created_at FROM request_documents WHERE request_id = ANY($1) ORDER BY id", [ids]);
      const atts = await db.all("SELECT id, request_id, at, result, served_to, description, by_name FROM request_attempts WHERE request_id = ANY($1) ORDER BY at", [ids]);
      for (const j of active) { j.documents = docs.filter((d) => d.request_id === j.id); j.attempts = atts.filter((a) => a.request_id === j.id); }
    }
    res.json({ offers, active, past: past.reverse().slice(0, 100), results: RESULTS });
  });
  app.post("/api/portal/requests/:id/accept", requireNotary, loadMe, async (req, res) => {
    const r = await mine(req, res); if (!r) return;
    if (r.assignee_status !== "offered" || !OPEN.includes(r.status)) return res.status(400).json({ error: "This request is no longer open." });
    const { notaryWithCompliance } = require("./notary");
    if (!(await notaryWithCompliance(req.notary)).compliance.ready) return res.status(400).json({ error: "Finish onboarding before accepting." });
    await db.run("UPDATE service_requests SET assignee_status = 'accepted', status = 'in_progress', updated_at = now() WHERE id = $1", [r.id]);
    await logReq(r.id, "team", `Accepted by ${req.notary.name}`);
    mail.deskNotice(`${req.notary.name} accepted ${r.ref}`, `${req.notary.name} accepted ${r.ref} (${(TYPES[r.type] || {}).label || r.type}).`);
    res.json({ ok: true });
  });
  app.post("/api/portal/requests/:id/decline", requireNotary, loadMe, async (req, res) => {
    const r = await mine(req, res); if (!r) return;
    if (r.assignee_status !== "offered") return res.status(400).json({ error: "This request is no longer open." });
    const reason = str(req.body.reason, 300);
    await db.run("UPDATE service_requests SET assignee_status = 'declined', updated_at = now() WHERE id = $1", [r.id]);
    await logReq(r.id, "team", `Declined by ${req.notary.name}${reason ? `: ${reason}` : ""}`);
    mail.deskNotice(`${req.notary.name} declined ${r.ref}: reassign`, `${req.notary.name} declined ${r.ref}.${reason ? " Reason: " + reason : ""}\nAssign someone else in the Requests tab.`);
    res.json({ ok: true });
  });
  app.post("/api/portal/requests/:id/attempts", requireNotary, loadMe, async (req, res) => {
    const r = await mine(req, res, true); if (!r) return;
    try { res.status(201).json({ attempt: await addAttempt(r.id, req.body, req.notary.name) }); } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.post("/api/portal/requests/:id/documents", requireNotary, loadMe, raw, async (req, res) => {
    const r = await mine(req, res, true); if (!r) return;
    try {
      const doc = await storage.saveRequestFile({ requestId: r.id, kind: "proof", filename: str(req.query.filename, 200), contentType: req.get("Content-Type"), buffer: req.body, by: "team", byName: req.notary.name });
      await logReq(r.id, "team", `${req.notary.name} uploaded ${doc.filename}`);
      mail.deskNotice(`Proof uploaded for ${r.ref}`, `${req.notary.name} uploaded ${doc.filename} to ${r.ref}.`);
      res.status(201).json({ document: doc });
    } catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  });
  app.get("/api/portal/request-documents/:id", requireNotary, loadMe, async (req, res) => {
    const doc = await db.one(`SELECT d.id, d.filename, d.content_type, d.storage, d.path FROM request_documents d JOIN service_requests r ON r.id = d.request_id
      WHERE d.id = $1 AND r.assignee_id = $2 AND r.assignee_status = 'accepted'`, [Number(req.params.id) || 0, req.notary.id]);
    if (!doc) return res.status(404).send("Not found");
    await sendDoc(res, doc);
  });
  app.post("/api/portal/requests/:id/complete", requireNotary, loadMe, async (req, res) => {
    const r = await mine(req, res, true); if (!r) return;
    if (!OPEN.includes(r.status)) return res.status(400).json({ error: "This request is already closed." });
    if (r.type === "process_serve" && !(await db.one("SELECT 1 FROM request_attempts WHERE request_id = $1 AND result = 'served'", [r.id])))
      return res.status(400).json({ error: "Log the successful serve first." });
    if (r.type === "process_serve" && !(await db.one("SELECT 1 FROM request_documents WHERE request_id = $1 AND kind = 'proof'", [r.id])))
      return res.status(400).json({ error: "Upload the signed affidavit of service first." });
    const note = str(req.body.note, 1000);
    await db.run("UPDATE service_requests SET status = 'completed', completed_at = now(), updated_at = now() WHERE id = $1", [r.id]);
    await logReq(r.id, "team", `Completed by ${req.notary.name}${note ? `: ${note}` : ""}`);
    mail.deskNotice(`${r.ref} completed by ${req.notary.name}`, `${r.ref} (${(TYPES[r.type] || {}).label || r.type}) is complete.${note ? "\nNote: " + note : ""}\nReview it and send the invoice from the Requests tab.`);
    res.json({ ok: true });
  });
}

async function addAttempt(requestId, body, byName) {
  const result = str(body.result, 20);
  if (!RESULTS[result]) throw err("Choose the result of the attempt.");
  const at = body.at ? new Date(body.at) : new Date();
  if (isNaN(at) || at.getTime() > Date.now() + 5 * 60000) throw err("Enter when the attempt happened (not in the future).");
  const servedTo = str(body.servedTo, 160);
  if (result === "served" && !servedTo) throw err("Enter who was served (name or description).");
  const row = await db.one(`INSERT INTO request_attempts(request_id, at, result, served_to, description, by_name) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [requestId, at.toISOString(), result, servedTo || null, str(body.description, 1000) || null, byName]);
  await logReq(requestId, byName === "Desk" ? "desk" : "team", `Attempt: ${RESULTS[result]}${servedTo ? ` · ${servedTo}` : ""} (${byName})`);
  if (result === "served") mail.deskNotice(`Served: request #${requestId}`, `${byName} logged a successful serve${servedTo ? ` on ${servedTo}` : ""}.`);
  return row;
}

module.exports = { register, invoiceRequest, TYPES, RESULTS };
