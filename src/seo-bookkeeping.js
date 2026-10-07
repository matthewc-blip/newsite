// Bookkeeping software pages and how-to guides. Shown (and in the sitemap) once bookkeeping is opened in Settings.
const { SOFTWARE, GUIDES } = require("./bk-content");
const { getSettings } = require("./db");

const HUB = "/bookkeeping/guides";
const SW_HUB = "/bookkeeping/software";
const swPath = (s) => `${SW_HUB}/${s.slug}`;
const gPath = (g) => `${HUB}/${g.slug}`;
const SW = Object.fromEntries(SOFTWARE.map((s) => [s.slug, s]));
const GD = Object.fromEntries(GUIDES.map((g) => [g.slug, g]));
const paths = () => [[HUB, "0.6"], [SW_HUB, "0.6"], ...SOFTWARE.map((s) => [swPath(s), "0.6"]), ...GUIDES.map((g) => [gPath(g), "0.6"])];

function register(app, c) {
  const { layout, business, base, faqHtml, faqSchema, crumbSchema, esc, telHref } = c;
  const open = async () => !!((await getSettings().catch(() => null))?.bookkeeping?.open);
  const CTA = { ctaHref: "/bookkeeping/#interest", ctaLabel: "Get a Quote" };
  const card = (href, code, h, p, more) => `<a class="svc" href="${href}"><span class="code">${code}</span><h3>${esc(h)}</h3><p>${esc(p)}</p><span class="more">${more} →</span></a>`;
  const provider = (url) => ({ "@type": "ProfessionalService", name: "MCC Solutions", url: url + "/", address: { "@type": "PostalAddress", addressLocality: "Cranford", addressRegion: "NJ", addressCountry: "US" } });

  app.get(HUB, async (req, res) => {
    const biz = await business(); const url = base(req); const noindex = !(await open());
    const crumbs = [["MCC Solutions", "/"], ["Bookkeeping", "/bookkeeping/"], ["Guides", HUB]];
    res.send(layout({
      req, biz, path: HUB, crumbs, noindex,
      title: "Small Business Bookkeeping Guides for New Jersey | MCC",
      description: "Plain-language bookkeeping guides for New Jersey small businesses: QuickBooks ProAdvisors, reconciliation, catching up, sales tax, payroll, 1099s and more.",
      body: {
        hero: `<p class="eyebrow">Bookkeeping guides</p><h1 style="margin-top:10px">Plain answers to small business bookkeeping questions</h1><p class="lede" style="margin-top:14px">Short guides from the MCC Solutions desk for New Jersey business owners. General information, not tax or legal advice.</p>`,
        main: `<section class="band"><div class="wrap"><div class="grid g3">${GUIDES.map((g) => card(gPath(g), "GUIDE", g.title, g.description, "Read the guide")).join("")}</div>
          <p style="margin-top:28px;color:var(--ink-2)">Looking for help with a specific program? See <a href="${SW_HUB}">bookkeeping by software</a>.</p></div></section>`,
        ctaTitle: "Rather have us keep the books? Ask for a quote.", ...CTA,
      },
      schema: [crumbSchema(url, crumbs), { "@type": "CollectionPage", name: "Bookkeeping guides", url: url + HUB, hasPart: GUIDES.map((g) => ({ "@type": "Article", headline: g.title, url: url + gPath(g) })) }],
    }));
  });

  app.get(SW_HUB, async (req, res) => {
    const biz = await business(); const url = base(req); const noindex = !(await open());
    const crumbs = [["MCC Solutions", "/"], ["Bookkeeping", "/bookkeeping/"], ["Software", SW_HUB]];
    res.send(layout({
      req, biz, path: SW_HUB, crumbs, noindex,
      title: "Bookkeeping for QuickBooks, Xero, Wave & More | MCC Solutions",
      description: "Bookkeeping help for the software you already use: QuickBooks Online, Xero, Wave, FreshBooks, Zoho Books, payroll tools and card processors. New Jersey firm.",
      body: {
        hero: `<p class="eyebrow">Bookkeeping by software</p><h1 style="margin-top:10px">We work in the program you already use</h1><p class="lede" style="margin-top:14px">Your books stay in an account you own. Pick your software to see how we work in it, what to watch for, and which guides help.</p>`,
        main: `<section class="band"><div class="wrap"><div class="grid g3">${SOFTWARE.map((s) => card(swPath(s), "SOFTWARE", s.name, s.description, s.short)).join("")}</div>
          <p style="margin-top:28px;color:var(--ink-2)">Not sure which program fits? Read <a href="${gPath(GD["how-to-switch-accounting-software"])}">how to switch accounting software</a> or <a href="/bookkeeping/#interest">tell us about your business</a>.</p></div></section>`,
        ctaTitle: "Tell us what you use. We'll tell you what it needs.", ...CTA,
      },
      schema: [crumbSchema(url, crumbs)],
    }));
  });

  app.get(`${SW_HUB}/:slug`, async (req, res, next) => {
    const s = SW[req.params.slug]; if (!s) return next();
    const biz = await business(); const url = base(req); const path = swPath(s); const noindex = !(await open());
    const crumbs = [["MCC Solutions", "/"], ["Bookkeeping", "/bookkeeping/"], ["Software", SW_HUB], [s.name, path]];
    const gl = s.guides.map((x) => GD[x]).filter(Boolean);
    const others = SOFTWARE.filter((x) => x.slug !== s.slug);
    res.send(layout({
      req, biz, path, crumbs, noindex,
      title: `${s.title} | MCC Solutions`.slice(0, 70), description: s.description,
      body: {
        hero: `<p class="eyebrow">Bookkeeping · ${esc(s.name)}</p><h1 style="margin-top:10px">${esc(s.title)}</h1><p class="lede" style="margin-top:14px">${esc(s.intro)}</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="/bookkeeping/#interest">Get a bookkeeping quote</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call the desk</a></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">Good fit for</p><h2>Who ${esc(s.short)} suits</h2><ul class="checks">${s.fits.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div class="stack"><p class="eyebrow">What we do</p><h2>Bookkeeping in ${esc(s.short)}</h2><ul class="checks">${s.work.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        </div></section>
        <section class="band alt"><div class="wrap" style="max-width:860px">
          <div class="sec-head"><p class="eyebrow">Before you commit</p><h2>What to watch for</h2></div>
          <ul class="checks">${s.watch.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
          <p style="margin-top:18px;color:var(--ink-2)">Software plans and prices change often, so check the provider's current details. MCC Solutions is independent and not affiliated with the software companies named on this site.</p>
        </div></section>
        <section class="band"><div class="wrap" style="max-width:860px">
          <div class="sec-head"><p class="eyebrow">FAQ</p><h2>${esc(s.name)} questions</h2></div>
          ${faqHtml(s.faqs)}
          ${gl.length ? `<h3 style="margin-top:36px;margin-bottom:12px">Helpful guides</h3><ul class="county-links">${gl.map((g) => `<li><a href="${gPath(g)}">${esc(g.title)}</a></li>`).join("")}</ul>` : ""}
          <h3 style="margin-top:28px;margin-bottom:12px">Other software</h3><ul class="county-links">${others.map((o) => `<li><a href="${swPath(o)}">${esc(o.name)}</a></li>`).join("")}</ul>
        </div></section>`,
        ctaTitle: `Need help with ${s.short}? Ask for a quote.`, ...CTA,
      },
      schema: [
        { "@type": "Service", name: s.title, serviceType: "Bookkeeping", description: s.description, url: url + path, provider: provider(url), areaServed: { "@type": "State", name: "New Jersey" } },
        faqSchema(s.faqs), crumbSchema(url, crumbs),
      ],
    }));
  });

  app.get(`${HUB}/:slug`, async (req, res, next) => {
    const g = GD[req.params.slug]; if (!g) return next();
    const biz = await business(); const url = base(req); const path = gPath(g); const noindex = !(await open());
    const crumbs = [["MCC Solutions", "/"], ["Bookkeeping", "/bookkeeping/"], ["Guides", HUB], [g.title, path]];
    const sws = (g.software || []).map((x) => SW[x]).filter(Boolean);
    const more = GUIDES.filter((x) => x.slug !== g.slug).slice(0, 4);
    const updated = new Date(g.updated + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    res.send(layout({
      req, biz, path, crumbs, noindex, title: `${g.title} | MCC Solutions`.slice(0, 70), description: g.description,
      body: {
        hero: `<p class="eyebrow">Bookkeeping guide · Updated ${esc(updated)}</p><h1 style="margin-top:10px">${esc(g.title)}</h1><p class="lede" style="margin-top:14px">${esc(g.intro)}</p><p class="byline">By <a href="/about">Matthew Coleman</a>, MCC Solutions</p>`,
        main: `<section class="band"><div class="wrap guide-layout">
          <article class="legal-doc guide">${g.sections.map(([h, ps]) => `<h2>${esc(h)}</h2>${ps.map((t) => `<p>${esc(t)}</p>`).join("")}`).join("")}
            <h2>Common questions</h2>${faqHtml(g.faqs)}
            <p class="guide-note">This guide is general information, not tax, legal or accounting advice. Rules, fees and due dates change; check with the IRS, the NJ Division of Taxation or a licensed professional for your situation.</p>
          </article>
          <aside class="guide-aside"><div class="stack"><p class="eyebrow">Let us handle it</p>
            <a class="svc" href="/bookkeeping/"><h3>Monthly bookkeeping</h3><p>Categorizing, reconciling and monthly reports, with cleanup, payroll and NJ filings available.</p><span class="more">Bookkeeping →</span></a>
            ${sws.map((s) => `<a class="svc" href="${swPath(s)}"><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p><span class="more">${esc(s.short)} →</span></a>`).join("")}
            <p class="eyebrow" style="margin-top:12px">More guides</p><ul>${more.map((m) => `<li><a href="${gPath(m)}">${esc(m.title)}</a></li>`).join("")}</ul>
            <a class="btn btn-ghost" href="${HUB}">All guides</a></div></aside>
        </div></section>`,
        ctaTitle: "Rather have us keep the books? Ask for a quote.", ...CTA,
      },
      schema: [
        { "@type": "Article", headline: g.title, description: g.description, dateModified: g.updated, datePublished: g.updated, author: { "@type": "Person", name: "Matthew Coleman", url: url + "/about" }, publisher: { "@type": "Organization", name: "MCC Solutions", url: url + "/" }, mainEntityOfPage: url + path, image: url + "/img/og.png" },
        faqSchema(g.faqs), crumbSchema(url, crumbs),
      ],
    }));
  });
}

module.exports = { register, paths, HUB, SW_HUB };
