// Passkeys (WebAuthn) as the required second factor for client users and portal users (notaries, witnesses, process servers).
// Sign-in is the emailed link plus a passkey. SMS codes are not offered. Set REQUIRE_PASSKEYS=0 in the environment to switch the requirement
// off in an emergency (everyone then signs in with the link alone, as before).
const sw = require("@simplewebauthn/server");
const { db } = require("./db");
const { str, sign, verify, cookie, setCookie, rateLimit } = require("./util");

const REQUIRED = process.env.REQUIRE_PASSKEYS !== "0";
const DAY = 86400000;
const RP_NAME = "MCC Solutions";

function rp(req) {
  // PUBLIC_URL decides the site address; without it, fall back to the address this request came in on.
  const pub = new URL(process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`);
  const id = process.env.WEBAUTHN_RP_ID || pub.hostname.replace(/^www\./, "");
  const origins = process.env.WEBAUTHN_ORIGINS ? process.env.WEBAUTHN_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
    : id === "localhost" ? [pub.origin] : [`https://${id}`, `https://www.${id}`];
  return { id, origins };
}

const KINDS = {
  client: { cookie: "mcc_client", idKey: "uid", base: "/api/client/mfa", header: "mcc-client",
    load: (id) => db.one("SELECT u.id, u.name, u.email FROM client_users u JOIN client_accounts a ON a.id = u.account_id WHERE u.id = $1 AND u.active = 1 AND a.active = 1", [id]) },
  portal: { cookie: "mcc_notary", idKey: "nid", base: "/api/portal/mfa", header: "mcc-portal",
    load: (id) => db.one("SELECT id, name, email FROM notaries WHERE id = $1 AND active = 1", [id]) },
};

// Cookie set after the emailed link: a short session until the passkey is confirmed (when passkeys are required).
function loginCookie(req, res, kind, id) {
  const K = KINDS[kind];
  const mfa = REQUIRED ? 0 : 1;
  const ttl = mfa ? 30 * DAY : 12 * 3600 * 1000;
  setCookie(req, res, K.cookie, sign({ [K.idKey]: id, mfa, exp: Date.now() + ttl }), Math.round(ttl / 1000));
}
// True when a signed session may use the portal (passkey confirmed, or passkeys not required).
const sessionOk = (s) => !REQUIRED || !!(s && s.mfa);
const mfaError = { error: "Confirm your passkey to continue.", code: "mfa_required" };

const list = (kind, id) => db.all("SELECT id, name, created_at, last_used_at FROM passkeys WHERE kind = $1 AND subject_id = $2 ORDER BY created_at", [kind, id]);
const countFor = async (kind, id) => (await db.one("SELECT COUNT(*)::int AS n FROM passkeys WHERE kind = $1 AND subject_id = $2", [kind, id])).n;
const resetFor = (kind, id) => db.run("DELETE FROM passkeys WHERE kind = $1 AND subject_id = $2", [kind, id]);

/* ----- core steps, shared by the portal routes below and the admin sign-in (src/admin-auth.js) ----- */
const fail = (status, message, code) => Object.assign(new Error(message), { status, code });
const mkState = (kind, id, purpose, challenge) => sign({ k: kind, id, p: purpose, ch: challenge, exp: Date.now() + 5 * 60000 });
const readState = (body, kind, id, purpose) => { const s = verify(body && body.state); return s && s.k === kind && s.id === id && s.p === purpose ? s : null; };
const tx = (c) => (c.transports ? c.transports.split(",") : undefined);

async function regOptions(req, kind, subject, mayAdd) {
  const existing = await db.all("SELECT credential_id, transports FROM passkeys WHERE kind = $1 AND subject_id = $2", [kind, subject.id]);
  if (existing.length && !mayAdd) throw fail(403, "Confirm one of your existing passkeys before adding another.");
  const o = await sw.generateRegistrationOptions({
    rpName: RP_NAME, rpID: rp(req).id, userName: subject.email, userDisplayName: subject.name || subject.email,
    userID: new TextEncoder().encode(`${kind}:${subject.id}`), attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: tx(c) })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
  return { options: o, state: mkState(kind, subject.id, "reg", o.challenge) };
}
async function regVerify(req, kind, subject, mayAdd) {
  const st = readState(req.body, kind, subject.id, "reg");
  if (!st) throw fail(400, "That request expired. Start again.");
  if ((await countFor(kind, subject.id)) && !mayAdd) throw fail(403, "Confirm one of your existing passkeys before adding another.");
  let v;
  try { v = await sw.verifyRegistrationResponse({ response: req.body.response, expectedChallenge: st.ch, expectedOrigin: rp(req).origins, expectedRPID: rp(req).id, requireUserVerification: true }); }
  catch (e) { throw fail(400, "We couldn't verify that passkey. " + String(e.message || "").slice(0, 160)); }
  if (!v.verified || !v.registrationInfo) throw fail(400, "We couldn't verify that passkey.");
  const c = v.registrationInfo.credential;
  try {
    await db.run("INSERT INTO passkeys(kind, subject_id, credential_id, public_key, counter, transports, name) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [kind, subject.id, c.id, Buffer.from(c.publicKey).toString("base64url"), c.counter || 0, (c.transports || (req.body.response.response && req.body.response.response.transports) || []).join(",") || null, str(req.body.name, 60) || "Passkey"]);
  } catch (e) { if (e.code === "23505") throw fail(400, "That passkey is already registered."); throw e; }
}
async function authOptions(req, kind, subject) {
  const creds = await db.all("SELECT credential_id, transports FROM passkeys WHERE kind = $1 AND subject_id = $2", [kind, subject.id]);
  if (!creds.length) throw fail(400, "No passkey on this account yet.", "no_passkey");
  const o = await sw.generateAuthenticationOptions({ rpID: rp(req).id, userVerification: "required", allowCredentials: creds.map((c) => ({ id: c.credential_id, transports: tx(c) })) });
  return { options: o, state: mkState(kind, subject.id, "auth", o.challenge) };
}
async function authVerify(req, kind, subject) {
  const st = readState(req.body, kind, subject.id, "auth");
  if (!st) throw fail(400, "That request expired. Start again.");
  const row = await db.one("SELECT * FROM passkeys WHERE kind = $1 AND subject_id = $2 AND credential_id = $3", [kind, subject.id, str(req.body.response && req.body.response.id, 400)]);
  if (!row) throw fail(400, "That passkey isn't registered on this account.");
  let v;
  try { v = await sw.verifyAuthenticationResponse({ response: req.body.response, expectedChallenge: st.ch, expectedOrigin: rp(req).origins, expectedRPID: rp(req).id, requireUserVerification: true,
      credential: { id: row.credential_id, publicKey: Buffer.from(row.public_key, "base64url"), counter: Number(row.counter), transports: tx(row) } }); }
  catch (e) { throw fail(400, "We couldn't verify that passkey. " + String(e.message || "").slice(0, 160)); }
  if (!v.verified) throw fail(400, "We couldn't verify that passkey.");
  await db.run("UPDATE passkeys SET counter = $1, last_used_at = now() WHERE id = $2", [v.authenticationInfo.newCounter, row.id]);
}
async function removeKey(kind, subjectId, id) {
  const n = await countFor(kind, subjectId);
  if (REQUIRED && n <= 1) throw fail(400, "Keep at least one passkey, or you'd be locked out. Add another first.");
  await db.run("DELETE FROM passkeys WHERE id = $1 AND kind = $2 AND subject_id = $3", [Number(id) || 0, kind, subjectId]);
}
const wrap = (fn) => async (req, res) => {
  try { res.json(await fn(req, res)); }
  catch (e) { if (!e.status) throw e; res.status(e.status).json({ error: e.message, code: e.code }); }
};

function mount(app, kind) {
  const K = KINDS[kind];
  const session = (req) => { const s = verify(cookie(req, K.cookie)); return s && s[K.idKey] ? s : null; };
  async function auth(req, res, next) {
    const s = session(req);
    if (!s) return res.status(401).json({ error: "Sign in with your emailed link first." });
    if (req.method !== "GET" && req.get("X-Requested-With") !== K.header) return res.status(403).json({ error: "Forbidden" });
    const subject = await K.load(s[K.idKey]);
    if (!subject) return res.status(401).json({ error: "This account is inactive. Contact the desk." });
    req.mfaSess = s; req.subject = subject;
    next();
  }
  const upgrade = (req, res) => setCookie(req, res, K.cookie, sign({ [K.idKey]: req.subject.id, mfa: 1, exp: Date.now() + 30 * DAY }), 30 * 86400);
  const limit = rateLimit(30, 15 * 60000);

  app.get(K.base + "/status", auth, async (req, res) => {
    res.json({ required: REQUIRED, verified: sessionOk(req.mfaSess), name: req.subject.name, email: req.subject.email, passkeys: await list(kind, req.subject.id) });
  });
  app.post(K.base + "/register/options", auth, limit, wrap((req) => regOptions(req, kind, req.subject, sessionOk(req.mfaSess))));
  app.post(K.base + "/register/verify", auth, limit, wrap(async (req, res) => { await regVerify(req, kind, req.subject, sessionOk(req.mfaSess)); upgrade(req, res); return { ok: true }; }));
  app.post(K.base + "/auth/options", auth, limit, wrap((req) => authOptions(req, kind, req.subject)));
  app.post(K.base + "/auth/verify", auth, limit, wrap(async (req, res) => { await authVerify(req, kind, req.subject); upgrade(req, res); return { ok: true }; }));
  app.delete(K.base + "/passkeys/:id", auth, wrap(async (req) => {
    if (!sessionOk(req.mfaSess)) throw fail(403, mfaError.error, mfaError.code);
    await removeKey(kind, req.subject.id, req.params.id); return { ok: true };
  }));
}

module.exports = { REQUIRED, mount, loginCookie, sessionOk, mfaError, countFor, resetFor, list, core: { regOptions, regVerify, authOptions, authVerify, removeKey, fail, wrap } };
