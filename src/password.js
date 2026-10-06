// Password hashing (scrypt, salted) and the password rules, shared by admin, client and portal sign-in.
const crypto = require("crypto");
const MIN_PW = 12;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64url")}$${dk.toString("base64url")}`;
}
function checkPassword(pw, stored) {
  const [alg, salt, dk] = String(stored || "").split("$");
  const want = Buffer.from(dk || "", "base64url");
  const got = crypto.scryptSync(String(pw || ""), Buffer.from(salt || "", "base64url"), 64, { N: 16384, r: 8, p: 1 });
  return alg === "scrypt" && want.length === got.length && crypto.timingSafeEqual(want, got);
}
const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "admin", "iloveyou", "abc123", "monkey", "dragon"];
// `banned` is a list of strings the password must not contain (name, email name, company).
function passwordProblem(pw, banned = []) {
  const p = String(pw || "");
  if (p.length < MIN_PW) return `Use at least ${MIN_PW} characters. A few random words works well.`;
  if (p.length > 200) return "That password is too long.";
  const low = p.toLowerCase();
  if (banned.some((b) => b && String(b).length >= 4 && low.includes(String(b).toLowerCase()))) return "Don't put your name, email or the company name in the password.";
  if (COMMON.some((c) => low.includes(c))) return "That's too easy to guess. Pick something less common.";
  if (new Set(p).size < 6) return "Use a more varied password.";
  return null;
}
module.exports = { MIN_PW, hashPassword, checkPassword, passwordProblem };
