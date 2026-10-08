// Long-term copy of session recordings in Cloudflare R2 (S3-compatible).
// Retention is enforced by a bucket lock rule set in the Cloudflare dashboard on the "recordings/" prefix, not by this code.
// Optional: without the R2 keys, recordings stay in Zoom only and nothing here runs.
const E = process.env;

const r2On = () => !!(E.R2_ACCOUNT_ID && E.R2_ACCESS_KEY_ID && E.R2_SECRET_ACCESS_KEY && E.R2_BUCKET);

let client;
function s3() {
  if (!client) {
    const { S3Client } = require("@aws-sdk/client-s3");
    client = new S3Client({
      region: "auto",
      endpoint: `https://${E.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: E.R2_ACCESS_KEY_ID, secretAccessKey: E.R2_SECRET_ACCESS_KEY },
    });
  }
  return client;
}

// Streams `body` (a Node readable) into the bucket. Multipart, so recordings of any size work.
async function putStream(key, body, meta = {}) {
  const { Upload } = require("@aws-sdk/lib-storage");
  const up = new Upload({
    client: s3(),
    params: { Bucket: E.R2_BUCKET, Key: key, Body: body, ContentType: meta.contentType || "application/octet-stream", Metadata: meta.metadata || {} },
    queueSize: 3,
    partSize: 16 * 1024 * 1024,
  });
  await up.done();
  return key;
}

// Reads the object back and returns its SHA-256, so a stored copy can be checked against the fingerprint.
async function sha256Of(key) {
  const crypto = require("crypto");
  const { GetObjectCommand } = require("@aws-sdk/client-s3");
  const r = await s3().send(new GetObjectCommand({ Bucket: E.R2_BUCKET, Key: key }));
  const h = crypto.createHash("sha256"); let n = 0;
  for await (const c of r.Body) { h.update(c); n += c.length; }
  return { sha256: h.digest("hex"), size: n };
}

const safe = (s) => String(s || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
const keyFor = (ref, filename) => `recordings/${safe(ref)}/${Date.now()}-${safe(filename)}`;
const retainUntil = (from = new Date()) => { const d = new Date(from); d.setFullYear(d.getFullYear() + 10); return d.toISOString().slice(0, 10); };

module.exports = { r2On, putStream, sha256Of, keyFor, retainUntil };
