// Remote ink-signed sessions (N.J.A.C. 17:50-1.14(i)): Zoom meeting, Persona ID check, recording link,
// declaration, and the 3-day deadline for the signed paper to reach the notary.
// Every integration is optional: without keys the admin can paste a Zoom link and mark the ID check by hand.
// Whether a given ID method satisfies the rule is the notary's call; this tool records what was done.
const crypto = require("crypto");
const { db, getSettings } = require("./db");
const { str, emailOk } = require("./util");
const mail = require("./email");
const archive = require("./archive");
const { PassThrough, Readable } = require("stream");

const E = process.env;
const zoomOn = () => !!(E.ZOOM_ACCOUNT_ID && E.ZOOM_CLIENT_ID && E.ZOOM_CLIENT_SECRET);
const personaOn = () => !!(E.PERSONA_API_KEY && E.PERSONA_TEMPLATE_ID);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const bad = (m, status = 400) => Object.assign(new Error(m), { status });
const DAY = 864e5;

// Checks the notary confirms before closing out a session.
const CHECKS = [
  ["notice", "My portal notice lists the video and ID technology I'm using"],
  ["idShown", "Signer showed a current government photo ID on camera"],
  ["idProofed", "Identity proofing done (KBA, biometric, certificate, personal knowledge or credible witness as allowed)"],
  ["room", "Signer showed the room is private"],
  ["recorded", "Whole session recorded; copy saved for 10 years"],
  ["oath", "Oath or affirmation given on the recording (jurat)"],
  ["signed", "Signer signed the record and the declaration on camera"],
  ["journal", "Journal entry made (notes that communication technology was used)"],
];

/* ---------- Zoom (Server-to-Server OAuth) ---------- */
let zTok = null;
async function zoomToken() {
  if (zTok && zTok.exp > Date.now() + 60000) return zTok.t;
  const auth = Buffer.from(`${E.ZOOM_CLIENT_ID}:${E.ZOOM_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(E.ZOOM_ACCOUNT_ID)}`, { method: "POST", headers: { Authorization: `Basic ${auth}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw bad("Zoom sign-in failed. Check the Zoom keys in Render.", 502);
  zTok = { t: j.access_token, exp: Date.now() + (j.expires_in || 3000) * 1000 };
  return zTok.t;
}
async function zoomMeeting(topic, startIso, tz) {
  const r = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST", headers: { Authorization: `Bearer ${await zoomToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ topic, type: 2, start_time: startIso.replace(/\.\d+Z$/, "Z"), timezone: tz || "America/New_York", duration: 45,
      settings: { auto_recording: "cloud", waiting_room: true, join_before_host: false, mute_upon_entry: false, participant_video: true, host_video: true, approval_type: 2, meeting_authentication: false } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw bad("Zoom could not create the meeting: " + (j.message || r.status), 502);
  return { id: String(j.id), join: j.join_url, start: j.start_url, passcode: j.password || "" };
}

/* ---------- Tamper-evidence: SHA-256 fingerprints ---------- */
// A fingerprint proves a file is byte-for-byte what existed when it was recorded here. It does not stop anyone changing the file.
const HEX = /^[a-f0-9]{64}$/;
const KINDS = ["recording", "transcript", "signed_paper", "notarized_copy", "other"];
async function addHash(sessionId, kind, filename, size, sha256, source) {
  return db.one("insert into remote_hashes (session_id,kind,filename,size_bytes,sha256,source) values ($1,$2,$3,$4,$5,$6) returning *", [sessionId, kind, filename || null, size == null ? null : Number(size), sha256, source]);
}
// Downloads one Zoom file once, hashing it as it streams. When R2 is connected the same bytes are copied into the bucket.
async function zoomDownload(url, dlToken) {
  // Zoom sends a short-lived download token with each recording event; it works without any extra app scope.
  // The app's own token is the fallback (it needs the cloud recording read scopes).
  const tries = [dlToken, null].filter((t, i) => t || i === 1);
  let last = 0;
  for (const t of tries) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${t || await zoomToken()}` }, redirect: "follow" });
    if (r.ok && r.body) return r;
    last = r.status;
    if (r.status !== 401 && r.status !== 403) break;
  }
  throw new Error("Zoom download failed: " + last);
}
async function hashZoomFile(url, store, dlToken) {
  const r = await zoomDownload(url, dlToken);
  const h = crypto.createHash("sha256"); let n = 0;
  const tap = new PassThrough();
  const src = Readable.fromWeb(r.body);
  src.on("data", (c) => { h.update(c); n += c.length; });
  src.on("error", (e) => tap.destroy(e));
  src.pipe(tap);
  let key = null, uploadError = null;
  if (store && archive.r2On()) {
    try { key = await archive.putStream(store.key, tap, { contentType: store.contentType, metadata: store.metadata }); }
    catch (e) { console.error("R2 upload failed:", e.message, e.$metadata?.httpStatusCode || ""); uploadError = `${e.name || "Error"}: ${e.message}`; tap.resume(); await new Promise((ok) => src.once("end", ok).once("close", ok)); }
  } else { for await (const _ of tap) { /* drain */ } }
  return { sha256: h.digest("hex"), size: n, key, uploadError };
}
async function hashRecording(sessionId, files, dlToken) {
  const done = [], failed = [];
  const sess = archive.r2On() ? await get(sessionId) : null;
  for (const f of files || []) {
    if (!f.download_url || (f.status && f.status !== "completed")) continue;
    const ext = String(f.file_type || "").toUpperCase();
    const kind = ext === "TRANSCRIPT" || ext === "VTT" ? "transcript" : "recording";
    const name = `${f.recording_type || "recording"}.${ext.toLowerCase() || "bin"}`;
    // A retry must not copy a file that's already fingerprinted (and archived, when R2 is on).
    const dup = await db.one("select id from remote_hashes where session_id=$1 and filename=$2 and size_bytes=$3 and ($4 or stored_key is not null)", [sessionId, name, Number(f.file_size) || -1, !archive.r2On()]).catch(() => null);
    if (dup) continue;
    try {
      const store = sess ? { key: archive.keyFor(sess.ref, name), contentType: ext === "MP4" ? "video/mp4" : undefined, metadata: { session: String(sess.ref) } } : null;
      const { sha256, size, key, uploadError } = await hashZoomFile(f.download_url, store, dlToken || f.download_token);
      if (uploadError) failed.push("Cloud storage upload failed (" + uploadError + "). The recording is fingerprinted but only exists in Zoom; use Test storage");
      let row = await addHash(sessionId, kind, name, size, sha256, "zoom");
      if (key) {
        // Read the stored copy back and confirm it matches before calling it archived.
        let ok = false;
        try { const back = await archive.sha256Of(key); ok = back.sha256 === sha256 && back.size === size; } catch (e) { console.error("R2 verify failed:", e.message); }
        row = await db.one("update remote_hashes set stored_key=$2, stored_at=now(), stored_verified=$3, retain_until=$4 where id=$1 returning *", [row.id, key, ok, archive.retainUntil()]);
      }
      done.push(row);
    } catch (e) { console.error("Recording fingerprint failed:", e.message); failed.push(e.message); }
  }
  // Show the outcome on the session card so a failure is visible without reading logs.
  await db.run("update remote_sessions set archive_error=$2 where id=$1", [sessionId, failed.length ? failed[0] + (done.length ? "" : " (nothing was fingerprinted; use Retry)") : null]).catch(() => {});
  if (done.length) await mail.deskNotice("Recording fingerprints saved", done.map((r) => `${r.filename}  ${r.size_bytes} bytes  SHA-256 ${r.sha256}` + (r.stored_key ? `\n   Archived: ${r.stored_key} (${r.stored_verified ? "read back and matched" : "UPLOADED BUT NOT VERIFIED - check it"})` : "")).join("\n") + "\n\nKeep this email as an independent, dated copy." + (archive.r2On() ? "" : "\nLong-term storage is not connected: these recordings exist only in Zoom."));
  return done;
}

/* ---------- Persona ---------- */
const P = (path, opts = {}) => fetch("https://withpersona.com/api/v1" + path, { ...opts, headers: { Authorization: `Bearer ${E.PERSONA_API_KEY}`, "Persona-Version": "2023-01-05", "Content-Type": "application/json", ...(opts.headers || {}) } });
async function personaStart(s) {
  const [first, ...rest] = String(s.signer_name).split(/\s+/);
  const r = await P("/inquiries", { method: "POST", body: JSON.stringify({ data: { attributes: { "inquiry-template-id": E.PERSONA_TEMPLATE_ID, "reference-id": s.ref, "name-first": first, "name-last": rest.join(" ") || undefined, "email-address": s.signer_email || undefined } } }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw bad("Persona could not start the check: " + (j.errors?.[0]?.title || r.status), 502);
  const id = j.data.id;
  const l = await P(`/inquiries/${id}/generate-one-time-link`, { method: "POST", body: "{}" });
  const lj = await l.json().catch(() => ({}));
  return { id, link: lj.meta?.["one-time-link"] || null, status: j.data.attributes.status };
}
async function personaRefresh(id) {
  const r = await P(`/inquiries/${id}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw bad("Persona could not be reached.", 502);
  return j.data.attributes.status;
}

/* ---------- data ---------- */

/* ---------- Seals: recording fingerprints + shipping tracking number, written once to an append-only table ---------- */
const canon = (m) => JSON.stringify(m.map((h) => ({ kind: h.kind, filename: h.filename ?? null, size_bytes: h.size_bytes == null ? null : Number(h.size_bytes), sha256: h.sha256 })));
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const ZERO = "0".repeat(64);
const sealText = (prev, ref, tracking, manifestHash, at) => [prev, ref, tracking, manifestHash, at].join("|");
async function sealSession(s, by, carrier) {
  const tracking = String(s.tracking || "").trim();
  if (!tracking) throw bad("Enter the tracking number first.");
  return db.tx(async (t) => {
    await t.run("select pg_advisory_xact_lock(7340211)");
    if (await t.one("select id from remote_seals where session_id=$1", [s.id])) throw bad("This session is already sealed. Seals can't be changed.");
    const hs = await t.all("select kind, filename, size_bytes, sha256 from remote_hashes where session_id=$1 order by sha256", [s.id]);
    if (!hs.some((h) => h.kind === "recording")) throw bad("There is no recording fingerprint yet. Wait for Zoom to finish, or use Retry fingerprint.");
    const manifest = JSON.parse(canon(hs));
    const mh = sha(canon(manifest));
    const prev = (await t.one("select seal_hash from remote_seals order by id desc limit 1"))?.seal_hash || ZERO;
    const at = new Date().toISOString();
    const seal = sha(sealText(prev, s.ref, tracking, mh, at));
    return t.one("insert into remote_seals (session_id,session_ref,tracking,carrier,manifest,manifest_sha256,prev_seal_hash,seal_hash,sealed_at,sealed_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *", [s.id, s.ref, tracking, carrier || null, JSON.stringify(manifest), mh, prev, seal, at, by || "admin"]);
  });
}
// Re-computes every hash in the chain from the stored values. Reports the first row that doesn't match.
async function verifySeals() {
  const rows = await db.all("select * from remote_seals order by id");
  let prev = ZERO;
  for (const r of rows) {
    const mh = sha(canon(r.manifest));
    const at = new Date(r.sealed_at).toISOString();
    if (r.prev_seal_hash !== prev || r.manifest_sha256 !== mh || r.seal_hash !== sha(sealText(prev, r.session_ref, r.tracking, mh, at))) return { ok: false, count: rows.length, brokenAt: r.id, ref: r.session_ref };
    prev = r.seal_hash;
  }
  return { ok: true, count: rows.length, head: prev };
}

const ref = () => "RS-" + crypto.randomBytes(3).toString("hex").toUpperCase();
const get = (id) => db.one("select * from remote_sessions where id=$1", [id]);
const view = (s) => ({ ...s, hoursLeft: s.paper_due_at && !s.paper_received_at ? Math.round((new Date(s.paper_due_at) - Date.now()) / 36e5) : null });

async function create(b) {
  const name = str(b.signerName, 120);
  if (!name) throw bad("Add the signer's name.");
  const email = str(b.signerEmail, 160);
  if (email && !emailOk(email)) throw bad("That email doesn't look right.");
  const when = b.scheduledAt ? new Date(b.scheduledAt) : null;
  if (b.scheduledAt && isNaN(when)) throw bad("Pick a valid date and time.");
  const settings = await getSettings();
  let z = { id: null, join: str(b.zoomUrl, 400) || null, start: null, passcode: "" };
  if (zoomOn() && when && !b.zoomUrl) z = await zoomMeeting(`Notarization: ${name}`, when.toISOString(), settings.business.timezone);
  const row = await db.one(`insert into remote_sessions (ref,booking_id,signer_name,signer_email,signer_phone,signer_location,doc_title,act,scheduled_at,zoom_meeting_id,zoom_join_url,zoom_start_url,zoom_passcode,id_method,notes)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning *`,
    [ref(), Number(b.bookingId) || null, name, email || null, str(b.signerPhone, 40) || null, str(b.signerLocation, 120) || null, str(b.docTitle, 200) || null, b.act === "acknowledgment" ? "acknowledgment" : "jurat",
      when, z.id, z.join, z.start, z.passcode, str(b.idMethod, 40) || null, str(b.notes, 2000) || null]);
  return row;
}

async function invite(s, settings) {
  if (!s.signer_email) throw bad("Add the signer's email first.");
  if (!s.zoom_join_url) throw bad("Add a Zoom link first.");
  const biz = settings.business, first = s.signer_name.split(/\s+/)[0];
  const when = s.scheduled_at ? new Intl.DateTimeFormat("en-US", { timeZone: biz.timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(s.scheduled_at)) : "the time we agreed";
  const idLine = s.persona_link ? `\nBefore the video call, please complete this short ID check on your phone or computer (about 3 minutes):\n${s.persona_link}\n` : "";
  const text = `Hi ${first},

Your remote notarization with ${biz.name} is scheduled for ${when}.

Join the video call here: ${s.zoom_join_url}${s.zoom_passcode ? `\nPasscode: ${s.zoom_passcode}` : ""}
${idLine}
Please have ready:
- Your current government-issued photo ID (driver's license or passport).
- The document, unsigned. Do not sign or date it before the call. You will sign it on camera.
- A pen with blue or black ink, and a quiet room where you are alone for the signing.
- An envelope for sending the signed original back to me right after the call. Use tracked, overnight mail if you can. New Jersey requires the signed paper to reach me within three days.

The call is recorded, as New Jersey requires. If you have any trouble joining, call ${biz.phone}.

${biz.name}`;
  const ok = await mail.send({ to: s.signer_email, subject: "Your remote notarization: join link and what to have ready", text });
  await db.run("update remote_sessions set status = case when status='scheduled' then 'invited' else status end where id=$1", [s.id]);
  return ok;
}

function declarationHtml(s, tz) {
  const d = s.scheduled_at ? new Intl.DateTimeFormat("en-US", { timeZone: tz, dateStyle: "long" }).format(new Date(s.scheduled_at)) : "____________";
  return `<!doctype html><meta charset="utf-8"><title>Declaration ${esc(s.ref)}</title><style>body{font:16px/1.6 Georgia,serif;max-width:680px;margin:40px auto;padding:0 20px;color:#111}h1{font-size:1.3rem}.sig{margin-top:48px}.sig div{border-top:1px solid #111;width:340px;padding-top:4px}.note{font:13px Arial;color:#555;border:1px solid #ccc;padding:10px;margin-bottom:24px}@media print{.note{display:none}}</style>
  <div class="note">Print this page and attach it to the document. Check the wording against the current NJ Notary Public Manual (Chapter 8) before use. The notary's name and the date are filled in; the signer signs and dates on camera.</div>
  <h1>Declaration of Remote Signer</h1>
  <p>I declare under penalty of perjury that the record to which this declaration is attached is the same record on which <b>${esc((s.notary_name || "[NOTARY NAME]"))}</b> performed a notarial act and before whom I appeared by means of communication technology on <b>${esc(d)}</b>.</p>
  <p>Document: ${esc(s.doc_title || "________________")}<br>Signer: ${esc(s.signer_name)}<br>Reference: ${esc(s.ref)}</p>
  <div class="sig"><div>Signature of signer</div><br><div>Date signed</div></div></body>`;
}

async function runAlerts() {
  const rows = await db.all(`select * from remote_sessions where paper_due_at is not null and paper_received_at is null and deadline_alerted=false and paper_due_at < now() + interval '24 hours'`);
  for (const s of rows) {
    const claimed = await db.one("update remote_sessions set deadline_alerted=true where id=$1 and deadline_alerted=false returning id", [s.id]);
    if (!claimed) continue;
    await mail.deskNotice(`Signed paper due soon: ${s.ref} (${s.signer_name})`, `The signed paper and declaration for ${s.signer_name} (${s.ref}) must reach you by ${new Date(s.paper_due_at).toUTCString()}. Tracking: ${s.tracking || "none recorded"}. Contact the signer now if it hasn't arrived.`);
  }
}
let timer = null;
function startJob() { if (timer) return; setTimeout(() => runAlerts().catch((e) => console.error("Remote alert job:", e.message)), 60000).unref(); timer = setInterval(() => runAlerts().catch((e) => console.error("Remote alert job:", e.message)), 15 * 60000); timer.unref(); }

/* ---------- webhooks ---------- */
function zoomWebhook(req, res) {
  const secret = E.ZOOM_WEBHOOK_SECRET;
  if (!secret) return res.status(503).end();
  const raw = req.body.toString("utf8");
  let ev; try { ev = JSON.parse(raw); } catch { return res.status(400).end(); }
  if (ev.event === "endpoint.url_validation") {
    const tok = ev.payload?.plainToken || "";
    return res.json({ plainToken: tok, encryptedToken: crypto.createHmac("sha256", secret).update(tok).digest("hex") });
  }
  const expect = "v0=" + crypto.createHmac("sha256", secret).update(`v0:${req.get("x-zm-request-timestamp")}:${raw}`).digest("hex");
  const given = req.get("x-zm-signature") || "";
  if (given.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expect))) return res.status(401).end();
  res.json({ ok: true });
  (async () => {
    const o = ev.payload?.object || {};
    const mid = String(o.id || "");
    if (ev.event === "recording.completed" && mid) {
      const sess = await db.one("select id from remote_sessions where zoom_meeting_id=$1", [mid]);
      if (sess) hashRecording(sess.id, o.recording_files, ev.download_token).catch((e) => console.error("Fingerprint job:", e.message));
      await db.run("update remote_sessions set recording_url=$2, recording_passcode=$3, recording_ref=$4, recording_at=now(), checklist = coalesce(checklist,'{}'::jsonb) where zoom_meeting_id=$1", [mid, o.share_url || null, o.password || null, String(o.uuid || "")]);
    }
    if (ev.event === "meeting.ended" && mid) {
      await db.run(`update remote_sessions set session_ended_at=coalesce(session_ended_at, now()), paper_due_at=coalesce(paper_due_at, now() + interval '3 days'), status = case when status in ('scheduled','invited') then 'awaiting_paper' else status end where zoom_meeting_id=$1`, [mid]);
    }
  })().catch((e) => console.error("Zoom webhook:", e.message));
}
function personaWebhook(req, res) {
  const secret = E.PERSONA_WEBHOOK_SECRET;
  if (!secret) return res.status(503).end();
  const raw = req.body.toString("utf8");
  const parts = Object.fromEntries(String(req.get("persona-signature") || "").split(",").map((p) => p.split("=")));
  const expect = crypto.createHmac("sha256", secret).update(`${parts.t}.${raw}`).digest("hex");
  const sig = String(parts.v1 || "");
  if (!parts.t || sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return res.status(401).end();
  res.json({ ok: true });
  (async () => {
    const ev = JSON.parse(raw);
    const inq = ev.data?.attributes?.payload?.data;
    if (!inq || inq.type !== "inquiry") return;
    await db.run("update remote_sessions set persona_status=$2, persona_checked_at=now() where persona_inquiry_id=$1", [inq.id, inq.attributes?.status || null]);
  })().catch((e) => console.error("Persona webhook:", e.message));
}

/* ---------- routes ---------- */
function register(app, { requireAdmin }) {
  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { if (!e.status) console.error(e); res.status(e.status || 500).json({ error: e.status ? e.message : "Something went wrong." }); }
  };
  const load = async (req) => { const s = await get(Number(req.params.id) || 0); if (!s) throw bad("Session not found.", 404); return s; };

  app.get("/api/admin/remote", requireAdmin, wrap(async () => ({
    zoom: zoomOn(), zoomWebhook: !!E.ZOOM_WEBHOOK_SECRET, persona: personaOn(), personaWebhook: !!E.PERSONA_WEBHOOK_SECRET, checks: CHECKS,
    sessions: await (async () => {
      const rows = (await db.all("select * from remote_sessions order by coalesce(scheduled_at, created_at) desc limit 100")).map(view);
      const hs = await db.all("select * from remote_hashes where session_id = any($1::int[]) order by created_at", [rows.map((r) => r.id)]);
      const sl = await db.all("select * from remote_seals where session_id = any($1::int[])", [rows.map((r) => r.id)]);
      return rows.map((r) => ({ ...r, hashes: hs.filter((h) => h.session_id === r.id), seal: sl.find((x) => x.session_id === r.id) || null }));
    })(),
  })));
  app.get("/api/admin/remote-seals/verify", requireAdmin, wrap(async () => verifySeals()));
  app.post("/api/admin/remote/:id/seal", requireAdmin, wrap(async (req) => {
    const s = await load(req), b = req.body || {};
    if (b.tracking !== undefined) { const tr = str(b.tracking, 120); if (tr) await db.run("update remote_sessions set tracking=$2 where id=$1", [s.id, tr]); }
    const row = await sealSession(await get(s.id), req.admin?.email || "admin", str(b.carrier, 40));
    mail.deskNotice(`Sealed: ${row.session_ref}`, `Session ${row.session_ref} sealed.\nTracking: ${row.tracking}\nFingerprints: ${row.manifest.map((h) => `${h.kind} ${h.filename || ""} SHA-256 ${h.sha256}`).join("\n  ")}\nManifest SHA-256: ${row.manifest_sha256}\nSeal: ${row.seal_hash}\nPrevious seal: ${row.prev_seal_hash}\nSealed at: ${new Date(row.sealed_at).toISOString()}\n\nKeep this email as an independent, dated copy.`);
    return { seal: row };
  }));
  app.post("/api/admin/remote/:id/hashes", requireAdmin, wrap(async (req) => {
    const s = await load(req), b = req.body || {};
    const kind = KINDS.includes(b.kind) ? b.kind : "other", sha = String(b.sha256 || "").trim().toLowerCase();
    if (!HEX.test(sha)) throw bad("That doesn't look like a SHA-256 fingerprint (64 letters and numbers).");
    const dupe = await db.one("select id from remote_hashes where session_id=$1 and sha256=$2", [s.id, sha]);
    if (dupe) throw bad("That fingerprint is already saved for this session.");
    return { hash: await addHash(s.id, kind, str(b.filename, 200), Number(b.size) >= 0 ? Number(b.size) : null, sha, "manual") };
  }));
  // Creating a session also starts the ID check and emails the signer the Zoom and ID links, unless sendInvite is false.
  // A failed step never loses the session: it comes back as a warning and the card's buttons can retry it.
  app.post("/api/admin/remote", requireAdmin, wrap(async (req) => {
    const b = req.body || {};
    let s = await create(b);
    const warnings = [];
    if (b.sendInvite !== false) {
      if (personaOn() && (!b.idMethod || b.idMethod === "persona")) {
        try {
          const p = await personaStart(s);
          s = await db.one("update remote_sessions set persona_inquiry_id=$2,persona_link=$3,persona_status=$4,persona_checked_at=now(),id_method=coalesce(id_method,'persona') where id=$1 returning *", [s.id, p.id, p.link, p.status]);
        } catch (e) { warnings.push("The ID check link wasn't created: " + e.message); }
      }
      if (s.signer_email && s.zoom_join_url) {
        try { await invite(s, await getSettings()); s = await get(s.id); }
        catch (e) { warnings.push("The invite wasn't sent: " + e.message); }
      } else if (!s.signer_email) warnings.push("No signer email, so nothing was sent. Add one and use Send invite.");
      else warnings.push("No Zoom link yet, so the invite wasn't sent.");
    }
    return { session: view(s), warnings };
  }));
  app.post("/api/admin/remote/:id", requireAdmin, wrap(async (req) => {
    const s = await load(req), b = req.body || {}, sets = [], vals = [];
    const put = (col, v) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    for (const [k, col, max] of [["idMethod", "id_method", 40], ["witnessName", "witness_name", 120], ["tracking", "tracking", 120], ["notes", "notes", 2000], ["zoomUrl", "zoom_join_url", 400], ["docTitle", "doc_title", 200]]) if (b[k] !== undefined) put(col, str(b[k], max) || null);
    if (b.checklist && typeof b.checklist === "object") put("checklist", JSON.stringify(Object.fromEntries(CHECKS.map(([k]) => [k, !!b.checklist[k]]))));
    if (b.endSession) { put("session_ended_at", new Date()); if (!s.paper_due_at) put("paper_due_at", new Date(Date.now() + 3 * DAY)); put("status", "awaiting_paper"); }
    if (b.paperReceived) { put("paper_received_at", new Date()); put("status", "paper_received"); }
    if (b.complete) {
      const c = s.checklist || {};
      if (!s.paper_received_at && !b.paperReceived) throw bad("Mark the signed paper as received first.");
      const miss = CHECKS.filter(([k]) => !c[k]);
      if (miss.length) throw bad("Finish the checklist first: " + miss.map((m) => m[1]).join("; "));
      put("completed_at", new Date()); put("status", "completed");
    }
    if (!sets.length) return { session: view(s) };
    vals.push(s.id);
    return { session: view(await db.one(`update remote_sessions set ${sets.join(",")} where id=$${vals.length} returning *`, vals)) };
  }));
  app.post("/api/admin/remote/:id/zoom", requireAdmin, wrap(async (req) => {
    const s = await load(req);
    if (!zoomOn()) throw bad("Zoom isn't connected. Add the Zoom keys in Render, or paste a link.");
    if (!s.scheduled_at) throw bad("Set a date and time first.");
    const settings = await getSettings();
    const z = await zoomMeeting(`Notarization: ${s.signer_name}`, new Date(s.scheduled_at).toISOString(), settings.business.timezone);
    return { session: view(await db.one("update remote_sessions set zoom_meeting_id=$2,zoom_join_url=$3,zoom_start_url=$4,zoom_passcode=$5 where id=$1 returning *", [s.id, z.id, z.join, z.start, z.passcode])) };
  }));
  app.post("/api/admin/remote/:id/persona", requireAdmin, wrap(async (req) => {
    const s = await load(req);
    if (!personaOn()) throw bad("Persona isn't connected. Add the Persona keys in Render, or mark the ID check by hand.");
    const p = await personaStart(s);
    return { session: view(await db.one("update remote_sessions set persona_inquiry_id=$2,persona_link=$3,persona_status=$4,persona_checked_at=now(),id_method=coalesce(id_method,'persona') where id=$1 returning *", [s.id, p.id, p.link, p.status])) };
  }));
  app.post("/api/admin/remote/:id/persona/refresh", requireAdmin, wrap(async (req) => {
    const s = await load(req);
    if (!s.persona_inquiry_id) throw bad("No Persona check has been started.");
    const st = await personaRefresh(s.persona_inquiry_id);
    return { session: view(await db.one("update remote_sessions set persona_status=$2,persona_checked_at=now() where id=$1 returning *", [s.id, st])) };
  }));
  app.get("/api/admin/remote-storage", requireAdmin, wrap(async () => {
    if (!archive.r2On()) throw bad("Cloud storage isn't connected. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in Render.");
    return archive.selfTest();
  }));
  // Re-run the fingerprint and archive step: ask Zoom for the recording's files again (fresh download links).
  app.post("/api/admin/remote/:id/fingerprint", requireAdmin, wrap(async (req) => {
    const s = await load(req);
    if (!zoomOn()) throw bad("Zoom isn't connected.");
    const key = s.recording_ref || s.zoom_meeting_id;
    if (!key) throw bad("This session has no Zoom recording yet.");
    const enc = encodeURIComponent(/^\/|\/\//.test(key) ? encodeURIComponent(key) : key);
    const r = await fetch(`https://api.zoom.us/v2/meetings/${enc}/recordings`, { headers: { Authorization: `Bearer ${await zoomToken()}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw bad("Zoom wouldn't list the recording: " + (j.message || r.status) + ". Check the recording scopes on the Zoom app.", 502);
    const rows = (await hashRecording(s.id, j.recording_files, j.download_access_token)).length;
    return { fingerprinted: rows, session: view(await get(s.id)) };
  }));
  app.post("/api/admin/remote/:id/invite", requireAdmin, wrap(async (req) => {
    const s = await load(req);
    const ok = await invite(s, await getSettings());
    return { sent: ok, session: view(await get(s.id)) };
  }));
  app.get("/api/admin/remote/:id/declaration", requireAdmin, async (req, res) => {
    const s = await get(Number(req.params.id) || 0);
    if (!s) return res.status(404).send("Not found");
    const settings = await getSettings();
    res.type("html").send(declarationHtml({ ...s, notary_name: E.NOTARY_NAME || "Matthew Coleman" }, settings.business.timezone));
  });
  app.delete("/api/admin/remote/:id", requireAdmin, wrap(async (req) => { await db.run("delete from remote_sessions where id=$1 and completed_at is null", [Number(req.params.id) || 0]); return { ok: true }; }));
}

module.exports = { sealSession, verifySeals, register, startJob, zoomWebhook, personaWebhook, runAlerts, hashRecording, hashZoomFile, CHECKS };
