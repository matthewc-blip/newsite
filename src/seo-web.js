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

const CHECKER = "/websites/seo-checker";
const QUIZ = "/websites/quiz";
const paths = () => [[CHECKER, "0.7"], [QUIZ, "0.7"], [HUB, "0.6"], [SV_HUB, "0.7"], ...SERVICES.map((s) => [svPath(s), "0.7"]), ...GUIDES.map((g) => [gPath(g), "0.6"])];

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

  /* ----- free SEO basics checker ----- */
  const checker = require("./seo-checker");
  const { rateLimit, emailOk, str } = require("./util");
  const heard = require("./heard");
  let inFlight = 0;
  const runCheck = async (input) => {
    if (inFlight >= 6) throw Object.assign(new Error("The checker is busy. Try again in a minute."), { user: true });
    inFlight++;
    try { return await checker.check(input); } finally { inFlight--; }
  };
  const failMsg = (res, e) => { if (!e.user) console.error("seo-checker:", e); return res.status(e.user ? 400 : 500).json({ error: e.user ? e.message : "Something went wrong checking that page. Try again." }); };
  app.post("/api/seo-check", rateLimit(8, 10 * 60000), async (req, res) => {
    try { res.json({ result: await runCheck(req.body && req.body.url) }); } catch (e) { failMsg(res, e); }
  });
  app.post("/api/seo-check/lead", rateLimit(4, 10 * 60000), async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(400).json({ error: "Rejected" });
    const name = str(b.name, 120), email = str(b.email, 160);
    if (!name) return res.status(400).json({ error: "Enter your name." });
    if (!emailOk(email)) return res.status(400).json({ error: "Enter a valid email." });
    try {
      const r = await runCheck(b.url); // re-run on the server: the report is never built from client-supplied results
      const text = checker.reportText(r);
      const { db } = require("./db"); const mail = require("./email");
      const note = str(b.note, 600);
      const hf = heard.clean(str(b.heardFrom, 20)) || "other";
      await db.run("INSERT INTO messages(name,email,topic,message,heard_from,heard_note) VALUES($1,$2,$3,$4,$5,$6)",
        [name, email, "Website & SEO", `Free SEO basics check for ${r.url}: score ${r.score}/100 (${r.counts.fail} to fix, ${r.counts.warn} to improve).${note ? `\n\nTheir note: ${note}` : ""}\n\n${text}`, hf, hf === "other" ? "Free SEO checker" : "SEO checker"]);
      mail.deskNotice("SEO checker lead", `${name} <${email}> ran the checker on ${r.url}: ${r.score}/100, ${r.counts.fail} to fix, ${r.counts.warn} to improve.${note ? `\n\nNote: ${note}` : ""}\n\nThey were emailed the full report.`);
      mail.send({ to: email, subject: `Your website basics check: ${r.score}/100`, text: `Hi ${name},\n\nHere is the report you asked for.\n\n${text}\n\nIf you'd like help with any of this, reply to this email or request a quote at https://mcc-solutionsnj.com/websites/#quote. A fixed written quote comes after a short call, with no obligation.\n\nMatthew Coleman\nMCC Solutions · Cranford, NJ`, html: undefined });
      res.status(201).json({ ok: true });
    } catch (e) { failMsg(res, e); }
  });

  app.get(CHECKER, async (req, res) => {
    const biz = await business(); const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Websites & SEO", "/websites/"], ["Free website basics check", CHECKER]];
    const faqs = [
      ["What does this check?", "Technical on-page basics that are visible in your page's HTML: title, meta description, headings, mobile setup, HTTPS, indexing instructions, robots.txt, sitemap, structured data, image alt text, tap-to-call links and social previews."],
      ["What doesn't it check?", "It doesn't know where you rank, how much traffic you get, how good your content is, your reviews, your backlinks or your Google Business Profile. A passing score is not a ranking promise."],
      ["Does it store my website or my results?", "We don't save the page we fetch. If you ask for the emailed report, we keep your name, email and the address you checked so we can follow up about it."],
      ["Will you contact me?", "We send the report you asked for. If you also added a note or want help, we reply once by email. We don't add you to a mailing list."],
    ];
    res.send(layout({
      req, biz, path: CHECKER, crumbs,
      title: "Free Website Basics Check for Small Businesses | MCC Solutions",
      description: "Check your website's on-page SEO basics for free: title, description, mobile setup, HTTPS, sitemap and more, with plain-English fixes. No sign-up to see results.",
      body: {
        hero: `<p class="eyebrow">Free tool</p><h1 style="margin-top:10px">Free website basics check</h1><p class="lede" style="margin-top:14px">Enter your website address and see what search engines can read on the page, with a plain-English fix for each problem. No sign-up to see the results.</p>`,
        main: `<section class="band"><div class="wrap" style="max-width:860px">
          <form class="form-card" id="chk" novalidate>
            <div class="field"><label for="chk-url">Your website address</label><input id="chk-url" name="url" inputmode="url" autocomplete="url" placeholder="yourbusiness.com" maxlength="300"></div>
            <div style="margin-top:14px"><button class="btn btn-primary" type="submit" id="chk-go">Check my site</button> <span class="form-msg" id="chk-msg" role="alert" style="margin-left:10px"></span></div>
            <p style="margin-top:12px;color:var(--muted);font-size:.9rem">We load the one page you enter, plus its robots.txt and sitemap. This checks technical basics only, not rankings, traffic or content quality.</p>
          </form>
          <div id="chk-out" hidden>
            <div class="form-card" style="margin-top:22px"><div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap"><div id="chk-score" style="font-family:var(--f-display);font-size:3.2rem;font-weight:800;line-height:1"></div><div><b id="chk-head"></b><p id="chk-sub" style="margin:4px 0 0;color:var(--ink-2)"></p></div></div></div>
            <div id="chk-list" style="margin-top:22px"></div>
            <div class="form-card" id="chk-lead" style="margin-top:22px">
              <h2 style="margin:0 0 6px;font-size:1.3rem">Want this report by email?</h2>
              <p style="margin:0 0 14px;color:var(--ink-2)">We'll send the full list with the fixes. If you'd like help, add a note and we'll reply with a plain-language plan and a fixed quote after a short call.</p>
              <fieldset><div class="field"><label for="l-name">Your name</label><input id="l-name" autocomplete="name"></div><div class="field"><label for="l-email">Email</label><input id="l-email" type="email" autocomplete="email"></div>
              <div class="field full"><label for="l-note">Anything we should know? <span class="opt">(optional)</span></label><textarea id="l-note" maxlength="600"></textarea></div>
              <div class="hp" aria-hidden="true" style="position:absolute;left:-9999px"><label for="l-web">Website</label><input id="l-web" tabindex="-1" autocomplete="off"></div></fieldset>
              <button class="btn btn-primary" type="button" id="l-go">Email me the report</button> <span class="form-msg" id="l-msg" role="alert" style="margin-left:10px"></span>
            </div>
          </div>
        </div></section>
        <section class="band alt"><div class="wrap" style="max-width:860px"><div class="sec-head"><p class="eyebrow">FAQ</p><h2>About this tool</h2></div>${faqHtml(faqs)}
          <p style="margin-top:22px;color:var(--ink-2)">Want to understand the results? Read <a href="${HUB}">our plain-language SEO guides</a>, take the <a href="${QUIZ}">free website quiz</a>, or see <a href="${SV_HUB}">what we do and what it costs</a>.</p></div></section>
        <script>(function(){
          var $=function(i){return document.getElementById(i)},last=null,busy=false;
          var ICON={pass:"\\u2713",warn:"!",fail:"\\u2715"},LAB={pass:"Passing",warn:"Improve",fail:"Fix"},COL={pass:"var(--ok)",warn:"var(--warn)",fail:"#a33"};
          function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
          function post(u,b){return fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||"Something went wrong.");return j})})}
          function render(r){
            $("chk-out").hidden=false;$("chk-score").textContent=r.score;$("chk-score").style.color=r.score>=80?"var(--ok)":r.score>=55?"var(--warn)":"#a33";
            $("chk-head").textContent="out of 100 for "+r.url.replace(/^https?:\\/\\//,"").slice(0,70);
            $("chk-sub").textContent=r.counts.pass+" passing, "+r.counts.warn+" to improve, "+r.counts.fail+" to fix"+(r.redirected?". We followed a redirect to this address.":".");
            var list=$("chk-list");list.textContent="";var groups={};r.checks.forEach(function(c){(groups[c.group]=groups[c.group]||[]).push(c)});
            Object.keys(groups).forEach(function(g){
              list.appendChild(el("h3",null,g)).style.margin="22px 0 8px";
              groups[g].forEach(function(c){
                var row=el("div");row.style.cssText="display:grid;grid-template-columns:34px 1fr;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)";
                var ic=el("span",null,ICON[c.status]);ic.style.cssText="width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700;color:#fff;background:"+COL[c.status];ic.setAttribute("aria-label",LAB[c.status]);
                var body=el("div");var t=el("b",null,c.label);body.appendChild(t);body.appendChild(el("p",null,c.detail)).style.cssText="margin:2px 0 0;color:var(--ink-2)";
                if(c.fix){var f=el("p",null,"How to fix: "+c.fix);f.style.cssText="margin:6px 0 0;color:var(--ink)";body.appendChild(f)}
                row.appendChild(ic);row.appendChild(body);list.appendChild(row)});
            });
            $("chk-out").scrollIntoView({behavior:"smooth",block:"start"});
            if(window.mccTrack)window.mccTrack("seo_check_run",{score:r.score});
          }
          $("chk").addEventListener("submit",function(e){e.preventDefault();if(busy)return;var u=$("chk-url").value.trim(),m=$("chk-msg");m.textContent="";m.style.color="";
            if(!u){m.textContent="Enter your website address.";return}
            busy=true;$("chk-go").disabled=true;m.style.color="var(--muted)";m.textContent="Checking, this takes a few seconds\\u2026";
            post("/api/seo-check",{url:u}).then(function(j){last=j.result;m.textContent="";render(last)}).catch(function(err){m.style.color="";m.textContent=err.message}).then(function(){busy=false;$("chk-go").disabled=false});
          });
          try{var q0=new URLSearchParams(location.search).get("url");if(q0){$("chk-url").value=q0.slice(0,300);$("chk-go").click()}}catch(e){}
          $("l-go").addEventListener("click",function(){var m=$("l-msg");m.textContent="";m.style.color="";if(!last){m.textContent="Run the check first.";return}
            var n=$("l-name").value.trim(),em=$("l-email").value.trim();if(!n||!em){m.textContent="Enter your name and email.";return}
            $("l-go").disabled=true;
            post("/api/seo-check/lead",{url:last.requested,name:n,email:em,note:$("l-note").value,website:$("l-web").value,heardFrom:"other"}).then(function(){m.style.color="var(--ok)";m.textContent="Sent. Check your inbox in a minute (and your spam folder).";if(window.mccTrack)window.mccTrack("generate_lead",{form:"seo_checker"})}).catch(function(err){m.textContent=err.message;$("l-go").disabled=false});
          });
        })();</script>`,
        ctaTitle: "Rather have us fix it? Ask for a quote.", ...CTA,
      },
      schema: [
        { "@type": "WebApplication", name: "Free website basics check", url: url + CHECKER, applicationCategory: "BusinessApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, provider: provider(url) },
        faqSchema(faqs), crumbSchema(url, crumbs),
      ],
    }));
  });

  /* ----- free website quiz ----- */
  const webQuiz = require("./web-quiz");
  const quizKit = require("./quiz-kit");
  quizKit.registerApi(app, { engine: webQuiz, checkApi: "/api/websites/quiz", leadApi: "/api/websites/quiz/lead", topic: "Website & SEO", name: "Free website quiz",
    tag: "Free website quiz", quoteUrl: "https://mcc-solutionsnj.com/websites/#quote", leadSubject: "Your website and local presence check", deskSubject: "Website quiz lead" });
  app.get(QUIZ, async (req, res) => {
    const biz = await business(); const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Websites & SEO", "/websites/"], ["Free quiz", QUIZ]];
    const faqs = [
      ["What is this?", "A short quiz about your website and your local presence: who owns your domain, how current and fast the site is, whether visitors can easily call or book, your Google Business Profile, reviews and how you measure results. You get a score and a plain-English list of what to fix first, with a guide for each."],
      ["How is it different from the website basics check?", "The basics check loads one page and reads what's in its code. This quiz asks you about things no tool can see from outside, like who owns your domain and whether you ask for reviews. Use both."],
      ["What does the score mean?", "It reflects only your answers. It doesn't look at your site, your rankings or your traffic, and it isn't a prediction of results or a ranking promise."],
      ["Is my information saved?", "Your answers are scored when you see the results and are not stored. If you ask for the emailed report, we keep your name, email and answers so we can follow up about it. We don't add you to a mailing list."],
    ];
    res.send(layout({
      req, biz, path: QUIZ, crumbs,
      title: "Is Your Website Working for You? Free Quiz | MCC Solutions",
      description: "Answer a few quick questions about your website and local presence and get a score with a plain-English list of what to fix first. Free, no sign-up to see results.",
      body: {
        hero: `<p class="eyebrow">Free quiz</p><h1 style="margin-top:10px">Is your website working for you?</h1><p class="lede" style="margin-top:14px">Answer a few quick questions about your website and how customers find you. See what to fix first, with a guide for each item. No sign-up to see the results.</p>`,
        main: quizKit.mainHtml({ engine: webQuiz, checkApi: "/api/websites/quiz", leadApi: "/api/websites/quiz/lead", event: "web_quiz", allGood: "Nothing to fix based on your answers. Keep reviewing it every quarter.",
          disclaimer: "This reflects only your answers. It doesn't look at your site, your rankings or your traffic.",
          faqBand: `<section class="band alt"><div class="wrap" style="max-width:860px"><div class="sec-head"><p class="eyebrow">FAQ</p><h2>About this quiz</h2></div>${faqHtml(faqs)}
          <p style="margin-top:22px;color:var(--ink-2)">Want a tool to read your page? Try the <a href="${CHECKER}">free website basics check</a>. Or see <a href="${HUB}">our plain-language guides</a> and <a href="${SV_HUB}">what we do and what it costs</a>.</p></div></section>` }),
        ctaTitle: "Rather have us fix it? Ask for a quote.", ...CTA,
      },
      schema: [
        { "@type": "WebApplication", name: "Is your website working for you? Free quiz", url: url + QUIZ, applicationCategory: "BusinessApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, provider: provider(url) },
        faqSchema(faqs), crumbSchema(url, crumbs),
      ],
    }));
  });
}

module.exports = { register, paths, HUB, SV_HUB, PRICES, CHECKER, QUIZ };
