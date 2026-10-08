// Remote ink-signed sessions (N.J.A.C. 17:50-1.14(i)): Zoom meeting, Persona ID check, recording link,
// declaration, and the 3-day deadline for the signed paper to reach the notary.
// Every integration is optional: without keys the admin can paste a Zoom link and mark the ID check by hand.
// Whether a given ID method satisfies the rule is the notary's call; this tool records what was done.
const crypto = require("crypto");
const { db, getSettings } = require("./db");
const { str, emailOk } = require("./util");
const mail = require("./email");

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
    sessions: (await db.all("select * from remote_sessions order by coalesce(scheduled_at, created_at) desc limit 100")).map(view),
  })));
  app.post("/api/admin/remote", requireAdmin, wrap(async (req) => ({ session: view(await create(req.body || {})) })));
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

module.exports = { register, startJob, zoomWebhook, personaWebhook, runAlerts, CHECKS };
