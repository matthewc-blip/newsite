// Long-term copy of session recordings in Cloudflare R2 (S3-compatible).
// Retention is enforced by a bucket lock rule set in the Cloudflare dashboard on the "recordings/" prefix, not by this code.
// Optional: without the R2 keys, recordings stay in Zoom only and nothing here runs.
const E = process.env;
const clean = (v) => String(v || "").trim();

const r2On = () => !!(E.R2_ACCOUNT_ID && E.R2_ACCESS_KEY_ID && E.R2_SECRET_ACCESS_KEY && E.R2_BUCKET);

// Buckets created in a jurisdiction (EU, FedRAMP) live at a different address. R2_ENDPOINT overrides the default; R2_JURISDICTION ("eu" or "fedramp") builds it.
function endpoint() {
  if (clean(E.R2_ENDPOINT)) return clean(E.R2_ENDPOINT).replace(/\/+$/, "");
  const j = clean(E.R2_JURISDICTION).toLowerCase();
  return `https://${clean(E.R2_ACCOUNT_ID)}.${j ? j + "." : ""}r2.cloudflarestorage.com`;
}

let client;
function s3() {
  if (!client) {
    const { S3Client } = require("@aws-sdk/client-s3");
    client = new S3Client({
      region: "auto",
      endpoint: endpoint(),
      credentials: { accessKeyId: String(E.R2_ACCESS_KEY_ID).trim(), secretAccessKey: String(E.R2_SECRET_ACCESS_KEY).trim() },
      // Newer SDK versions add checksum headers by default; R2 only wants them when an operation requires one.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return client;
}

// Streams `body` (a Node readable) into the bucket. Multipart, so recordings of any size work.
async function putStream(key, body, meta = {}) {
  const { Upload } = require("@aws-sdk/lib-storage");
  const up = new Upload({
    client: s3(),
    params: { Bucket: clean(E.R2_BUCKET), Key: key, Body: body, ContentType: meta.contentType || "application/octet-stream", Metadata: meta.metadata || {} },
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
  const r = await s3().send(new GetObjectCommand({ Bucket: clean(E.R2_BUCKET), Key: key }));
  const h = crypto.createHash("sha256"); let n = 0;
  for await (const c of r.Body) { h.update(c); n += c.length; }
  return { sha256: h.digest("hex"), size: n };
}

// Tries each storage step on its own so a failure says which permission or setting is wrong. Uses the unlocked "healthcheck/" prefix.
async function selfTest() {
  const c = require("@aws-sdk/client-s3");
  const bucket = clean(E.R2_BUCKET), key = `healthcheck/${Date.now()}.txt`;
  const mask = (v) => { v = clean(v); return v.length > 8 ? `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} characters)` : `(${v.length} characters)`; };
  const out = { endpoint: endpoint().replace(clean(E.R2_ACCOUNT_ID), "<account>"), buckets: null, account: mask(E.R2_ACCOUNT_ID), accessKeyId: mask(E.R2_ACCESS_KEY_ID), secretLength: clean(E.R2_SECRET_ACCESS_KEY).length, bucket, steps: [] };
  const step = async (name, fn) => {
    try { await fn(); out.steps.push({ name, ok: true }); return true; }
    catch (e) { out.steps.push({ name, ok: false, error: `${e.name || "Error"}: ${e.message}`, status: e.$metadata?.httpStatusCode }); return false; }
  };
  // Every step runs even if an earlier one fails: some tokens can upload but not "find" the bucket, and the pattern tells us which permission is missing.
  await step("See which buckets this key can access", async () => { out.buckets = ((await s3().send(new c.ListBucketsCommand({}))).Buckets || []).map((b) => b.Name); });
  await step("Find the bucket (HeadBucket)", () => s3().send(new c.HeadBucketCommand({ Bucket: bucket })));
  await step("List files in the bucket", () => s3().send(new c.ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 })));
  const up = await step("Upload a small file", () => s3().send(new c.PutObjectCommand({ Bucket: bucket, Key: key, Body: "storage test" })));
  if (up) await step("Read it back", () => s3().send(new c.GetObjectCommand({ Bucket: bucket, Key: key })).then((r) => r.Body.transformToString()));
  let mp = null;
  await step("Start a large upload (what recordings use)", async () => { mp = (await s3().send(new c.CreateMultipartUploadCommand({ Bucket: bucket, Key: key + ".mp" }))).UploadId; });
  if (mp) await step("Cancel the large upload", () => s3().send(new c.AbortMultipartUploadCommand({ Bucket: bucket, Key: key + ".mp", UploadId: mp })));
  if (up) await step("Delete the test file", () => s3().send(new c.DeleteObjectCommand({ Bucket: bucket, Key: key })));
  return out;
}

const safe = (s) => String(s || "file").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80);
const keyFor = (ref, filename) => `recordings/${safe(ref)}/${Date.now()}-${safe(filename)}`;
const retainUntil = (from = new Date()) => { const d = new Date(from); d.setFullYear(d.getFullYear() + 10); return d.toISOString().slice(0, 10); };

module.exports = { r2On, putStream, sha256Of, keyFor, retainUntil, selfTest };
