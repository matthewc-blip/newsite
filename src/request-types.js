// Service requests that aren't timed appointments: process serving, recording, legalization and more.
// Each type lists the fields its request form asks for and which team roles can be assigned to it.
// roles: [] means the desk handles it directly or through a partner (track the partner cost as vendor cost).
const TYPES = {
  process_serve: {
    label: "Process serving", page: "process-serving", roles: ["process_server"],
    blurb: "Personal or substitute service of court papers, with attempts logged and a signed affidavit of service.",
    fields: [
      { key: "serve_name", label: "Person or business to serve", required: true },
      { key: "serve_address", label: "Service address (street, city, state, ZIP)", required: true, wide: true },
      { key: "serve_alt", label: "Other addresses or best times to find them", wide: true, textarea: true },
      { key: "case", label: "Court and case or docket number" },
      { key: "documents", label: "Documents to serve (e.g. summons and complaint)" },
      { key: "priority", label: "Priority", options: ["Standard (first attempt within 3 business days)", "Rush (within 24 hours)", "Same day"] },
    ],
  },
  recording: {
    label: "Document recording", page: "document-recording", roles: [],
    blurb: "Deeds, mortgages, releases and other documents recorded with the county.",
    fields: [
      { key: "doc_type", label: "Document type (deed, mortgage, release…)", required: true },
      { key: "county", label: "County where it records", required: true },
      { key: "count", label: "Number of documents" },
      { key: "originals", label: "How will we get the originals?", options: ["Pick them up", "I'll mail or drop them off", "Already e-signed / electronic"] },
    ],
  },
  legalization: {
    label: "Embassy legalization", page: "embassy-legalization", roles: [],
    blurb: "Documents certified for countries that don't accept apostilles.",
    fields: [
      { key: "country", label: "Destination country", required: true },
      { key: "doc_type", label: "Document type", required: true },
      { key: "count", label: "Number of documents" },
    ],
  },
  translation: {
    label: "Certified translation", page: "certified-translation", roles: [],
    blurb: "Certified translations by our translation partners, notarized when required.",
    fields: [
      { key: "from_lang", label: "Translate from", required: true },
      { key: "to_lang", label: "Translate to", required: true },
      { key: "pages", label: "Approximate pages" },
      { key: "purpose", label: "What it's for (court, USCIS, apostille…)" },
    ],
  },
  shredding: {
    label: "Secure document shredding", page: "document-shredding", roles: [],
    blurb: "Pickup and certified destruction of closing, legal and estate paperwork.",
    fields: [
      { key: "volume", label: "Approximate volume (boxes or bags)", required: true },
      { key: "pickup_address", label: "Pickup address", required: true, wide: true },
      { key: "certificate", label: "Certificate of destruction needed?", options: ["Yes", "No"] },
    ],
  },
  estate_scan: {
    label: "Estate document scanning", page: "estate-document-scanning", roles: ["notary", "process_server"],
    blurb: "Pickup, scanning and organizing an estate's paperwork for the executor or attorney.",
    fields: [
      { key: "volume", label: "Approximate volume (boxes or folders)", required: true },
      { key: "pickup_address", label: "Pickup address", required: true, wide: true },
      { key: "deliver", label: "Deliver scans to (email or attorney)" },
    ],
  },
  lien_waivers: {
    label: "Lien waiver collection", page: "lien-waiver-collection", roles: ["notary"],
    blurb: "Notarized lien waivers collected from subcontractors and suppliers on your schedule.",
    fields: [
      { key: "project", label: "Project name and address", required: true, wide: true },
      { key: "signers", label: "Number of subcontractors or suppliers", required: true },
      { key: "draw", label: "Draw date or deadline" },
    ],
  },
  inspection: {
    label: "Property inspection", page: "property-inspections", roles: ["process_server", "notary"],
    blurb: "Occupancy checks and exterior photo inspections for lenders, servicers and investors.",
    fields: [
      { key: "property", label: "Property address", required: true, wide: true },
      { key: "inspection", label: "Inspection type", options: ["Occupancy check", "Exterior photos", "Interior photos (access arranged)", "Other"] },
      { key: "contact", label: "Access contact (if interior)" },
    ],
  },
};

const ROLE_LABEL = { notary: "Notary", witness: "Witness", process_server: "Process server" };

function publicCatalog() {
  return Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, { label: t.label, fields: t.fields }]));
}

module.exports = { TYPES, ROLE_LABEL, publicCatalog };
