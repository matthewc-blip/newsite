// Shared internal-link helpers: related documents, balanced "more guides" lists and the seasonal/tool links.
const { DOCS, docPath } = require("./doc-pages");

const TRAVEL = { path: "/notary/travel-and-school-consent-forms", label: "Kids' travel, camp and passport consent forms", services: ["child-travel-consent", "passport-consent-form", "mobile-notary"], docs: ["custody-and-guardianship-documents", "notarized-letter-and-affidavit-of-identity"] };
const YEAREND = { path: "/notary/year-end-estate-planning-signings", label: "Year-end wills, powers of attorney and directives", services: ["estate-planning-notary", "hospital-notary", "mobile-notary"], docs: ["living-will-and-healthcare-proxy", "trust-documents", "affidavit-of-title-and-estate-affidavits"] };
const SEASONAL = [TRAVEL, YEAREND];

const docsForService = (slug, n = 8) => DOCS.filter((d) => d.services.includes(slug)).slice(0, n);
const seasonalForService = (slug) => SEASONAL.filter((s) => s.services.includes(slug));
const seasonalForDoc = (slug) => SEASONAL.filter((s) => s.docs.includes(slug));
// Declared related documents first, then others in the same category, then the rest, up to n.
function relatedDocs(d, n = 4) {
  const out = []; const add = (x) => { if (x && x.slug !== d.slug && !out.includes(x)) out.push(x); };
  (d.related || []).forEach((sl) => add(DOCS.find((x) => x.slug === sl)));
  DOCS.filter((x) => x.category === d.category).forEach(add);
  const i = DOCS.indexOf(d); for (let k = 1; k < DOCS.length && out.length < n; k++) add(DOCS[(i + k) % DOCS.length]);
  return out.slice(0, n);
}
// The n items after `item` in the list, wrapping around, so every item gets links from its neighbours.
function cyclic(list, item, n = 4) {
  const i = list.indexOf(item); if (i < 0) return list.slice(0, n);
  const out = []; for (let k = 1; k < list.length && out.length < n; k++) out.push(list[(i + k) % list.length]);
  return out;
}
module.exports = { docsForService, seasonalForService, seasonalForDoc, relatedDocs, cyclic, docPath, SEASONAL };
