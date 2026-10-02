// File storage for notary credentials and closing documents.
// If SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set, files go to a private Supabase Storage bucket.
// Otherwise they are stored inside the database (fine to start; switch to Supabase Storage as volume grows).
const crypto = require("crypto");
const { db } = require("./db");

const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const BUCKET = process.env.SUPABASE_BUCKET || "mcc-documents";
const useSupabase = !!(SB_URL && SB_KEY);

const ALLOWED = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/tiff": "tif" };
const MAX_CREDENTIAL = 10 * 1024 * 1024;
const MAX_CLOSING = 50 * 1024 * 1024;

const headers = (extra = {}) => ({ Authorization: `Bearer ${SB_KEY}`, apikey: SB_KEY, ...extra });
const bad = (m) => Object.assign(new Error(m), { status: 400 });

let bucketReady = null;
function ensureBucket() {
  if (!useSupabase) return Promise.resolve();
  if (!bucketReady) {
    bucketReady = fetch(`${SB_URL}/storage/v1/bucket`, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_CLOSING }),
    }).then(async (r) => {
      if (r.ok) return;
      const t = await r.text();
      if (/already exists|Duplicate/i.test(t)) return;
      bucketReady = null;
      throw new Error("Could not create storage bucket: " + t);
    });
  }
  return bucketReady;
}

function check(contentType, buffer, max) {
  if (!ALLOWED[contentType]) throw bad("Upload a PDF or an image (JPG, PNG, WEBP, HEIC, TIFF).");
  if (!buffer || !buffer.length) throw bad("That file is empty.");
  if (buffer.length > max) throw bad(`Files must be under ${Math.round(max / 1048576)} MB.`);
  if (contentType === "application/pdf" && buffer.slice(0, 5).toString() !== "%PDF-") throw bad("That file doesn't look like a valid PDF.");
}
const cleanName = (n) => String(n || "document").replace(/[^\w.\- ()]+/g, "_").slice(0, 140) || "document";

// Store bytes; returns { storage, path, data } to save on the row.
async function put(prefix, contentType, buffer) {
  if (!useSupabase) return { storage: "db", path: null, data: buffer };
  await ensureBucket();
  const objectPath = `${prefix}/${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ALLOWED[contentType]}`;
  const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${objectPath}`, {
    method: "POST", headers: headers({ "Content-Type": contentType, "x-upsert": "false" }), body: buffer,
  });
  if (!r.ok) throw new Error("Upload to Supabase Storage failed: " + (await r.text()));
  return { storage: "supabase", path: objectPath, data: null };
}
async function get(table, row) {
  if (row.storage === "supabase") {
    const r = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${row.path}`, { headers: headers() });
    if (!r.ok) throw new Error("Could not fetch file from storage");
    return Buffer.from(await r.arrayBuffer());
  }
  return (await db.one(`SELECT data FROM ${table} WHERE id = $1`, [row.id])).data;
}
async function remove(row) {
  if (row.storage === "supabase" && row.path) {
    await fetch(`${SB_URL}/storage/v1/object/${BUCKET}`, {
      method: "DELETE", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: [row.path] }),
    }).catch(() => {});
  }
}

/* ----- notary credential documents ----- */
async function saveDocument({ notaryId, kind, filename, contentType, buffer, uploadedBy }) {
  check(contentType, buffer, MAX_CREDENTIAL);
  const s = await put(`notary-${notaryId}`, contentType, buffer);
  return db.one(`INSERT INTO notary_documents(notary_id, kind, filename, content_type, size_bytes, storage, path, data, uploaded_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, kind, filename, content_type, size_bytes, uploaded_at`,
    [notaryId, kind, cleanName(filename), contentType, buffer.length, s.storage, s.path, s.data, uploadedBy]);
}
const readDocument = (doc) => get("notary_documents", doc);
async function deleteDocument(doc) { await remove(doc); await db.run("DELETE FROM notary_documents WHERE id = $1", [doc.id]); }

/* ----- closing documents (packages and scanbacks) ----- */
async function saveBookingFile({ bookingId, kind, filename, contentType, buffer, by, byName }) {
  check(contentType, buffer, MAX_CLOSING);
  const s = await put(`booking-${bookingId}/${kind}`, contentType, buffer);
  return db.one(`INSERT INTO booking_documents(booking_id, kind, filename, content_type, size_bytes, storage, path, data, uploaded_by, uploaded_by_name, review_status)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, booking_id, kind, filename, content_type, size_bytes, uploaded_by, uploaded_by_name, review_status, created_at`,
    [bookingId, kind, cleanName(filename), contentType, buffer.length, s.storage, s.path, s.data, by, byName || null, kind === "scanback" ? "pending" : null]);
}
const readBookingFile = (row) => get("booking_documents", row);
async function deleteBookingFile(row) { await remove(row); await db.run("DELETE FROM booking_documents WHERE id = $1", [row.id]); }
// Keep the record, drop the bytes (retention policy).
async function purgeBookingFile(row) { await remove(row); await db.run("UPDATE booking_documents SET data = NULL, path = NULL, purged_at = now() WHERE id = $1", [row.id]); }

async function saveRequestFile({ requestId, kind, filename, contentType, buffer, by, byName }) {
  check(contentType, buffer, MAX_CLOSING);
  const s = await put(`request-${requestId}/${kind}`, contentType, buffer);
  return db.one(`INSERT INTO request_documents(request_id, kind, filename, content_type, size_bytes, storage, path, data, uploaded_by, uploaded_by_name)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, request_id, kind, filename, content_type, size_bytes, uploaded_by, uploaded_by_name, created_at`,
    [requestId, kind, cleanName(filename), contentType, buffer.length, s.storage, s.path, s.data, by, byName || null]);
}
const readRequestFile = (row) => get("request_documents", row);
async function deleteRequestFile(row) { await remove(row); await db.run("DELETE FROM request_documents WHERE id = $1", [row.id]); }

module.exports = {
  saveRequestFile, readRequestFile, deleteRequestFile,
  saveDocument, readDocument, deleteDocument,
  saveBookingFile, readBookingFile, deleteBookingFile, purgeBookingFile,
  ALLOWED, MAX_BYTES: MAX_CREDENTIAL, MAX_CLOSING, storageMode: useSupabase ? "supabase" : "db",
};
