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
  court_filing: {
    label: "Court filing & runs", page: "court-filing", roles: ["process_server"],
    blurb: "Papers filed at the courthouse, documents picked up and delivered, and copies pulled from the court file.",
    fields: [
      { key: "court", label: "Court and county (e.g. Superior Court, Union County)", required: true },
      { key: "case", label: "Case or docket number" },
      { key: "task", label: "What do you need?", required: true, options: ["File papers in person", "Pick up and deliver documents", "Get copies from the court file", "Other"] },
      { key: "documents", label: "Documents (what's being filed, delivered or copied)", required: true, wide: true },
      { key: "pickup_address", label: "Pickup address, if we're collecting originals", wide: true },
    ],
  },
  records_retrieval: {
    label: "Records retrieval", page: "records-retrieval", roles: ["process_server"],
    blurb: "Copies of deeds, mortgages, court records, business filings and vital records, pulled and delivered.",
    fields: [
      { key: "record", label: "Record type", required: true, options: ["Deed, mortgage or other recorded document", "Court record", "Business or corporate filing", "Vital record (birth, death, marriage)", "Other"] },
      { key: "where", label: "County, court or agency that holds it", required: true },
      { key: "identify", label: "Names, property address, book and page, or docket number", required: true, wide: true, textarea: true },
      { key: "certified", label: "Certified copy needed?", options: ["Yes, certified", "No, a plain copy is fine", "Not sure"] },
    ],
  },
  skip_trace: {
    label: "Skip tracing", page: "skip-tracing", roles: [],
    blurb: "A current address for someone you need to serve or reach, from database searches for a permissible purpose.",
    fields: [
      { key: "subject", label: "Person's full name", required: true },
      { key: "last_address", label: "Last known address", required: true, wide: true },
      { key: "identifiers", label: "Other details (date of birth, phone, employer, relatives)", wide: true, textarea: true },
      { key: "purpose", label: "Purpose of the search", required: true, options: ["Serving court papers", "Collecting a judgment or debt", "Estate or heir search", "Other legal purpose"] },
    ],
  },
  medical_records: {
    label: "Medical records pickup", page: "medical-records-retrieval", roles: ["process_server", "notary"],
    blurb: "Records requested and picked up from hospitals, practices and facilities with the patient's signed authorization.",
    fields: [
      { key: "provider", label: "Hospital, practice or facility (name and address)", required: true, wide: true },
      { key: "patient", label: "Patient name", required: true },
      { key: "authorization", label: "Signed HIPAA authorization or subpoena?", required: true, options: ["Yes, I'll attach it", "Need help getting it signed (notary visit)", "Subpoena attached"] },
      { key: "deliver", label: "Deliver to (email or address)" },
    ],
  },
  jail_notary: {
    label: "Correctional facility notary visit", page: "jail-and-prison-notary", roles: ["notary"],
    blurb: "A notary visit to a jail, prison or detention center, arranged with the facility, for signers who are incarcerated.",
    fields: [
      { key: "facility", label: "Facility name and town", required: true, wide: true },
      { key: "inmate", label: "Name of the person signing", required: true },
      { key: "inmate_id", label: "Inmate or booking number, if you have it" },
      { key: "documents", label: "What needs to be notarized (e.g. power of attorney, affidavit, consent)", required: true, wide: true, textarea: true },
      { key: "contact", label: "Who arranged the visit (attorney, family, facility contact)", wide: true },
    ],
  },
  estate_package: {
    label: "Estate planning signing package", page: "estate-planning-signing-package", roles: ["notary", "witness"],
    blurb: "A notary and the witnesses needed to sign wills, powers of attorney and healthcare directives in one visit.",
    fields: [
      { key: "documents", label: "Documents being signed (will, power of attorney, healthcare directive…)", required: true, wide: true, textarea: true },
      { key: "signers", label: "Number of people signing", required: true },
      { key: "location", label: "Where the signing happens (address, town)", required: true, wide: true },
      { key: "attorney", label: "Attorney or firm preparing the documents" },
      { key: "witnesses", label: "Witnesses needed from us?", options: ["Yes, two witnesses", "Yes, one witness", "No, we have our own", "Not sure"] },
      { key: "when", label: "Preferred date and time" },
    ],
  },
  i9_verification: {
    label: "I-9 authorized representative", page: "i9-verification", roles: ["notary"],
    blurb: "A local representative meets your remote hire, examines their documents in person and completes Section 2 of Form I-9.",
    fields: [
      { key: "employee", label: "Employee name", required: true },
      { key: "employer", label: "Employer (company name)", required: true },
      { key: "location", label: "Where to meet (address or town in New Jersey)", required: true, wide: true },
      { key: "start_date", label: "Employee's first day of work" },
      { key: "employee_phone", label: "Employee phone or email" },
    ],
  },
};

const ROLE_LABEL = { notary: "Notary", witness: "Witness", process_server: "Process server" };

function publicCatalog() {
  return Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, { label: t.label, fields: t.fields }]));
}

module.exports = { TYPES, ROLE_LABEL, publicCatalog };
