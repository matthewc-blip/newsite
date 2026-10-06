// Passkeys (WebAuthn) as the required second factor for client users and portal users (notaries, witnesses, process servers).
// Sign-in is the emailed link plus a passkey. SMS codes are not offered. Set REQUIRE_PASSKEYS=0 in the environment to switch the requirement
// off in an emergency (everyone then signs in with the link alone, as before).
const sw = require("@simplewebauthn/server");
const { db } = require("./db");
const crypto = require("crypto");
const { str, sign, verify, cookie, setCookie, rateLimit } = require("./util");
const mail = require("./email");
const { hashPassword, checkPassword, passwordProblem } = require("./password");

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
  client: { cookie: "mcc_client", idKey: "uid", base: "/api/client/mfa", header: "mcc-client", table: "client_users", signin: "/api/client/signin",
    byEmail: (e) => db.one("SELECT u.* FROM client_users u JOIN client_accounts a ON a.id = u.account_id WHERE lower(u.email) = $1 AND u.active = 1 AND a.active = 1", [e]),
    load: (id) => db.one("SELECT u.id, u.name, u.email, u.password_hash, a.phone FROM client_users u JOIN client_accounts a ON a.id = u.account_id WHERE u.id = $1 AND u.active = 1 AND a.active = 1", [id]) },
  portal: { cookie: "mcc_notary", idKey: "nid", base: "/api/portal/mfa", header: "mcc-portal", table: "notaries", signin: "/api/portal/signin",
    byEmail: (e) => db.one("SELECT * FROM notaries WHERE lower(email) = $1 AND active = 1", [e]),
    load: (id) => db.one("SELECT id, name, email, phone, password_hash FROM notaries WHERE id = $1 AND active = 1", [id]) },
};

// Cookie set after the emailed link: it only proves the email address. `lnk` lets the person set a new password; `pw` stays 0 until they do.
function loginCookie(req, res, kind, id) {
  const K = KINDS[kind];
  setCookie(req, res, K.cookie, sign({ [K.idKey]: id, pw: 0, lnk: 1, mfa: REQUIRED ? 0 : 1, exp: Date.now() + 12 * 3600 * 1000 }), 12 * 3600);
}
// True when a signed session may use the portal: password entered or set, and the passkey confirmed (when passkeys are required).
const sessionOk = (s) => !!(s && s.pw && (!REQUIRED || s.mfa));
const mfaError = { error: "Finish signing in to continue.", code: "mfa_required" };

const list = (kind, id) => db.all("SELECT id, name, created_at, last_used_at FROM passkeys WHERE kind = $1 AND subject_id = $2 ORDER BY created_at", [kind, id]);
const countFor = async (kind, id) => (await db.one("SELECT COUNT(*)::int AS n FROM passkeys WHERE kind = $1 AND subject_id = $2", [kind, id])).n;
const resetFor = (kind, id) => db.run("DELETE FROM passkeys WHERE kind = $1 AND subject_id = $2", [kind, id]);

/* ----- backup codes: one-time codes that let someone who lost their passkey register a new one ----- */
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => { let c = ""; for (let i = 0; i < 10; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; return c.slice(0, 5) + "-" + c.slice(5); };
const normCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const scryptCode = (code, salt) => crypto.scryptSync(normCode(code), Buffer.from(salt, "base64url"), 32, { N: 16384, r: 8, p: 1 }).toString("base64url");
async function generateCodes(kind, id) {
  await db.run("DELETE FROM backup_codes WHERE kind = $1 AND subject_id = $2", [kind, id]);
  const out = [];
  for (let i = 0; i < 10; i++) {
    const code = newCode(), salt = crypto.randomBytes(16).toString("base64url");
    await db.run("INSERT INTO backup_codes(kind, subject_id, salt, code_hash) VALUES($1,$2,$3,$4)", [kind, id, salt, scryptCode(code, salt)]);
    out.push(code);
  }
  return out;
}
const codesLeft = async (kind, id) => (await db.one("SELECT COUNT(*)::int AS n FROM backup_codes WHERE kind = $1 AND subject_id = $2 AND used_at IS NULL", [kind, id])).n;
async function useCode(kind, id, code) {
  if (normCode(code).length !== 10) return false;
  const rows = await db.all("SELECT * FROM backup_codes WHERE kind = $1 AND subject_id = $2 AND used_at IS NULL", [kind, id]);
  let hit = null;
  for (const r of rows) { // check them all so timing doesn't reveal which one matched
    const a = Buffer.from(scryptCode(code, r.salt)), b = Buffer.from(r.code_hash);
    if (a.length === b.length && crypto.timingSafeEqual(a, b) && !hit) hit = r;
  }
  if (!hit) return false;
  const used = await db.one("UPDATE backup_codes SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id", [hit.id]);
  return !!used;
}
async function logEvent(kind, subject, action, method, note) {
  await db.run("INSERT INTO security_events(kind, subject_id, subject_label, action, method, note) VALUES($1,$2,$3,$4,$5,$6)",
    [kind, subject.id, `${subject.name || ""} <${subject.email || ""}>`.trim(), action, method || null, note || null]);
}
// Tell the account owner by email, so a hijack attempt reaches the real person.
async function alertOwner(subject, headline, detail) {
  if (!subject.email) return;
  mail.send({ to: subject.email, subject: `Security notice: ${headline}`,
    text: `Hi ${subject.name || "there"},\n\n${headline}.\n\n${detail}\n\nIf this wasn't you, call the desk right away${process.env.DESK_PHONE ? " at " + process.env.DESK_PHONE : ""} and we'll lock the account.\n\nMCC Solutions` }).catch(() => {});
}
const METHODS = { callback: "Called them back on the number on file", inbound_call: "They called from the number on file", other: "Other verification" };
// Desk-initiated reset after the identity check described in the dashboard. Requires a method (and a note for "other") and records it.
async function deskReset(kind, subject, { method, note }, adminLabel) {
  if (!METHODS[method]) throw fail(400, "Choose how you confirmed who they are.");
  const n = str(note, 400);
  if (method !== "other" && !subject.phone) throw fail(400, "There's no phone number on file for this person, so a phone check isn't possible. Don't reset the passkey. Add a verified phone number first, or choose another verification method and describe it.");
  if (method === "other" && n.length < 10) throw fail(400, "Describe how you verified them (at least a short sentence).");
  await resetFor(kind, subject.id);
  await db.run("DELETE FROM backup_codes WHERE kind = $1 AND subject_id = $2", [kind, subject.id]);
  await logEvent(kind, subject, "desk_reset", METHODS[method], n);
  await alertOwner(subject, "Your sign-in passkey was reset", `The MCC desk reset your passkey after verifying your identity (${METHODS[method].toLowerCase()}). You'll register a new passkey the next time you sign in.`);
}

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
  const upgrade = (req, res) => setCookie(req, res, K.cookie, sign({ [K.idKey]: req.subject.id, pw: 1, mfa: 1, exp: Date.now() + 30 * DAY }), 30 * 86400);
  const limit = rateLimit(30, 15 * 60000);
  const needPw = (req, res, next) => (req.mfaSess.pw ? next() : res.status(403).json({ error: "Set or enter your password first.", code: "password_required" }));

  // Set a password. Allowed straight after the emailed link (that is how a first password is set or a forgotten one reset),
  // or while signed in by giving the current password.
  app.post(K.base + "/password", auth, rateLimit(10, 15 * 60000), wrap(async (req, res) => {
    const pw = String(req.body.password || "");
    const had = !!req.subject.password_hash;
    const fresh = !!req.mfaSess.lnk && !req.mfaSess.pw;
    if (!fresh) {
      if (!sessionOk(req.mfaSess)) throw fail(403, mfaError.error, mfaError.code);
      if (!checkPassword(req.body.current, req.subject.password_hash)) throw fail(401, "Your current password isn't right.");
    }
    const bad = passwordProblem(pw, [req.subject.email.split("@")[0], req.subject.name, ...String(req.subject.name || "").split(/\s+/)]);
    if (bad) throw fail(400, bad);
    await db.run(`UPDATE ${K.table} SET password_hash = $1, password_set_at = now(), failed_logins = 0, locked_until = NULL WHERE id = $2`, [hashPassword(pw), req.subject.id]);
    await logEvent(kind, req.subject, had ? "password_changed" : "password_set", fresh ? "Emailed link" : "Current password", null);
    if (had) alertOwner(req.subject, "Your password was changed", "The password on your MCC Solutions account was just changed.");
    const ttl = req.mfaSess.mfa ? 30 * DAY : 12 * 3600 * 1000;
    setCookie(req, res, K.cookie, sign({ [K.idKey]: req.subject.id, pw: 1, mfa: req.mfaSess.mfa ? 1 : 0, exp: Date.now() + ttl }), Math.round(ttl / 1000));
    return { ok: true };
  }));
  app.get(K.base + "/status", auth, async (req, res) => {
    res.json({ required: REQUIRED, verified: sessionOk(req.mfaSess), pwDone: !!req.mfaSess.pw, passwordSet: !!req.subject.password_hash, name: req.subject.name, email: req.subject.email, passkeys: await list(kind, req.subject.id), backupCodesLeft: await codesLeft(kind, req.subject.id) });
  });
  app.post(K.base + "/register/options", auth, needPw, limit, wrap((req) => regOptions(req, kind, req.subject, sessionOk(req.mfaSess))));
  app.post(K.base + "/register/verify", auth, needPw, limit, wrap(async (req, res) => {
    const hadKeys = (await countFor(kind, req.subject.id)) > 0;
    await regVerify(req, kind, req.subject, sessionOk(req.mfaSess));
    upgrade(req, res);
    if (hadKeys) alertOwner(req.subject, "A new passkey was added to your account", "A new passkey was just registered on your MCC Solutions account.");
    const backupCodes = (await codesLeft(kind, req.subject.id)) === 0 ? await generateCodes(kind, req.subject.id) : null; // shown once
    return { ok: true, backupCodes };
  }));
  // Lost passkey: a backup code removes the old passkeys so a new one can be registered (the emailed link is still required to get here).
  app.post(K.base + "/recover", auth, needPw, rateLimit(5, 15 * 60000), wrap(async (req) => {
    if (!(await countFor(kind, req.subject.id))) throw fail(400, "There's no passkey to recover. Create one instead.");
    if (!(await useCode(kind, req.subject.id, req.body.code))) throw fail(401, "That backup code didn't work. Check it and try again, or contact the desk.");
    await resetFor(kind, req.subject.id);
    await db.run("DELETE FROM backup_codes WHERE kind = $1 AND subject_id = $2", [kind, req.subject.id]);
    await logEvent(kind, req.subject, "backup_code_recovery", "Backup code", null);
    alertOwner(req.subject, "Your passkey was reset with a backup code", "A backup code was used to remove your old passkey so a new one could be registered.");
    return { ok: true };
  }));
  app.post(K.base + "/backup-codes", auth, limit, wrap(async (req) => {
    if (!sessionOk(req.mfaSess)) throw fail(403, mfaError.error, mfaError.code);
    const codes = await generateCodes(kind, req.subject.id);
    await logEvent(kind, req.subject, "backup_codes_regenerated", null, null);
    return { ok: true, backupCodes: codes };
  }));
  app.post(K.base + "/auth/options", auth, needPw, limit, wrap((req) => authOptions(req, kind, req.subject)));
  app.post(K.base + "/auth/verify", auth, needPw, limit, wrap(async (req, res) => { await authVerify(req, kind, req.subject); upgrade(req, res); return { ok: true }; }));
  app.delete(K.base + "/passkeys/:id", auth, wrap(async (req) => {
    if (!sessionOk(req.mfaSess)) throw fail(403, mfaError.error, mfaError.code);
    await removeKey(kind, req.subject.id, req.params.id); return { ok: true };
  }));

  // Password sign-in (step one). The passkey is still step two. Same answer for unknown email, wrong password and no password yet.
  app.post(K.signin, rateLimit(10, 15 * 60000), wrap(async (req, res) => {
    const email = str(req.body.email, 160).toLowerCase();
    const generic = "That email and password don't match. First time, or forgot your password? Use the link option below.";
    const u = email && (await K.byEmail(email));
    if (!u || !u.password_hash) { crypto.scryptSync("x", "y", 64, { N: 16384, r: 8, p: 1 }); throw fail(401, generic); }
    if (u.locked_until && new Date(u.locked_until) > new Date()) throw fail(429, "Too many wrong attempts. Wait 15 minutes, or use the emailed link to reset your password.");
    if (!checkPassword(req.body.password, u.password_hash)) {
      const n = (u.failed_logins || 0) + 1;
      await db.run(`UPDATE ${K.table} SET failed_logins = $1, locked_until = $2 WHERE id = $3`, [n, n >= 5 ? new Date(Date.now() + 15 * 60000) : null, u.id]);
      if (n === 5) alertOwner(u, "Several wrong password attempts", "Someone entered the wrong password five times on your account, so sign-in is paused for 15 minutes.");
      throw fail(401, generic);
    }
    await db.run(`UPDATE ${K.table} SET failed_logins = 0, locked_until = NULL WHERE id = $1`, [u.id]);
    const ttl = 12 * 3600 * 1000;
    setCookie(req, res, K.cookie, sign({ [K.idKey]: u.id, pw: 1, mfa: REQUIRED ? 0 : 1, exp: Date.now() + ttl }), Math.round(ttl / 1000));
    return { ok: true };
  }));
}

module.exports = { REQUIRED, mount, loginCookie, sessionOk, mfaError, countFor, resetFor, list, deskReset, METHODS, logEvent, core: { regOptions, regVerify, authOptions, authVerify, removeKey, fail, wrap } };
