// Free notary tools: service finder, appointment checklist, and the earnings calculator for recruiting.
const { DOCS, docPath, DOCS_HUB, DOC_CATEGORIES } = require("./doc-pages");
const { fit } = require("./titles");
const finder = require("./notary-finder");
const quizKit = require("./quiz-kit");
const { rateLimit } = require("./util");

const FINDER = "/notary/which-service", CHECKLIST = "/notary/appointment-checklist", EARN = "/notary/become-a-notary/earnings";
const paths = () => [[FINDER, "0.7"], [CHECKLIST, "0.7"], [EARN, "0.5"]];

// Pay per assignment: 50% of the customer starting price, matching /notary/become-a-notary.
const PAY = { mobile: 37.5, loan: 75, hospital: 62.5 };

function prepItems(d) {
  const out = [];
  for (const [h, paras] of d.sections) if (/have ready|bring|prepare|preparing|before (the|we)/i.test(h)) for (const p of paras) out.push(p);
  return out;
}

function register(app, c) {
  const { layout, business, base, faqHtml, faqSchema, crumbSchema, esc } = c;
  const { getSettings } = require("./db");
  const app_ = (url, name, cat) => ({ "@type": "WebApplication", name, url, applicationCategory: cat, operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } });

  /* ----- finder ----- */
  app.post("/api/notary/which-service", rateLimit(60, 10 * 60000), async (req, res) => {
    const ans = finder.engine.cleanAnswers(req.body && req.body.answers);
    if (finder.engine.missing(ans).length) return res.status(400).json({ error: "Answer every question to see the recommendation." });
    const [s, biz] = await Promise.all([getSettings().catch(() => null), business()]);
    res.json({ result: finder.recommend(ans, s, biz.phone) });
  });
  app.get(FINDER, async (req, res) => {
    const biz = await business(); const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["Which service do I need?", FINDER]];
    const faqs = [
      ["Is this a legal opinion?", "No. It points you to the service that usually fits your situation. A notary can't tell you which document you need or give legal advice, so check with the office asking for the document, or your attorney, if you're unsure."],
      ["Are my answers saved?", "No. Your answers are used to show the recommendation and aren't stored."],
      ["Does this book my appointment?", "No. It suggests a service. You request the appointment on the booking form, and no time is guaranteed until you receive a confirmation email from us."],
    ];
    res.send(layout({
      req, biz, path: FINDER, crumbs,
      title: "Which Notary Service Do I Need? Free Quiz | MCC Solutions",
      description: "Answer four quick questions and find out whether you need a mobile notary, a loan signing agent, a hospital visit, remote online notarization or an apostille in New Jersey.",
      body: {
        hero: `<p class="eyebrow">Free tool</p><h1 style="margin-top:10px">Which notary service do I need?</h1><p class="lede" style="margin-top:14px">Four quick questions. We'll point you to the right service and tell you what happens next.</p>`,
        main: quizKit.mainHtml({ engine: finder.engine, checkApi: "/api/notary/which-service", leadApi: "", event: "notary_finder", allGood: "", mode: "recommend",
          disclaimer: "This is general guidance, not legal advice. Your answers aren't stored.",
          faqBand: `<section class="band alt"><div class="wrap" style="max-width:860px"><div class="sec-head"><p class="eyebrow">FAQ</p><h2>About this tool</h2></div>${faqHtml(faqs)}
          <p style="margin-top:22px;color:var(--ink-2)">Know what you need? <a href="/notary/#order">Request an appointment</a>, or see <a href="${CHECKLIST}">what to bring</a> and <a href="${DOCS_HUB}">the documents we notarize</a>.</p></div></section>` }),
        ctaTitle: "Ready to book?", ctaHref: "/notary/#order", ctaLabel: "Request an appointment",
      },
      schema: [app_(url + FINDER, "Which notary service do I need?", "UtilitiesApplication"), faqSchema(faqs), crumbSchema(url, crumbs)],
    }));
  });

  /* ----- checklist ----- */
  app.get(CHECKLIST, async (req, res) => {
    const biz = await business(); const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["What to bring", CHECKLIST]];
    const data = DOC_CATEGORIES.map((cat) => ({ cat, docs: DOCS.filter((d) => d.category === cat).map((d) => ({ slug: d.slug, title: d.title.replace(/ in New Jersey| \(NJ\)| in NJ/g, "").replace(/^Notarizing (a |an )?/i, "").replace(/^./, (x) => x.toUpperCase()), href: docPath(d), items: prepItems(d) })) }));
    const faqs = [
      ["Do all signers need ID?", "Yes. Every person signing needs a current, government-issued photo ID, such as a driver's license or passport. The name on the ID should match the name on the document."],
      ["Should I sign the document ahead of time?", "No. Leave it unsigned. You sign in front of the notary, and the notary can't notarize a signature they didn't watch you make."],
      ["What if the office asking for the document wants something else?", "Follow the receiving office. This list is general guidance. Offices can require a specific form, wording or number of copies, and we can't change that for you."],
    ];
    res.send(layout({
      req, biz, path: CHECKLIST, crumbs,
      title: fit("What to Bring to a Notary Appointment: Free Checklist", "MCC Solutions"),
      description: "Pick your document and get a printable checklist of what to bring to your notary appointment in New Jersey: ID, unsigned papers, witnesses and more.",
      body: {
        hero: `<p class="eyebrow">Free checklist</p><h1 style="margin-top:10px">What to bring to your notary appointment</h1><p class="lede" style="margin-top:14px">Choose your document and how you'll sign. Tick things off, then print the list or copy it.</p>`,
        main: `<section class="band"><div class="wrap" style="max-width:860px">
          <div class="form-card" id="cl-card"><fieldset>
            <div class="field full"><label for="cl-doc">Your document</label><select id="cl-doc"></select></div>
            <div class="field"><label for="cl-mode">How you'll sign</label><select id="cl-mode"><option value="person">In person with a notary</option><option value="ron">Remotely, by video (electronic document)</option><option value="rin">Remotely, by video (paper, ink signature)</option></select></div>
            <div class="field"><label for="cl-n">Number of signers</label><input id="cl-n" type="number" min="1" max="10" value="1"></div>
          </fieldset></div>
          <div class="form-card" id="cl-out" style="margin-top:22px" aria-live="polite">
            <h2 id="cl-title" style="margin:0 0 4px;font-size:1.4rem"></h2><p id="cl-link" style="margin:0 0 14px"></p>
            <ul id="cl-list" style="list-style:none;margin:0;padding:0"></ul>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px"><button class="btn btn-primary" type="button" id="cl-print">Print</button><button class="btn btn-ghost" type="button" id="cl-copy">Copy the list</button><a class="btn btn-ghost" href="/notary/#order">Request an appointment</a><span class="form-msg" id="cl-msg" role="status"></span></div>
            <p style="margin:16px 0 0;color:var(--muted);font-size:.9rem">General guidance only. The office asking for your document may require more, so check with them. A notary can't give legal advice or tell you which document you need. No appointment time is guaranteed until you receive a confirmation email from us.</p>
          </div>
        </div></section>
        <section class="band alt"><div class="wrap" style="max-width:860px"><div class="sec-head"><p class="eyebrow">FAQ</p><h2>Before your appointment</h2></div>${faqHtml(faqs)}
        <p style="margin-top:22px;color:var(--ink-2)">Not sure which service you need? <a href="${FINDER}">Try the service finder</a>.</p></div></section>
        <script>window.MCC_CHECKLIST=${JSON.stringify(data).replace(/</g, "\\u003c")};</script><script src="/js/notary-tools.js" defer></script>`,
        ctaTitle: "Ready to book?", ctaHref: "/notary/#order", ctaLabel: "Request an appointment",
      },
      schema: [app_(url + CHECKLIST, "Notary appointment checklist", "UtilitiesApplication"), faqSchema(faqs), crumbSchema(url, crumbs)],
    }));
  });

  /* ----- earnings calculator ----- */
  app.get(EARN, async (req, res) => {
    const biz = await business(); const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["Join as a notary", "/notary/become-a-notary"], ["Earnings calculator", EARN]];
    const row = (id, label, pay) => `<div class="field"><label for="${id}">${label} <span class="opt">($${pay.toFixed(2)} each)</span></label><input id="${id}" type="number" min="0" max="100" step="1" value="0" inputmode="numeric"></div>`;
    const faqs = [
      ["Is this what I'll earn?", "No. It only multiplies your numbers by the per-job pay we list. We can't guarantee how many jobs are offered, and you choose which to accept. Your exact pay is shown before you accept each job."],
      ["What does it leave out?", "Taxes, self-employment tax, E&O insurance, your commission and supply costs, and slow weeks. You're an independent contractor and receive a 1099. Talk to a tax professional about your numbers."],
      ["How much work is there?", "We're a young company building volume with title companies, law firms and families. Early notaries get work as it grows, but there are no minimums and no guarantees."],
    ];
    res.send(layout({
      req, biz, path: EARN, crumbs,
      title: fit("Notary Earnings Calculator: Mobile and Loan Signing Pay", "MCC Solutions"),
      description: "Estimate what you could make taking mobile notary, loan signing and hospital assignments in New Jersey. Paid per job at 50% of the service fee.",
      body: {
        hero: `<p class="eyebrow">For notaries</p><h1 style="margin-top:10px">Notary earnings calculator</h1><p class="lede" style="margin-top:14px">Enter how many jobs you might take in a week. See a rough weekly and monthly total at our per-job pay.</p>`,
        main: `<section class="band"><div class="wrap" style="max-width:860px">
          <div class="form-card"><fieldset>
            ${row("e-mobile", "Mobile notary visits per week", PAY.mobile)}${row("e-loan", "Loan signings per week", PAY.loan)}${row("e-hosp", "Hospital or care-facility visits per week", PAY.hospital)}
            <div class="field"><label for="e-cost">Your cost per job <span class="opt">(gas, tolls, printing)</span></label><input id="e-cost" type="number" min="0" max="500" step="0.5" value="0" inputmode="decimal"></div>
            <div class="field"><label for="e-hrs">Hours per job <span class="opt">(travel included)</span></label><input id="e-hrs" type="number" min="0.25" max="12" step="0.25" value="1.5" inputmode="decimal"></div>
          </fieldset></div>
          <div class="form-card" style="margin-top:22px" aria-live="polite">
            <div style="display:flex;gap:28px;flex-wrap:wrap">
              <div><p style="margin:0;color:var(--muted);font-size:.9rem">Per week</p><b id="r-wk" style="font-family:var(--f-display);font-size:2rem">$0</b></div>
              <div><p style="margin:0;color:var(--muted);font-size:.9rem">Per month</p><b id="r-mo" style="font-family:var(--f-display);font-size:2rem">$0</b></div>
              <div><p style="margin:0;color:var(--muted);font-size:.9rem">Per hour after costs</p><b id="r-hr" style="font-family:var(--f-display);font-size:2rem">$0</b></div>
            </div>
            <p id="r-sum" style="margin:14px 0 0;color:var(--ink-2)"></p>
            <p style="margin:14px 0 0;color:var(--muted);font-size:.9rem">An estimate from your own numbers, before taxes, E&amp;O insurance and other expenses. Not a promise of income or of how many jobs will be offered. Independent contractor work with a 1099, and you choose which jobs to accept.</p>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px"><a class="btn btn-primary" href="/notary/become-a-notary">See requirements and apply</a></div>
          </div>
        </div></section>
        <section class="band alt"><div class="wrap" style="max-width:860px"><div class="sec-head"><p class="eyebrow">FAQ</p><h2>About these numbers</h2></div>${faqHtml(faqs)}</div></section>
        <script>window.MCC_PAY=${JSON.stringify(PAY)};</script><script src="/js/notary-tools.js" defer></script>`,
        ctaTitle: "Ready to join?", ctaHref: "/notary/become-a-notary", ctaLabel: "Apply",
      },
      schema: [app_(url + EARN, "Notary earnings calculator", "FinanceApplication"), faqSchema(faqs), crumbSchema(url, crumbs)],
    }));
  });
}
module.exports = { register, paths, FINDER, CHECKLIST, EARN, PAY };
