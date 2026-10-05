// Crawlable landing pages for search: one per New Jersey county, one per service, a New Jersey hub,
// plus sitemap.xml and robots.txt. Pages are rendered on the server so search engines see full HTML.
const { getSettings } = require("./db");
const { COUNTIES, SERVICES } = require("./seo-data");
const prices = require("./prices");
const { EXTRA } = require("./seo-extra");
const { GUIDES, guidePath, guidesFor } = require("./guides");

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
<meta property="og:image" content="${esc(url)}/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/archivo-latin-wdth-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/public-sans-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/fonts.css">
<link rel="stylesheet" href="/css/site.css">
<script type="application/ld+json">${json}</script>
<script src="/js/ga.js" async></script>
</head>
<body class="seo">
<div class="strip"><div class="wrap">
  <span>Dispatch desk: <a class="mono" href="${telHref(biz.phone)}" style="color:inherit"><b>${phone}</b></a><span class="strip-extra"> · <b>${email}</b></span></span>
  <span class="strip-extra">Mon–Fri 7AM–9PM ET · Sat 9AM–5PM · <a href="/" style="color:inherit">← MCC Solutions home</a></span>
</div></div>
<header class="site"><div class="wrap">
  <a class="brand" href="/notary/"><span class="seal">MCC</span><span><span class="brand-name">MCC Solutions</span><span class="brand-sub">Notary &amp; Signing Dispatch</span></span></a>
  <button class="menu-btn" id="menuBtn" aria-expanded="false" aria-controls="mainNav">Menu</button>
  <nav class="main" id="mainNav" aria-label="Main">
    <a href="${NJ_HUB}#services">Services</a>
    <a href="/notary/loan-signing-agent">Loan Signings</a>
    <a href="/notary/mobile-notary">Mobile Notary</a>
    <a href="/notary/process-serving">Process Serving</a>
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
    <div><h4>Services</h4><ul>${SERVICES.slice(0, 7).map((s) => `<li><a href="${servicePath(s)}">${esc(s.short)}</a></li>`).join("")}<li><a href="${NJ_HUB}#services" style="color:var(--brass)">All services →</a></li></ul></div>
    <div><h4>New Jersey</h4><ul class="foot-counties">${COUNTIES.map((c) => `<li><a href="${countyPath(c)}">${esc(c.name)}</a></li>`).join("")}</ul></div>
    <div><h4>Desk</h4><ul><li class="mono"><a href="${telHref(biz.phone)}">${phone}</a></li><li class="mono">${email}</li><li>Mon–Fri 7AM–9PM ET</li><li>Sat 9AM–5PM ET</li><li><a href="/notary/#order" style="color:var(--brass)">Order a signing →</a></li></ul></div>
  </div>
  <p class="foot-links"><a href="/about">About</a> · <a href="/notary/fees">Fees</a> · <a href="/notary/law-firms">For law firms</a> · <a href="/notary/guides">Guides</a> · <a href="/notary/vendors">Vendor packet</a> · <a href="/notary/#notaries">Join as a notary</a> · <a href="/notary/become-a-witness">Become a witness</a> · <a href="/notary/become-a-process-server">Become a process server</a> · <a href="/notary/training">Notary training</a> · <a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of service</a></p>
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
const serviceCards = (lead, list = SERVICES) => `<div class="grid g3">${list.map((s) => `<a class="svc" href="${servicePath(s)}"><span class="code">${esc(s.code)}</span><h3>${esc(lead ? `${s.name} in ${lead}` : s.name)}</h3><p>${esc(s.description)}</p><span class="more">${esc(s.short)} →</span></a>`).join("")}</div>`;
const countyLinks = (list) => `<ul class="county-links">${list.map((c) => `<li><a href="${countyPath(c)}">${esc(c.name)} County</a></li>`).join("")}</ul>`;

function countyFaqs(c) {
  return [
    [`Can a notary come to my home in ${c.towns[0]} or ${c.towns[1]}?`, `Yes. MCC Solutions sends mobile notaries and signing agents to homes, offices and care facilities throughout ${c.name} County, including ${c.towns.slice(0, 4).join(", ")}. Travel beyond 20 miles is quoted before we confirm.`],
    [`Do you handle loan closings for title companies in ${c.name} County?`, `Yes. Our certified signing agents handle purchase, refinance, HELOC and reverse mortgage signings in ${c.name} County, with scanbacks reviewed by the desk and the return tracking number sent to your team.`],
    [`Can you notarize at a hospital or nursing home in ${c.name} County?`, `Yes. We visit hospitals, rehab centers, assisted living and hospice care in ${c.name} County for powers of attorney, healthcare proxies and other documents, including evenings and weekends.`],
    [`How much does a mobile notary cost in ${c.name} County?`, `New Jersey sets the notarial fee at $2.50 per act. Travel and service fees depend on distance and timing, and you get a firm quote before the appointment is confirmed.`],
  ];
}

// Request form for services that aren't timed appointments (process serving, recording…).
function requestForm(s) {
  const t = require("./request-types").TYPES[s.requestType];
  if (!t) return "";
  const field = (f) => {
    const id = "rq-" + f.key;
    const label = `<label for="${id}">${esc(f.label)}${f.required ? "" : ' <span class="opt">(optional)</span>'}</label>`;
    const ctl = f.options ? `<select id="${id}" data-rk="${f.key}">${f.options.map((o) => `<option>${esc(o)}</option>`).join("")}</select>`
      : f.textarea ? `<textarea id="${id}" data-rk="${f.key}" rows="2"></textarea>` : `<input id="${id}" data-rk="${f.key}">`;
    return `<div class="field${f.wide || f.textarea ? " full" : ""}">${label}${ctl}<span class="err" data-err="${f.key}"></span></div>`;
  };
  return `<section class="band alt" id="request"><div class="wrap form-layout">
    <form class="form-card" id="reqForm" novalidate>
      <fieldset><legend>${esc(t.label)} request</legend>${t.fields.map(field).join("")}
        <div class="field"><label for="rq-due">Needed by <span class="opt">(optional)</span></label><input id="rq-due" type="date"></div>
        <div class="field full"><label for="rq-notes">Anything else? <span class="opt">(optional)</span></label><textarea id="rq-notes" rows="2"></textarea></div>
        <div class="field full"><label for="rq-files">Attach documents <span class="opt">(optional, PDF or photos, up to 10 files)</span></label><input id="rq-files" type="file" accept="application/pdf,image/*" multiple></div>
      </fieldset>
      <fieldset><legend>Your details</legend>
        <div class="field"><label for="rq-name">Name</label><input id="rq-name" autocomplete="name"><span class="err" data-err="contactName"></span></div>
        <div class="field"><label for="rq-co">Company <span class="opt">(optional)</span></label><input id="rq-co" autocomplete="organization"></div>
        <div class="field"><label for="rq-email">Email</label><input id="rq-email" type="email" autocomplete="email"><span class="err" data-err="contactEmail"></span></div>
        <div class="field"><label for="rq-phone">Phone</label><input id="rq-phone" type="tel" autocomplete="tel"><span class="err" data-err="contactPhone"></span></div>
        <div class="field"><label for="rq-ref">Your file or matter number <span class="opt">(optional, shows on the invoice)</span></label><input id="rq-ref"></div>
        <input type="text" id="rq-website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
      </fieldset>
      <div class="form-foot"><small>The desk confirms details and price before any work starts, usually within one business day. See our <a href="/privacy">privacy policy</a>.</small><button class="btn btn-primary" type="submit">Send request</button></div>
      <p class="form-msg" id="reqMsg" role="status"></p>
    </form>
    <aside class="stack"><h3>Prefer to talk?</h3><p>Call the desk and we'll take the request by phone.</p><h3 style="margin-top:12px">Ordering for a firm?</h3><p>A <a href="/notary/law-firms#account">firm account</a> lets your team order, attach papers, follow every attempt and download affidavits in one portal.</p></aside>
  </div></section>
  <script>
  document.getElementById("reqForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var f = this, m = document.getElementById("reqMsg"), b = f.querySelector("button[type=submit]");
    var g = function (id) { return document.getElementById(id).value.trim(); };
    var details = {}; f.querySelectorAll("[data-rk]").forEach(function (el) { details[el.dataset.rk] = el.value.trim(); });
    f.querySelectorAll("[data-err]").forEach(function (el) { el.textContent = ""; });
    b.disabled = true; m.className = "form-msg"; m.textContent = "Sending…";
    try {
      var r = await fetch("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: ${JSON.stringify(s.requestType)}, details: details, dueDate: g("rq-due"), notes: g("rq-notes"), contactName: g("rq-name"), company: g("rq-co"), contactEmail: g("rq-email"), contactPhone: g("rq-phone"), clientRef: g("rq-ref"), website: g("rq-website") }) });
      var d = await r.json().catch(function () { return {}; });
      if (!r.ok) { Object.keys(d.fields || {}).forEach(function (k) { var el = f.querySelector('[data-err="' + k + '"]'); if (el) el.textContent = d.fields[k]; }); throw new Error(d.error || "Couldn't send. Try again or call the desk."); }
      if (window.mccTrack) window.mccTrack("generate_lead", { form: "request_" + ${JSON.stringify(s.requestType)} });
      var files = Array.prototype.slice.call(document.getElementById("rq-files").files || []).slice(0, 10), failed = [];
      for (var i = 0; i < files.length; i++) {
        m.className = "form-msg"; m.textContent = "Uploading " + files[i].name + "…";
        if (files[i].size > 50 * 1024 * 1024) { failed.push(files[i].name + " (over 50 MB)"); continue; }
        var u = await fetch("/api/requests/" + encodeURIComponent(d.ref) + "/papers?token=" + encodeURIComponent(d.uploadToken) + "&filename=" + encodeURIComponent(files[i].name), { method: "POST", headers: { "Content-Type": files[i].type || "application/octet-stream" }, body: files[i] });
        if (!u.ok) failed.push(files[i].name);
      }
      f.reset(); m.className = "form-msg ok"; m.textContent = "Request " + d.ref + " received" + (files.length ? " with " + (files.length - failed.length) + " document" + (files.length - failed.length === 1 ? "" : "s") : "") + ". We emailed you a copy and the desk will follow up within one business day." + (failed.length ? " These didn't upload, so please email them to the desk: " + failed.join(", ") + "." : "");
    } catch (err) { m.className = "form-msg"; m.textContent = err.message; }
    b.disabled = false;
  });
  </script>`;
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
          <div class="sec-head" id="services"><p class="eyebrow">Services</p><h2>What we handle across New Jersey</h2></div>
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
          ${serviceCards(`${c.name} County`, SERVICES.slice(0, 9))}
          <p style="margin-top:22px;color:var(--ink-2)"><b>Also in ${esc(c.name)} County:</b> ${SERVICES.slice(9).map((x) => `<a href="${servicePath(x)}">${esc(x.short)}</a>`).join(" · ")}</p>
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
      const settings = await getSettings().catch(() => null);
      const biz = settings ? settings.business : await business();
      const url = base(req);
      const path = servicePath(s);
      const from = settings ? prices.forSlug(settings, s.slug) : null;
      const x = EXTRA[s.slug] || {};
      const allFaqs = s.faqs.concat(x.faqs || []);
      const guides = guidesFor(s.slug);
      const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], [s.name, path]];
      res.send(layout({
        req, biz, path, crumbs, title: s.title, description: s.description,
        body: {
          hero: `<p class="eyebrow">${esc(s.code)}</p><h1 style="margin-top:10px">${esc(s.h1)}</h1><p class="lede" style="margin-top:14px">${esc(s.lede)}</p>${from ? `<p class="from-price"><span>Starting at</span> <b>${prices.money(from.price)}</b> <small>${esc(from.note)} · <a href="/notary/fees">all fees</a></small></p>` : ""}<div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="${s.requestType ? "#request" : "/notary/#order"}">${s.requestType ? "Request service" : "Book now"}</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call the desk</a></div>`,
          main: `${s.requestType ? requestForm(s) : ""}<section class="band"><div class="wrap split">
            <div class="stack"><p class="eyebrow">What's included</p><h2>Every ${esc(s.short.toLowerCase())} order</h2><ul class="checks">${s.included.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
            <div class="stack"><p class="eyebrow">Who uses it</p><h2>Built for</h2><ul class="checks">${s.who.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
          </div></section>
          ${x.steps ? `<section class="band alt"><div class="wrap">
            <div class="sec-head"><p class="eyebrow">How it works</p><h2>${esc(s.name)}, step by step</h2></div>
            <ol class="steps steps-4">${x.steps.map(([t, d]) => `<li><h3>${esc(t)}</h3><p>${esc(d)}</p></li>`).join("")}</ol>
          </div></section>` : ""}
          ${x.ready ? `<section class="band"><div class="wrap split">
            <div class="stack"><p class="eyebrow">Before we arrive</p><h2>Have this ready</h2><ul class="checks">${x.ready.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>
            <div class="stack"><p class="eyebrow">Timing</p><h2>Turnaround</h2><p class="lede">${esc(x.turnaround || "")}</p>${guides.length ? `<div class="guide-links"><p class="eyebrow">Helpful guides</p><ul>${guides.map((g) => `<li><a href="${guidePath(g)}">${esc(g.title)}</a></li>`).join("")}</ul></div>` : ""}</div>
          </div></section>` : ""}
          <section class="band alt"><div class="wrap" style="max-width:860px">
            <div class="sec-head"><p class="eyebrow">FAQ</p><h2>Common questions</h2></div>
            ${faqHtml(allFaqs)}
          </div></section>
          <section class="band"><div class="wrap">
            <div class="sec-head"><p class="eyebrow">Where we work</p><h2>${esc(s.name)} in every New Jersey county</h2></div>
            ${countyLinks(COUNTIES)}
          </div></section>`,
        },
        schema: [
          orgSchema(url, biz, { "@type": "State", name: "New Jersey" }),
          { "@type": "Service", name: s.name, serviceType: s.short, description: s.description, provider: { "@id": url + "/#business" }, areaServed: { "@type": "State", name: "New Jersey" }, url: url + path },
          faqSchema(allFaqs),
          crumbSchema(url, crumbs),
        ],
      }));
    });
  }

  /* ---------- how-to guides ---------- */
  const GUIDES_HUB = "/notary/guides";
  app.get(GUIDES_HUB, async (req, res) => {
    const biz = await business();
    const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["Guides", GUIDES_HUB]];
    res.send(layout({
      req, biz, path: GUIDES_HUB, crumbs,
      title: "Notary, Apostille & Process Serving Guides for New Jersey | MCC",
      description: "Plain-language New Jersey guides: getting an apostille, preparing for a loan signing, how process serving works, hospital notarizations and recording a deed.",
      body: {
        hero: `<p class="eyebrow">Guides</p><h1 style="margin-top:10px">Plain answers to New Jersey paperwork questions</h1><p class="lede" style="margin-top:14px">Short guides from the MCC Solutions desk. General information, not legal advice.</p>`,
        main: `<section class="band"><div class="wrap"><div class="grid g3">${GUIDES.map((g) => `<a class="svc" href="${guidePath(g)}"><span class="code">GUIDE</span><h3>${esc(g.title)}</h3><p>${esc(g.description)}</p><span class="more">Read the guide →</span></a>`).join("")}</div></div></section>`,
        ctaTitle: "Rather have us handle it? Call the desk.",
      },
      schema: [crumbSchema(url, crumbs), { "@type": "CollectionPage", name: "Guides", url: url + GUIDES_HUB, hasPart: GUIDES.map((g) => ({ "@type": "Article", headline: g.title, url: url + guidePath(g) })) }],
    }));
  });
  for (const g of GUIDES) {
    app.get(guidePath(g), async (req, res) => {
      const biz = await business();
      const url = base(req);
      const path = guidePath(g);
      const crumbs = [["MCC Solutions", "/"], ["Guides", GUIDES_HUB], [g.title, path]];
      const svcs = g.services.map((sl) => SERVICES.find((x) => x.slug === sl)).filter(Boolean);
      const updated = new Date(g.updated + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
      res.send(layout({
        req, biz, path, crumbs, title: `${g.title} | MCC Solutions`.slice(0, 70), description: g.description,
        body: {
          hero: `<p class="eyebrow">Guide · Updated ${esc(updated)}</p><h1 style="margin-top:10px">${esc(g.title)}</h1><p class="lede" style="margin-top:14px">${esc(g.intro)}</p><p class="byline">By <a href="/about">Matthew Coleman</a>, MCC Solutions</p>`,
          main: `<section class="band"><div class="wrap guide-layout">
            <article class="legal-doc guide">${g.sections.map(([h, paras]) => `<h2>${esc(h)}</h2>${paras.map((t) => `<p>${esc(t)}</p>`).join("")}`).join("")}
              <h2>Common questions</h2>${faqHtml(g.faqs)}
              <p class="guide-note">This guide is general information, not legal advice. Fees and procedures change; check with the office involved or an attorney for your situation.</p>
            </article>
            <aside class="guide-aside"><div class="stack"><p class="eyebrow">Let us handle it</p>${svcs.map((x) => `<a class="svc" href="${servicePath(x)}"><h3>${esc(x.name)}</h3><p>${esc(x.description)}</p><span class="more">${esc(x.short)} →</span></a>`).join("")}<a class="btn btn-ghost" href="${GUIDES_HUB}">All guides</a></div></aside>
          </div></section>`,
          ctaTitle: "Rather have us handle it? Call the desk.",
        },
        schema: [
          { "@type": "Article", headline: g.title, description: g.description, dateModified: g.updated, datePublished: g.updated, author: { "@type": "Person", name: "Matthew Coleman", url: url + "/about" }, publisher: { "@type": "Organization", name: "MCC Solutions", url: url + "/" }, mainEntityOfPage: url + path, image: url + "/img/og.png" },
          faqSchema(g.faqs),
          crumbSchema(url, crumbs),
        ],
      }));
    });
  }

  app.get("/sitemap.xml", async (req, res) => {
    const url = base(req);
    const paths = [["/", "1.0"], ["/notary/", "0.9"], [NJ_HUB, "0.8"], ...SERVICES.map((s) => [servicePath(s), "0.8"]), ...COUNTIES.map((c) => [countyPath(c), "0.7"]), ["/about", "0.6"], ["/websites/", "0.6"], ["/notary/vendors", "0.6"], ["/notary/law-firms", "0.7"], ["/notary/fees", "0.6"], ["/notary/training", "0.5"], ["/notary/become-a-witness", "0.5"], ["/notary/become-a-process-server", "0.5"], [GUIDES_HUB, "0.6"], ...GUIDES.map((g) => [guidePath(g), "0.6"]), ["/privacy", "0.3"], ["/terms", "0.3"]];
    // The bookkeeping page is unlisted until it is opened in Settings → Bookkeeping.
    if ((await getSettings().catch(() => null))?.bookkeeping?.open) paths.push(["/bookkeeping/", "0.7"]);
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

  // Short tracked links for print and outreach (QR codes stay small and easy to scan).
  // /go/<code> forwards to the page with UTM tags so Google Analytics shows which channel brought the visit.
  const GO = {
    pc1: ["/notary/vendors", "postcard", "mail", "nj_postcard_1"],
    pcb: ["/notary/#order", "postcard", "mail", "nj_postcard_booking"],
    li: ["/notary/vendors", "linkedin", "social", "linkedin_outreach"],
    em: ["/notary/vendors", "email", "email", "cold_email"],
    bk: ["/bookkeeping/", "mailer", "mail", "bookkeeping"],
  };
  app.get("/go/:code", (req, res) => {
    const g = GO[String(req.params.code).toLowerCase()];
    if (!g) return res.redirect(302, "/notary/");
    const [path, source, medium, campaign] = g;
    const [p, hash] = path.split("#");
    res.redirect(302, `${p}?utm_source=${source}&utm_medium=${medium}&utm_campaign=${campaign}${hash ? "#" + hash : ""}`);
  });

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(`User-agent: *
Disallow: /admin/
Disallow: /portal/
Disallow: /client/
Disallow: /manage.html
Disallow: /api/
Disallow: /reviews/
Disallow: /go/

Sitemap: ${base(req)}/sitemap.xml
`);
  });
}

module.exports = { register, layout, business, telHref, base, esc, COUNTIES, SERVICES, countyPath, servicePath, NJ_HUB };
