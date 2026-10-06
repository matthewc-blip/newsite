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
  const state = (req, purpose, challenge) => sign({ k: kind, id: req.subject.id, p: purpose, ch: challenge, exp: Date.now() + 5 * 60000 });
  const readState = (req, purpose) => { const s = verify(req.body && req.body.state); return s && s.k === kind && s.id === req.subject.id && s.p === purpose ? s : null; };
  const limit = rateLimit(30, 15 * 60000);

  app.get(K.base + "/status", auth, async (req, res) => {
    const passkeys = await list(kind, req.subject.id);
    res.json({ required: REQUIRED, verified: sessionOk(req.mfaSess), name: req.subject.name, email: req.subject.email, passkeys });
  });

  app.post(K.base + "/register/options", auth, limit, async (req, res) => {
    const existing = await db.all("SELECT credential_id, transports FROM passkeys WHERE kind = $1 AND subject_id = $2", [kind, req.subject.id]);
    if (existing.length && !sessionOk(req.mfaSess)) return res.status(403).json({ error: "Confirm one of your existing passkeys before adding another." });
    const o = await sw.generateRegistrationOptions({
      rpName: RP_NAME, rpID: rp(req).id, userName: req.subject.email, userDisplayName: req.subject.name || req.subject.email,
      userID: new TextEncoder().encode(`${kind}:${req.subject.id}`), attestationType: "none",
      excludeCredentials: existing.map((c) => ({ id: c.credential_id, transports: c.transports ? c.transports.split(",") : undefined })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    });
    res.json({ options: o, state: state(req, "reg", o.challenge) });
  });

  app.post(K.base + "/register/verify", auth, limit, async (req, res) => {
    const st = readState(req, "reg");
    if (!st) return res.status(400).json({ error: "That request expired. Start again." });
    const existing = await countFor(kind, req.subject.id);
    if (existing && !sessionOk(req.mfaSess)) return res.status(403).json({ error: "Confirm one of your existing passkeys before adding another." });
    let v;
    try {
      v = await sw.verifyRegistrationResponse({ response: req.body.response, expectedChallenge: st.ch, expectedOrigin: rp(req).origins, expectedRPID: rp(req).id, requireUserVerification: true });
    } catch (e) { return res.status(400).json({ error: "We couldn't verify that passkey. " + String(e.message || "").slice(0, 160) }); }
    if (!v.verified || !v.registrationInfo) return res.status(400).json({ error: "We couldn't verify that passkey." });
    const c = v.registrationInfo.credential;
    const name = str(req.body.name, 60) || "Passkey";
    try {
      await db.run("INSERT INTO passkeys(kind, subject_id, credential_id, public_key, counter, transports, name) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [kind, req.subject.id, c.id, Buffer.from(c.publicKey).toString("base64url"), c.counter || 0, (c.transports || (req.body.response.response && req.body.response.response.transports) || []).join(",") || null, name]);
    } catch (e) { if (e.code === "23505") return res.status(400).json({ error: "That passkey is already registered." }); throw e; }
    upgrade(req, res);
    res.json({ ok: true });
  });

  app.post(K.base + "/auth/options", auth, limit, async (req, res) => {
    const creds = await db.all("SELECT credential_id, transports FROM passkeys WHERE kind = $1 AND subject_id = $2", [kind, req.subject.id]);
    if (!creds.length) return res.status(400).json({ error: "No passkey on this account yet.", code: "no_passkey" });
    const o = await sw.generateAuthenticationOptions({ rpID: rp(req).id, userVerification: "required",
      allowCredentials: creds.map((c) => ({ id: c.credential_id, transports: c.transports ? c.transports.split(",") : undefined })) });
    res.json({ options: o, state: state(req, "auth", o.challenge) });
  });

  app.post(K.base + "/auth/verify", auth, limit, async (req, res) => {
    const st = readState(req, "auth");
    if (!st) return res.status(400).json({ error: "That request expired. Start again." });
    const row = await db.one("SELECT * FROM passkeys WHERE kind = $1 AND subject_id = $2 AND credential_id = $3", [kind, req.subject.id, str(req.body.response && req.body.response.id, 400)]);
    if (!row) return res.status(400).json({ error: "That passkey isn't registered on this account." });
    let v;
    try {
      v = await sw.verifyAuthenticationResponse({ response: req.body.response, expectedChallenge: st.ch, expectedOrigin: rp(req).origins, expectedRPID: rp(req).id, requireUserVerification: true,
        credential: { id: row.credential_id, publicKey: Buffer.from(row.public_key, "base64url"), counter: Number(row.counter), transports: row.transports ? row.transports.split(",") : undefined } });
    } catch (e) { return res.status(400).json({ error: "We couldn't verify that passkey. " + String(e.message || "").slice(0, 160) }); }
    if (!v.verified) return res.status(400).json({ error: "We couldn't verify that passkey." });
    await db.run("UPDATE passkeys SET counter = $1, last_used_at = now() WHERE id = $2", [v.authenticationInfo.newCounter, row.id]);
    upgrade(req, res);
    res.json({ ok: true });
  });

  app.delete(K.base + "/passkeys/:id", auth, async (req, res) => {
    if (!sessionOk(req.mfaSess)) return res.status(403).json(mfaError);
    const n = await countFor(kind, req.subject.id);
    if (REQUIRED && n <= 1) return res.status(400).json({ error: "Keep at least one passkey, or you'd be locked out. Add another first." });
    await db.run("DELETE FROM passkeys WHERE id = $1 AND kind = $2 AND subject_id = $3", [Number(req.params.id) || 0, kind, req.subject.id]);
    res.json({ ok: true });
  });
}

module.exports = { REQUIRED, mount, loginCookie, sessionOk, mfaError, countFor, resetFor, list };
