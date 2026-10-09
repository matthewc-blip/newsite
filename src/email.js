const nodemailer = require("nodemailer");
const { fmt } = require("./time");

const enabled = !!process.env.SMTP_HOST;
const transport = enabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_PORT) === "465",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

const FROM = process.env.MAIL_FROM || "MCC Solutions <no-reply@example.com>";
const DESK = process.env.DESK_EMAIL || "";
const BASE = (process.env.PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function send({ to, subject, text, html, attachments }) {
  if (!to) return false;
  if (!enabled) {
    console.log(`[email disabled] To: ${to} | ${subject}\n${text}\n`);
    return false;
  }
  try {
    await transport.sendMail({ from: FROM, to, subject, text, html, attachments });
    return true;
  } catch (e) {
    console.error("Email failed:", e.message);
    return false;
  }
}

const SERVICE_NAMES = { mobile: "Mobile notary", ron: "Remote Online Notarization (RON)", rin: "Remote Ink-Signed Notarization (RIN)" };

function summaryLines(b, settings) {
  const tz = b.customer_tz || settings.business.timezone;
  const lines = [
    ["Booking", b.ref],
    ["Service", SERVICE_NAMES[b.service]],
    ["Type", b.category],
    ["When", fmt(new Date(b.start_utc), tz)],
    ["Signers", String(b.signers)],
  ];
  if (b.service === "mobile") lines.push(["Location", [b.address, b.city, b.state, b.zip].filter(Boolean).join(", ")]);
  else lines.push(["Signer location", b.signer_location]);
  if (b.service === "rin" && b.mailing_address) lines.push(["Paper docs mailed to", b.mailing_address]);
  const extras = require("./addons").list(b);
  const chosen = extras.filter((a) => a.kind !== "fee"), fees = extras.filter((a) => a.kind === "fee");
  if (chosen.length) lines.push(["Add-ons", require("./addons").describe(chosen)]);
  if (fees.length) lines.push(["Extra fees", require("./addons").describe(fees)]);
  return lines;
}

function manageUrl(b) {
  return `${BASE}/manage.html?ref=${encodeURIComponent(b.ref)}&token=${encodeURIComponent(b.token)}`;
}

function wrapHtml(title, intro, lines, footer) {
  return `<div style="font-family:Arial,sans-serif;max-width:560px;color:#14231d">
  <h2 style="margin:0 0 8px">${esc(title)}</h2><p>${intro}</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">${lines
    .map(([k, v]) => `<tr><td style="padding:6px 10px 6px 0;color:#6a7a72;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`)
    .join("")}</table>
  <p style="margin-top:18px">${footer}</p></div>`;
}

const NEXT_STEPS = {
  mobile: "A coordinator will confirm your appointment and assign a notary. Have unexpired photo ID ready for every signer, and do not sign documents before the notary arrives.",
  ron: "A coordinator will confirm your session and email the secure signing link. You will need unexpired government photo ID and a device with a camera and microphone.",
  rin: "A coordinator will confirm eligibility for your state and document, then arrange for the paper documents to reach you. You will sign in ink on a video call, then ship the originals to the notary using the label we provide.",
};

async function bookingCreated(b, settings, ics) {
  const lines = summaryLines(b, settings);
  const link = manageUrl(b);
  const cardLine = settings.billing?.cardAtBooking === "required" && !b.client_account_id && !b.stripe_payment_method_id ? "To confirm your appointment, please save a card using the link below. It is charged only after your appointment, once the final fee is confirmed." : "";
  const text = `We received your request. Your requested time is not guaranteed until you receive a separate confirmation email from us.\n\n${cardLine ? cardLine + "\n\n" : ""}${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${NEXT_STEPS[b.service]}\n\nView, add a card or cancel: ${link}\nQuestions: ${settings.business.phone} / ${settings.business.email}`;
  await send({
    to: b.contact_email,
    subject: `Booking request received · ${b.ref}`,
    text,
    html: wrapHtml("Booking request received", esc("Your requested time is not guaranteed until you receive a separate confirmation email from us. " + (cardLine ? cardLine + " " : "") + NEXT_STEPS[b.service]), lines, `<a href="${esc(link)}">View or cancel this booking</a><br>Questions: ${esc(settings.business.phone)} · ${esc(settings.business.email)}`),
    attachments: ics ? [{ filename: `${b.ref}.ics`, content: ics, contentType: "text/calendar" }] : undefined,
  });
  await send({
    to: DESK,
    subject: `New ${b.service.toUpperCase()} booking ${b.ref} · ${b.category}`,
    text: `${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\nContact: ${b.contact_name} · ${b.contact_phone} · ${b.contact_email}\nCompany: ${b.company || "-"}\nNotes: ${b.notes || "-"}\n\nOpen the dashboard: ${BASE}/admin/`,
  });
}

async function bookingStatusChanged(b, settings, notary) {
  const msgs = {
    confirmed: ["Your booking is confirmed", "Your appointment is confirmed. We will send the notary's details once assigned."],
    assigned: ["Your notary is assigned", notary ? `Your notary is ${notary.name}${notary.phone ? ", " + notary.phone : ""}.` : "A notary has been assigned to your appointment."],
    canceled: ["Your booking was canceled", "This booking has been canceled. Contact the desk if this is a mistake."],
    completed: ["Thank you", "Your signing is complete. Thank you for choosing MCC Solutions."],
  };
  const m = msgs[b.status];
  if (!m) return;
  const lines = summaryLines(b, settings);
  const link = manageUrl(b);
  await send({
    to: b.contact_email,
    subject: `${m[0]} · ${b.ref}`,
    text: `${m[1]}\n\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\n${link}`,
    html: wrapHtml(m[0], esc(m[1]), lines, `<a href="${esc(link)}">View booking</a>`),
  });
}

// "Please join your Proof session": the link the desk pasted onto the booking, with what to have ready.
async function proofInvite(b, settings) {
  const tz = b.customer_tz || settings.business.timezone;
  const when = fmt(new Date(b.start_utc), tz);
  const first = String(b.contact_name || "").split(/\s+/)[0] || "there";
  const biz = settings.business;
  const ready = [
    "A current government-issued photo ID (driver's license or passport).",
    "A phone, tablet or computer with a working camera and microphone.",
    "A quiet place where you can be on camera for the signing.",
    "The document does not need to be signed beforehand. Do not sign anything until the notary asks you to.",
  ];
  const text = `Hi ${first},

Your remote notarization with ${biz.name} is set for ${when}.

Please join your secure signing session on Proof here:
${b.proof_link}

What happens next:
1. Open the link and follow the prompts to confirm who you are. You may be asked a few identity questions.
2. You'll connect by video with the notary, who will walk you through the signing.

Please have ready:
${ready.map((r) => "- " + r).join("\n")}

If you have trouble opening the link, call us at ${biz.phone} or reply to this email and we'll help right away.

Thank you,
${biz.name}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#14231d;line-height:1.55">
  <h2 style="margin:0 0 8px">Please join your signing session</h2>
  <p>Hi ${esc(first)},</p>
  <p>Your remote notarization with <b>${esc(biz.name)}</b> is set for <b>${esc(when)}</b>.</p>
  <p style="margin:22px 0"><a href="${esc(b.proof_link)}" style="background:#1f5f46;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;display:inline-block">Join my Proof session</a></p>
  <p style="font-size:13px;color:#6a7a72;word-break:break-all">Button not working? Copy this link into your browser:<br>${esc(b.proof_link)}</p>
  <h3 style="margin:22px 0 6px;font-size:16px">What happens next</h3>
  <ol style="padding-left:20px;margin:0"><li>Open the link and follow the prompts to confirm who you are. You may be asked a few identity questions.</li><li>You'll connect by video with the notary, who will walk you through the signing.</li></ol>
  <h3 style="margin:22px 0 6px;font-size:16px">Please have ready</h3>
  <ul style="padding-left:20px;margin:0">${ready.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
  <p style="margin-top:22px">Trouble opening the link? Call us at ${esc(biz.phone)} or reply to this email and we'll help right away.</p>
  <p>Thank you,<br>${esc(biz.name)}</p></div>`;
  return send({ to: b.contact_email, subject: `Please join your remote notarization on Proof · ${b.ref}`, text, html });
}

async function deskNotice(subject, text) {
  await send({ to: DESK, subject, text });
}

module.exports = { proofInvite, bookingCreated, bookingStatusChanged, deskNotice, manageUrl, SERVICE_NAMES, emailEnabled: enabled };

/* ---------- notary emails ---------- */
function jobLines(b, settings) {
  const tz = settings.business.timezone;
  const lines = [
    ["Booking", b.ref],
    ["Service", SERVICE_NAMES[b.service]],
    ["Type", `${b.category} · ${b.signers} signer${b.signers > 1 ? "s" : ""}`],
    ["When", fmt(new Date(b.start_utc), b.service === "mobile" && b.customer_tz ? b.customer_tz : tz)],
    [b.service === "mobile" ? "Area" : "Signer at", b.service === "mobile" ? [b.city, b.state, b.zip].filter(Boolean).join(", ") : b.signer_location],
  ];
  if (b.notary_fee != null) lines.push(["Your fee", "$" + Number(b.notary_fee).toFixed(2)]);
  return lines;
}

async function notaryOffer(b, n, settings, link) {
  const lines = jobLines(b, settings);
  await send({
    to: n.email,
    subject: `New assignment offer · ${b.service.toUpperCase()} · ${b.ref}`,
    text: `Hi ${n.name},\n\nYou have a new assignment offer.\n\n${lines.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nAccept or decline: ${link}\n\nFull address and signer contact details appear after you accept.`,
    html: wrapHtml("New assignment offer", `Hi ${esc(n.name)}, you have a new assignment. Full address and signer contact details appear after you accept.`, lines, `<a href="${esc(link)}" style="display:inline-block;background:#a8751f;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Accept or decline</a>`),
  });
}

async function notarySignIn(n, link, settings) {
  await send({
    to: n.email,
    subject: `Your ${settings.business.name} notary portal link to set your password`,
    text: `Hi ${n.name},\n\nUse this link to set or reset your notary portal password. It works once and expires in 30 minutes. After that, sign in with your password and passkey.\n\n${link}\n\nIf you didn't ask for this, ignore this email.`,
    html: wrapHtml("Set your notary portal password", `Hi ${esc(n.name)}, this link works once and expires in 30 minutes. Use it to set or reset your password, then sign in with your password and passkey.`, [], `<a href="${esc(link)}" style="display:inline-block;background:#a8751f;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Set my password</a><br><br>If you didn't ask for this, ignore this email.`),
  });
}

async function notaryWelcome(n, link, settings) {
  const w = n.role === "witness" || n.role === "process_server";
  const steps = n.role === "process_server" ? "1. Upload your driver's license, vehicle registration, auto insurance card, background check and W-9\n2. Enter the expiration dates\n3. Sign the process server agreement" : n.role === "witness" ? "1. Upload your photo ID, background check and W-9\n2. Set your service area\n3. Sign the witness agreement" : "1. Upload your commission certificate, E&O policy, background check and W-9\n2. Enter your expiration dates\n3. Sign the contractor agreement";
  const work = n.role === "process_server" ? "serves" : n.role === "witness" ? "witness jobs" : "assignments";
  const expect = `We're a young company and we're ramping up our marketing now. Jobs will come in as that marketing builds, so work will start slowly and grow over time. There are no minimums and no guaranteed volume, and you choose which jobs to accept. Your exact pay is shown before you accept each one.`;
  const contact = `Questions? Reply to this email or call ${settings.business.phone}.`;
  await send({
    to: n.email,
    subject: `Welcome to ${settings.business.name}: finish your onboarding`,
    text: `Hi ${n.name},\n\nCongratulations, and welcome to ${settings.business.name}. Your application was approved, and we're glad to have you.\n\nWhat to expect: ${expect}\n\nTo get ready for your first one, finish onboarding in the ${w ? "team" : "notary"} portal:\n\n${steps}\n\n${link}\n\nThis link expires in 7 days. After that, sign in at ${BASE}/portal/ with this email address.\n\nWhen ${work === "assignments" ? "an assignment" : "a job"} near you comes in, you'll get an offer by email, or by text if you turn that on, with the location, time and your pay. Accept or decline in the portal.\n\n${contact}\n\n${settings.business.name}`,
    html: wrapHtml("Congratulations, you're approved", `Hi ${esc(n.name)}, welcome to ${esc(settings.business.name)}. We're glad to have you.<br><br><b>What to expect:</b> ${esc(expect)}<br><br>To get ready for your first one, finish onboarding in the portal:<br><br>${esc(steps).replace(/\n/g, "<br>")}`, [], `<a href="${esc(link)}" style="display:inline-block;background:#a8751f;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Finish onboarding</a><br><br>This link expires in 7 days. After that, sign in at ${esc(BASE)}/portal/ with this email address.<br><br>When ${work === "assignments" ? "an assignment" : "a job"} near you comes in, you'll get an offer by email, or by text if you turn that on, with the location, time and your pay. Accept or decline in the portal.<br><br>${esc(contact)}`),
  });
}

async function credentialReminder(n, items) {
  const text = items.map((i) => `- ${i}`).join("\n");
  await send({
    to: n.email,
    subject: "Action needed: notary credentials expiring",
    text: `Hi ${n.name},\n\n${text}\n\nUpload the renewed documents and new dates in the notary portal: ${BASE}/portal/\n\nWe can't send assignments while a commission or E&O policy is expired.`,
  });
}

module.exports.notaryOffer = notaryOffer;
module.exports.notarySignIn = notarySignIn;
module.exports.notaryWelcome = notaryWelcome;
module.exports.credentialReminder = credentialReminder;
module.exports.BASE = BASE;
module.exports.send = send;
// Send one message and report the real result (used by the admin "Send test email" button).
module.exports.sendTest = async (to) => {
  if (!enabled) return { ok: false, error: "Email is off: SMTP_HOST is not set on the server." };
  try {
    await transport.verify();
    const info = await transport.sendMail({ from: FROM, to, subject: "MCC Solutions test email", text: `This is a test from your MCC Solutions site.\n\nSent from: ${FROM}\nServer: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}\n\nIf you got this, booking emails are working.` });
    return { ok: true, from: FROM, to, id: info.messageId };
  } catch (e) {
    const u = process.env.SMTP_USER || "(not set)";
    const pw = process.env.SMTP_PASS || "";
    const hint = ` [Server is logging in as: ${u} · password is ${pw.length} characters${/\s/.test(pw) ? ", HAS SPACES" : ""}${pw.length && pw.length !== 16 && /gmail|google/i.test(process.env.SMTP_HOST || "") ? " (a Google App Password is 16)" : ""}]`;
    return { ok: false, error: e.message + hint };
  }
};

async function witnessOffer(w, b, link, fee, settings) {
  const tz = settings.business.timezone;
  const when = fmt(new Date(b.start_utc), b.customer_tz || tz);
  const area = b.service === "mobile" ? [b.city, b.state].filter(Boolean).join(", ") : "Remote (video)";
  await send({
    to: w.email,
    subject: `Witness request ${b.ref} · ${when}`,
    text: `Hi ${w.name},\n\nCan you witness a signing?\n\nWhen: ${when}\nWhere: ${area}\nType: ${b.category}${fee != null ? `\nYour fee: $${Number(fee).toFixed(2)}` : ""}\n\nAccept or decline: ${link}\n\nThe full address and contact details appear after you accept.`,
    html: wrapHtml("Witness request", `Hi ${esc(w.name)}, can you witness this signing?`, [["When", when], ["Where", area], ["Type", b.category], ...(fee != null ? [["Your fee", `$${Number(fee).toFixed(2)}`]] : [])], `<a href="${esc(link)}" style="display:inline-block;background:#a8751f;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:600">Accept or decline</a>`),
  });
}
module.exports.witnessOffer = witnessOffer;
