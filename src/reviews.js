// Google review requests: one email per completed job, sent a few hours after completion.
// Each email address is asked at most once per `repeatDays`, and anyone can opt out with one click.
const { db, getSettings, logEvent } = require("./db");
const { sign, verify } = require("./util");
const mail = require("./email");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const optoutUrl = (email) => `${mail.BASE}/reviews/optout?t=${encodeURIComponent(sign({ e: email.toLowerCase(), exp: Date.now() + 3 * 365 * 864e5 }))}`;

function message(b, settings) {
  const s = settings.reviews;
  const first = String(b.contact_name || "").trim().split(/\s+/)[0] || "there";
  const biz = settings.business.name;
  const out = optoutUrl(b.contact_email);
  const subject = `How did your signing with ${biz} go?`;
  const text = `Hi ${first},

Thanks for choosing ${biz} for your ${b.category.toLowerCase()} (${b.ref}). If we did a good job, would you leave us a quick Google review? It takes about a minute and helps other people find a notary they can trust.

Leave a review: ${s.googleUrl}

If anything wasn't right, just reply to this email or call ${settings.business.phone} and we'll make it right.

${biz}

Don't want these emails? ${out}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#14231d;line-height:1.5">
  <p>Hi ${esc(first)},</p>
  <p>Thanks for choosing ${esc(biz)} for your ${esc(b.category.toLowerCase())} (${esc(b.ref)}). If we did a good job, would you leave us a quick Google review? It takes about a minute and helps other people find a notary they can trust.</p>
  <p style="margin:24px 0"><a href="${esc(s.googleUrl)}" style="background:#a8751f;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">Leave a Google review</a></p>
  <p>If anything wasn't right, just reply to this email or call ${esc(settings.business.phone)} and we'll make it right.</p>
  <p>${esc(biz)}</p>
  <p style="font-size:12px;color:#6a7a72;margin-top:28px"><a href="${esc(out)}" style="color:#6a7a72">Don't send me review requests</a></p></div>`;
  return { subject, text, html };
}

let running = false;
async function run() {
  if (running) return 0;
  running = true;
  let sent = 0;
  try {
    const settings = await getSettings();
    const s = settings.reviews || {};
    if (!s.enabled || !s.googleUrl) return 0;
    const delay = Math.max(0, Number(s.delayHours) || 0);
    const repeat = Math.max(30, Number(s.repeatDays) || 180);
    // Only jobs completed in the last 14 days, so turning this on never emails old customers.
    const due = await db.all(`SELECT * FROM bookings WHERE status = 'completed' AND review_requested_at IS NULL
        AND completed_at <= now() - ($1::int * interval '1 hour') AND completed_at > now() - interval '14 days'
      ORDER BY completed_at LIMIT 50`, [delay]);
    for (const b of due) {
      // Claim the job first so two server runs can't both send.
      const claimed = await db.one("UPDATE bookings SET review_requested_at = now() WHERE id = $1 AND review_requested_at IS NULL RETURNING id", [b.id]);
      if (!claimed || !b.contact_email) continue;
      const email = b.contact_email.toLowerCase();
      if (await db.one("SELECT 1 FROM review_optouts WHERE email = $1", [email])) { await logEvent(b.id, "system", "Review request skipped: customer opted out"); continue; }
      if (await db.one("SELECT 1 FROM review_requests WHERE lower(email) = $1 AND sent_at > now() - ($2::int * interval '1 day')", [email, repeat])) {
        await logEvent(b.id, "system", `Review request skipped: already asked in the last ${repeat} days`);
        continue;
      }
      const m = message(b, settings);
      await mail.send({ to: b.contact_email, ...m });
      await db.run("INSERT INTO review_requests(booking_id, email) VALUES($1, $2)", [b.id, email]);
      await logEvent(b.id, "system", "Google review request emailed");
      sent++;
    }
  } finally { running = false; }
  return sent;
}

function startJob() {
  setTimeout(() => run().catch((e) => console.error("Review requests failed:", e.message)), 2 * 60 * 1000).unref();
  setInterval(() => run().catch((e) => console.error("Review requests failed:", e.message)), 15 * 60 * 1000).unref();
}

function register(app, { requireAdmin }) {
  app.get("/reviews/optout", async (req, res) => {
    const p = verify(String(req.query.t || ""));
    const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><link rel="stylesheet" href="/css/site.css"></head><body><main><section class="band"><div class="wrap" style="max-width:640px"><h1>${esc(title)}</h1><p class="lede" style="margin-top:12px">${body}</p><p style="margin-top:20px"><a href="/notary/">Back to MCC Solutions</a></p></div></section></main></body></html>`;
    if (!p || !p.e) return res.status(400).send(page("Link not valid", "This opt-out link is incomplete or expired. Reply to the email and we'll take you off the list."));
    await db.run("INSERT INTO review_optouts(email) VALUES($1) ON CONFLICT (email) DO NOTHING", [p.e]);
    res.send(page("You're unsubscribed", `We won't send review requests to ${esc(p.e)} again. You'll still get emails about your own bookings.`));
  });

  // Desk: see what was sent, and send one now for testing.
  app.get("/api/admin/reviews", requireAdmin, async (req, res) => {
    const rows = await db.all(`SELECT r.sent_at, r.email, b.ref FROM review_requests r LEFT JOIN bookings b ON b.id = r.booking_id ORDER BY r.id DESC LIMIT 50`);
    res.json({ sent: rows, optouts: (await db.one("SELECT COUNT(*)::int AS n FROM review_optouts")).n });
  });
  app.post("/api/admin/reviews/run", requireAdmin, async (req, res) => res.json({ sent: await run() }));
}

module.exports = { run, startJob, register, message };
