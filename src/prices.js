// "Starting at" prices shown on the website. Edit them in the dashboard: Settings → Starting prices on the website.
// They're shown to customers only; the actual quote for each job is still set by the desk.
const ITEMS = [
  { key: "ron", label: "Remote online notarization (RON)", note: "per session, online, no travel" },
  { key: "mobile", label: "Mobile notary visit", note: "plus state notarial fees" },
  { key: "loan", label: "Loan signing", note: "printing and scanbacks included" },
  { key: "hospital", label: "Hospital or care facility visit", note: "plus state notarial fees" },
  { key: "process_serve", label: "Process serving", note: "per address, standard service" },
  { key: "apostille", label: "Apostille", note: "per document, plus state fees" },
  { key: "recording", label: "Document recording", note: "per document, plus county fees" },
  { key: "court_filing", label: "Court filing or document run", note: "per trip, plus court fees" },
  { key: "records", label: "Records retrieval", note: "per record, plus agency fees" },
  { key: "skip_trace", label: "Skip trace", note: "per person" },
  { key: "medical_records", label: "Medical records pickup", note: "per facility, plus copy fees" },
  { key: "i9", label: "I-9 verification", note: "per employee" },
];
const DEFAULTS = { ron: 40, mobile: 75, loan: 150, hospital: 125, process_serve: 85, apostille: 125, recording: 50, court_filing: 75, records: 65, skip_trace: 75, medical_records: 95, i9: 50 };

// Which starting price each service page shows.
const BY_SLUG = {
  "remote-online-notarization": "ron",
  "mobile-notary": "mobile", "estate-planning-notary": "mobile", "business-notary": "mobile", "usps-form-1583": "mobile",
  "child-travel-consent": "mobile", "passport-consent-form": "mobile",
  "loan-signing-agent": "loan", "private-lender-signings": "loan",
  "hospital-notary": "hospital", "process-serving": "process_serve", "apostille-services": "apostille", "document-recording": "recording",
  "court-filing": "court_filing", "records-retrieval": "records", "skip-tracing": "skip_trace", "medical-records-retrieval": "medical_records",
  "i9-verification": "i9", "vehicle-title-notary": "mobile",
};

function list(settings) {
  const p = (settings && settings.publicPrices) || {};
  return ITEMS.map((i) => ({ ...i, price: p[i.key] == null || p[i.key] === "" ? null : Number(p[i.key]) })).filter((i) => i.price != null && i.price >= 0);
}
function forSlug(settings, slug) {
  const k = BY_SLUG[slug];
  return k ? list(settings).find((i) => i.key === k) || null : null;
}
const money = (n) => "$" + (Number.isInteger(n) ? n : n.toFixed(2));

module.exports = { ITEMS, DEFAULTS, BY_SLUG, list, forSlug, money };
