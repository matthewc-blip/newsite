// Seasonal landing pages: short, practical pages for requests that cluster at certain times of year.
// General information only; no legal advice and no claims about wait times or volumes.
const { fit } = require("./titles");

const PAGES = [
  {
    path: "/notary/travel-and-school-consent-forms", eyebrow: "Spring break, summer and back to school",
    title: "Notarized Child Travel, Camp & Passport Consent Forms in NJ",
    description: "Traveling with a child, sending one to camp, or applying for a minor's passport? We notarize consent letters and Form DS-3053 in Cranford and across NJ.",
    h1: "Consent forms for kids: travel, camps and passports",
    lede: "A notarized consent form is something families need before a trip, a camp session or a first passport. The notary confirms who signed. We can come to your home or meet you at a convenient spot.",
    sections: [
      ["Which form do you need?", ["<b>Child travel consent letter.</b> A letter from a parent saying a child may travel without that parent. Airlines, cruise lines and border officials sometimes ask for one, and a notarized signature is commonly recommended. Check with the carrier or the destination, because requirements differ.", "<b>Passport consent (Form DS-3053).</b> When a child under 16 applies for a passport and one parent can't come to the application, that parent's consent is signed in front of a notary. The form says what else to include, such as a copy of that parent's ID.", "<b>Camp, school and medical consent.</b> Some programs ask for a notarized parent signature. Ask the program which form and wording it wants."]],
      ["What to bring", ["The form or letter, completed but <b>not signed</b>. A current government-issued photo ID for each person signing. Trip dates, the traveling adult's name and the destination, if your letter includes them.", "The person giving consent must be present. A notary can't sign for someone or notarize a signature they didn't watch being made."]],
      ["Plan ahead", ["These requests bunch up before school breaks and summer. If a deadline is close, book early and tell us the date it's due. Same-day visits are sometimes possible but never guaranteed, and no time is confirmed until you get our email.", "A notary can't write the letter or tell you what a foreign country requires. For that, ask the carrier, the embassy or an attorney."]],
    ],
    links: [["Child travel consent notarization", "/notary/child-travel-consent"], ["Passport consent form (DS-3053)", "/notary/passport-consent-form"], ["Mobile notary", "/notary/mobile-notary"], ["What to bring checklist", "/notary/appointment-checklist"]],
    faqs: [["Do both parents have to sign a travel consent letter?", "Only the parent giving consent signs it. Whether you need one at all depends on the airline, cruise line or destination, so check with them."], ["Can you notarize a passport consent form online?", "The form needs to be signed in front of a notary. Ask the passport agency or acceptance facility whether a remote notarization will be accepted before you rely on one."], ["How much does it cost?", "See our starting prices on the mobile notary page. The desk confirms the fee before the appointment, and New Jersey sets the notarial fee."]],
  },
  {
    path: "/notary/year-end-estate-planning-signings", eyebrow: "Before the year ends",
    title: "Year-End Wills, POA & Healthcare Directive Signings in NJ",
    description: "Finishing a will, power of attorney or healthcare directive before year-end? A mobile notary can come to your home or care facility. Witness help available.",
    h1: "Get your estate paperwork signed before the year ends",
    lede: "Many families want a will, power of attorney or healthcare directive finished before the holidays and the new year. We handle the notary part at your home, office or a care facility.",
    sections: [
      ["What we can do", ["Take your acknowledgment or oath on documents your attorney prepared, check IDs, and make sure every page that needs a signature gets one. We can arrange witnesses when your document calls for them.", "We aren't attorneys. We can't draft documents, say which ones you need or advise on how to sign them. Bring the final documents and your attorney's signing instructions."]],
      ["Common documents", ["Last will and testament and self-proving affidavits. Durable power of attorney. Living will and healthcare proxy. Trust signature pages. Beneficiary and transfer forms for accounts."]],
      ["What to bring", ["The final documents, unsigned, with the attorney's instructions. A current government-issued photo ID for each signer. A list of who will act as witnesses, if any, and their IDs.", "Everyone signing should be present and willing. If a signer is in the hospital or a care facility, tell us when you book so we can plan the visit."]],
      ["Book early", ["The weeks around the holidays fill up. No time is guaranteed until you receive our confirmation email, so book as soon as you know the date, and call us if it's urgent."]],
    ],
    links: [["Estate planning signings", "/notary/estate-planning-notary"], ["Hospital and care-facility visits", "/notary/hospital-notary"], ["Living will and healthcare proxy", "/notary/documents/living-will-and-healthcare-proxy"], ["Trust documents", "/notary/documents/trust-documents"]],
    faqs: [["Can you tell me which documents I need?", "No. That's legal advice, which a notary can't give. An estate-planning attorney can tell you what fits your situation."], ["Do you provide witnesses?", "Yes, on request, for an added fee per witness. Ask when you book."], ["Can you come to a nursing home or hospital?", "Yes. Tell us the facility and room when you book, and we'll confirm the time by email."]],
  },
];

const paths = () => PAGES.map((p) => [p.path, "0.6"]);

function register(app, c) {
  const { layout, business, base, faqHtml, faqSchema, crumbSchema } = c;
  for (const pg of PAGES) {
    app.get(pg.path, async (req, res) => {
      const biz = await business(); const url = base(req);
      const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], [pg.h1, pg.path]];
      res.send(layout({
        req, biz, path: pg.path, crumbs, title: fit(pg.title, "MCC Solutions"), description: pg.description,
        body: {
          hero: `<p class="eyebrow">${pg.eyebrow}</p><h1 style="margin-top:10px">${pg.h1}</h1><p class="lede" style="margin-top:14px">${pg.lede}</p><div class="hero-ctas" style="margin-top:18px"><a class="btn btn-primary" href="/notary/#order">Request an appointment</a></div>`,
          main: `<section class="band"><div class="wrap" style="max-width:860px">${pg.sections.map(([h, ps]) => `<h2 style="margin:28px 0 10px;font-size:1.5rem">${h}</h2>${ps.map((t) => `<p style="margin:0 0 12px">${t}</p>`).join("")}`).join("")}
            <h2 style="margin:28px 0 10px;font-size:1.5rem">Related</h2><ul>${pg.links.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join("")}</ul>
            <p style="color:var(--muted);font-size:.9rem;margin-top:22px">General information, not legal advice. Updated October 2026.</p></div></section>
            <section class="band alt"><div class="wrap" style="max-width:860px"><div class="sec-head"><p class="eyebrow">FAQ</p><h2>Common questions</h2></div>${faqHtml(pg.faqs)}</div></section>`,
          ctaTitle: "Ready to book?", ctaHref: "/notary/#order", ctaLabel: "Request an appointment",
        },
        schema: [faqSchema(pg.faqs), crumbSchema(url, crumbs)],
      }));
    });
  }
}
module.exports = { register, paths, PAGES };
