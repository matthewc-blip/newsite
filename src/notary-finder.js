// "Which notary service do I need?" Rules-based recommendation. No scoring, no stored answers.
const prices = require("./prices");
const BOOK = "/notary/#order";
const Q = (id, text, options, extra) => ({ id, group: "Your situation", text, options: options.map(([v, l]) => [v, l, 0]), advice: "", guide: "", ...extra });

const QUESTIONS = [
  Q("need", "What kind of document is it?", [
    ["loan", "Mortgage, refinance or HELOC closing documents"],
    ["property", "A deed, affidavit, power of attorney, will-related or other personal document"],
    ["general", "A business, vehicle, travel-consent or other general form"],
    ["agency", "A form for a government agency, court, bank or school"],
    ["abroad", "A document going to another country"],
    ["unsure", "I'm not sure"],
  ]),
  Q("where", "How do you want to sign?", [
    ["person", "In person: a notary comes to me (home, office, bank or coffee shop)"],
    ["facility", "In person at a hospital, nursing home or care facility"],
    ["remote", "Remotely, on a video call"],
  ]),
  Q("paper", "If you sign remotely, does the receiving office need a paper document with your ink signature and a physical notary stamp?", [
    ["yes", "Yes, it must be paper with an ink signature and a stamp"],
    ["no", "No, an electronic document is fine"],
    ["unsure", "I don't know"],
  ], { ask: ["where", "remote"] }),
  Q("when", "When do you need it done?", [
    ["today", "Today or tomorrow"],
    ["soon", "Within the next week"],
    ["later", "Later, I'm planning ahead"],
  ]),
];

const engine = require("./quiz-engine").create({ questions: QUESTIONS, guideBase: "", title: "Which notary service do I need?", disclaimer: "", levels: ["", "", ""] });

const SVC = {
  mobile: { slug: "mobile-notary", title: "Mobile notary", learn: "/notary/mobile-notary" },
  loan: { slug: "loan-signing-agent", title: "Loan signing agent", learn: "/notary/loan-signing-agent" },
  hospital: { slug: "hospital-notary", title: "Hospital and care facility visit", learn: "/notary/hospital-notary" },
  ron: { slug: "remote-online-notarization", title: "Remote online notarization (RON)", learn: "/notary/remote-online-notarization" },
  rin: { slug: "remote-ink-signed-notarization", title: "Remote ink-signed notarization (RIN)", learn: "/notary/remote-ink-signed-notarization" },
  apostille: { slug: "apostille-services", title: "Notarization and apostille", learn: "/notary/apostille-services" },
};

function recommend(ans, settings, phone) {
  let key;
  if (ans.need === "abroad") key = "apostille";
  else if (ans.where === "facility") key = "hospital";
  else if (ans.where === "remote") key = ans.paper === "no" ? "ron" : "rin";
  else key = ans.need === "loan" ? "loan" : "mobile";
  const s = SVC[key]; const notes = []; const steps = []; let why = "";
  const p = settings ? prices.forSlug(settings, s.slug) : null;
  const price = p ? `Starting at ${prices.money(p.price)}, plus state notarial fees where they apply` : "";

  if (key === "apostille") {
    why = "Documents used abroad usually need to be notarized first and then certified with an apostille (or legalized, for countries outside the Hague Convention). We handle both steps.";
    steps.push("Tell us the document and the country it's going to.", "We confirm what the receiving country needs and what it costs.", "You sign in front of a notary, and we take it through certification and send it back.");
    notes.push("Don't sign the document before the notary arrives.");
  } else if (key === "hospital") {
    why = "A hospital or care-facility visit means a notary comes to the bedside or the facility office, and can work around visiting hours and the patient's energy.";
    steps.push("Tell us the facility, the room and the document.", "We confirm the time with you by email.", "The notary checks ID, and confirms the signer understands what they are signing and is signing willingly.");
    notes.push("A notary can't decide whether someone is able to sign. If there is any question about capacity, talk to the facility and your attorney first.");
  } else if (key === "rin") {
    why = ans.paper === "unsure"
      ? "Because you aren't sure, we suggest the version that works in more cases: you sign on paper in ink while on a video call, and the notary stamps the paper. Ask the receiving office first if you can."
      : "You sign the paper document in ink on a live video call, and the notary applies a physical stamp and seal. This is the version offices that won't take an electronic notarization ask for.";
    steps.push("Tell us the document and who is receiving it.", "We schedule a video session and send instructions, including your ID check.", "You sign in ink while the notary watches, then mail the original to the notary.", "The notary stamps it and mails it back.");
    notes.push("This is a specialty service, quoted by the desk before you book. The signed paper has to reach the notary within a short window, so plan for shipping time both ways.");
  } else if (key === "ron") {
    why = "You sign an electronic document on a live video call and the notary applies an electronic notarization. It's the quickest option if the receiving party accepts it.";
    steps.push("Book a time and tell us the document.", "We email a link to the session platform.", "Show your ID, answer the identity questions, and sign on screen.");
    notes.push("Not every office accepts electronic notarization. If you aren't sure, ask them first.");
  } else if (key === "loan") {
    why = "Mortgage and refinance packages are signed with a loan signing agent who prints the documents, walks you through the signing pages, and returns them to the closing company on time.";
    steps.push("Send us the closing company's name and the signing date they gave you.", "We confirm the time and place with you by email.", "The agent brings the documents, explains where to sign, and ships them back.");
    notes.push("A signing agent can't explain loan terms or give advice. Questions about the loan go to your lender or closing company.");
  } else {
    why = "A mobile notary comes to you: your home, office, a bank lobby or wherever suits you. Bring the document unsigned and a valid photo ID for each signer.";
    steps.push("Pick a time and tell us the document.", "We confirm by email.", "Everyone signing shows a photo ID. Sign in front of the notary, and you're done.");
  }
  if (ans.need === "agency") notes.push("Check what the agency or school requires before you sign, such as a specific form, wording or number of copies. We can't change a form or tell you which one you need.");
  if (ans.need === "unsure") notes.push("Not sure what you need notarized? Call us or tell us the document name when you book, and we'll tell you whether it needs a notary and which service fits.");
  if (ans.when === "today") notes.push("Same-day appointments are sometimes possible, so call the desk. They are never guaranteed.");
  notes.push("No appointment time is guaranteed until you receive a confirmation email from us.");
  return { key, title: s.title, price, why, steps, notes, ctaHref: BOOK, ctaLabel: "Request this appointment", learnHref: s.learn, phone: phone || "" };
}

module.exports = { engine, recommend, QUESTIONS };
