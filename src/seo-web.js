// Websites and local SEO: service pages and how-to guides under /websites/.
const { SERVICES, GUIDES } = require("./web-content");
const { fit } = require("./titles");

const HUB = "/websites/guides";
const SV_HUB = "/websites/services";
const svPath = (s) => `${SV_HUB}/${s.slug}`;
const gPath = (g) => `${HUB}/${g.slug}`;
const SV = Object.fromEntries(SERVICES.map((s) => [s.slug, s]));
const GD = Object.fromEntries(GUIDES.map((g) => [g.slug, g]));
// Rate card (set by the owner, 2026-10-07). Change here and in public/websites/index.html.
const PRICES = {
  "local-seo": { from: "$500/mo", rows: [["Local SEO audit", "$500", "one-time: site, profile, listings and a written plan"], ["Starter", "$500/mo", "profile upkeep and one new page or fix a month"], ["Standard", "$900/mo", "adds review support and two pages a month"], ["Growth", "$1,500/mo", "adds more content and a monthly call"]], note: "Monthly plans have a 3-month minimum. We never promise rankings." },
  "google-business-profile": { from: "$350", rows: [["Profile setup or cleanup", "$350", "one-time: claim, verify, complete, fix duplicates"]], note: "Suspended profiles are quoted after we see the cause. Google makes the final call on appeals." },
  "website-design": { from: "$1,500", rows: [["Starter website", "$1,500", "up to 5 pages, mobile, forms, Business Profile and Search Console set up"], ["Standard website", "$3,000", "up to 12 pages, service pages, schema, speed tuning"], ["Growth website", "From $5,000", "12+ pages, booking, town pages, tracking; quoted"]], note: "Every project gets a fixed written quote before work starts. You own the domain and accounts." },
  "website-speed": { from: "$400", rows: [["Speed fix", "$400", "Core Web Vitals review and the fixes that matter most"]], note: "Rebuilds are quoted separately if the site is too heavy to fix." },
  "technical-seo-and-schema": { from: "$85/hr", rows: [["Technical SEO and schema", "Quoted", "most sites are covered in an audit or a build"], ["Ad hoc work", "$85/hr", "fixes, redirects, markup and other small jobs"]], note: "We estimate the hours in writing before we start." },
  "website-care": { from: "$99/mo", rows: [["Care", "$99/mo", "updates, backups and security checks"], ["Care + SEO check", "$199/mo", "adds a monthly Search Console and analytics review"]], note: "Cancel any time. You keep your site and accounts." },
};
const priceBand = (pr) => pr ? `<section class="band alt"><div class="wrap" style="max-width:860px"><div class="sec-head"><p class="eyebrow">Pricing</p><h2>What it costs</h2></div><div class="price-list">${pr.rows.map(([n, a, d]) => `<div style="display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--line,#ddd)"><div><b>${n}</b><br><span style="color:var(--ink-2)">${d}</span></div><div style="white-space:nowrap;font-weight:600">${a}</div></div>`).join("")}</div><p style="margin-top:14px;color:var(--ink-2)">${pr.note} Prices are starting points. We confirm a written quote before any work begins.</p></div></section>` : "";

const paths = () => [[HUB, "0.6"], [SV_HUB, "0.7"], ...SERVICES.map((s) => [svPath(s), "0.7"]), ...GUIDES.map((g) => [gPath(g), "0.6"])];

function register(app, c) {
  const { layout, business, base, faqHtml, faqSchema, crumbSchema, esc, telHref } = c;
  const CTA = { ctaHref: "/websites/#quote", ctaLabel: "Get a Quote" };
  const card = (href, code, h, p, more) => `<a class="svc" href="${href}"><span class="code">${code}</span><h3>${esc(h)}</h3><p>${esc(p)}</p><span class="more">${more} →</span></a>`;
  const provider = (url) => ({ "@type": "ProfessionalService", name: "MCC Solutions", url: url + "/", address: { "@type": "PostalAddress", addressLocality: "Cranford", addressRegion: "NJ", addressCountry: "US" } });

  app.get(HUB, async (req, res) => {
    const biz = await business(); const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Websites", "/websites/"], ["Guides", HUB]];
    res.send(layout({
      req, biz, path: HUB, crumbs,
      title: "Local SEO & Website Guides for Small Business | MCC",
      description: "Plain-language guides on local SEO, Google Business Profile, reviews, Core Web Vitals, schema, Search Console and small business website costs.",
      body: {
        hero: `<p class="eyebrow">Websites &amp; local SEO guides</p><h1 style="margin-top:10px">Plain answers to local SEO and website questions</h1><p class="lede" style="margin-top:14px">Short guides from the MCC Solutions desk for New Jersey business owners. No ranking promises, just what works and what to avoid.</p>`,
        main: `<section class="band"><div class="wrap"><div class="grid g3">${GUIDES.map((g) => card(gPath(g), "GUIDE", g.title, g.description, "Read the guide")).join("")}</div>
          <p style="margin-top:28px;color:var(--ink-2)">Want help with the work? See our <a href="${SV_HUB}">website and local SEO services</a>.</p></div></section>`,
        ctaTitle: "Rather have us handle it? Ask for a quote.", ...CTA,
      },
      schema: [crumbSchema(url, crumbs), { "@type": "CollectionPage", name: "Websites and local SEO guides", url: url + HUB, hasPart: GUIDES.map((g) => ({ "@type": "Article", headline: g.title, url: url + gPath(g) })) }],
    }));
  });

  app.get(SV_HUB, async (req, res) => {
    const biz = await business(); const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Websites", "/websites/"], ["Services", SV_HUB]];
    res.send(layout({
      req, biz, path: SV_HUB, crumbs,
      title: "Website Design & Local SEO Services in NJ | MCC Solutions",
      description: "Local SEO, Google Business Profile, website design, speed fixes, technical SEO and website care for New Jersey small businesses. Fixed written quotes.",
      body: {
        hero: `<p class="eyebrow">Websites &amp; local SEO</p><h1 style="margin-top:10px">Website and local SEO services for New Jersey businesses</h1><p class="lede" style="margin-top:14px">Clear, fast websites and local search work from a Cranford firm. Fixed written quotes, you own your accounts, and no ranking promises.</p>`,
        main: `<section class="band"><div class="wrap"><div class="grid g3">${SERVICES.map((s) => card(svPath(s), "SERVICE", s.name, s.description + (PRICES[s.slug] ? ` From ${PRICES[s.slug].from}.` : ""), s.short)).join("")}</div>
          <p style="margin-top:28px;color:var(--ink-2)">Not sure where to start? Read <a href="${gPath(GD["local-seo-checklist-for-small-business"])}">our local SEO checklist</a> or <a href="/websites/#quote">tell us about your business</a>.</p></div></section>`,
        ctaTitle: "Tell us what you need. We'll quote it in writing.", ...CTA,
      },
      schema: [crumbSchema(url, crumbs)],
    }));
  });

  app.get(`${SV_HUB}/:slug`, async (req, res, next) => {
    const s = SV[req.params.slug]; if (!s) return next();
    const biz = await business(); const url = base(req); const path = svPath(s);
    const crumbs = [["MCC Solutions", "/"], ["Websites", "/websites/"], ["Services", SV_HUB], [s.name, path]];
    const gl = s.guides.map((x) => GD[x]).filter(Boolean);
    const others = SERVICES.filter((x) => x.slug !== s.slug);
    res.send(layout({
      req, biz, path, crumbs,
      title: fit(s.title), description: s.description,
      body: {
        hero: `<p class="eyebrow">Websites &amp; local SEO · ${esc(s.name)}</p><h1 style="margin-top:10px">${esc(s.title)}</h1><p class="lede" style="margin-top:14px">${esc(s.intro)}</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="/websites/#quote">Get a quote</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call the desk</a></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">What's included</p><h2>${esc(s.name)} work</h2><ul class="checks">${s.includes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div class="stack"><p class="eyebrow">Good fit for</p><h2>Who this helps</h2><ul class="checks">${s.fit.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p style="color:var(--ink-2)">We do not promise rankings. We do solid work, explain what we did and set up the tools so you can see the results.</p></div>
        </div></section>
        <section class="band alt"><div class="wrap">
          <div class="sec-head"><p class="eyebrow">How it works</p><h2>Four steps</h2></div>
          <ol class="steps">${s.process.map(([h, p]) => `<li><b>${esc(h)}</b><span>${esc(p)}</span></li>`).join("")}</ol>
        </div></section>
        ${priceBand(PRICES[s.slug])}
        <section class="band"><div class="wrap" style="max-width:860px">
          <div class="sec-head"><p class="eyebrow">FAQ</p><h2>${esc(s.name)} questions</h2></div>
          ${faqHtml(s.faqs)}
          ${gl.length ? `<h3 style="margin-top:36px;margin-bottom:12px">Helpful guides</h3><ul class="county-links">${gl.map((g) => `<li><a href="${gPath(g)}">${esc(g.title)}</a></li>`).join("")}</ul>` : ""}
          <h3 style="margin-top:28px;margin-bottom:12px">Other services</h3><ul class="county-links">${others.map((o) => `<li><a href="${svPath(o)}">${esc(o.name)}</a></li>`).join("")}</ul>
        </div></section>`,
        ctaTitle: `Want help with ${s.short.toLowerCase()}? Ask for a quote.`, ...CTA,
      },
      schema: [
        { "@type": "Service", name: s.title, serviceType: s.name, description: s.description, url: url + path, provider: provider(url), areaServed: { "@type": "State", name: "New Jersey" } },
        faqSchema(s.faqs), crumbSchema(url, crumbs),
      ],
    }));
  });

  app.get(`${HUB}/:slug`, async (req, res, next) => {
    const g = GD[req.params.slug]; if (!g) return next();
    const biz = await business(); const url = base(req); const path = gPath(g);
    const crumbs = [["MCC Solutions", "/"], ["Websites", "/websites/"], ["Guides", HUB], [g.title, path]];
    const svcs = (g.services || []).map((x) => SV[x]).filter(Boolean);
    const more = GUIDES.filter((x) => x.slug !== g.slug).slice(0, 4);
    const updated = new Date(g.updated + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    res.send(layout({
      req, biz, path, crumbs, title: fit(g.title), description: g.description,
      body: {
        hero: `<p class="eyebrow">Guide · Updated ${esc(updated)}</p><h1 style="margin-top:10px">${esc(g.title)}</h1><p class="lede" style="margin-top:14px">${esc(g.intro)}</p><p class="byline">By <a href="/about">Matthew Coleman</a>, MCC Solutions</p>`,
        main: `<section class="band"><div class="wrap guide-layout">
          <article class="legal-doc guide">${g.sections.map(([h, ps]) => `<h2>${esc(h)}</h2>${ps.map((t) => `<p>${esc(t)}</p>`).join("")}`).join("")}
            <h2>Common questions</h2>${faqHtml(g.faqs)}
            <p class="guide-note">This guide is general information. Search engines change how they work and their guidelines; check Google's current documentation for your situation. Nobody can guarantee a ranking.</p>
          </article>
          <aside class="guide-aside"><div class="stack"><p class="eyebrow">Let us handle it</p>
            ${svcs.map((s) => `<a class="svc" href="${svPath(s)}"><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p><span class="more">${esc(s.short)} →</span></a>`).join("")}
            <p class="eyebrow" style="margin-top:12px">More guides</p><ul>${more.map((m) => `<li><a href="${gPath(m)}">${esc(m.title)}</a></li>`).join("")}</ul>
            <a class="btn btn-ghost" href="${HUB}">All guides</a></div></aside>
        </div></section>`,
        ctaTitle: "Rather have us handle it? Ask for a quote.", ...CTA,
      },
      schema: [
        { "@type": "Article", headline: g.title, description: g.description, dateModified: g.updated, datePublished: g.updated, author: { "@type": "Person", name: "Matthew Coleman", url: url + "/about" }, publisher: { "@type": "Organization", name: "MCC Solutions", url: url + "/" }, mainEntityOfPage: url + path, image: url + "/img/og.png" },
        faqSchema(g.faqs), crumbSchema(url, crumbs),
      ],
    }));
  });
}

module.exports = { register, paths, HUB, SV_HUB, PRICES };
