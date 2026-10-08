// Bookkeeping software pages and how-to guides. Shown (and in the sitemap) once bookkeeping is opened in Settings.
const { fit } = require("./titles");
const { SOFTWARE, GUIDES } = require("./bk-content");
const { getSettings } = require("./db");

const HUB = "/bookkeeping/guides";
const SW_HUB = "/bookkeeping/software";
const swPath = (s) => `${SW_HUB}/${s.slug}`;
const gPath = (g) => `${HUB}/${g.slug}`;
const SW = Object.fromEntries(SOFTWARE.map((s) => [s.slug, s]));
const GD = Object.fromEntries(GUIDES.map((g) => [g.slug, g]));
const CHECKUP = "/bookkeeping/health-check";
const paths = () => [[CHECKUP, "0.6"], [HUB, "0.6"], [SW_HUB, "0.6"], ...SOFTWARE.map((s) => [swPath(s), "0.6"]), ...GUIDES.map((g) => [gPath(g), "0.6"])];

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
          <p style="margin-top:28px;color:var(--ink-2)">Not sure where your books stand? Take the <a href="${CHECKUP}">free bookkeeping health check</a>. Looking for help with a specific program? See <a href="${SW_HUB}">bookkeeping by software</a>.</p></div></section>`,
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
      title: fit(s.title), description: s.description,
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
      req, biz, path, crumbs, noindex, title: fit(g.title), description: g.description,
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

  /* ----- free bookkeeping health check ----- */
  const checkup = require("./bk-checkup");
  const { rateLimit, emailOk, str } = require("./util");
  const heard = require("./heard");
  app.post("/api/bookkeeping/checkup", rateLimit(30, 10 * 60000), (req, res) => {
    const ans = checkup.cleanAnswers(req.body && req.body.answers);
    const miss = checkup.missing(ans);
    if (miss.length) return res.status(400).json({ error: "Answer every question to see your results.", missing: miss });
    res.json({ result: checkup.evaluate(ans) });
  });
  app.post("/api/bookkeeping/checkup/lead", rateLimit(4, 10 * 60000), async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(400).json({ error: "Rejected" });
    const name = str(b.name, 120), email = str(b.email, 160), company = str(b.company, 160), note = str(b.note, 600);
    if (!name) return res.status(400).json({ error: "Enter your name." });
    if (!emailOk(email)) return res.status(400).json({ error: "Enter a valid email." });
    const ans = checkup.cleanAnswers(b.answers);
    if (checkup.missing(ans).length) return res.status(400).json({ error: "Answer every question first." });
    const r = checkup.evaluate(ans); // scored again here: the report never comes from client-supplied results
    const text = checkup.reportText(r);
    const { db } = require("./db"); const mail = require("./email");
    const hf = heard.clean(str(b.heardFrom, 20)) || "other";
    try {
      await db.run("INSERT INTO messages(name,email,topic,message,heard_from,heard_note) VALUES($1,$2,$3,$4,$5,$6)",
        [name, email, "Bookkeeping", `Free bookkeeping health check${company ? ` for ${company}` : ""}: ${r.score}/100 (${r.level}).${note ? `\n\nTheir note: ${note}` : ""}\n\n${text}`, hf, "Free bookkeeping health check"]);
      mail.deskNotice("Bookkeeping health check lead", `${name} <${email}>${company ? ` · ${company}` : ""} scored ${r.score}/100 (${r.level}): ${r.counts.fail} to fix, ${r.counts.warn} to improve.${note ? `\n\nNote: ${note}` : ""}\n\nThey were emailed the full report.`);
      mail.send({ to: email, subject: `Your bookkeeping health check: ${r.score}/100`, text: `Hi ${name},\n\nHere is the report you asked for.\n\n${text}\n\nIf you'd like help with any of this, reply to this email or ask for a quote at https://mcc-solutionsnj.com/bookkeeping/#interest. We reply with a plain estimate and no obligation.\n\nMatthew Coleman\nMCC Solutions · Cranford, NJ` });
      res.status(201).json({ ok: true });
    } catch (e) { console.error("bk-checkup lead:", e); res.status(500).json({ error: "Something went wrong. Try again, or call the desk." }); }
  });

  app.get(CHECKUP, async (req, res) => {
    const biz = await business(); const url = base(req); const noindex = !(await open());
    const crumbs = [["MCC Solutions", "/"], ["Bookkeeping", "/bookkeeping/"], ["Health check", CHECKUP]];
    const faqs = [
      ["What is this?", "A short set of questions about how your business keeps its books: separate accounts, reconciliation, records, payroll and sales tax filings, and year-end. You get a score and a plain-English list of what to tackle first, with a guide for each."],
      ["What does the score mean?", "It reflects only your answers about habits. It can't tell how your business is doing financially, whether your filings are correct, or what you owe. It is general information, not tax, legal or accounting advice."],
      ["Is my information saved?", "Your answers are scored when you see the results and are not stored. If you ask for the emailed report, we keep your name, email and answers so we can follow up about it."],
      ["Will you contact me?", "We send the report you asked for. If you add a note or ask for help, we reply by email. We don't add you to a mailing list."],
    ];
    res.send(layout({
      req, biz, path: CHECKUP, crumbs, noindex,
      title: "Free Bookkeeping Health Check for Small Businesses | MCC Solutions",
      description: "Answer 12 quick questions about your books and get a score with a plain-English list of what to fix first. Free, no sign-up to see results.",
      body: {
        hero: `<p class="eyebrow">Free tool</p><h1 style="margin-top:10px">Free bookkeeping health check</h1><p class="lede" style="margin-top:14px">Answer a few quick questions about how your books are kept and see what to tackle first, with a guide for each item. No sign-up to see the results.</p>`,
        main: `<section class="band"><div class="wrap" style="max-width:860px">
          <div class="form-card" id="bk">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><p id="bk-step" style="margin:0;font-family:var(--f-mono);font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:var(--brass)"></p><p id="bk-grp" style="margin:0;color:var(--muted);font-size:.9rem"></p></div>
            <div role="progressbar" id="bk-bar" aria-label="Quiz progress" aria-valuemin="0" aria-valuemax="100" style="height:6px;background:var(--line);border-radius:99px;margin:10px 0 22px;overflow:hidden"><div id="bk-fill" style="height:100%;width:0;background:var(--brass);transition:width .25s ease"></div></div>
            <div id="bk-qs" aria-live="polite"></div>
            <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:22px;flex-wrap:wrap"><button class="btn btn-ghost" type="button" id="bk-back">Back</button><span class="form-msg" id="bk-msg" role="alert"></span><button class="btn btn-primary" type="button" id="bk-next" disabled>Next</button></div>
            <p style="margin-top:14px;color:var(--muted);font-size:.9rem">This reflects only your answers. It is general information, not tax, legal or accounting advice.</p></div>
          <div id="bk-out" hidden>
            <div class="form-card" style="margin-top:22px"><div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap"><div id="bk-score" style="font-family:var(--f-display);font-size:3.2rem;font-weight:800;line-height:1"></div><div><b id="bk-head"></b><p id="bk-sub" style="margin:4px 0 0;color:var(--ink-2)"></p></div></div></div>
            <p style="margin:14px 0 0"><button class="btn btn-ghost btn-sm" type="button" id="bk-retake">Retake the quiz</button></p><div id="bk-start" style="margin-top:22px"></div><div id="bk-list" style="margin-top:12px"></div>
            <div class="form-card" style="margin-top:22px">
              <h2 style="margin:0 0 6px;font-size:1.3rem">Want this report by email?</h2>
              <p style="margin:0 0 14px;color:var(--ink-2)">We'll send the full list. If you'd like help, add a note and we'll reply with a plain estimate.</p>
              <fieldset><div class="field"><label for="b-name">Your name</label><input id="b-name" autocomplete="name"></div><div class="field"><label for="b-email">Email</label><input id="b-email" type="email" autocomplete="email"></div>
              <div class="field full"><label for="b-co">Business name <span class="opt">(optional)</span></label><input id="b-co" autocomplete="organization"></div>
              <div class="field full"><label for="b-note">Anything we should know? <span class="opt">(optional)</span></label><textarea id="b-note" maxlength="600"></textarea></div>
              <div aria-hidden="true" style="position:absolute;left:-9999px"><label for="b-web">Website</label><input id="b-web" tabindex="-1" autocomplete="off"></div></fieldset>
              <button class="btn btn-primary" type="button" id="b-go">Email me the report</button> <span class="form-msg" id="b-msg" role="alert" style="margin-left:10px"></span>
            </div>
          </div>
        </div></section>
        <section class="band alt"><div class="wrap" style="max-width:860px"><div class="sec-head"><p class="eyebrow">FAQ</p><h2>About this tool</h2></div>${faqHtml(faqs)}
          <p style="margin-top:22px;color:var(--ink-2)">More plain-language help: <a href="${HUB}">bookkeeping guides</a> or <a href="${SW_HUB}">bookkeeping by software</a>.</p></div></section>
        <script>(function(){
          var Q=${JSON.stringify(checkup.publicQuestions()).replace(/</g, "\\u003c")},ans={},busy=false;
          var $=function(i){return document.getElementById(i)};
          function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}
          function post(u,b){return fetch(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||"Something went wrong.");return j})})}
          function vis(q){return !q.ask||ans[q.ask[0]]===q.ask[1]}
          var idx=0;
          function list(){return Q.filter(vis)}
          function show(){var qs=list();if(idx>=qs.length)idx=qs.length-1;var q=qs[idx],root=$("bk-qs");root.textContent="";
            $("bk-step").textContent="Question "+(idx+1)+" of "+qs.length;$("bk-grp").textContent=q.group;
            var pct=Math.round(idx/qs.length*100);$("bk-fill").style.width=pct+"%";$("bk-bar").setAttribute("aria-valuenow",pct);
            var f=el("fieldset");f.style.cssText="border:0;padding:0;margin:0;display:block";
            var lg=el("legend",null,q.text);lg.style.cssText="font-family:var(--f-display);font-size:1.35rem;font-weight:700;line-height:1.3;letter-spacing:normal;text-transform:none;color:var(--ink);margin:0 0 16px;padding:0";lg.tabIndex=-1;f.appendChild(lg);
            q.options.forEach(function(o,i){var id="q-"+q.id+"-"+i,on=ans[q.id]===o[0];
              var l=el("label");l.setAttribute("for",id);l.style.cssText="display:flex;gap:12px;align-items:flex-start;justify-content:flex-start;text-align:left;padding:13px 14px;margin:0 0 10px;border:1px solid "+(on?"var(--brass)":"var(--line)")+";border-radius:6px;background:"+(on?"var(--brass-soft)":"var(--surface)")+";cursor:pointer;font-weight:400;font-size:1rem;letter-spacing:normal;text-transform:none;color:var(--ink)";
              var r=el("input");r.type="radio";r.name=q.id;r.id=id;r.value=o[0];r.checked=on;r.style.cssText="width:auto;flex:none;margin:4px 0 0;padding:0";
              r.addEventListener("change",function(){ans[q.id]=o[0];$("bk-msg").textContent="";show();var n=$("bk-next");n.disabled=false;var again=document.getElementById("q-"+q.id+"-"+i);if(again)again.focus()});
              l.appendChild(r);l.appendChild(el("span",null,o[1]));f.appendChild(l)});
            root.appendChild(f);
            $("bk-back").style.visibility=idx===0?"hidden":"visible";
            var last=idx===qs.length-1&&!(q.id==="payroll"&&ans.payroll==="yes");
            $("bk-next").textContent=last?"See my results":"Next";$("bk-next").disabled=!ans[q.id];
          }
          function next(){var qs=list(),q=qs[idx];if(!ans[q.id]){$("bk-msg").textContent="Choose an answer to continue.";return}$("bk-msg").textContent="";
            var after=list();if(idx<after.length-1){idx++;show();var lg=document.querySelector("#bk-qs legend");if(lg)lg.focus();return}
            if(busy)return;busy=true;$("bk-next").disabled=true;var m=$("bk-msg");m.style.color="var(--muted)";m.textContent="Scoring\u2026";
            post("/api/bookkeeping/checkup",{answers:ans}).then(function(j){m.textContent="";m.style.color="";$("bk").hidden=true;render(j.result)}).catch(function(err){m.style.color="";m.textContent=err.message}).then(function(){busy=false;$("bk-next").disabled=false})}
          $("bk-next").addEventListener("click",next);
          $("bk-back").addEventListener("click",function(){if(idx>0){idx--;show()}});
          document.addEventListener("keydown",function(e){if(e.key==="Enter"&&!$("bk").hidden&&document.activeElement&&document.activeElement.type==="radio"&&ans[list()[idx].id]){e.preventDefault();next()}});
          function retake(){ans={};idx=0;$("bk-out").hidden=true;$("bk").hidden=false;show();$("bk").scrollIntoView({behavior:"smooth",block:"start"})}
          function card(i,tone){var row=el("div");row.style.cssText="padding:14px 0;border-bottom:1px solid var(--line)";
            var t=el("b",null,i.question);row.appendChild(t);var a=el("p",null,"Your answer: "+i.answer);a.style.cssText="margin:3px 0 0;color:var(--muted)";row.appendChild(a);
            var w=el("p",null,i.advice);w.style.cssText="margin:6px 0 0";row.appendChild(w);
            if(i.guide){var p=el("p");p.style.margin="6px 0 0";var l=el("a",null,"Read the guide \\u2192");l.href=i.guide.href;p.appendChild(l);row.appendChild(p)}
            return row}
          function render(r){$("bk-out").hidden=false;var s=$("bk-score");s.textContent=r.score;s.style.color=r.score>=80?"var(--ok)":r.score>=50?"var(--warn)":"#a33";
            $("bk-head").textContent="out of 100: "+r.level;$("bk-sub").textContent=r.counts.pass+" in good shape, "+r.counts.warn+" to improve, "+r.counts.fail+" to fix.";
            var st=$("bk-start");st.textContent="";var ls=$("bk-list");ls.textContent="";
            var by={};r.items.forEach(function(i){by[i.id]=i});
            if(r.startHere.length){var h=el("h2",null,"Start here");h.style.fontSize="1.3rem";st.appendChild(h);r.startHere.forEach(function(id){st.appendChild(card(by[id]))})}
            var rest=r.items.filter(function(i){return i.status!=="pass"&&r.startHere.indexOf(i.id)<0});
            if(rest.length){var h2=el("h2",null,"Then work on");h2.style.cssText="font-size:1.3rem;margin-top:26px";ls.appendChild(h2);rest.forEach(function(i){ls.appendChild(card(i))})}
            var ok=r.items.filter(function(i){return i.status==="pass"});
            if(ok.length){var h3=el("h2",null,"Already in good shape");h3.style.cssText="font-size:1.3rem;margin-top:26px";ls.appendChild(h3);var u=el("ul","checks");ok.forEach(function(i){u.appendChild(el("li",null,i.question.replace(/\\?$/,"")+": "+i.answer))});ls.appendChild(u)}
            if(!r.startHere.length&&!rest.length)st.appendChild(el("p",null,"Nothing to fix based on your answers. Keep the monthly routine going."));
            $("bk-out").scrollIntoView({behavior:"smooth",block:"start"});if(window.mccTrack)window.mccTrack("bk_checkup_run",{score:r.score});}
          $("b-go").addEventListener("click",function(){var m=$("b-msg");m.textContent="";m.style.color="";var n=$("b-name").value.trim(),em=$("b-email").value.trim();
            if(!n||!em){m.textContent="Enter your name and email.";return}$("b-go").disabled=true;
            post("/api/bookkeeping/checkup/lead",{answers:ans,name:n,email:em,company:$("b-co").value,note:$("b-note").value,website:$("b-web").value,heardFrom:"other"}).then(function(){m.style.color="var(--ok)";m.textContent="Sent. Check your inbox in a minute (and your spam folder).";if(window.mccTrack)window.mccTrack("generate_lead",{form:"bk_checkup"})}).catch(function(err){m.textContent=err.message;$("b-go").disabled=false})});
          $("bk-retake").addEventListener("click",retake);
          show();
        })();</script>`,
        ctaTitle: "Rather have us keep the books? Ask for a quote.", ...CTA,
      },
      schema: [
        { "@type": "WebApplication", name: "Free bookkeeping health check", url: url + CHECKUP, applicationCategory: "BusinessApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, provider: provider(url) },
        faqSchema(faqs), crumbSchema(url, crumbs),
      ],
    }));
  });
}

module.exports = { register, paths, HUB, SW_HUB, CHECKUP };
