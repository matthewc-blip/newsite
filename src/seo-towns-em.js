// Notary landing pages for the 22 Essex County and 39 Morris County towns.
// Honest scope: MCC is based in Cranford (Union County). In-person visits here are confirmed per address, and remote online notarization is available statewide.
const { getSettings } = require("./db");
const prices = require("./prices");
const { ESSEX, MORRIS, ALL } = require("./towns-essex-morris");
const unionMod = require("./seo-towns");

const COUNTY = {
  essex: { name: "Essex", towns: ESSEX, seat: "Newark", clerk: "the Essex County Clerk's office in Newark" },
  morris: { name: "Morris", towns: MORRIS, seat: "Morristown", clerk: "the Morris County Clerk's office in Morristown" },
};
const KIND = { city: "City of", town: "Town of", township: "Township of", borough: "Borough of", village: "Village of" };
const townPath = (t) => `/notary/new-jersey/${t.county}-county/${t.slug}`;
const countyPath = (k) => `/notary/new-jersey/${k}-county`;
const paths = () => ALL.map((t) => [townPath(t), "0.5"]);
const BY = Object.fromEntries(ALL.map((t) => [`${t.county}/${t.slug}`, t]));
const lookup = (t, slug) => BY[`${t.county}/${slug}`] || ALL.find((x) => x.slug === slug) || unionMod.BY[slug];
const pathOf = (t) => (t.county ? townPath(t) : unionMod.notaryPath(t));

function register(app, c) {
  const { layout, business, base, faqHtml, faqSchema, crumbSchema, esc, telHref } = c;
  const nearLinks = (t) => `<ul class="county-links">${t.near.map((s) => lookup(t, s)).filter(Boolean).map((n) => `<li><a href="${pathOf(n)}">${esc(n.name)}</a></li>`).join("")}</ul>`;

  for (const key of Object.keys(COUNTY)) {
    const C = COUNTY[key];
    app.get(`/notary/new-jersey/${key}-county/:town`, async (req, res, next) => {
      const t = C.towns.find((x) => x.slug === req.params.town);
      if (!t) return next();
      const biz = await business(); const url = base(req); const path = townPath(t);
      const settings = await getSettings().catch(() => null);
      const mobile = settings ? prices.forSlug(settings, "mobile-notary") : null;
      const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["New Jersey", "/notary/new-jersey"], [`${C.name} County`, countyPath(key)], [t.name, path]];
      const faqs = [
        [`Can a notary come to my home or office in ${t.name}?`, `We confirm in-person availability for your address before a booking is final. MCC Solutions is based in Cranford and is building its notary network in ${C.name} County, so book online or call the desk and we will tell you who can come, when, and the firm fee before anyone is dispatched.`],
        [`Can I get a document notarized online from ${t.name}?`, `Yes. Remote online notarization lets you sign from home or the office over a secure video session, with no travel. It works for many documents. Some documents, and some receiving offices, need an in-person or paper signing, so ask before you book if you are unsure.`],
        [`Do you handle loan signings in ${t.name}?`, `Yes. Loan signing agents handle purchases, refinances, HELOCs and reverse mortgages. We confirm availability for your ${t.name} address, and coordinate with your title company or lender.`],
        [`Where do I record a deed signed in ${t.name}?`, `Deeds for ${t.name} are recorded with ${C.clerk}. We can notarize the deed, and our document recording service can file it for you.`],
        [`What should I have ready for a notary visit in ${t.name}?`, `An unexpired government photo ID for every signer, the complete documents (unsigned), and every signer present. A notary cannot give legal advice or choose the document for you.`],
      ];
      res.send(layout({
        req, biz, path, crumbs,
        title: `Notary in ${t.name}, NJ | Mobile & Remote Online | MCC`,
        description: `Notary and loan signing help in ${t.name}, NJ${t.zips ? ` (${t.zips})` : ""}. Mobile visits where available, or sign online from home. Book online or call.`,
        body: {
          hero: `<p class="eyebrow">${esc(C.name)} County · ${esc(t.name)}, NJ</p><h1 style="margin-top:10px">Notary and loan signing help in ${esc(t.name)}, NJ</h1><p class="lede" style="margin-top:14px">MCC Solutions is a Cranford, NJ notary and signing firm. For ${esc(t.name)}, we offer mobile notary and loan signing visits where we have a notary available, and remote online notarization if you would rather sign from home.${mobile ? ` Mobile notary visits start at ${prices.money(mobile.price)}, plus state notarial fees.` : ""}</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="/notary/#order">Book a notary in ${esc(t.name)}</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call the desk</a></div>`,
          main: `<section class="band"><div class="wrap split">
            <div class="stack"><p class="eyebrow">About ${esc(t.name)}</p><h2>Signing in ${esc(t.name)}</h2><p class="lede">${esc(t.line)}</p><p>${esc(t.notary)}</p></div>
            <div class="stack"><h3>Places in and around ${esc(t.name)}</h3><ul class="checks">${t.anchors.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>${t.zips ? `<p style="color:var(--muted);font-size:.9rem">ZIP codes: ${esc(t.zips)}.</p>` : ""}</div>
          </div></section>
          <section class="band alt"><div class="wrap">
            <div class="sec-head"><p class="eyebrow">How we serve ${esc(t.name)}</p><h2>Two ways to get it done</h2></div>
            <div class="grid g3">
              <a class="svc" href="/notary/mobile-notary"><span class="code">MOBILE</span><h3>Mobile notary</h3><p>A notary comes to your home, office, bank or care facility in ${esc(t.name)} when we have one available. We confirm the visit and the fee before dispatching.</p><span class="more">Mobile notary →</span></a>
              <a class="svc" href="/notary/#order"><span class="code">ONLINE</span><h3>Remote online notarization</h3><p>Sign over a secure video session from home or the office, with no travel, for the documents that allow it.</p><span class="more">Book online →</span></a>
              <a class="svc" href="/notary/loan-signing-agent"><span class="code">LOANS</span><h3>Loan signing</h3><p>Purchases, refinances, HELOCs and reverse mortgages, coordinated with your title company or lender.</p><span class="more">Loan signing →</span></a>
              <a class="svc" href="/notary/hospital-notary"><span class="code">CARE</span><h3>Hospital and care-facility visits</h3><p>Powers of attorney and healthcare directives signed at the bedside, when availability allows.</p><span class="more">Hospital notary →</span></a>
              <a class="svc" href="/notary/estate-planning-notary"><span class="code">ESTATE</span><h3>Estate documents</h3><p>Wills, trusts, powers of attorney and deeds, notarized with the right witnesses.</p><span class="more">Estate notary →</span></a>
              <a class="svc" href="/notary/document-recording"><span class="code">FILE</span><h3>Document recording</h3><p>We file your deed or document with ${esc(C.clerk)}.</p><span class="more">Recording →</span></a>
            </div>
          </div></section>
          <section class="band"><div class="wrap" style="max-width:860px">
            <div class="sec-head"><p class="eyebrow">FAQ</p><h2>${esc(t.name)} notary questions</h2></div>
            ${faqHtml(faqs)}
            <h3 style="margin-top:36px;margin-bottom:12px">Nearby towns</h3>${nearLinks(t)}
            <p style="margin-top:14px;color:var(--ink-2)"><a href="${countyPath(key)}">${esc(C.name)} County notary services</a> · <a href="/notary/new-jersey">All New Jersey counties</a></p>
          </div></section>`,
          ctaTitle: `Need a notary in ${t.name}? Send it to the desk.`,
        },
        schema: [
          { "@type": "Service", name: `Notary services in ${t.name}`, serviceType: "Notary", description: `Mobile notary, loan signing and remote online notarization for ${t.name}, NJ.`, url: url + path,
            provider: { "@type": "ProfessionalService", name: "MCC Solutions", url: url + "/", address: { "@type": "PostalAddress", addressLocality: "Cranford", addressRegion: "NJ", addressCountry: "US" } },
            areaServed: { "@type": "City", name: `${t.name}, NJ` } },
          faqSchema(faqs), crumbSchema(url, crumbs),
        ],
      }));
    });
  }
}

module.exports = { register, paths, COUNTY, townPath };
