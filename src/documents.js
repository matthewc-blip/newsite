// Closing packages and scanbacks: upload, download, desk review, retention.
const express = require("express");
const { db, getSettings, logEvent } = require("./db");
const { str } = require("./util");
const storage = require("./storage");
const mail = require("./email");
const { sendSms } = require("./sms");

const raw = express.raw({ type: () => true, limit: storage.MAX_CLOSING + 1024 });
const DOC_COLS = "id, booking_id, kind, filename, content_type, size_bytes, uploaded_by, uploaded_by_name, review_status, review_note, reviewed_at, downloaded_at, purged_at, created_at, storage, path";
const publicDoc = ({ storage: _s, path: _p, ...d }) => d;

async function listDocs(bookingId, { forNotary = false } = {}) {
  const rows = await db.all(`SELECT ${DOC_COLS} FROM booking_documents WHERE booking_id = $1 ORDER BY created_at`, [bookingId]);
  return rows.map(publicDoc).filter((d) => !forNotary || d.kind !== "scanback" || d.uploaded_by === "notary");
}

async function sendFile(res, doc) {
  if (doc.purged_at) return res.status(410).json({ error: "This file was deleted under the document retention policy." });
  const buf = await storage.readBookingFile(doc);
  res.setHeader("Content-Type", doc.content_type);
  res.setHeader("Content-Disposition", `inline; filename="${doc.filename.replace(/"/g, "")}"`);
  res.setHeader("Cache-Control", "private, no-store");
  res.send(buf);
}

// Roll individual scanback reviews up to the booking.
async function refreshScanbackStatus(bookingId) {
  const r = await db.one(`SELECT
      COUNT(*) FILTER (WHERE kind = 'scanback')::int AS total,
      COUNT(*) FILTER (WHERE kind = 'scanback' AND review_status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE kind = 'scanback' AND review_status = 'rejected')::int AS rejected
    FROM booking_documents WHERE booking_id = $1 AND purged_at IS NULL AND coalesce(review_status, '') <> 'superseded'`, [bookingId]);
  const status = !r.total ? null : r.pending ? "pending" : r.rejected ? "rejected" : "approved";
  await db.run("UPDATE bookings SET scanback_status = $1 WHERE id = $2", [status, bookingId]);
  return status;
}

// Everyone on the client side who should hear about a booking.
async function clientRecipients(b) {
  const set = new Set([b.contact_email].filter(Boolean));
  if (b.client_account_id) {
    const users = await db.all("SELECT email FROM client_users WHERE account_id = $1 AND active = 1", [b.client_account_id]);
    users.forEach((u) => set.add(u.email.toLowerCase()));
  }
  return [...set];
}

async function notifyNotaryPackage(b) {
  if (!b.notary_id || b.notary_status !== "accepted") return;
  const n = await db.one("SELECT * FROM notaries WHERE id = $1", [b.notary_id]);
  if (!n) return;
  const s = await getSettings();
  const link = await require("./notary").createLoginLink(n.id, 72 * 60, `#job-${b.id}`);
  if (n.email) mail.send({ to: n.email, subject: `Documents ready · ${b.ref}`, text: `Hi ${n.name},\n\nThe documents for ${b.ref} (${b.category}) are ready to download and print:\n${link}` });
  if (n.phone && n.sms_ok) sendSms(n.phone, `${s.business.name}: documents ready for ${b.ref}. ${link}`);
}

async function afterPackageUpload(b, who) {
  await logEvent(b.id, who, "Closing documents uploaded");
  notifyNotaryPackage(b);
}

async function approveAll(bookingId, note) {
  const rows = await db.all("UPDATE booking_documents SET review_status = 'approved', review_note = $2, reviewed_at = now() WHERE booking_id = $1 AND kind = 'scanback' AND review_status = 'pending' AND purged_at IS NULL RETURNING id", [bookingId, note || null]);
  const status = await refreshScanbackStatus(bookingId);
  if (status === "approved") {
    const b = await db.one("SELECT * FROM bookings WHERE id = $1", [bookingId]);
    await logEvent(bookingId, "desk", "Scanbacks approved");
    const to = await clientRecipients(b);
    const link = b.client_account_id ? `${mail.BASE}/client/#order-${b.id}` : mail.manageUrl(b);
    for (const addr of to) mail.send({ to: addr, subject: `Scanbacks ready · ${b.ref}${b.file_number ? " · File " + b.file_number : ""}`, text: `The signed scanbacks for ${b.ref} (${b.category}${b.signer_names ? ", " + b.signer_names : ""}) passed our review.${b.return_tracking ? `\nOriginals shipped: tracking ${b.return_tracking}` : ""}\n\n${b.client_account_id ? "Download them here: " + link : "Questions? Reply to this email."}` });
  }
  return rows.length;
}

async function rejectScanback(docId, note) {
  const d = await db.one("UPDATE booking_documents SET review_status = 'rejected', review_note = $2, reviewed_at = now() WHERE id = $1 AND kind = 'scanback' RETURNING booking_id, filename", [docId, note]);
  if (!d) return null;
  await refreshScanbackStatus(d.booking_id);
  await logEvent(d.booking_id, "desk", `Scanback rejected (${d.filename}): ${note}`);
  const b = await db.one("SELECT * FROM bookings WHERE id = $1", [d.booking_id]);
  if (b.notary_id) {
    const n = await db.one("SELECT * FROM notaries WHERE id = $1", [b.notary_id]);
    const link = await require("./notary").createLoginLink(n.id, 72 * 60, `#job-${b.id}`);
    if (n.email) mail.send({ to: n.email, subject: `Scanback needs a fix · ${b.ref}`, text: `Hi ${n.name},\n\nThe desk flagged a scanback for ${b.ref}:\n\n"${note}"\n\nPlease correct it and upload a new scan: ${link}` });
    if (n.phone && n.sms_ok) sendSms(n.phone, `Scanback fix needed for ${b.ref}: ${note.slice(0, 120)}. ${link}`);
  }
  return d;
}

// Delete file contents for jobs finished more than N days ago.
async function purgeOld() {
  const days = (await getSettings()).documents?.retentionDays ?? 30;
  if (!days || days < 1) return 0;
  const rows = await db.all(
    `SELECT d.id, d.storage, d.path FROM booking_documents d JOIN bookings b ON b.id = d.booking_id
     WHERE d.purged_at IS NULL AND b.status IN ('completed','canceled','no_show') AND b.updated_at < now() - make_interval(days => $1::int)`, [days]);
  for (const r of rows) await storage.purgeBookingFile(r);
  if (rows.length) console.log(`Retention: deleted ${rows.length} closing document file(s) older than ${days} days`);
  return rows.length;
}
function startRetentionJob() {
  const tick = () => purgeOld().catch((e) => console.error("Retention job failed:", e.message));
  setTimeout(tick, 2 * 60 * 1000).unref();
  setInterval(tick, 12 * 3600 * 1000).unref();
}

function register(app, { requireAdmin, requireNotary, loadNotary }) {
  /* ----- desk ----- */
  app.get("/api/admin/bookings/:id/documents", requireAdmin, async (req, res) => res.json({ documents: await listDocs(Number(req.params.id) || 0) }));

  app.post("/api/admin/bookings/:id/documents", requireAdmin, raw, async (req, res) => {
    const b = await db.one("SELECT * FROM bookings WHERE id = $1", [Number(req.params.id) || 0]);
    if (!b) return res.status(404).json({ error: "Not found" });
    const kind = ["package", "scanback", "other"].includes(req.query.kind) ? req.query.kind : "package";
    try {
      const d = await storage.saveBookingFile({ bookingId: b.id, kind, filename: str(req.query.filename, 200), contentType: (req.get("Content-Type") || "").split(";")[0], buffer: req.body, by: "desk", byName: "Desk" });
      if (kind === "package") await afterPackageUpload(b, "desk");
      if (kind === "scanback") {
        await db.run("UPDATE booking_documents SET review_status = 'superseded' WHERE booking_id = $1 AND kind = 'scanback' AND review_status = 'rejected'", [b.id]);
        await refreshScanbackStatus(b.id);
      }
      res.status(201).json({ document: publicDoc(d) });
    } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : "Upload failed." }); if (!e.status) console.error(e); }
  });

  app.get("/api/admin/booking-documents/:docId", requireAdmin, async (req, res) => {
    const d = await db.one(`SELECT ${DOC_COLS} FROM booking_documents WHERE id = $1`, [Number(req.params.docId) || 0]);
    if (!d) return res.status(404).json({ error: "Not found" });
    await sendFile(res, d);
  });
  app.delete("/api/admin/booking-documents/:docId", requireAdmin, async (req, res) => {
    const d = await db.one(`SELECT ${DOC_COLS} FROM booking_documents WHERE id = $1`, [Number(req.params.docId) || 0]);
    if (!d) return res.status(404).json({ error: "Not found" });
    await storage.deleteBookingFile(d);
    await logEvent(d.booking_id, "desk", `Removed ${d.kind}: ${d.filename}`);
    if (d.kind === "scanback") await refreshScanbackStatus(d.booking_id);
    res.json({ ok: true });
  });
  app.post("/api/admin/booking-documents/:docId/review", requireAdmin, async (req, res) => {
    const status = req.body.status;
    const note = str(req.body.note, 500);
    const id = Number(req.params.docId) || 0;
    if (status === "rejected") {
      if (!note) return res.status(400).json({ error: "Say what needs fixing so the notary can correct it." });
      const d = await rejectScanback(id, note);
      return d ? res.json({ ok: true }) : res.status(404).json({ error: "Not found" });
    }
    if (status === "approved") {
      const d = await db.one("UPDATE booking_documents SET review_status = 'approved', reviewed_at = now() WHERE id = $1 AND kind = 'scanback' RETURNING booking_id", [id]);
      if (!d) return res.status(404).json({ error: "Not found" });
      const s = await refreshScanbackStatus(d.booking_id);
      if (s === "approved") await approveAll(d.booking_id);
      return res.json({ ok: true, scanback_status: s });
    }
    res.status(400).json({ error: "Invalid status" });
  });
  app.post("/api/admin/bookings/:id/scanbacks/approve", requireAdmin, async (req, res) => {
    await approveAll(Number(req.params.id) || 0, str(req.body.note, 500));
    res.json({ ok: true });
  });
  app.post("/api/admin/documents/purge", requireAdmin, async (req, res) => res.json({ purged: await purgeOld() }));

  /* ----- notary ----- */
  async function notaryJob(req, res) {
    const b = await db.one("SELECT * FROM bookings WHERE id = $1 AND notary_id = $2 AND notary_status = 'accepted'", [Number(req.params.id) || 0, req.notary.id]);
    if (!b) { res.status(404).json({ error: "This job isn't assigned to you." }); return null; }
    return b;
  }
  app.get("/api/portal/booking-documents/:docId", requireNotary, loadNotary, async (req, res) => {
    const d = await db.one(`SELECT d.id, d.booking_id, d.kind, d.filename, d.content_type, d.storage, d.path, d.purged_at, d.downloaded_at, d.uploaded_by
      FROM booking_documents d JOIN bookings b ON b.id = d.booking_id
      WHERE d.id = $1 AND b.notary_id = $2 AND b.notary_status = 'accepted' AND (d.kind <> 'scanback' OR d.uploaded_by = 'notary')`, [Number(req.params.docId) || 0, req.notary.id]);
    if (!d) return res.status(404).json({ error: "Not found" });
    if (d.kind === "package" && !d.downloaded_at) {
      await db.run("UPDATE booking_documents SET downloaded_at = now() WHERE id = $1", [d.id]);
      await logEvent(d.booking_id, "notary", `${req.notary.name} downloaded ${d.filename}`);
    }
    await sendFile(res, d);
  });
  app.post("/api/portal/jobs/:id/scanbacks", requireNotary, loadNotary, raw, async (req, res) => {
    const b = await notaryJob(req, res); if (!b) return;
    try {
      const d = await storage.saveBookingFile({ bookingId: b.id, kind: "scanback", filename: str(req.query.filename, 200), contentType: (req.get("Content-Type") || "").split(";")[0], buffer: req.body, by: "notary", byName: req.notary.name });
      await db.run("UPDATE booking_documents SET review_status = 'superseded' WHERE booking_id = $1 AND kind = 'scanback' AND review_status = 'rejected'", [b.id]);
      await refreshScanbackStatus(b.id);
      await logEvent(b.id, "notary", `Scanback uploaded: ${d.filename}`);
      mail.deskNotice(`Scanbacks to review · ${b.ref}`, `${req.notary.name} uploaded ${d.filename} for ${b.ref}. Review it in the dashboard.`);
      res.status(201).json({ document: publicDoc(d) });
    } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : "Upload failed. Try again." }); if (!e.status) console.error(e); }
  });
  app.delete("/api/portal/booking-documents/:docId", requireNotary, loadNotary, async (req, res) => {
    const d = await db.one(`SELECT d.* FROM booking_documents d JOIN bookings b ON b.id = d.booking_id
      WHERE d.id = $1 AND b.notary_id = $2 AND d.kind = 'scanback' AND d.uploaded_by = 'notary' AND d.review_status <> 'approved'`, [Number(req.params.docId) || 0, req.notary.id]);
    if (!d) return res.status(404).json({ error: "You can only remove your own scans that haven't been approved." });
    await storage.deleteBookingFile(d);
    await refreshScanbackStatus(d.booking_id);
    res.json({ ok: true });
  });
}

module.exports = { register, listDocs, sendFile, afterPackageUpload, refreshScanbackStatus, purgeOld, startRetentionJob, raw, publicDoc, DOC_COLS, clientRecipients };
