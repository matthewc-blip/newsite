// Checkout add-ons: extras a customer picks when booking (printing, scanbacks, witnesses, courier,
// apostille handling). The list and prices live in settings.addons and can be edited in the dashboard.
// Chosen add-ons are stored on the booking, shown to the notary, and billed as separate invoice lines.
const round2 = (n) => Math.round(Number(n) * 100) / 100;
const SERVICES = ["mobile", "ron", "rin"];

function catalog(settings) {
  return (settings.addons || [])
    .filter((a) => a && a.id && a.label && a.enabled !== false && Number(a.price) >= 0)
    .map((a) => ({
      id: String(a.id).slice(0, 30), label: String(a.label).slice(0, 80), price: round2(a.price),
      note: String(a.note || "").slice(0, 160), max: Math.max(1, Math.min(10, parseInt(a.max, 10) || 1)),
      services: (Array.isArray(a.services) ? a.services : SERVICES).filter((s) => SERVICES.includes(s)),
    }));
}

// Validate what the customer sent ({id: qty} or [{id, qty}]) against the current catalog.
function pick(input, service, settings) {
  const want = Array.isArray(input) ? Object.fromEntries(input.map((x) => [x && x.id, x && x.qty])) : (input && typeof input === "object" ? input : {});
  const out = [];
  for (const a of catalog(settings)) {
    if (!a.services.includes(service)) continue;
    const qty = Math.max(0, Math.min(a.max, parseInt(want[a.id], 10) || 0));
    if (qty > 0) out.push({ id: a.id, label: a.label, qty, price: a.price });
  }
  return out;
}

const list = (b) => (Array.isArray(b.addons) ? b.addons : []);
const total = (items) => round2(items.reduce((s, a) => s + a.qty * a.price, 0));
const describe = (items) => items.map((a) => `${a.label}${a.qty > 1 ? ` ×${a.qty}` : ""} ($${(a.qty * a.price).toFixed(2)})`).join(", ");

module.exports = { catalog, pick, list, total, describe };
