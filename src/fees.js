// Extra fees: rush, after-hours, weekend, extra signers, waiting time, travel, trip and late-cancel fees.
// The list and prices live in settings.fees and can be edited in the dashboard (Settings → Extra fees).
// Fees are stored on the booking next to the checkout add-ons (kind "fee"), so invoices, card charges,
// the margin check and customer emails all include them. Time-based fees are added automatically when
// a booking is made; the desk can add, change or remove any fee before the job is invoiced.
// New Jersey caps the fee per notarial act, so these are billed as separate service and travel fees,
// shown on the website and on every quote and invoice.
const { dateInTz, weekday } = require("./time");
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const SERVICES = ["mobile", "ron", "rin"];
const AUTO = ["rush", "after_hours", "weekend", "extra_signer", "late_cancel"];

const DEFAULTS = [
  { id: "rush", label: "Rush (starts within 4 hours of booking)", price: 50, auto: "rush", share: 50, services: ["mobile"], note: "Added automatically when the appointment starts less than 4 hours after it's booked." },
  { id: "after_hours", label: "After-hours (before 8 am or after 7 pm)", price: 50, auto: "after_hours", share: 50, services: ["mobile"], note: "Added automatically for early-morning and evening appointments." },
  { id: "weekend", label: "Weekend appointment", price: 40, auto: "weekend", share: 50, services: ["mobile"], note: "Added automatically for Saturday and Sunday appointments." },
  { id: "holiday", label: "Holiday appointment", price: 75, share: 50, services: ["mobile", "ron", "rin"], note: "Federal and state holidays." },
  { id: "extra_signer", label: "Additional signer", price: 20, unit: "per signer", max: 9, auto: "extra_signer", share: 50, services: ["mobile"], note: "Each signer after the first." },
  { id: "extra_docs", label: "Additional documents (over 6 notarizations)", price: 10, unit: "per document", max: 50, share: 50, services: ["mobile"], note: "Handling for large stacks. State notarial fees are billed separately." },
  { id: "waiting", label: "Waiting time", price: 15, unit: "per 15 minutes", max: 16, share: 75, services: ["mobile"], note: "After the first 15 minutes, when signers or documents aren't ready." },
  { id: "travel_30", label: "Extended travel (30–45 miles)", price: 50, share: 75, services: ["mobile"], note: "Most of New Jersey is within our standard area." },
  { id: "travel_45", label: "Long-distance travel (over 45 miles)", price: 85, share: 75, services: ["mobile"] },
  { id: "facility", label: "Hospital or facility coordination", price: 25, share: 50, services: ["mobile"], note: "Security check-in, escorts, protective gear or waiting on staff." },
  { id: "trip", label: "Trip fee (canceled on arrival or no-show)", price: 60, share: 75, onCancel: true, services: ["mobile"], note: "When the notary arrives and the signing can't go ahead." },
  { id: "late_cancel", label: "Late cancellation (under 2 hours' notice)", price: 35, auto: "late_cancel", share: 50, onCancel: true, services: ["mobile"], note: "Added automatically when an appointment is canceled less than 2 hours before it starts." },
];

// Extras for service requests (process serving and the rest). types: which request types offer it ("*" = all).
// auto: added when the request comes in with that priority picked (e.g. "priority:Rush").
const REQUEST_DEFAULTS = [
  { id: "rush_serve", label: "Rush service (first attempt within 24 hours)", price: 40, share: 50, types: ["process_serve"], auto: "priority:Rush" },
  { id: "same_day_serve", label: "Same-day service", price: 75, share: 60, types: ["process_serve"], auto: "priority:Same day" },
  { id: "extra_address", label: "Additional address", price: 45, unit: "per address", max: 10, share: 70, types: ["process_serve"] },
  { id: "extra_attempts", label: "Additional attempts (beyond 3)", price: 25, unit: "per attempt", max: 10, share: 70, types: ["process_serve"] },
  { id: "stakeout", label: "Stakeout / wait for the subject", price: 60, unit: "per hour", max: 12, share: 75, types: ["process_serve"] },
  { id: "skip_trace", label: "Skip trace (new address search)", price: 75, share: 0, types: ["process_serve"] },
  { id: "affidavit_filing", label: "File the affidavit with the court", price: 45, share: 50, types: ["process_serve"] },
  { id: "rush_request", label: "Rush handling (within 1 business day)", price: 50, share: 50, types: ["recording", "legalization", "translation", "court_filing", "records_retrieval", "medical_records", "vehicle_title", "i9_verification", "inspection", "lien_waivers"] },
  { id: "travel_req", label: "Extended travel (over 45 miles)", price: 50, share: 75, types: ["*"] },
  { id: "pass_through", label: "Government / county fees (at cost)", price: 0, share: 0, types: ["*"], note: "Set the price to the actual fee paid." },
];

const clean = (a) => ({
  id: String(a.id).slice(0, 30), label: String(a.label).slice(0, 80), price: round2(a.price),
  unit: a.unit ? String(a.unit).slice(0, 30) : "", note: String(a.note || "").slice(0, 200),
  max: Math.max(1, Math.min(50, parseInt(a.max, 10) || 1)), auto: AUTO.includes(a.auto) ? a.auto : null,
  share: Math.max(0, Math.min(100, Number(a.share) || 0)), onCancel: !!a.onCancel,
  services: (Array.isArray(a.services) ? a.services : SERVICES).filter((s) => SERVICES.includes(s)),
});

function requestCatalog(settings) {
  const list = Array.isArray(settings.requestFees) ? settings.requestFees : REQUEST_DEFAULTS;
  return list.filter((a) => a && a.id && a.label && a.enabled !== false && Number(a.price) >= 0).map((a) => ({
    id: String(a.id).slice(0, 30), label: String(a.label).slice(0, 80), price: round2(a.price), unit: a.unit ? String(a.unit).slice(0, 30) : "",
    note: String(a.note || "").slice(0, 200), max: Math.max(1, Math.min(50, parseInt(a.max, 10) || 1)), share: Math.max(0, Math.min(100, Number(a.share) || 0)),
    types: Array.isArray(a.types) && a.types.length ? a.types.map(String) : ["*"], auto: typeof a.auto === "string" ? a.auto.slice(0, 60) : null, onCancel: false,
  }));
}
const forType = (settings, type) => requestCatalog(settings).filter((f) => f.types.includes("*") || f.types.includes(type));
// Extras that apply automatically to a new request (e.g. rush or same-day picked on a serve).
function requestAuto(settings, type, details) {
  const d = details || {};
  return forType(settings, type).filter((f) => {
    if (!f.auto) return false;
    const [key, prefix] = f.auto.split(":");
    return key && prefix && String(d[key] || "").toLowerCase().startsWith(prefix.toLowerCase());
  }).map((f) => item(f, 1));
}

function catalog(settings) {
  const list = Array.isArray(settings.fees) ? settings.fees : DEFAULTS;
  return list.filter((a) => a && a.id && a.label && a.enabled !== false && Number(a.price) >= 0).map(clean);
}
// What the website and booking form may show (no notary share).
const publicCatalog = (settings) => catalog(settings).map(({ share, ...a }) => a);

const item = (f, qty, extra = {}) => ({ id: f.id, label: f.label, qty, price: f.price, kind: "fee", share: f.share, onCancel: f.onCancel, ...extra });

// Fees that apply automatically to a new booking.
function auto(settings, b, now = Date.now()) {
  const tz = settings.business.timezone;
  const start = new Date(b.start_utc || b.start);
  if (isNaN(start)) return [];
  const local = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(start);
  const mins = Number(local.find((p) => p.type === "hour").value) * 60 + Number(local.find((p) => p.type === "minute").value);
  const day = weekday(dateInTz(start, tz));
  const perSigner = settings.pricing?.[b.service]?.perExtraSigner;
  const out = [];
  for (const f of catalog(settings)) {
    if (!f.auto || !f.services.includes(b.service)) continue;
    if (f.auto === "rush" && start.getTime() - now < 4 * 3600e3) out.push(item(f, 1));
    if (f.auto === "after_hours" && (mins < 8 * 60 || mins >= 19 * 60)) out.push(item(f, 1));
    if (f.auto === "weekend" && (day === 0 || day === 6)) out.push(item(f, 1));
    if (f.auto === "extra_signer" && (perSigner == null || perSigner === "") && b.signers > 1) out.push(item(f, Math.min(f.max, b.signers - 1)));
  }
  return out;
}

// The late-cancel fee, when an appointment is canceled under 2 hours before it starts.
function lateCancel(settings, b, now = Date.now()) {
  const f = catalog(settings).find((x) => x.auto === "late_cancel" && x.services.includes(b.service));
  const left = new Date(b.start_utc).getTime() - now;
  return f && left < 2 * 3600e3 && left > -12 * 3600e3 ? item(f, 1) : null;
}

// Replace the fees on a booking with what the desk sent: [{id, qty}] from the catalog, or
// {id: "custom", label, price, qty, share, onCancel} for a one-off. Add-ons the customer chose stay as they are.
function apply(current, input, settings, list) {
  if (!Array.isArray(input) || input.length > 30) throw Object.assign(new Error("Fees must be a list of up to 30 items."), { status: 400 });
  const cat = Object.fromEntries((list || catalog(settings)).map((f) => [f.id, f]));
  const keep = (Array.isArray(current) ? current : []).filter((a) => a.kind !== "fee");
  const prev = Object.fromEntries((Array.isArray(current) ? current : []).filter((a) => a.kind === "fee").map((a) => [a.id, a]));
  const fees = [];
  for (const x of input) {
    if (!x) continue;
    const qty = Math.max(0, Math.min(50, parseInt(x.qty, 10) || 0));
    if (!qty) continue;
    if (x.id === "custom" || String(x.id || "").startsWith("custom")) {
      const label = String(x.label || "").trim().slice(0, 80);
      const price = round2(x.price);
      if (!label || !(price >= 0 && price <= 5000)) throw Object.assign(new Error("A custom fee needs a name and a price between $0 and $5,000."), { status: 400 });
      fees.push({ id: "custom-" + (fees.length + 1), label, qty, price, kind: "fee", share: Math.max(0, Math.min(100, Number(x.share) || 0)), onCancel: !!x.onCancel });
      continue;
    }
    const f = cat[x.id] || (prev[x.id] && { ...prev[x.id], max: 50 }); // a fee removed from Settings can stay on old jobs
    if (!f) throw Object.assign(new Error(`Unknown fee: ${x.id}`), { status: 400 });
    fees.push(item(f, Math.min(f.max || 50, qty), x.price != null && x.price !== "" ? { price: round2(Math.max(0, Math.min(5000, Number(x.price) || 0))) } : {}));
  }
  return [...keep, ...fees];
}

const ofKind = (items) => (Array.isArray(items) ? items : []).filter((a) => a.kind === "fee");
const total = (items) => round2((items || []).reduce((s, a) => s + a.qty * a.price, 0));
// The notary's suggested share of the extra fees on a job.
const notaryShare = (items) => round2(ofKind(items).reduce((s, a) => s + a.qty * a.price * (Number(a.share) || 0) / 100, 0));
// Fees that can still be billed when the job was canceled or the signer didn't show.
const cancelItems = (items) => ofKind(items).filter((a) => a.onCancel);

function validateSettings(list) {
  if (!Array.isArray(list) || list.length > 30) return "Extra fees must be a list of up to 30 items.";
  for (const a of list) {
    if (!a || !/^[a-z0-9_-]{1,30}$/.test(String(a.id || "")) || !String(a.label || "").trim()) return "Each fee needs an id and a name.";
    const price = Number(a.price);
    if (!(price >= 0 && price <= 5000)) return `Price for ${a.label} must be between $0 and $5,000.`;
    a.price = round2(price);
    if (a.share !== undefined) a.share = Math.max(0, Math.min(100, Number(a.share) || 0));
  }
  return null;
}

module.exports = { DEFAULTS, REQUEST_DEFAULTS, requestCatalog, forType, requestAuto, catalog, publicCatalog, auto, lateCancel, apply, ofKind, total, notaryShare, cancelItems, validateSettings };
