// Crawlable landing pages for search: one per New Jersey county, one per service, a New Jersey hub,
// plus sitemap.xml and robots.txt. Pages are rendered on the server so search engines see full HTML.
const { getSettings } = require("./db");
const { COUNTIES, SERVICES } = require("./seo-data");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bySlug = Object.fromEntries(COUNTIES.map((c) => [c.slug, c]));
const NJ_HUB = "/notary/new-jersey";
const countyPath = (c) => `${NJ_HUB}/${c.slug}-county`;
const servicePath = (s) => `/notary/${s.slug}`;
const BUILT = new Date().toISOString().slice(0, 10);

function base(req) {
  const env = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
  return env || `${req.protocol}://${req.get("host")}`;
}

async function business() {
  try { return (await getSettings()).business; }
  catch { return { name: "MCC Solutions", phone: "", email: "" }; }
}
const telHref = (p) => "tel:+1" + String(p || "").replace(/\D/g, "").replace(/^1/, "");

function orgSchema(url, biz, areas) {
  return {
    "@type": "ProfessionalService",
    "@id": url + "/#business",
    name: biz.name || "MCC Solutions",
    url: url + "/notary/",
    telephone: biz.phone || undefined,
    email: biz.email || undefined,
    priceRange: "$$",
    description: "Mobile notary and loan signing agent dispatch for New Jersey: in-person signings, Remote Online Notarization and Remote Ink-Signed Notarization.",
    areaServed: areas,
    openingHoursSpecification: [
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "07:00", closes: "21:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Saturday", opens: "09:00", closes: "17:00" },
    ],
  };
}
const faqSchema = (faqs) => ({ "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
const crumbSchema = (url, items) => ({ "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: url + path })) });

function layout({ req, biz, title, description, path, crumbs, body, schema }) {
  const url = base(req);
  const canonical = url + path;
  const graph = { "@context": "https://schema.org", "@graph": schema };
  const json = JSON.stringify(graph).replace(/</g, "\\u003c");
  const phone = esc(biz.phone), email = esc(biz.email);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MCC Solutions">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,500..900&family=Public+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/css/site.css">
<script type="application/ld+json">${json}</script>
<script src="/js/ga.js" async></script>
</head>
<body class="seo">
<div class="strip"><div class="wrap">
  <span>Dispatch desk: <a class="mono" href="${telHref(biz.phone)}" style="color:inherit"><b>${phone}</b></a> · <b>${email}</b></span>
  <span>Mon–Fri 7AM–9PM ET · Sat 9AM–5PM · <a href="/" style="color:inherit">← MCC Solutions home</a></span>
</div></div>
<header class="site"><div class="wrap">
  <a class="brand" href="/notary/"><span class="seal">MCC</span><span><span class="brand-name">MCC Solutions</span><span class="brand-sub">Notary &amp; Signing Dispatch</span></span></a>
  <button class="menu-btn" id="menuBtn" aria-expanded="false" aria-controls="mainNav">Menu</button>
  <nav class="main" id="mainNav" aria-label="Main">
    <a href="/notary/loan-signing-agent">Loan Signings</a>
    <a href="/notary/mobile-notary">Mobile Notary</a>
    <a href="/notary/hospital-notary">Hospital Visits</a>
    <a href="/notary/remote-online-notarization">RON</a>
    <a href="${NJ_HUB}">NJ Counties</a>
    <a href="/notary/#faq">FAQ</a>
    <a href="/notary/#contact">Contact</a>
  </nav>
  <a class="btn btn-primary hdr-cta" href="/notary/#order">Book Now</a>
</div></header>
<main>
  <section class="page-hero"><div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([n, p], i) => (i < crumbs.length - 1 ? `<a href="${p}">${esc(n)}</a> / ` : esc(n))).join("")}</nav>
    ${body.hero}
  </div></section>
  ${body.main}
  <section class="band cta-band"><div class="wrap">
    <h2>${esc(body.ctaTitle || "Need a notary? Send it to the desk.")}</h2>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-primary" href="/notary/#order">Book Now</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call ${phone}</a></div>
  </div></section>
</main>
<footer><div class="wrap">
  <div class="cols">
    <div class="stack"><a class="brand" href="/notary/"><span class="seal">MCC</span><span class="brand-name">MCC Solutions</span></a><p>Notary and loan signing dispatch. In-person, RON and RIN signings coordinated from one desk.</p></div>
    <div><h4>Services</h4><ul>${SERVICES.map((s) => `<li><a href="${servicePath(s)}">${esc(s.short)}</a></li>`).join("")}</ul></div>
    <div><h4>New Jersey</h4><ul class="foot-counties">${COUNTIES.map((c) => `<li><a href="${countyPath(c)}">${esc(c.name)}</a></li>`).join("")}</ul></div>
    <div><h4>Desk</h4><ul><li class="mono"><a href="${telHref(biz.phone)}">${phone}</a></li><li class="mono">${email}</li><li>Mon–Fri 7AM–9PM ET</li><li>Sat 9AM–5PM ET</li><li><a href="/notary/#order" style="color:var(--brass)">Order a signing →</a></li></ul></div>
  </div>
  <p class="foot-links"><a href="/about">About</a> · <a href="/notary/vendors">Vendor packet</a> · <a href="/notary/#notaries">Join as a notary</a> · <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of service</a></p>
  <div class="legal">
    <p>MCC Solutions is not a law firm and does not provide legal advice. Notaries and signing agents cannot explain the legal effect of documents. Remote notarization availability depends on state law and the acceptance of the receiving party.</p>
    <p>© ${new Date().getFullYear()} MCC Solutions. All rights reserved.</p>
  </div>
</div></footer>
<script>(function(){var b=document.getElementById("menuBtn"),n=document.getElementById("mainNav");b.addEventListener("click",function(){b.setAttribute("aria-expanded",n.classList.toggle("open"))});})();</script>
</body>
</html>`;
}

const faqHtml = (faqs) => `<div class="faq-group">${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>`;
const serviceCards = (lead) => `<div class="grid g3">${SERVICES.map((s) => `<a class="svc" href="${servicePath(s)}"><span class="code">${esc(s.code)}</span><h3>${esc(lead ? `${s.name} in ${lead}` : s.name)}</h3><p>${esc(s.description)}</p><span class="more">${esc(s.short)} →</span></a>`).join("")}</div>`;
const countyLinks = (list) => `<ul class="county-links">${list.map((c) => `<li><a href="${countyPath(c)}">${esc(c.name)} County</a></li>`).join("")}</ul>`;

function countyFaqs(c) {
  return [
    [`Can a notary come to my home in ${c.towns[0]} or ${c.towns[1]}?`, `Yes. MCC Solutions sends mobile notaries and signing agents to homes, offices and care facilities throughout ${c.name} County, including ${c.towns.slice(0, 4).join(", ")}. Travel beyond 20 miles is quoted before we confirm.`],
    [`Do you handle loan closings for title companies in ${c.name} County?`, `Yes. Our certified signing agents handle purchase, refinance, HELOC and reverse mortgage signings in ${c.name} County, with scanbacks reviewed by the desk and the return tracking number sent to your team.`],
    [`Can you notarize at a hospital or nursing home in ${c.name} County?`, `Yes. We visit hospitals, rehab centers, assisted living and hospice care in ${c.name} County for powers of attorney, healthcare proxies and other documents, including evenings and weekends.`],
    [`How much does a mobile notary cost in ${c.name} County?`, `New Jersey sets the notarial fee at $2.50 per act. Travel and service fees depend on distance and timing, and you get a firm quote before the appointment is confirmed.`],
  ];
}

function register(app) {
  app.get(NJ_HUB, async (req, res) => {
    const biz = await business();
    const url = base(req);
    const regions = ["North Jersey", "Central Jersey", "South Jersey"];
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["New Jersey", NJ_HUB]];
    res.send(layout({
      req, biz, path: NJ_HUB, crumbs,
      title: "Mobile Notary & Loan Signing Agents in New Jersey | MCC",
      description: "Mobile notaries and certified loan signing agents in all 21 New Jersey counties. Home, office and hospital visits, plus remote online notarization.",
      body: {
        hero: `<h1>Mobile notary and loan signing agents in all 21 New Jersey counties</h1><p class="lede" style="margin-top:14px">MCC Solutions dispatches commissioned New Jersey notaries and certified signing agents statewide, from Bergen to Cape May. Same-day visits are most available in central and North Jersey; 24 hours' notice gives the best match anywhere in the state.</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="/notary/#order">Book a notary</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call the desk</a></div>`,
        main: `<section class="band"><div class="wrap">
          <div class="sec-head"><p class="eyebrow">Counties</p><h2>Find your county</h2></div>
          <div class="grid g3">${regions.map((r) => `<div><h3 style="margin-bottom:10px">${r}</h3>${countyLinks(COUNTIES.filter((c) => c.region === r))}</div>`).join("")}</div>
        </div></section>
        <section class="band alt"><div class="wrap">
          <div class="sec-head"><p class="eyebrow">Services</p><h2>What we handle across New Jersey</h2></div>
          ${serviceCards("")}
        </div></section>`,
        ctaTitle: "Book a New Jersey notary in minutes.",
      },
      schema: [orgSchema(url, biz, { "@type": "State", name: "New Jersey" }), crumbSchema(url, crumbs)],
    }));
  });

  app.get(`${NJ_HUB}/:slug`, async (req, res, next) => {
    const m = /^([a-z-]+)-county$/.exec(req.params.slug);
    const c = m && bySlug[m[1]];
    if (!c) return next();
    const biz = await business();
    const url = base(req);
    const path = countyPath(c);
    const faqs = countyFaqs(c);
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["New Jersey", NJ_HUB], [`${c.name} County`, path]];
    const neighbors = c.neighbors.map((s) => bySlug[s]).filter(Boolean);
    res.send(layout({
      req, biz, path, crumbs,
      title: `Mobile Notary in ${c.name} County, NJ | Loan Signing Agent`,
      description: `Mobile notary and loan signing agents in ${c.name} County, NJ, including ${c.towns[0]} and ${c.towns[1]}. Home, office and hospital visits. Book online.`,
      body: {
        hero: `<p class="eyebrow">${esc(c.region)} · County seat: ${esc(c.seat)}</p><h1 style="margin-top:10px">Mobile notary and loan signing agents in ${esc(c.name)} County, NJ</h1><p class="lede" style="margin-top:14px">MCC Solutions sends commissioned notaries and certified signing agents to homes, offices, hospitals and care facilities across ${esc(c.name)} County, from ${esc(c.towns[0])} to ${esc(c.towns[c.towns.length - 1])}.</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="/notary/#order">Book in ${esc(c.name)} County</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call the desk</a></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">Local coverage</p><h2>Signing in ${esc(c.name)} County</h2><p class="lede">${esc(c.note)}</p></div>
          <div><h3 style="margin-bottom:12px">Towns we serve in ${esc(c.name)} County</h3><ul class="town-list">${c.towns.map((t) => `<li>${esc(t)}</li>`).join("")}</ul><p style="margin-top:12px;font-size:.9rem;color:var(--muted)">Don't see your town? We cover all of ${esc(c.name)} County. Ask the desk.</p></div>
        </div></section>
        <section class="band alt"><div class="wrap">
          <div class="sec-head"><p class="eyebrow">Services</p><h2>Notary services in ${esc(c.name)} County</h2></div>
          ${serviceCards(`${c.name} County`)}
        </div></section>
        <section class="band"><div class="wrap" style="max-width:860px">
          <div class="sec-head"><p class="eyebrow">FAQ</p><h2>${esc(c.name)} County notary questions</h2></div>
          ${faqHtml(faqs)}
          <h3 style="margin-top:36px;margin-bottom:12px">Nearby counties</h3>${countyLinks(neighbors)}
        </div></section>`,
        ctaTitle: `Need a notary in ${c.name} County? Send it to the desk.`,
      },
      schema: [
        orgSchema(url, biz, [{ "@type": "AdministrativeArea", name: `${c.name} County, New Jersey` }, ...c.towns.map((t) => ({ "@type": "City", name: `${t}, NJ` }))]),
        faqSchema(faqs),
        crumbSchema(url, crumbs),
      ],
    }));
  });

  for (const s of SERVICES) {
    app.get(servicePath(s), async (req, res) => {
      const biz = await business();
      const url = base(req);
      const path = servicePath(s);
      const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], [s.name, path]];
      res.send(layout({
        req, biz, path, crumbs, title: s.title, description: s.description,
        body: {
          hero: `<p class="eyebrow">${esc(s.code)}</p><h1 style="margin-top:10px">${esc(s.h1)}</h1><p class="lede" style="margin-top:14px">${esc(s.lede)}</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="/notary/#order">Book now</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call the desk</a></div>`,
          main: `<section class="band"><div class="wrap split">
            <div class="stack"><p class="eyebrow">What's included</p><h2>Every ${esc(s.short.toLowerCase())} order</h2><ul class="checks">${s.included.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
            <div class="stack"><p class="eyebrow">Who uses it</p><h2>Built for</h2><ul class="checks">${s.who.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
          </div></section>
          <section class="band alt"><div class="wrap" style="max-width:860px">
            <div class="sec-head"><p class="eyebrow">FAQ</p><h2>Common questions</h2></div>
            ${faqHtml(s.faqs)}
          </div></section>
          <section class="band"><div class="wrap">
            <div class="sec-head"><p class="eyebrow">Where we work</p><h2>${esc(s.name)} in every New Jersey county</h2></div>
            ${countyLinks(COUNTIES)}
          </div></section>`,
        },
        schema: [
          orgSchema(url, biz, { "@type": "State", name: "New Jersey" }),
          { "@type": "Service", name: s.name, serviceType: s.short, description: s.description, provider: { "@id": url + "/#business" }, areaServed: { "@type": "State", name: "New Jersey" }, url: url + path },
          faqSchema(s.faqs),
          crumbSchema(url, crumbs),
        ],
      }));
    });
  }

  app.get("/sitemap.xml", (req, res) => {
    const url = base(req);
    const paths = [["/", "1.0"], ["/notary/", "0.9"], [NJ_HUB, "0.8"], ...SERVICES.map((s) => [servicePath(s), "0.8"]), ...COUNTIES.map((c) => [countyPath(c), "0.7"]), ["/about", "0.6"], ["/notary/vendors", "0.6"], ["/privacy", "0.3"], ["/terms", "0.3"]];
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map(([p, pr]) => `  <url><loc>${esc(url + p)}</loc><lastmod>${BUILT}</lastmod><priority>${pr}</priority></url>`).join("\n")}
</urlset>`);
  });

  // Google Analytics loader. Uses the MCC GA4 property by default; GA_MEASUREMENT_ID overrides it.
  // Loaded only on public pages; the admin, notary and client portals never include it.
  app.get("/js/ga.js", (req, res) => {
    const id = String(process.env.GA_MEASUREMENT_ID || "G-YD3R9MMYGZ").trim(); // set GA_MEASUREMENT_ID to override, or "off" to disable
    res.type("application/javascript").set("Cache-Control", "public, max-age=300");
    if (!/^G-[A-Z0-9]{4,}$/.test(id)) return res.send("window.mccTrack=function(){};");
    res.send(`(function(){
var id=${JSON.stringify(id)};
window.dataLayer=window.dataLayer||[];
window.gtag=function(){dataLayer.push(arguments);};
gtag("js",new Date());
gtag("config",id);
var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+id;document.head.appendChild(s);
window.mccTrack=function(name,params){try{gtag("event",name,params||{});}catch(e){}};
document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href^='tel:'],a[href^='mailto:']");if(!a)return;
window.mccTrack(a.href.indexOf("tel:")===0?"phone_click":"email_click",{link_url:a.href,page_path:location.pathname});});
})();`);
  });

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(`User-agent: *
Disallow: /admin/
Disallow: /portal/
Disallow: /client/
Disallow: /manage.html
Disallow: /api/

Sitemap: ${base(req)}/sitemap.xml
`);
  });
}

module.exports = { register, layout, business, telHref, base, esc, COUNTIES, SERVICES, countyPath, servicePath, NJ_HUB };
