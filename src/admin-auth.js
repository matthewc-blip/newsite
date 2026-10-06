// Dashboard sign-in. One fixed owner email; the password hash and passkey live in the database, not in an environment variable.
// Sign in = email + password, then a passkey. First-time setup and password resets go through a link emailed to the owner address,
// which is the root of trust (protect that mailbox with two-step sign-in). A lost passkey is cleared in Supabase (see schema.sql).
const crypto = require("crypto");
const { db } = require("./db");
const { str, emailOk, sign, verify, cookie, rateLimit } = require("./util");
const passkeys = require("./passkeys");
const mail = require("./email");

const ADMIN_EMAIL = "matthewc@mcc-solutionsnj.com";
const ADMIN_NAME = "Matthew Coleman";
const KIND = "admin";
const MIN_PW = 12;
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
const { fail, wrap } = passkeys.core;

/* ----- password hashing (scrypt, salted) ----- */
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64url")}$${dk.toString("base64url")}`;
}
function checkPassword(pw, stored) {
  const [alg, salt, dk] = String(stored || "").split("$");
  const want = Buffer.from(dk || "", "base64url");
  const got = crypto.scryptSync(pw, Buffer.from(salt || "", "base64url"), 64, { N: 16384, r: 8, p: 1 });
  return alg === "scrypt" && want.length === got.length && crypto.timingSafeEqual(want, got);
}
const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "admin", "iloveyou", "abc123", "monkey", "dragon"];
function passwordProblem(pw) {
  const p = String(pw || "");
  if (p.length < MIN_PW) return `Use at least ${MIN_PW} characters. A few random words works well.`;
  if (p.length > 200) return "That password is too long.";
  const low = p.toLowerCase();
  if (low.includes("matthewc") || low.includes("mcc-solutions") || low.includes("mccsolutions")) return "Don't put your name or the company name in the password.";
  if (COMMON.some((c) => low.includes(c))) return "That's too easy to guess. Pick something less common.";
  if (new Set(p).size < 6) return "Use a more varied password.";
  return null;
}

/* ----- the single admin row ----- */
async function row() {
  await db.run("INSERT INTO admin_users(email) VALUES($1) ON CONFLICT (email) DO NOTHING", [ADMIN_EMAIL]);
  return db.one("SELECT * FROM admin_users WHERE email = $1", [ADMIN_EMAIL]);
}
const subject = (a) => ({ id: a.id, name: ADMIN_NAME, email: a.email });

/* ----- cookies: full session, password-checked (waiting for passkey), setup (link opened) ----- */
const COOKIES = { full: "mcc_admin", pre: "mcc_admin_pre", setup: "mcc_admin_setup" };
const TTL = { full: 12 * 3600, pre: 5 * 60, setup: 15 * 60 };
function put(req, res, which, a) {
  res.append("Set-Cookie", `${COOKIES[which]}=${sign({ adm: 1, w: which, ep: a.session_epoch, exp: Date.now() + TTL[which] * 1000 })}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL[which]}${req.secure ? "; Secure" : ""}`);
}
const clear = (res, which) => res.append("Set-Cookie", `${COOKIES[which]}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
async function sessionFor(req, which) {
  const s = verify(cookie(req, COOKIES[which]));
  if (!s || s.adm !== 1 || s.w !== which) return null;
  const a = await row();
  return a.session_epoch === s.ep ? a : null;
}

async function requireAdmin(req, res, next) {
  const a = await sessionFor(req, "full");
  if (!a) return res.status(401).json({ error: "Sign in to the dashboard." });
  if (req.method !== "GET" && req.get("X-Requested-With") !== "mcc-admin") return res.status(403).json({ error: "Forbidden" });
  req.admin = a;
  next();
}

async function sendSetupLink(req) {
  const a = await row();
  const raw = crypto.randomBytes(32).toString("base64url");
  await db.run("DELETE FROM admin_setup_tokens WHERE admin_id = $1", [a.id]);
  await db.run("INSERT INTO admin_setup_tokens(token_hash, admin_id, expires_at) VALUES($1,$2, now() + interval '30 minutes')", [hash(raw), a.id]);
  const link = `${mail.BASE}/admin/?setup=${raw}`;
  const ok = await mail.send({ to: ADMIN_EMAIL, subject: "Set up your MCC dashboard sign-in",
    text: `Use this link to set your dashboard password and passkey. It works once and expires in 30 minutes.\n\n${link}\n\nIf you didn't ask for this, ignore it. Nothing changes until the link is used.` });
  // If email isn't working, the link goes to the server log so the owner (who can open the host's logs) can still get in.
  if (ok !== true) console.log(`[admin setup link] ${link}`);
}

function register(app) {
  const J = (fn) => wrap(fn);
  const rl = (n, mins) => rateLimit(n, mins * 60000);

  app.get("/api/admin/auth/state", async (req, res) => {
    const a = await row();
    res.json({ email: ADMIN_EMAIL, ready: !!a.password_hash && (await passkeys.countFor(KIND, a.id)) > 0 });
  });

  // Emailed to the fixed owner address only; the answer is the same whatever happens.
  app.post("/api/admin/auth/request-setup", rl(3, 60), async (req, res) => {
    const a = await row();
    const last = await db.one("SELECT created_at FROM admin_setup_tokens WHERE admin_id = $1 ORDER BY created_at DESC LIMIT 1", [a.id]);
    if (!last || Date.now() - new Date(last.created_at).getTime() > 60000) await sendSetupLink(req).catch((e) => console.error("Admin setup link:", e.message));
    res.json({ ok: true });
  });

  // Step 1 of setup/reset: the emailed link plus a new password.
  app.post("/api/admin/auth/setup/password", rl(10, 15), J(async (req, res) => {
    const t = str(req.body.token, 100), pw = String(req.body.password || "");
    const bad = passwordProblem(pw);
    if (bad) throw fail(400, bad);
    const tok = t && (await db.one("SELECT * FROM admin_setup_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()", [hash(t)]));
    if (!tok) throw fail(401, "That setup link has expired or was already used. Request a new one.");
    await db.run("UPDATE admin_setup_tokens SET used_at = now() WHERE token_hash = $1", [tok.token_hash]);
    const a = await db.one("UPDATE admin_users SET password_hash = $1, password_set_at = now(), session_epoch = session_epoch + 1, failed_logins = 0, locked_until = NULL WHERE id = $2 RETURNING *", [hashPassword(pw), tok.admin_id]);
    clear(res, "full"); clear(res, "pre");
    const needsKey = (await passkeys.countFor(KIND, a.id)) === 0;
    if (needsKey) put(req, res, "setup", a); // may now register the first passkey
    return { ok: true, needsPasskey: needsKey };
  }));

  // Sign in, step 1: email and password.
  app.post("/api/admin/login", rl(8, 15), J(async (req, res) => {
    const email = str(req.body.email, 200).toLowerCase(), pw = String(req.body.password || "").slice(0, 200);
    const a = await row();
    const generic = fail(401, "Wrong email or password.");
    if (a.locked_until && new Date(a.locked_until) > new Date()) throw fail(429, "Too many wrong attempts. Try again in a few minutes.");
    const good = a.password_hash ? checkPassword(pw, a.password_hash) : (checkPassword(pw, "scrypt$AAAA$AAAA"), false); // same work either way
    if (email !== ADMIN_EMAIL || !good) {
      const f = a.failed_logins + 1;
      await db.run("UPDATE admin_users SET failed_logins = $1, locked_until = CASE WHEN $1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END WHERE id = $2", [f, a.id]);
      throw generic;
    }
    await db.run("UPDATE admin_users SET failed_logins = 0, locked_until = NULL WHERE id = $1", [a.id]);
    if ((await passkeys.countFor(KIND, a.id)) === 0) throw fail(403, "Your passkey isn't set up. Request a setup link below.", "setup_needed");
    put(req, res, "pre", a);
    return { ok: true, next: "passkey" };
  }));

  app.post("/api/admin/logout", (req, res) => { clear(res, "full"); clear(res, "pre"); clear(res, "setup"); res.json({ ok: true }); });

  /* ----- passkey steps ----- */
  const mfa = "/api/admin/mfa";
  const ctx = async (req, res, next) => {
    if (req.method !== "GET" && req.get("X-Requested-With") !== "mcc-admin") return res.status(403).json({ error: "Forbidden" });
    for (const which of ["full", "pre", "setup"]) { const a = await sessionFor(req, which); if (a) { req.admin = a; req.stage = which; return next(); } }
    res.status(401).json({ error: "Sign in first.", code: "signin" });
  };
  app.get(mfa + "/status", ctx, async (req, res) => res.json({ stage: req.stage, name: ADMIN_NAME, email: ADMIN_EMAIL, passkeys: await passkeys.list(KIND, req.admin.id), verified: req.stage === "full" }));
  const limit = rl(30, 15);
  const mayAdd = async (req) => req.stage === "full" || (req.stage === "setup" && (await passkeys.countFor(KIND, req.admin.id)) === 0);
  app.post(mfa + "/register/options", ctx, limit, J(async (req) => { if (!(await mayAdd(req))) throw fail(403, "Confirm your passkey first."); return passkeys.core.regOptions(req, KIND, subject(req.admin), true); }));
  app.post(mfa + "/register/verify", ctx, limit, J(async (req, res) => {
    if (!(await mayAdd(req))) throw fail(403, "Confirm your passkey first.");
    await passkeys.core.regVerify(req, KIND, subject(req.admin), true);
    if (req.stage === "setup") { clear(res, "setup"); put(req, res, "full", req.admin); }
    return { ok: true };
  }));
  app.post(mfa + "/auth/options", ctx, limit, J(async (req) => { if (req.stage !== "pre") throw fail(403, "Sign in with your password first."); return passkeys.core.authOptions(req, KIND, subject(req.admin)); }));
  app.post(mfa + "/auth/verify", ctx, limit, J(async (req, res) => {
    if (req.stage !== "pre") throw fail(403, "Sign in with your password first.");
    await passkeys.core.authVerify(req, KIND, subject(req.admin));
    clear(res, "pre"); put(req, res, "full", req.admin);
    return { ok: true };
  }));
  app.delete(mfa + "/passkeys/:id", ctx, J(async (req) => {
    if (req.stage !== "full") throw fail(403, "Sign in first.");
    if ((await passkeys.countFor(KIND, req.admin.id)) <= 1) throw fail(400, "Keep at least one passkey, or you'd be locked out. Add another first.");
    await passkeys.core.removeKey(KIND, req.admin.id, req.params.id); return { ok: true };
  }));

  /* ----- change password (signed in) ----- */
  app.post("/api/admin/auth/change-password", requireAdmin, rl(5, 15), J(async (req, res) => {
    const cur = String(req.body.current || ""), next = String(req.body.password || "");
    if (!checkPassword(cur, req.admin.password_hash)) throw fail(400, "Your current password is wrong.");
    const bad = passwordProblem(next);
    if (bad) throw fail(400, bad);
    const a = await db.one("UPDATE admin_users SET password_hash = $1, password_set_at = now(), session_epoch = session_epoch + 1 WHERE id = $2 RETURNING *", [hashPassword(next), req.admin.id]);
    put(req, res, "full", a);
    return { ok: true };
  }));
}

module.exports = { requireAdmin, register, ADMIN_EMAIL };
