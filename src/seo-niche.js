// Niche situation pages that most notaries and bookkeepers don't write about.
// General information only: no legal, tax or immigration advice, and no claims about prices, wait times or volumes.
const { fit } = require("./titles");

const N = "/notary", B = "/bookkeeping";
const NOTE = "General information, not legal or tax advice. Rules change; confirm with the agency, lender or your professional. Updated October 2026.";

const NOTARY = [
  {
    path: `${N}/notarizing-without-id`, eyebrow: "When the signer has no ID",
    title: "Need a Notary but Have No ID? Options in New Jersey",
    description: "Lost your wallet, expired license or no photo ID? Here is what a New Jersey notary can and can't do when a signer has no acceptable ID.",
    h1: "What if the signer has no ID?",
    lede: "A notary has to be satisfied of who is signing. A current government photo ID is the usual way. When that's missing, there may be other routes, but the notary decides, and some documents will need a different plan.",
    sections: [
      ["Start with what you do have", ["An <b>expired</b> ID, a passport card, a military ID or a non-driver ID may still help. Tell us what you have when you book so we can say whether it is likely to work before we drive out.", "Some lenders, title companies and agencies set their own ID rules that are stricter than the notary's. For a loan signing, the lender's instructions come first."]],
      ["Other ways a notary may identify someone", ["New Jersey law lets a notary rely on satisfactory evidence of identity. Depending on the facts, that can include a person the notary already knows personally or a credible witness who knows the signer and can be identified themselves. Whether it fits is the notary's call, and it is never guaranteed.", "A relative at the bedside who has a good ID may be able to serve as that witness in some situations. We can't promise it, and we can't apply a rule that doesn't fit your facts."]],
      ["When we have to say no", ["If we can't confirm who the signer is, we can't notarize, and no fee amount changes that. The fastest fix is often replacing the ID: a temporary paper license from the MVC, or a passport application.", "We won't backdate, skip the identity step or accept an ID that looks altered."]],
    ],
    links: [["Appointment checklist", `${N}/appointment-checklist`], ["Mobile notary", `${N}/mobile-notary`], ["Jurat vs. acknowledgment", `${N}/jurat-vs-acknowledgment`], ["Hospital and care-facility visits", `${N}/hospital-notary`]],
    faqs: [["Can you notarize with an expired ID?", "Sometimes. It depends on how long ago it expired, how it looks and who requires the notarization. Ask when you book."], ["Will a photocopy of my ID work?", "No. The notary needs to see the original ID in person."], ["Can a family member vouch for me?", "In some cases a credible witness can help identify a signer, but the notary decides and some institutions don't allow it."]],
  },
  {
    path: `${N}/jurat-vs-acknowledgment`, eyebrow: "Two notarial acts, explained",
    title: "Jurat vs. Acknowledgment: Which Does Your Document Need?",
    description: "A jurat means you swore the contents are true. An acknowledgment confirms you signed on purpose. Learn the difference before your notary appointment.",
    h1: "Jurat vs. acknowledgment",
    lede: "Two of the most common notarial acts look alike on paper and work differently. Knowing which one you need saves a trip.",
    sections: [
      ["Acknowledgment", ["You tell the notary that you signed the document willingly and for the purpose stated. You can sign it before the appointment, but you must appear in person and confirm it is your signature. Deeds, powers of attorney and many contracts use acknowledgments."]],
      ["Jurat", ["You swear or affirm, in front of the notary, that what the document says is true, and you sign it in their presence. Affidavits and sworn statements use jurats."]],
      ["Which should I pick?", ["The agency, court or lender that asked for the document usually decides. A notary can't choose for you, because choosing is practicing law. If the document has no notary wording, tell us who asked for it and we can explain your options. Often they will have a form to attach."]],
      ["What we won't do", ["We won't notarize a document that is incomplete, and we won't tell you what to write in it. We can read the wording on the certificate so you know what you're signing."]],
    ],
    links: [["Notarizing without ID", `${N}/notarizing-without-id`], ["Affidavit documents", `${N}/documents/affidavit-of-title-and-estate-affidavits`], ["Notarized letter or affidavit of identity", `${N}/documents/notarized-letter-and-affidavit-of-identity`], ["Appointment checklist", `${N}/appointment-checklist`]],
    faqs: [["Do I have to sign in front of the notary?", "For a jurat, yes. For an acknowledgment you appear before the notary and confirm the signature is yours; bring the document either way."], ["Can you tell me which one my document needs?", "Not as legal advice. Ask the person or office that requested it, or an attorney."], ["Does a notary check that my document is true?", "No. A notary confirms who signed and how, not whether the contents are accurate."]],
  },
  {
    path: `${N}/signer-who-cannot-sign-easily`, eyebrow: "Care facilities and limited mobility",
    title: "Notary for Signers Who Can't Sign Easily in NJ",
    description: "Tremors, a stroke, arthritis or weak vision? How a New Jersey mobile notary handles signers who have difficulty signing, and when to call the attorney first.",
    h1: "When the signer has trouble signing",
    lede: "Many of our visits are to people in care facilities or recovering at home. Signing may be shaky, slow or done another way. A calm, unhurried visit usually works. Some situations need an attorney's guidance first.",
    sections: [
      ["Signing differently", ["A signature doesn't have to be neat. A shaky signature that the signer makes themselves is still theirs. Some signers use a mark such as an X, and in some cases another person signs at the signer's direction. The rules and the wording differ by document, so ask the attorney or the receiving office before the visit.", "We won't guess. If the document has no wording for it, we stop and explain."]],
      ["Is the signer able to understand?", ["The signer needs to be aware of what they're signing and be willing. A notary can't judge legal capacity, but we can refuse to proceed if the signer seems confused, pressured or unsure why we are there. We may ask to speak with the signer alone for a moment."]],
      ["Plan the visit", ["Choose the time of day when the signer is at their best. Tell the facility we are coming and whether they need a visitor pass. Have the final documents ready, and keep ID close. Witnesses can be arranged when the document calls for them."]],
    ],
    links: [["Hospital and care-facility notary", `${N}/hospital-notary`], ["Power of attorney in a hospital", `${N}/guides/notarizing-a-power-of-attorney-in-a-hospital`], ["Estate planning signings", `${N}/estate-planning-notary`], ["Notarizing without ID", `${N}/notarizing-without-id`]],
    faqs: [["Can someone sign for a person who can't sign?", "Only in the ways the law and the document allow. Check with the attorney or the office that requested the document first."], ["Will you come to a nursing home?", "Yes. Tell us the facility, floor and room when you book."], ["What if the signer seems confused?", "We may decline or pause. A notary can't decide capacity, but we won't push through a signing that looks unsafe for the signer."]],
  },
  {
    path: `${N}/non-english-speaking-signers`, eyebrow: "Signers who speak another language",
    title: "Notary for Non-English-Speaking Signers in New Jersey",
    description: "Signer doesn't speak English well? What a New Jersey notary can and can't do, how translators fit in, and what to ask before booking.",
    h1: "When the signer doesn't speak English",
    lede: "A notary has to be able to communicate with the signer directly. A document in another language, or a signer who needs help with English, is possible in some cases and not in others.",
    sections: [
      ["What matters", ["The notary and the signer need to understand each other well enough for the notary to confirm identity, willingness and what kind of act is being done. If we can't do that, we can't notarize. An interpreter doesn't replace that requirement.", "Certificate wording is in English. The signer should understand what they are signing, and a translator or attorney is the right person to explain it."]],
      ["Documents in another language", ["A document in a language the notary doesn't read may still be notarizable if the notary can talk with the signer and the document has proper notarial wording. The notary doesn't vouch for the content. Some agencies want an English translation attached or a certified translation."]],
      ["Plan ahead", ["Tell us the language and whether the signer is comfortable in English when you book. We'll tell you honestly whether we're a fit. If not, we'll say so before anyone makes a trip."]],
    ],
    links: [["Certified translation", `${N}/certified-translation`], ["Apostille services", `${N}/apostille-services`], ["Embassy legalization", `${N}/embassy-legalization`], ["Mobile notary", `${N}/mobile-notary`]],
    faqs: [["Can a family member interpret?", "That depends on the document and who is asking for it. A neutral interpreter is usually safer. Ask the office that requested the document."], ["Do you translate documents?", "Notaries can't translate. We can arrange a certified translation through our translation service."], ["Does the document have to be in English?", "Not always. Some offices require English or a translation attached. Check with the one that asked for it."]],
  },
  {
    path: `${N}/notary-is-not-an-immigration-lawyer`, eyebrow: "Know the difference",
    title: "Notary vs. Immigration Lawyer: What a Notary Can't Do in NJ",
    description: "A notary public in the U.S. is not an immigration lawyer or 'notario.' See what notarizing an immigration form means and where to get real legal help.",
    h1: "A notary is not an immigration lawyer",
    lede: "In many countries a 'notario' is a lawyer. In the U.S., a notary public is not. A notary checks identity and witnesses signatures. They can't advise on immigration, pick forms or file anything on your behalf.",
    sections: [
      ["What we can do", ["Witness your signature on a form or statement that needs one, confirm ID, and notarize an affidavit of support, a sworn statement or a consent letter when the agency asks for a notarized document.", "Many immigration forms are signed under penalty of perjury and do not need a notary. We can't tell you whether yours does. Check the form's instructions."]],
      ["What we can't do", ["Advise which form to file or fill it in for you. Say whether you qualify. Promise any result. Charge for those services. Anyone who offers them as a notary may be breaking the law."]],
      ["Where to get legal help", ["Use a licensed attorney or a Department of Justice accredited representative at a recognized organization. Check credentials before paying anyone, and don't sign blank forms."]],
    ],
    links: [["Certified translation", `${N}/certified-translation`], ["Embassy legalization", `${N}/embassy-legalization`], ["Jurat vs. acknowledgment", `${N}/jurat-vs-acknowledgment`], ["Non-English-speaking signers", `${N}/non-english-speaking-signers`]],
    faqs: [["Can you help me fill out my immigration form?", "No. That is legal advice or form preparation, which we don't do. See a licensed attorney or an accredited representative."], ["Does my form need to be notarized?", "Read the form's instructions or ask your attorney. We can't make that call."], ["Can you notarize an affidavit of support?", "If the signer is present and has valid ID, we can handle the notary step."]],
  },
  {
    path: `${N}/notary-for-landlords-and-property-managers`, eyebrow: "Rental owners and managers",
    title: "Notary for Landlords & Property Managers in New Jersey",
    description: "Mobile notary for NJ landlords and property managers: leases, guarantor forms, affidavits and owner paperwork signed at the property or your office.",
    h1: "Notary help for landlords and property managers",
    lede: "Landlords and managers tend to need notarizations in clusters: a guarantor form here, an owner affidavit there. We come to the property or your office so the unit isn't held up waiting.",
    sections: [
      ["Common requests", ["Lease guarantor and co-signer forms. Owner and tenant affidavits. Authorization letters for managers and agents. Vendor and insurance paperwork. Notarized statements for housing programs, when the program asks for one."]],
      ["What to have ready", ["The final documents, unsigned, and a government photo ID for each signer. If multiple people are signing in different places, list the locations when you book so we can plan the route."]],
      ["Ongoing needs", ["If you have regular signings, tell us. We can set up a simple arrangement so your team knows who to call. We don't give legal advice on leases or evictions; your attorney handles that."]],
    ],
    links: [["Commercial lease and business contracts", `${N}/documents/commercial-lease-and-business-contracts`], ["Mobile notary", `${N}/mobile-notary`], ["Law firms and businesses", `${N}/law-firms`], ["Process serving", `${N}/process-serving`]],
    faqs: [["Can you notarize a lease?", "Yes, if the signers appear with valid ID. Most residential leases don't require it, but some programs and landlords ask."], ["Can you serve eviction papers?", "We offer process serving separately; see that page for what's covered."], ["Do you travel to each property?", "Yes, within our service area. Tell us the addresses when you book."]],
  },
];

const BOOKS = [
  {
    path: `${B}/for/notaries-and-loan-signing-agents`, eyebrow: "Bookkeeping for signing agents",
    title: "Bookkeeping for Notaries & Loan Signing Agents (NJ)",
    description: "Books for self-employed notaries and loan signing agents: tracking per-signing income, mileage, scanbacks, E&O and 1099s. By a working notary and ProAdvisor.",
    h1: "Bookkeeping for notaries and loan signing agents",
    lede: "We run a notary business ourselves and keep the books as a QuickBooks ProAdvisor. Signing-agent income is messy: many small payments from many companies, plus mileage and printing. This is how we'd set it up.",
    sections: [
      ["What's different about your books", ["Income arrives from title companies, signing services and direct clients, often with a 1099 at year end. Expenses include mileage, printing and paper, a mobile printer, E&O and bonds, commissions and renewals, and background checks or certifications.", "A clean setup tracks each source separately so you can see which companies are actually worth your time."]],
      ["The records worth keeping", ["A mileage log that records date, starting point, destination and purpose. A simple income list matched to bank deposits. Receipts for supplies. A line for each platform's fee."]],
      ["Getting current", ["If you haven't kept books, the first job is catching up: sort a year of deposits, set up categories and reconcile the bank. After that it's a few minutes a month."]],
      ["Taxes", ["Self-employed notaries generally report on Schedule C and may owe self-employment tax. We aren't a tax preparer and don't give tax advice here. Good books make your tax professional's job faster and cheaper."]],
    ],
    links: [["Bookkeeping health check", `${B}/health-check`], ["Bookkeeping guides", `${B}/guides`], ["Books for a mortgage application", `${B}/self-employed-books-for-a-mortgage`], ["Become a notary with us", `${N}/become-a-notary`]],
    faqs: [["Do you work with QuickBooks?", "Yes. We're a QuickBooks ProAdvisor and also work with other common tools."], ["Can you help me catch up on past months?", "Yes. Catch-up work is a common first project."], ["Do you do tax returns?", "No. We prepare the books and work with your tax professional."]],
  },
  {
    path: `${B}/self-employed-books-for-a-mortgage`, eyebrow: "Applying for a loan while self-employed",
    title: "Self-Employed Bookkeeping for a Mortgage Application (NJ)",
    description: "Self-employed and planning to buy or refinance? Clean books and a profit and loss statement make the lender's review easier. Here's what to prepare.",
    h1: "Get your books ready for a mortgage",
    lede: "Lenders look at self-employed income differently. They often want tax returns, a profit and loss statement and bank statements that agree with each other. Clean books make that review smoother.",
    sections: [
      ["What lenders may ask for", ["Recent personal and business tax returns, a year-to-date profit and loss statement, business bank statements and sometimes a balance sheet. Requirements vary by lender and loan type, so ask yours for their list."]],
      ["How books help", ["A profit and loss that ties to the bank statements and the tax return answers questions before they're asked. Personal and business spending that are mixed together slow the review down.", "We can't promise approval or change what a lender decides. We make the records clear and consistent."]],
      ["Timing", ["Start well before you apply. Cleanup takes longer than people expect, and lenders look at the most recent period. Avoid large unexplained deposits."]],
    ],
    links: [["Loan signing agent", `${N}/loan-signing-agent`], ["Bookkeeping health check", `${B}/health-check`], ["Bookkeeping for notaries", `${B}/for/notaries-and-loan-signing-agents`], ["Bookkeeping guides", `${B}/guides`]],
    faqs: [["Can you prepare a profit and loss statement?", "Yes, from your books. A CPA-prepared statement is a different service."], ["Will cleaner books get me approved?", "We can't promise that. They make your income easier to document."], ["How far back should the books go?", "Ask your lender. Many ask for at least the last year or two."]],
  },
  {
    path: `${B}/for/short-term-rental-hosts`, eyebrow: "Airbnb, VRBO and short-term rentals",
    title: "Bookkeeping for Airbnb & Short-Term Rental Hosts (NJ)",
    description: "Keep payouts, platform fees, cleaning, supplies and occupancy taxes straight. Bookkeeping for New Jersey short-term rental hosts by a QuickBooks ProAdvisor.",
    h1: "Bookkeeping for short-term rental hosts",
    lede: "Platform payouts don't match your bookings. Fees, refunds and taxes get netted out before the money arrives. We set up the books so each property's real numbers show up.",
    sections: [
      ["Why the books get messy", ["Payouts are net of fees and sometimes bundle several stays. Cleaning fees, supplies and repairs come from different cards. Some places charge occupancy taxes, and the rules depend on the town and platform."]],
      ["What we track", ["Gross bookings, platform fees and payouts, per property. Cleaning, supplies, utilities, mortgage interest and repairs. Anything collected for taxes shown separately from income."]],
      ["Taxes", ["How rental income is reported depends on your situation. Ask a tax professional. We keep the books they'll need."]],
    ],
    links: [["Bookkeeping health check", `${B}/health-check`], ["Bookkeeping guides", `${B}/guides`], ["Landlords and small rentals", `${B}/for/small-landlords`], ["Bookkeeping home", `${B}/`]],
    faqs: [["Do you handle occupancy tax filings?", "We can talk about it. Rules vary by town and platform, so confirm requirements with the town and your accountant."], ["Can you track multiple properties?", "Yes. Each property gets its own tracking."], ["Do you work with Airbnb reports?", "Yes. We reconcile platform payout reports against your bank deposits."]],
  },
  {
    path: `${B}/for/small-landlords`, eyebrow: "One to four rental units",
    title: "Bookkeeping for Small Landlords in New Jersey",
    description: "Rent, security deposits, repairs and mortgage interest tracked by property. Simple bookkeeping for small NJ landlords from a QuickBooks ProAdvisor.",
    h1: "Bookkeeping for small landlords",
    lede: "A few units don't need a big system, but they do need clean records: rent in, repairs out, and tenants' security deposits kept separate.",
    sections: [
      ["The basics", ["Track rent per unit, expenses per property, and security deposits apart from your own money. New Jersey has specific rules for deposits, so confirm them with your attorney."]],
      ["Repairs vs. improvements", ["Some costs are deducted right away and others are spread over time. A tax professional makes that call; we label them so the question is easy to answer."]],
      ["Year-end", ["Keep invoices for repairs and a clear record of each tenant's payments. That makes tax time and any dispute easier."]],
    ],
    links: [["Short-term rental hosts", `${B}/for/short-term-rental-hosts`], ["Bookkeeping health check", `${B}/health-check`], ["Bookkeeping guides", `${B}/guides`], ["Notary for landlords", `${N}/notary-for-landlords-and-property-managers`]],
    faqs: [["Do you handle rent collection?", "No. We keep the books of rent you collect."], ["Can you separate each property?", "Yes."], ["Do you give tax advice?", "No. We prepare clean records for your tax professional."]],
  },
  {
    path: `${B}/for/online-sellers`, eyebrow: "Etsy, Amazon, eBay and Shopify",
    title: "Bookkeeping for Etsy, Amazon & Online Sellers (NJ)",
    description: "Marketplace payouts, fees, shipping, inventory and sales tax are hard to match to your bank. Bookkeeping for NJ online sellers from a QuickBooks ProAdvisor.",
    h1: "Bookkeeping for online sellers",
    lede: "Marketplaces pay you net of fees, refunds and shipping labels. If your books only show bank deposits, you can't see your true margin. We rebuild the picture from the platform reports.",
    sections: [
      ["Where sellers get stuck", ["Deposits that don't match sales. Fees buried inside payouts. Inventory bought months before it's sold. Sales tax that the marketplace collects in some cases and you collect in others."]],
      ["What we set up", ["Sales, fees, shipping and refunds as separate lines. Cost of goods sold, so you know what you actually earn per item. Sales tax tracking, with the marketplace-collected amounts shown separately."]],
      ["Sales tax", ["Rules depend on where you sell and how. We keep the records. We don't determine your filing obligations; confirm them with the state or a tax professional."]],
    ],
    links: [["Bookkeeping health check", `${B}/health-check`], ["Bookkeeping guides", `${B}/guides`], ["Websites for small business", "/websites/"], ["Bookkeeping home", `${B}/`]],
    faqs: [["Do you reconcile platform reports?", "Yes, against your bank and card activity."], ["Can you track inventory?", "We can track cost of goods in the books. A full inventory system is a separate tool."], ["Can you file my sales tax?", "Ask us what's possible for your situation."]],
  },
  {
    path: `${B}/for/process-servers-and-field-contractors`, eyebrow: "Mileage-heavy 1099 work",
    title: "Bookkeeping for Process Servers & Field Contractors (NJ)",
    description: "Mileage, per-job pay, 1099s and slow-paying clients tracked cleanly. Bookkeeping for NJ process servers, courier drivers and other field contractors.",
    h1: "Bookkeeping for process servers and field contractors",
    lede: "Per-job pay, lots of driving and clients who pay late make cash flow hard to see. We track what you earn per job and what each mile costs.",
    sections: [
      ["What to track", ["Each job with date, client and pay. Mileage with purpose. Fuel, tolls, parking and phone costs. Who has paid and who is overdue."]],
      ["Spot the jobs that don't pay", ["A report by client, with miles driven, shows which accounts are worth the drive and which aren't."]],
      ["1099s", ["If you receive 1099s, we match them to your books so the numbers agree at tax time. Thresholds and forms change, so confirm the current rules with your tax professional."]],
    ],
    links: [["Process serving", `${N}/process-serving`], ["Bookkeeping for notaries", `${B}/for/notaries-and-loan-signing-agents`], ["Bookkeeping health check", `${B}/health-check`], ["Bookkeeping guides", `${B}/guides`]],
    faqs: [["Can you set up mileage tracking?", "Yes. We'll suggest a simple method that fits how you work."], ["Do you do payroll for a team?", "Ask us. See the bookkeeping page for payroll and filings."], ["Can you chase unpaid invoices?", "We track them and flag them. Collections are a separate matter."]],
  },
];

const paths = () => NOTARY.map((p) => [p.path, "0.6"]);
const bkPaths = () => BOOKS.map((p) => [p.path, "0.5"]);
const links = () => NOTARY.map((p) => [p.h1, p.path]);
const bkLinks = () => BOOKS.map((p) => [p.h1, p.path]);

function register(app, c, bkOpen) {
  const { layout, business, base, faqHtml, faqSchema, crumbSchema } = c;
  const mount = (pg, isBk) => app.get(pg.path, async (req, res) => {
    const biz = await business(); const url = base(req);
    const noindex = false;
    const crumbs = isBk ? [["MCC Solutions", "/"], ["Bookkeeping", "/bookkeeping/"], [pg.h1, pg.path]] : [["MCC Solutions", "/"], ["Notary", "/notary/"], [pg.h1, pg.path]];
    const cta = isBk ? ["/bookkeeping/#interest", "Get a Quote"] : ["/notary/#order", "Request an appointment"];
    res.send(layout({
      req, biz, path: pg.path, crumbs, noindex, title: fit(pg.title, "MCC Solutions"), description: pg.description,
      body: {
        hero: `<p class="eyebrow">${pg.eyebrow}</p><h1 style="margin-top:10px">${pg.h1}</h1><p class="lede" style="margin-top:14px">${pg.lede}</p><div class="hero-ctas" style="margin-top:18px"><a class="btn btn-primary" href="${cta[0]}">${cta[1]}</a></div>`,
        main: `<section class="band"><div class="wrap" style="max-width:860px">${pg.sections.map(([h, ps]) => `<h2 style="margin:28px 0 10px;font-size:1.5rem">${h}</h2>${ps.map((t) => `<p style="margin:0 0 12px">${t}</p>`).join("")}`).join("")}
          <h2 style="margin:28px 0 10px;font-size:1.5rem">Related</h2><ul class="county-links">${pg.links.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join("")}</ul>
          <p style="color:var(--muted);font-size:.9rem;margin-top:22px">${NOTE}</p></div></section>
          <section class="band alt"><div class="wrap" style="max-width:860px"><div class="sec-head"><p class="eyebrow">FAQ</p><h2>Common questions</h2></div>${faqHtml(pg.faqs)}</div></section>`,
        ctaTitle: isBk ? "Want clean books?" : "Ready to book?", ctaHref: cta[0], ctaLabel: cta[1],
      },
      schema: [faqSchema(pg.faqs), crumbSchema(url, crumbs)],
    }));
  });
  NOTARY.forEach((p) => mount(p, false));
  BOOKS.forEach((p) => mount(p, true));
}
module.exports = { register, paths, bkPaths, links, bkLinks, NOTARY, BOOKS };
