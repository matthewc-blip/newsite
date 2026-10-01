// Optional text messages through Twilio. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM to turn on.
const SID = process.env.TWILIO_ACCOUNT_SID || "";
const TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const FROM = process.env.TWILIO_FROM || "";
const enabled = !!(SID && TOKEN && FROM);

function e164(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.length === 10) return "+1" + d;
  if (d.length === 11 && d.startsWith("1")) return "+" + d;
  return d.length > 7 ? "+" + d : null;
}

async function sendSms(to, body) {
  const num = e164(to);
  if (!num) return;
  if (!enabled) { console.log(`[sms disabled] To: ${num} | ${body}`); return; }
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: "Basic " + Buffer.from(`${SID}:${TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: num, From: FROM, Body: body.slice(0, 600) }),
    });
    if (!r.ok) console.error("SMS failed:", await r.text());
  } catch (e) { console.error("SMS failed:", e.message); }
}

module.exports = { sendSms, smsEnabled: enabled };
