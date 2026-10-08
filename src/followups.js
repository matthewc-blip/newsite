// Quick callback requests, and one reminder email to people who start a booking and don't finish.
// The booking form says a reminder may be sent. Each person gets at most one per 30 days, and can opt out in one click.
const { db, getSettings } = require("./db");
const { sign, verify, rateLimit, str, emailOk, phoneOk } = require("./util");
const mail = require("./email");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const optoutUrl = (email) => `${mail.BASE}/followups/optout?t=${encodeURIComponent(sign({ e: email.toLowerCase(), exp: Date.now() + 3 * 365 * 864e5 }))}`;
const SVC = { mobile: "mobile notary appointment", ron: "remote online notarization session", rin: "remote ink-signed notarization session" };

function message(d, settings) {
  const first = String(d.name || "").trim().split(/\s+/)[0] || "there";
  const biz = settings.business.name, phone = settings.business.phone, out = optoutUrl(d.email);
  const what = SVC[d.service] || "appointment";
  const link = `${mail.BASE}/notary/#order`;
  const subject = "Still need a notary? Finish your request";
  const text = `Hi ${first},

You started requesting a ${what} with ${biz} but didn't finish. If you still need it, you can pick up where you left off here:

${link}

Or call ${phone} and a real person will take your details. No appointment time is guaranteed until you receive a confirmation email from us.

This is the only reminder we'll send. If you don't need us, ignore this email.

${biz}

Don't want emails like this? ${out}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#14231d;line-height:1.5">
  <p>Hi ${esc(first)},</p>
  <p>You started requesting a ${esc(what)} with ${esc(biz)} but didn't finish. If you still need it, you can pick up where you left off.</p>
  <p style="margin:24px 0"><a href="${esc(link)}" style="background:#a8751f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">Finish my request</a></p>
  <p>Or call ${esc(phone)} and a real person will take your details. No appointment time is guaranteed until you receive a confirmation email from us.</p>
  <p>This is the only reminder we'll send. If you don't need us, ignore this email.</p><p>${esc(biz)}</p>
  <p style="font-size:12px;color:#6a7a72;margin-top:28px"><a href="${esc(out)}" style="color:#6a7a72">Don't send me emails like this</a></p></div>`;
  return { subject, text, html };
}

let running = false;
async function run() {
  if (running) return 0; running = true; let sent = 0;
  try {
    const settings = await getSettings(); const f = settings.followups || {};
    if (!f.enabled) return 0;
    const delay = Math.max(1, Number(f.delayHours) || 2);
    const due = await db.all(`SELECT * FROM booking_drafts WHERE reminded_at IS NULL AND created_at <= now() - ($1::int * interval '1 hour') AND created_at > now() - interval '3 days' ORDER BY created_at LIMIT 30`, [delay]);
    for (const d of due) {
      const claimed = await db.one("UPDATE booking_drafts SET reminded_at = now() WHERE email = $1 AND reminded_at IS NULL RETURNING email", [d.email]);
      if (!claimed) continue;
      if (await db.one("SELECT 1 FROM followup_optouts WHERE email = $1", [d.email])) continue;
      // They finished (or someone else did for them): no reminder.
      if (await db.one("SELECT 1 FROM bookings WHERE lower(contact_email) = $1 AND created_at >= $2::timestamptz - interval '1 hour'", [d.email, d.created_at])) continue;
      await mail.send({ to: d.email, ...message(d, settings) }); sent++;
    }
    await db.run("DELETE FROM booking_drafts WHERE created_at < now() - interval '60 days'");
  } finally { running = false; }
  return sent;
}
function startJob() {
  setTimeout(() => run().catch((e) => console.error("Follow-ups failed:", e.message)), 3 * 60 * 1000).unref();
  setInterval(() => run().catch((e) => console.error("Follow-ups failed:", e.message)), 15 * 60 * 1000).unref();
}

function register(app, { requireAdmin }) {
  // Saved when the contact step of the booking form is completed.
  app.post("/api/booking-draft", rateLimit(20, 10 * 60000), async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(400).json({ error: "Rejected" });
    const email = str(b.email, 160).toLowerCase();
    if (!emailOk(email)) return res.status(400).json({ error: "Invalid email" });
    const service = ["mobile", "ron", "rin"].includes(b.service) ? b.service : null;
    await db.run(`INSERT INTO booking_drafts(email,name,service,category) VALUES($1,$2,$3,$4)
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, service = EXCLUDED.service, category = EXCLUDED.category,
        created_at = CASE WHEN booking_drafts.reminded_at IS NULL OR booking_drafts.reminded_at < now() - interval '30 days' THEN now() ELSE booking_drafts.created_at END,
        reminded_at = CASE WHEN booking_drafts.reminded_at < now() - interval '30 days' THEN NULL ELSE booking_drafts.reminded_at END`,
      [email, str(b.name, 120), service, str(b.category, 80)]);
    res.json({ ok: true });
  });

  // "Have us call you": a name, a phone number and a line about what they need.
  app.post("/api/callback", rateLimit(5, 10 * 60000), async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(400).json({ error: "Rejected" });
    const name = str(b.name, 120), phone = str(b.phone, 40), need = str(b.need, 400), email = str(b.email, 160);
    if (!name) return res.status(400).json({ error: "Enter your name." });
    if (!phoneOk(phone)) return res.status(400).json({ error: "Enter a phone number with area code." });
    if (email && !emailOk(email)) return res.status(400).json({ error: "That email doesn't look right. Leave it blank or fix it." });
    const page = str(b.page, 120);
    await db.run("INSERT INTO messages(name,email,topic,message) VALUES($1,$2,$3,$4)", [name, email || "(phone only)", "Callback request", `Call ${name} at ${phone}.${need ? `\n\nThey need: ${need}` : ""}${page ? `\n\nFrom page: ${page}` : ""}`]);
    mail.deskNotice("Callback request", `${name} · ${phone}${email ? ` · ${email}` : ""}\n\n${need || "(no details)"}\n\nPage: ${page || "unknown"}`);
    res.status(201).json({ ok: true });
  });

  app.get("/followups/optout", async (req, res) => {
    const p = verify(String(req.query.t || ""));
    const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><link rel="stylesheet" href="/css/site.css"></head><body><main><section class="band"><div class="wrap" style="max-width:640px"><h1>${esc(title)}</h1><p class="lede" style="margin-top:12px">${body}</p><p style="margin-top:20px"><a href="/notary/">Back to MCC Solutions</a></p></div></section></main></body></html>`;
    if (!p || !p.e) return res.status(400).send(page("Link not valid", "This link is incomplete or expired. Reply to the email and we'll take you off the list."));
    await db.run("INSERT INTO followup_optouts(email) VALUES($1) ON CONFLICT (email) DO NOTHING", [p.e]);
    await db.run("DELETE FROM booking_drafts WHERE email = $1", [p.e]);
    res.send(page("You're unsubscribed", `We won't send reminders to ${esc(p.e)} again.`));
  });
  app.post("/api/admin/followups/run", requireAdmin, async (req, res) => res.json({ sent: await run() }));
}
module.exports = { run, startJob, register, message };
