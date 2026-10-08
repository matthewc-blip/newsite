// About, vendor packet, privacy policy and terms of service pages.
// Rendered with the same layout as the landing pages in seo.js.
const { layout, business, telHref, base, esc } = require("./seo");

const UPDATED = "October 3, 2026";
const FOUNDER = { name: "Matthew Coleman", role: "Founder & Principal", photo: "/img/matthew-coleman.jpg" };
// From Matthew's resume. Only list credentials that are current; add new ones here as they're earned.
const CREDENTIALS = [
  ["New Jersey Notary Public", "Commissioned by the State of New Jersey"],
  ["NNA Certified Loan Signing Agent", "National Notary Association certification"],
  ["E&O insured", "$100,000 errors and omissions coverage"],
  ["Background screened", "Current background check on file"],
  ["QuickBooks ProAdvisor, Gold", "Intuit's certification for bookkeeping professionals"],
  ["B.S.B.A., Accounting & Finance", "Kutztown University of Pennsylvania, 2025"],
];

function legal(sections) {
  return `<section class="band"><div class="wrap legal-doc">${sections.map(([h, body]) => `<h2>${esc(h)}</h2>${body}`).join("")}</div></section>`;
}
const p = (t) => `<p>${t}</p>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

function register(app) {
  /* ---------- About ---------- */
  app.get("/about", async (req, res) => {
    const biz = await business();
    const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["About", "/about"]];
    res.send(layout({
      req, biz, path: "/about", crumbs,
      title: "About MCC Solutions | NJ Notary, Bookkeeping & Web Services",
      description: `Meet ${FOUNDER.name}, founder of MCC Solutions in Cranford, NJ: notary, loan signing agent, bookkeeper and accounting & finance graduate.`,
      body: {
        hero: `<p class="eyebrow">About MCC Solutions</p><h1 style="margin-top:10px">A signing desk built on one promise: the closing happens on time.</h1>`,
        main: `<section class="band"><div class="wrap split">
          <div><img class="about-photo" src="${FOUNDER.photo}" alt="${esc(FOUNDER.name)}, ${esc(FOUNDER.role)} of MCC Solutions" width="360" height="360"><p style="margin-top:14px"><b>${esc(FOUNDER.name)}</b><br><span style="color:var(--muted)">${esc(FOUNDER.role)}, MCC Solutions</span></p></div>
          <div class="stack">
            <h2>Why I started MCC Solutions</h2>
            <p class="lede">I started MCC Solutions in New Jersey because signings fail for simple reasons: a notary who doesn't confirm, a missed initial, a package that ships late, a client left calling for updates.</p>
            <p>So we built a desk that fixes each of those. Every order is confirmed and assigned to a verified notary. Clients see status at each step. Every package is checked before it ships, and the tracking number goes straight to the people waiting on it.</p>
            <p>We serve title companies, lenders, attorneys, hospitals and families across New Jersey, in person and remotely. Beyond notarizations, the same desk handles process serving, document recording, apostilles and the other paperwork that comes with a closing, a lawsuit or an estate.</p>
            <h2 style="margin-top:12px">My background</h2>
            <p>I'm based in Cranford, in Union County, and I still take signings myself. I'm a commissioned New Jersey notary and an NNA Certified Loan Signing Agent, background screened, with $100,000 in E&amp;O coverage. I've handled the time-sensitive work too, including a bedside will and trust signing in a hospital, where getting every detail right matters most.</p>
            <p>My background is in accounting and finance. I earned a B.S.B.A. in Accounting &amp; Finance from Kutztown University of Pennsylvania, where faculty selected me to lead group tutoring sessions for Intermediate Accounting I and II and Corporate Finance. I'm also a QuickBooks ProAdvisor, which is why the paperwork side of a business is where MCC is headed next.</p>
            <p>Alongside MCC, I complete data and strategy projects through Parker Dewey's micro-internship program for organizations ranging from a Fortune 500 consumer-goods subsidiary to a talent agency, a private equity firm and a venture-backed founder. The work has included a territory expansion plan with a prioritized account list, a data-driven talent pipeline tool, an asset-management data and strategy project, and a lead list of funded technology and healthcare companies. The habit is the same one I bring to your paperwork: get the numbers right, then make them usable.</p>
          </div>
        </div></section>
        <section class="band"><div class="wrap">
          <div class="sec-head"><p class="eyebrow">Credentials</p><h2>Licensed, certified and insured</h2></div>
          <ul class="cred-list">${CREDENTIALS.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join("")}</ul>
        </div></section>
        <section class="band alt"><div class="wrap">
          <div class="sec-head"><p class="eyebrow">How we work</p><h2>What every client gets</h2></div>
          <div class="grid g2">
            <div class="svc"><span class="code">VERIFIED</span><h3>Verified notaries</h3><p>An active commission, E&amp;O insurance, a background check, a W-9 and a signed contractor agreement are on file before any notary gets an assignment.</p></div>
            <div class="svc"><span class="code">STATUS</span><h3>Updates at every step</h3><p>Assigned, confirmed, signed and shipped. Clients get each update without having to call.</p></div>
            <div class="svc"><span class="code">QC</span><h3>Every package checked</h3><p>The notary checks every page at the table, then the desk reviews the scanbacks before the package ships.</p></div>
            <div class="svc"><span class="code">PRIVACY</span><h3>Documents handled carefully</h3><p>Files sit in private storage that only the assigned notary and the client can reach, and closing documents are deleted after the job is done.</p></div>
          </div>
        </div></section>`,
        ctaTitle: "Have a signing coming up? Send it to the desk.",
      },
      schema: [
        { "@type": "AboutPage", name: "About MCC Solutions", url: url + "/about" },
        { "@type": "Person", name: FOUNDER.name, jobTitle: FOUNDER.role, image: url + FOUNDER.photo, worksFor: { "@id": url + "/#business" },
          alumniOf: { "@type": "CollegeOrUniversity", name: "Kutztown University of Pennsylvania" },
          homeLocation: { "@type": "Place", name: "Cranford, New Jersey" },
          hasCredential: CREDENTIALS.slice(0, 4).map(([t]) => ({ "@type": "EducationalOccupationalCredential", name: t })),
          sameAs: ["https://www.linkedin.com/in/matthew--coleman"] },
        { "@type": "Organization", "@id": url + "/#org", name: "MCC Solutions", url: url + "/", founder: { "@type": "Person", name: FOUNDER.name } },
      ],
    }));
  });

  /* ---------- For law firms ---------- */
  app.get("/notary/law-firms", async (req, res) => {
    const { getSettings } = require("./db");
    const settings = await getSettings().catch(() => null);
    const biz = settings ? settings.business : await business();
    const url = base(req);
    const ps = settings ? require("./prices").list(settings).find((x) => x.key === "process_serve") : null;
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["For law firms", "/notary/law-firms"]];
    const faqs = [
      ["Do you give legal advice or prepare documents?", "No. We serve, notarize, witness, record and certify documents your firm prepares. Questions about the documents themselves go to your attorneys."],
      ["Will I know when each serve attempt happens?", "Yes. You get an email each time an attempt is logged, with the date, time and result, and your team can see every attempt in the client portal."],
      ["How do we get the papers to you?", "Attach them when you place the request in the client portal or on the request form. We can also pick up originals."],
      ["How is billing handled?", "Each request is billed with your file or matter number on the invoice. Firm accounts are invoiced, with terms set when the account opens."],
      ["Can you serve outside New Jersey?", "We serve across New Jersey with our own team. For other states, ask the desk and we'll arrange service through a trusted partner."],
    ];
    res.send(layout({
      req, biz, path: "/notary/law-firms", crumbs,
      title: "Process Serving, Notaries & Witnesses for NJ Law Firms | MCC",
      description: "Process serving with every attempt emailed and the affidavit uploaded, plus notaries, witnesses, apostilles and recording for New Jersey law firms. One account, one invoice.",
      body: {
        hero: `<p class="eyebrow">For law firms</p><h1 style="margin-top:10px">Process serving, notaries and witnesses from one desk</h1><p class="lede" style="margin-top:14px">Send serves, estate signings, apostilles and recordings from one portal. Every serve attempt is emailed to you as it happens, the affidavit is uploaded when it's done, and your file number is on every invoice.</p>${ps ? `<p class="from-price"><span>Process serving from</span> <b>${require("./prices").money(ps.price)}</b> <small>${esc(ps.note)}</small></p>` : ""}<div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="#account">Request a firm account</a><a class="btn btn-ghost" href="/notary/process-serving#request">Send a serve now</a></div>`,
        main: `<section class="band"><div class="wrap">
          <div class="sec-head"><p class="eyebrow">What firms send us</p><h2>The work around the case file</h2></div>
          <div class="grid g3">
            <a class="svc" href="/notary/process-serving"><span class="code">PROCESS SERVING</span><h3>Serves with a paper trail</h3><p>Personal and substitute service as the court rules allow. Attempts at different times of day, each one logged and emailed to you, then a signed affidavit of service.</p><span class="more">Process serving →</span></a>
            <a class="svc" href="/notary/estate-planning-notary"><span class="code">ESTATE SIGNINGS</span><h3>Notaries and witnesses</h3><p>Wills, trusts, powers of attorney and advance directives, with independent witnesses, at the client's home, office or hospital bed.</p><span class="more">Estate signings →</span></a>
            <a class="svc" href="/notary/apostille-services"><span class="code">INTERNATIONAL</span><h3>Apostilles and legalization</h3><p>Documents notarized and certified for use abroad, including embassy legalization for countries outside the Hague Convention.</p><span class="more">Apostilles →</span></a>
            <a class="svc" href="/notary/document-recording"><span class="code">RECORDING</span><h3>Deeds and releases recorded</h3><p>Submitted to the county with the recorded copy back to you.</p><span class="more">Recording →</span></a>
            <a class="svc" href="/notary/court-filing"><span class="code">COURT RUNS</span><h3>Filings and courthouse runs</h3><p>Walk-in filings, hand deliveries and copies from the court file, plus affidavits filed after a serve.</p><span class="more">Court runs →</span></a>
            <a class="svc" href="/notary/skip-tracing"><span class="code">SKIP TRACE</span><h3>Defendant moved? We find them</h3><p>Database searches for a current address, handed straight to a server. Permissible legal purposes only.</p><span class="more">Skip tracing →</span></a>
            <a class="svc" href="/notary/medical-records-retrieval"><span class="code">RECORDS</span><h3>Medical and public records</h3><p>Medical records picked up with the signed authorization, and certified deeds, court and vital records pulled for you.</p><span class="more">Records →</span></a>
            <a class="svc" href="/notary/certified-translation"><span class="code">TRANSLATION</span><h3>Certified translation</h3><p>Translations certified by our partners and notarized when the court or agency requires it.</p><span class="more">Translation →</span></a>
            <a class="svc" href="/notary/hospital-notary"><span class="code">URGENT</span><h3>Hospital and same-day visits</h3><p>Bedside notarizations and rush serves, including evenings and weekends.</p><span class="more">Hospital visits →</span></a>
          </div>
        </div></section>
        <section class="band alt"><div class="wrap split">
          <div class="stack"><p class="eyebrow">Your firm account</p><h2>Built for paralegals</h2><ul class="checks">
            <li>One client portal for serves, signings and every other request</li>
            <li>Attach the papers when you order, or add them later</li>
            <li>See each serve attempt, and download the affidavit when it's done</li>
            <li>Your file or matter number on every request and invoice</li>
            <li>Invoiced to the firm, with terms set when the account opens</li>
            <li>Add as many people from your team as you need</li>
          </ul></div>
          <div class="stack"><p class="eyebrow">Our servers</p><h2>Who serves your papers</h2><ul class="checks">
            <li>Adults with no interest in your case, as Rule 4:4-3 requires</li>
            <li>Background check on file before their first assignment</li>
            <li>Valid driver's license, plus a registered and insured vehicle, each tracked to expiration</li>
            <li>Signed contractor agreement covering confidentiality and conduct</li>
            <li>Every attempt recorded with date, time, place and result</li>
          </ul></div>
        </div></section>
        <section class="band" id="account"><div class="wrap form-layout">
          <form class="form-card" id="firmForm" novalidate>
            <fieldset><legend>Request a firm account</legend>
              <div class="field full"><label for="f-firm">Firm name</label><input id="f-firm" required autocomplete="organization"></div>
              <div class="field"><label for="f-name">Your name</label><input id="f-name" required autocomplete="name"></div>
              <div class="field"><label for="f-title">Role <span class="opt">(optional)</span></label><input id="f-title" placeholder="Paralegal, office manager, attorney…"></div>
              <div class="field"><label for="f-email">Work email</label><input id="f-email" type="email" required autocomplete="email"></div>
              <div class="field"><label for="f-phone">Phone</label><input id="f-phone" type="tel" required autocomplete="tel"></div>
              <fieldset class="field full" style="border:0;padding:0;margin:0"><legend style="font-size:.88rem;font-weight:600;margin-bottom:6px">What you'll send us</legend>
                <div class="chk-row">${["Process serving", "Notaries & witnesses", "Apostilles", "Recording", "Translation", "Other"].map((x, i) => `<label><input type="checkbox" name="f-need" value="${esc(x)}"${i === 0 ? " checked" : ""}> ${esc(x)}</label>`).join("")}</div>
              </fieldset>
              <div class="field"><label for="f-vol">Roughly how many a month?</label><select id="f-vol"><option>1–5</option><option selected>5–20</option><option>20–50</option><option>50+</option></select></div>
              <div class="field"><label for="f-team">People who'll order <span class="opt">(optional)</span></label><input id="f-team" placeholder="Names and emails, or just a number"></div>
              <div class="field full"><label for="f-msg">Anything else? <span class="opt">(optional)</span></label><textarea id="f-msg" rows="3" placeholder="Counties you need, billing contact, vendor forms…"></textarea></div>
              <input type="text" id="f-website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
            </fieldset>
            <div class="form-foot"><small>We set up the account and email your team a sign-in link, usually within one business day.</small><button class="btn btn-primary" type="submit">Request account</button></div>
            <p class="form-msg" id="firmMsg" role="status"></p>
          </form>
          <aside class="stack"><h3>Need something served today?</h3><p>You don't need an account to start. <a href="/notary/process-serving#request">Send a request</a> or call <a href="${telHref(biz.phone)}">${esc(biz.phone)}</a>.</p><h3 style="margin-top:12px">Vendor paperwork</h3><p>Our <a href="/notary/vendors">vendor packet</a> covers insurance, vetting and data handling.</p></aside>
        </div></section>
        <section class="band alt"><div class="wrap" style="max-width:860px">
          <div class="sec-head"><p class="eyebrow">FAQ</p><h2>Common questions from firms</h2></div>
          <div class="faq-group">${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>
        </div></section>
        <script>
        document.getElementById("firmForm").addEventListener("submit", async function (e) {
          e.preventDefault();
          var g = function (id) { return document.getElementById(id).value.trim(); };
          var m = document.getElementById("firmMsg"), b = this.querySelector("button[type=submit]");
          var needs = Array.prototype.map.call(this.querySelectorAll('input[name="f-need"]:checked'), function (i) { return i.value; });
          if (!g("f-firm") || !g("f-name") || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(g("f-email")) || g("f-phone").replace(/\\D/g, "").length < 10) { m.className = "form-msg"; m.textContent = "Enter the firm name, your name, a work email and a phone number."; return; }
          b.disabled = true; m.className = "form-msg"; m.textContent = "Sending…";
          var text = ["Firm: " + g("f-firm"), "Contact: " + g("f-name") + (g("f-title") ? " (" + g("f-title") + ")" : ""), "Phone: " + g("f-phone"), "Needs: " + (needs.join(", ") || "-"), "Volume: " + g("f-vol") + " a month", "Team: " + (g("f-team") || "-"), "", g("f-msg")].join("\\n");
          try {
            var r = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: g("f-name"), email: g("f-email"), topic: "Firm account request: " + g("f-firm"), message: text, website: g("f-website") }) });
            var d = await r.json().catch(function () { return {}; });
            if (!r.ok) throw new Error(d.error || "Couldn't send. Try again or call the desk.");
            if (window.mccTrack) window.mccTrack("generate_lead", { form: "firm_account" });
            this.reset(); m.className = "form-msg ok"; m.textContent = "Thanks. We'll set up the account and email your team a sign-in link, usually within one business day.";
          } catch (err) { m.className = "form-msg"; m.textContent = err.message; }
          b.disabled = false;
        });
        </script>`,
        ctaTitle: "Have papers to serve? Send them to the desk.",
      },
      schema: [
        { "@type": "Service", name: "Legal support services for law firms", serviceType: "Process serving, notarization and witness services", provider: { "@id": url + "/#business" }, areaServed: { "@type": "State", name: "New Jersey" }, audience: { "@type": "BusinessAudience", name: "Law firms" }, url: url + "/notary/law-firms" },
        { "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
        { "@type": "BreadcrumbList", itemListElement: crumbs.map(([n, pth], i) => ({ "@type": "ListItem", position: i + 1, name: n, item: url + pth })) },
      ],
    }));
  });

  /* ---------- Vendor packet ---------- */
  app.get("/notary/vendors", async (req, res) => {
    const biz = await business();
    const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["Vendor packet", "/notary/vendors"]];
    const rows = [
      ["Company", "MCC Solutions LLC · Cranford, NJ (Union County)"],
      ["Principal", "Matthew Coleman · NJ Notary Public · NNA Certified Loan Signing Agent · $100,000 E&amp;O · Background screened"],
      ["Services", "Loan signings (purchase, refinance, HELOC, reverse, seller), general mobile notary, hospital and facility visits, Remote Online Notarization, Remote Ink-Signed Notarization, process serving, document recording, apostilles, witnesses"],
      ["Coverage", "New Jersey, based in Cranford (Union County)"],
      ["Desk hours", "Mon–Fri 7 AM–9 PM ET · Sat 9 AM–5 PM ET"],
      ["Ordering", "Client portal, email or phone"],
      ["Order desk", `<a href="${telHref(biz.phone)}">${esc(biz.phone)}</a> · ${esc(biz.email)}`],
      ["Billing", "Invoice per order or every two weeks. ACH or card. Terms on approval."],
      ["Returns", "Drop-off with your prepaid label; tracking sent to your team"],
    ];
    res.send(layout({
      req, biz, path: "/notary/vendors", crumbs,
      title: "Vendor Packet for Title Companies | MCC Solutions",
      description: "Company profile, notary vetting standards, data security practices and documents your vendor management team needs to approve MCC Solutions.",
      body: {
        hero: `<p class="eyebrow">For title, escrow &amp; lenders</p><h1 style="margin-top:10px">Vendor packet</h1><p class="lede" style="margin-top:14px">Everything your vendor management team needs to approve MCC Solutions as a signing vendor. Request the documents below and we'll send them the same business day.</p><div class="hero-ctas no-print" style="margin-top:22px"><a class="btn btn-primary" href="#request">Request the packet</a><button class="btn btn-ghost" type="button" onclick="window.print()" title="Opens the print dialog. Choose Save as PDF to download.">Save as PDF</button></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">Company profile</p><h2>At a glance</h2><table class="kv-table">${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join("")}</table></div>
          <div class="stack"><p class="eyebrow">Documents</p><h2>What we send on request</h2><ul class="checks">
            <li><b>W-9</b> for MCC Solutions</li>
            <li><b>Fee schedule</b> for loan signings, general work and add-ons</li>
            <li><b>Notary credentials</b> for any assigned notary: commission, E&amp;O certificate and background check date</li>
            <li><b>Data security summary</b>, the practices listed on this page</li>
            <li><b>Your forms:</b> we complete vendor questionnaires and sign NDAs or vendor agreements</li>
          </ul></div>
        </div></section>
        <section class="band alt"><div class="wrap split">
          <div class="stack"><p class="eyebrow">Notary standards</p><h2>Before any notary is assigned</h2><ul class="checks">
            <li>Active New Jersey notary commission, verified</li>
            <li>Errors &amp; omissions insurance on file, tracked to expiration</li>
            <li>Background check on file</li>
            <li>W-9 and a signed contractor and data-security agreement</li>
            <li>Automatic reminders before any credential expires; expired notaries can't accept work</li>
          </ul></div>
          <div class="stack"><p class="eyebrow">Data security</p><h2>How we protect borrower data</h2><ul class="checks">
            <li>Encrypted connections (HTTPS) for every page, upload and download</li>
            <li>Documents kept in private storage; only the assigned notary and your team can download them</li>
            <li>Closing documents deleted 30 days after the job is completed or canceled</li>
            <li>Notaries sign in with single-use emailed links; desk access is password protected</li>
            <li>Notaries agree in writing to keep borrower information confidential and to delete local copies</li>
          </ul></div>
        </div></section>
        <section class="band no-print" id="request"><div class="wrap form-layout">
          <form class="form-card" id="vendorForm" novalidate>
            <fieldset><legend>Request the vendor packet</legend>
              <div class="field"><label for="v-company">Company</label><input id="v-company" required placeholder="Title or lending company"></div>
              <div class="field"><label for="v-name">Your name</label><input id="v-name" required></div>
              <div class="field"><label for="v-email">Work email</label><input id="v-email" type="email" required placeholder="you@company.com"></div>
              <div class="field"><label for="v-phone">Phone</label><input id="v-phone" type="tel"></div>
              <div class="field full"><label for="v-volume">Signings per month in New Jersey (estimate)</label><select id="v-volume"><option>1–5</option><option>6–20</option><option>21–50</option><option>50+</option></select></div>
              <div class="field full"><label for="v-msg">Anything specific? (optional)</label><textarea id="v-msg" placeholder="Vendor questionnaire, insurance minimums, counties you need covered…"></textarea></div>
              <input type="text" id="v-website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
            </fieldset>
            <div class="form-foot"><small>We reply the same business day. See our <a href="/privacy">privacy policy</a>.</small><button class="btn btn-primary" type="submit">Request packet</button></div>
            <p class="form-msg" id="vendorMsg" role="status"></p>
          </form>
          <aside class="stack"><h3>Prefer to call?</h3><p>Reach the desk at <a href="${telHref(biz.phone)}">${esc(biz.phone)}</a> or ${esc(biz.email)}.</p></aside>
        </div></section>
        <script>
        document.getElementById("vendorForm").addEventListener("submit", async function (e) {
          e.preventDefault();
          var g = function (id) { return document.getElementById(id).value.trim(); };
          var m = document.getElementById("vendorMsg"), b = this.querySelector("button");
          if (!g("v-company") || !g("v-name") || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(g("v-email"))) { m.className = "form-msg"; m.textContent = "Enter your company, name and a valid email."; return; }
          b.disabled = true; m.className = "form-msg"; m.textContent = "Sending…";
          try {
            var r = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
              name: g("v-name"), email: g("v-email"), topic: "Vendor packet request", website: g("v-website"),
              message: "Company: " + g("v-company") + "\\nPhone: " + (g("v-phone") || "-") + "\\nNJ signings per month: " + g("v-volume") + "\\n\\n" + (g("v-msg") || "(no notes)") }) });
            var d = await r.json().catch(function () { return {}; });
            if (!r.ok) throw new Error(d.error || "Couldn't send. Call the desk instead.");
            if (window.mccTrack) window.mccTrack("generate_lead", { form: "vendor_packet" }); this.reset(); m.className = "form-msg ok"; m.textContent = "Thanks. We'll email the vendor packet today.";
          } catch (err) { m.className = "form-msg"; m.textContent = err.message; }
          b.disabled = false;
        });
        </script>`,
        ctaTitle: "Ready to send your first file?",
      },
      schema: [{ "@type": "WebPage", name: "Vendor packet", url: url + "/notary/vendors" }],
    }));
  });

  /* ---------- Fees (public price list) ---------- */
  app.get("/notary/fees", async (req, res) => {
    const { getSettings } = require("./db");
    const settings = await getSettings();
    const biz = settings.business;
    const url = base(req);
    const prices = require("./prices"), fees = require("./fees");
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["Fees", "/notary/fees"]];
    const start = prices.list(settings);
    const fx = fees.publicCatalog(settings);
    const svc = (f) => f.services.length === 3 ? "All" : f.services.map((x) => ({ mobile: "Mobile", ron: "RON", rin: "RIN" }[x])).join(", ");
    const rq = fees.requestCatalog(settings).filter((f) => f.price > 0);
    const addons = require("./addons").catalog(settings);
    const money = (n) => prices.money(n);
    const lateCancel = fx.find((f) => f.auto === "late_cancel"), trip = fx.find((f) => f.id === "trip");
    const faqs = [
      ["Why is the notary fee listed separately?", "New Jersey sets the maximum fee a notary can charge for each notarial act. Our travel, scheduling and signing-service fees are separate charges for coming to you, and every quote and invoice shows them on their own lines."],
      ["Will I know the price before the appointment?", "Yes. You get the price when we confirm your appointment, including any extra fees that apply. Rush, after-hours and weekend fees are added when you book, so they're in your confirmation."],
      ["Do businesses get different pricing?", "Title companies, law firms and other businesses with an account can ask about volume pricing. Request a business account and we'll quote it."],
      ["What if I need to cancel?", `Cancel online or call the desk any time before the appointment.${lateCancel ? ` Cancellations under 2 hours before the start have a ${money(lateCancel.price)} late-cancellation fee.` : ""}${trip ? ` If the notary arrives and the signing can't go ahead, a ${money(trip.price)} trip fee applies.` : ""}`],
    ];
    res.send(layout({
      req, biz, path: "/notary/fees", crumbs,
      title: "Notary & Process Serving Fees in New Jersey | MCC Solutions",
      description: "Starting prices for mobile notary visits, loan signings, process serving and document services in New Jersey, plus every extra fee, listed up front.",
      body: {
        hero: `<p class="eyebrow">Pricing</p><h1 style="margin-top:10px">Our fees, listed up front</h1><p class="lede" style="margin-top:14px">Starting prices for each service, and every extra fee that can apply. You see the full price before your appointment is confirmed, and every invoice lists each charge on its own line.</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="/notary/#order">Book a notary</a><a class="btn btn-ghost" href="${telHref(biz.phone)}">Call for a quote</a></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">Starting prices</p><h2>Services</h2>
            ${start.length ? `<table class="kv-table">${start.map((i) => `<tr><th scope="row">${esc(i.label)}</th><td><b>${money(i.price)}</b> <small>${esc(i.note)}</small></td></tr>`).join("")}</table>` : `<p>Call the desk for a quote.</p>`}
            <p style="color:var(--ink-2);font-size:.92rem">Final prices depend on the location, timing and number of signers. The desk confirms the price before anything is scheduled.</p></div>
          <div class="stack"><p class="eyebrow">Options</p><h2>Add-ons you can choose</h2>
            ${addons.length ? `<table class="kv-table">${addons.map((a) => `<tr><th scope="row">${esc(a.label)}</th><td><b>${money(a.price)}</b>${a.note ? ` <small>${esc(a.note)}</small>` : ""}</td></tr>`).join("")}</table>` : "<p>None right now.</p>"}</div>
        </div></section>
        <section class="band alt"><div class="wrap">
          <div class="sec-head"><p class="eyebrow">Extra fees</p><h2>Notary visits and signings</h2><p class="lede">These only apply when they fit the appointment. Fees marked "automatic" are added when you book, so they show up in your confirmation.</p></div>
          <table class="kv-table fee-table">${fx.map((f) => `<tr><th scope="row">${esc(f.label)}${f.auto ? ' <span class="tag">automatic</span>' : ""}</th><td><b>${money(f.price)}</b>${f.unit ? ` ${esc(f.unit)}` : ""}${f.note ? `<br><small>${esc(f.note)}</small>` : ""}<br><small>${esc(svc(f))}</small></td></tr>`).join("")}</table>
          ${rq.length ? `<div class="sec-head" style="margin-top:40px"><h2>Process serving and document services</h2></div>
          <table class="kv-table fee-table">${rq.map((f) => `<tr><th scope="row">${esc(f.label)}</th><td><b>${money(f.price)}</b>${f.unit ? ` ${esc(f.unit)}` : ""}${f.note ? `<br><small>${esc(f.note)}</small>` : ""}</td></tr>`).join("")}</table>
          <p style="color:var(--ink-2);font-size:.92rem;margin-top:12px">Court, county, agency and copy fees are passed through at cost and shown separately.</p>` : ""}
        </div></section>
        <section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">New Jersey notarial fees</p><h2>The state fee is separate</h2><p>New Jersey law caps what a notary may charge for each notarial act. That fee is billed at or below the state limit. Travel, scheduling, printing and the other services on this page are separate charges for coming to you, agreed before the appointment.</p></div>
          <div class="stack"><p class="eyebrow">Payment</p><h2>How you pay</h2><ul class="checks"><li>Individuals: card saved when you book, charged after the appointment, with an emailed receipt</li><li>Businesses: invoice per job or monthly, by ACH or card</li><li>Every invoice lists the notarial fee, service fee and each extra fee on its own line</li></ul></div>
        </div></section>
        <section class="band alt"><div class="wrap"><div class="sec-head"><p class="eyebrow">Questions</p><h2>About our fees</h2></div>
          <div class="faq-group">${faqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div></div></section>`,
        ctaTitle: "Need a price for a specific job?",
      },
      schema: [{ "@type": "WebPage", name: "Fees", url: url + "/notary/fees" }, { "@type": "FAQPage", mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }],
    }));
  });

  /* ---------- Become a witness (application) ---------- */
  app.get("/notary/become-a-witness", async (req, res) => {
    const biz = await business();
    const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["Become a witness", "/notary/become-a-witness"]];
    res.send(layout({
      req, biz, path: "/notary/become-a-witness", crumbs,
      title: "Become a Paid Signing Witness in New Jersey | MCC",
      description: "Get paid to witness wills, deeds and remote signings near you in New Jersey. Flexible, per-assignment work. No notary commission needed. Apply in minutes.",
      body: {
        hero: `<p class="eyebrow">Join the team</p><h1 style="margin-top:10px">Get paid to witness signings near you</h1><p class="lede" style="margin-top:14px">Wills, deeds and some remote signings need independent witnesses. MCC Solutions sends witnesses with our notaries across New Jersey. You choose which requests to accept, and you're paid for every completed signing. No notary commission needed.</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="#apply">Apply now</a></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">What you'll need</p><h2>Requirements</h2><ul class="checks">
            <li>18 or older, with a valid government photo ID</li>
            <li>A background check on file (we'll tell you how if you don't have one)</li>
            <li>Reliable transportation and a phone for email and texts</li>
            <li>Not related to signers, and never named in documents you witness</li>
            <li>Professional, on time, and calm in hospitals and family settings</li>
          </ul></div>
          <div class="stack"><p class="eyebrow">How it works</p><h2>From request to payment</h2><ol class="steps" style="grid-template-columns:1fr">
            <li><h3>Apply</h3><p>Takes two minutes. We review applications within 3 business days.</p></li>
            <li><h3>Onboard online</h3><p>Upload your ID, background check and W-9, and sign the witness agreement in the portal.</p></li>
            <li><h3>Accept requests</h3><p>We email you witness requests near you. Accept the ones that fit your schedule.</p></li>
            <li><h3>Get paid</h3><p>You're paid for every completed signing, as an independent contractor.</p></li>
          </ol></div>
        </div></section>
        <section class="band alt" id="apply"><div class="wrap form-layout">
          <form class="form-card" id="witForm" novalidate>
            <fieldset><legend>Witness application</legend>
              <div class="field"><label for="w-name">Full name</label><input id="w-name" required autocomplete="name"></div>
              <div class="field"><label for="w-email">Email</label><input id="w-email" type="email" required autocomplete="email"></div>
              <div class="field"><label for="w-phone">Mobile phone</label><input id="w-phone" type="tel" required autocomplete="tel"></div>
              <div class="field"><label for="w-zip">Home ZIP</label><input id="w-zip" inputmode="numeric" maxlength="5" required></div>
              <div class="field"><label for="w-radius">How far will you travel?</label><select id="w-radius"><option>10 miles</option><option selected>20 miles</option><option>30 miles</option><option>50 miles</option></select></div>
              <div class="field"><label for="w-avail">When are you available?</label><select id="w-avail"><option>Weekdays</option><option>Evenings</option><option>Weekends</option><option selected>Evenings and weekends</option><option>Anytime</option></select></div>
              <div class="field"><label for="w-bg">Background check date <span class="opt">(if you have one)</span></label><input id="w-bg" type="date"></div>
              <div class="field"><label for="w-lang">Languages besides English <span class="opt">(optional)</span></label><input id="w-lang" placeholder="Spanish…"></div>
              <input type="text" id="w-website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
            </fieldset>
            <div class="form-foot"><small>By applying you agree to our <a href="/privacy">privacy policy</a>.</small><button class="btn btn-primary" type="submit">Submit application</button></div>
            <p class="form-msg" id="witMsg" role="status"></p>
          </form>
          <aside class="stack"><h3>Are you a notary?</h3><p>Commissioned notaries and signing agents can <a href="/notary/#notaries">apply to the notary network</a> instead, and still take witness requests.</p></aside>
        </div></section>
        <script>
        document.getElementById("witForm").addEventListener("submit", async function (e) {
          e.preventDefault();
          var g = function (id) { return document.getElementById(id).value.trim(); };
          var m = document.getElementById("witMsg"), b = this.querySelector("button");
          if (!g("w-name") || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(g("w-email")) || g("w-phone").replace(/\\D/g, "").length < 10 || !/^\\d{5}$/.test(g("w-zip"))) { m.className = "form-msg"; m.textContent = "Enter your name, email, mobile phone and 5-digit ZIP."; return; }
          b.disabled = true; m.className = "form-msg"; m.textContent = "Sending…";
          try {
            var r = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "witness", name: g("w-name"), email: g("w-email"), phone: g("w-phone"), zip: g("w-zip"), radius: g("w-radius"), availability: g("w-avail"), backgroundDate: g("w-bg"), languages: g("w-lang"), website: g("w-website") }) });
            var d = await r.json().catch(function () { return {}; });
            if (!r.ok) throw new Error(d.error || "Couldn't send. Try again.");
            if (window.mccTrack) window.mccTrack("witness_application", { form: "witness" });
            this.reset(); m.className = "form-msg ok"; m.textContent = "Application received. We review applications within 3 business days and will email you next steps.";
          } catch (err) { m.className = "form-msg"; m.textContent = err.message; }
          b.disabled = false;
        });
        </script>`,
        ctaTitle: "Questions about witnessing? Call the desk.",
      },
      schema: [{ "@type": "JobPosting", title: "Signing Witness (independent contractor)", description: "Witness wills, deeds and remote signings for MCC Solutions across New Jersey. Per-assignment, flexible schedule.", employmentType: "CONTRACTOR", datePosted: new Date().toISOString().slice(0, 10), hiringOrganization: { "@type": "Organization", name: "MCC Solutions", sameAs: url + "/" }, jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressRegion: "NJ", addressCountry: "US" } } }],
    }));
  });

  /* ---------- Become a process server (application) ---------- */
  app.get("/notary/become-a-process-server", async (req, res) => {
    const biz = await business();
    const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["Become a process server", "/notary/become-a-process-server"]];
    res.send(layout({
      req, biz, path: "/notary/become-a-process-server", crumbs,
      title: "Become a Process Server in New Jersey | MCC Solutions",
      description: "Serve court papers for law firms across New Jersey. Per-serve pay, flexible schedule, assignments near you. Requires a driver's license and a registered, insured vehicle.",
      body: {
        hero: `<p class="eyebrow">Join the team</p><h1 style="margin-top:10px">Serve papers for law firms near you</h1><p class="lede" style="margin-top:14px">MCC Solutions handles process serving for attorneys across New Jersey. We send you serves near home, you log your attempts in the portal, and you're paid for every completed serve. Property inspections and courier runs are available too.</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="#apply">Apply now</a></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">What you'll need</p><h2>Requirements</h2><ul class="checks">
            <li>18 or older, and not a party to any case you serve</li>
            <li>A valid driver's license</li>
            <li>A registered vehicle with current auto insurance (you'll upload both)</li>
            <li>A background check on file (we'll tell you how if you don't have one)</li>
            <li>A smartphone for photos, GPS-stamped attempts and email</li>
            <li>Calm, professional and safe at the door. Never force a serve.</li>
          </ul></div>
          <div class="stack"><p class="eyebrow">How it works</p><h2>From assignment to payment</h2><ol class="steps" style="grid-template-columns:1fr">
            <li><h3>Apply</h3><p>Takes two minutes. We review applications within 3 business days.</p></li>
            <li><h3>Onboard online</h3><p>Upload your driver's license, vehicle registration, auto insurance, background check and W-9, then sign the process server agreement.</p></li>
            <li><h3>Accept serves</h3><p>We email you serves near you with the pay shown up front. Accept the ones that fit your route.</p></li>
            <li><h3>Log and complete</h3><p>Record each attempt in the portal, then upload the signed affidavit of service.</p></li>
            <li><h3>Get paid</h3><p>You're paid for every completed serve, as an independent contractor.</p></li>
          </ol></div>
        </div></section>
        <section class="band alt" id="apply"><div class="wrap form-layout">
          <form class="form-card" id="psForm" novalidate>
            <fieldset><legend>Process server application</legend>
              <div class="field"><label for="p-name">Full name</label><input id="p-name" required autocomplete="name"></div>
              <div class="field"><label for="p-email">Email</label><input id="p-email" type="email" required autocomplete="email"></div>
              <div class="field"><label for="p-phone">Mobile phone</label><input id="p-phone" type="tel" required autocomplete="tel"></div>
              <div class="field"><label for="p-zip">Home ZIP</label><input id="p-zip" inputmode="numeric" maxlength="5" required></div>
              <div class="field"><label for="p-vehicle">Do you have a registered, insured vehicle?</label><select id="p-vehicle"><option value="">Choose…</option><option>Yes, registered and insured</option><option>No</option></select></div>
              <div class="field"><label for="p-exp">Process serving experience</label><select id="p-exp"><option>None yet</option><option>Under 1 year</option><option>1 to 3 years</option><option>3+ years</option></select></div>
              <div class="field"><label for="p-radius">How far will you drive?</label><select id="p-radius"><option>10 miles</option><option selected>20 miles</option><option>30 miles</option><option>50 miles</option></select></div>
              <div class="field"><label for="p-avail">When are you available?</label><select id="p-avail"><option>Weekdays</option><option>Evenings</option><option>Weekends</option><option selected>Evenings and weekends</option><option>Anytime</option></select></div>
              <div class="field"><label for="p-bg">Background check date <span class="opt">(if you have one)</span></label><input id="p-bg" type="date"></div>
              <div class="field"><label for="p-lang">Languages besides English <span class="opt">(optional)</span></label><input id="p-lang" placeholder="Spanish…"></div>
              <input type="text" id="p-website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
            </fieldset>
            <div class="form-foot"><small>By applying you agree to our <a href="/privacy">privacy policy</a>.</small><button class="btn btn-primary" type="submit">Submit application</button></div>
            <p class="form-msg" id="psMsg" role="status"></p>
          </form>
          <aside class="stack"><h3>Are you a notary?</h3><p>Commissioned notaries and signing agents can <a href="/notary/#notaries">apply to the notary network</a>. Want lighter work? <a href="/notary/become-a-witness">Become a signing witness</a>.</p></aside>
        </div></section>
        <script>
        document.getElementById("psForm").addEventListener("submit", async function (e) {
          e.preventDefault();
          var g = function (id) { return document.getElementById(id).value.trim(); };
          var m = document.getElementById("psMsg"), b = this.querySelector("button");
          if (!g("p-name") || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(g("p-email")) || g("p-phone").replace(/\\D/g, "").length < 10 || !/^\\d{5}$/.test(g("p-zip"))) { m.className = "form-msg"; m.textContent = "Enter your name, email, mobile phone and 5-digit ZIP."; return; }
          if (!/^Yes/.test(g("p-vehicle"))) { m.className = "form-msg"; m.textContent = "Process servers need a registered, insured vehicle."; return; }
          b.disabled = true; m.className = "form-msg"; m.textContent = "Sending…";
          try {
            var r = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "process_server", name: g("p-name"), email: g("p-email"), phone: g("p-phone"), zip: g("p-zip"), radius: g("p-radius"), availability: g("p-avail"), vehicle: g("p-vehicle"), experience: g("p-exp"), backgroundDate: g("p-bg"), languages: g("p-lang"), website: g("p-website") }) });
            var d = await r.json().catch(function () { return {}; });
            if (!r.ok) throw new Error(d.error || "Couldn't send. Try again.");
            if (window.mccTrack) window.mccTrack("process_server_application", { form: "process_server" });
            this.reset(); m.className = "form-msg ok"; m.textContent = "Application received. We review applications within 3 business days and will email you next steps.";
          } catch (err) { m.className = "form-msg"; m.textContent = err.message; }
          b.disabled = false;
        });
        </script>`,
        ctaTitle: "Questions about serving for us? Call the desk.",
      },
      schema: [{ "@type": "JobPosting", title: "Process Server (independent contractor)", description: "Serve court papers for law firms across New Jersey for MCC Solutions. Per-serve pay, flexible schedule. Driver's license and registered, insured vehicle required.", employmentType: "CONTRACTOR", datePosted: new Date().toISOString().slice(0, 10), hiringOrganization: { "@type": "Organization", name: "MCC Solutions", sameAs: url + "/" }, jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressRegion: "NJ", addressCountry: "US" } } }],
    }));
  });

  /* ---------- Become a notary / loan signing agent (application + Google for Jobs) ---------- */
  app.get("/notary/become-a-notary", async (req, res) => {
    const biz = await business();
    const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["Become a notary or signing agent", "/notary/become-a-notary"]];
    const jobDesc = "<p>MCC Solutions is a Cranford, NJ firm that dispatches mobile notary, loan signing and remote online notarization (RON) work across New Jersey. We are taking on commissioned notaries and loan signing agents as independent contractors.</p>"
      + "<p><b>What you will do:</b> accept signings near you from the MCC portal, travel to the signer's home, office, bank or hospital (or run a RON session on the Proof platform), notarize and complete the package, then upload scanbacks and return the documents. Your pay is shown before you accept each job.</p>"
      + "<p><b>Pay:</b> paid per assignment at 50% of the customer's service fee: $37.50 for a mobile notary visit, $75 for a loan signing and $62.50 for a hospital or care-facility visit.</p>"
      + "<p><b>Requirements:</b></p><ul><li>An active notary commission (New Jersey, or your own state for remote work)</li><li>Errors and omissions (E&amp;O) insurance with at least $100,000 in coverage</li><li>A background check completed within the last 12 months</li><li>A W-9 and a signed independent contractor agreement</li><li>A home ZIP code and the distance you are willing to travel</li><li>A smartphone and email, and the ability to print loan documents for in-person signings</li><li>For RON work: approval on the Proof platform, a computer with a webcam and microphone, and the remote notarization notice to the NJ Treasurer</li></ul>"
      + "<p>This is independent contractor work with a 1099 at year end. You choose which jobs to accept, with no minimums. RON is optional.</p>";
    res.send(layout({
      req, biz, path: "/notary/become-a-notary", crumbs,
      title: "Become a Notary or Loan Signing Agent in New Jersey | MCC",
      description: "Take mobile notary, loan signing and RON assignments across New Jersey as an independent contractor. Paid per job at 50% of the service fee, shown before you accept. See the requirements and apply.",
      body: {
        hero: `<p class="eyebrow">Join the team</p><h1 style="margin-top:10px">Take notary and loan signing jobs near you</h1><p class="lede" style="margin-top:14px">MCC Solutions sends mobile notary, loan signing and remote online notarization (RON) assignments to commissioned notaries across New Jersey. You accept the jobs that fit your schedule and your area, and the pay is shown before you say yes.</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="/notary/#notaries">Apply now</a></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">What you'll need</p><h2>Requirements</h2><ul class="checks">
            <li>An active notary commission (New Jersey, or your own state for remote work)</li>
            <li>Errors and omissions (E&amp;O) insurance, $100,000 minimum</li>
            <li>A background check completed in the last 12 months</li>
            <li>A W-9, and a signed independent contractor agreement</li>
            <li>Your home ZIP and how far you're willing to travel</li>
            <li>A smartphone and email, plus the ability to print loan documents for in-person signings</li>
            <li>Loan signing agent certification, if you want loan work</li>
            <li>For RON work: approval on the Proof platform, a computer with a webcam and microphone, and the remote notarization notice to the NJ Treasurer filed before your first remote act</li>
          </ul>
          <h3 style="margin-top:20px">What it pays</h3><p>Paid per assignment at 50% of the customer's service fee: <b>$37.50</b> for a mobile notary visit, <b>$75</b> for a loan signing and <b>$62.50</b> for a hospital or care-facility visit. Your exact pay is shown before you accept each job, including RON sessions. RON is optional; you can take in-person work, remote work or both.</p>
          <p style="color:var(--ink-2)">We don't give legal or financial advice at signings, and neither do you. Never notarize without a proper ID check.</p></div>
          <div class="stack"><p class="eyebrow">How it works</p><h2>From application to payment</h2><ol class="steps" style="grid-template-columns:1fr">
            <li><h3>Apply</h3><p>Takes a couple of minutes. We review applications within 3 business days.</p></li>
            <li><h3>Onboard online</h3><p>Upload your commission, E&amp;O, background check and W-9, then sign the contractor agreement. Your portal uses a password and a passkey, so your account stays secure.</p></li>
            <li><h3>Accept jobs</h3><p>Offers arrive by email, or by text if you turn that on, with the location, time and your pay shown. Accept or decline in the portal.</p></li>
            <li><h3>Complete the signing</h3><p>Notarize, mark the job complete, and upload the scanbacks.</p></li>
            <li><h3>Get paid</h3><p>You're paid per assignment as an independent contractor, and you'll receive a 1099 at year end.</p></li>
          </ol>
          <p style="color:var(--ink-2)">Honest note: we're a young company. We're building up volume with title companies, law firms and families, and we're keeping the team small so the notaries who join early get the work as it grows.</p></div>
        </div></section>
        <section class="band alt"><div class="wrap stack">
          <p class="eyebrow">Ready?</p><h2>Apply to the notary network</h2>
          <p>The application is on our notary page. Tell us your commission, your coverage area and what kinds of signings you do.</p>
          <p><a class="btn btn-primary" href="/notary/#notaries">Go to the application</a></p>
          <p style="color:var(--ink-2)">Want other kinds of work? You can also <a href="/notary/become-a-witness">work as a signing witness</a> or <a href="/notary/become-a-process-server">serve papers as a process server</a>.</p>
        </div></section>`,
        ctaTitle: "Questions about joining? Call the desk.",
      },
      schema: [{ "@type": "JobPosting", title: "Mobile Notary / Loan Signing Agent / Remote Online Notary (independent contractor)", description: jobDesc, employmentType: "CONTRACTOR", datePosted: "2026-10-05", validThrough: "2027-04-05T23:59:59-04:00", directApply: false, hiringOrganization: { "@type": "Organization", name: "MCC Solutions", sameAs: url + "/", logo: url + "/favicon.svg" }, jobLocation: { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: "Cranford", addressRegion: "NJ", addressCountry: "US" } }, industry: "Notary and signing services" }],
    }));
  });

  /* ---------- Notary training (interest list) ---------- */
  app.get("/notary/training", async (req, res) => {
    const biz = await business();
    const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["Notary training", "/notary/training"]];
    res.send(layout({
      req, biz, path: "/notary/training", crumbs,
      title: "Notary & Loan Signing Agent Training in New Jersey",
      description: "Hands-on notary and loan signing agent classes from a working NJ signing desk. Join the list for upcoming classes and a path to paid assignments.",
      body: {
        hero: `<p class="eyebrow">Coming soon</p><h1 style="margin-top:10px">Notary and loan signing training from a working signing desk</h1><p class="lede" style="margin-top:14px">Learn the work from the people who dispatch it. MCC Solutions is putting together small, practical classes for new New Jersey notaries and signing agents, and graduates who meet our standards can apply to take assignments from the desk.</p><div class="hero-ctas" style="margin-top:22px"><a class="btn btn-primary" href="#join">Join the list</a></div>`,
        main: `<section class="band"><div class="wrap split">
          <div class="stack"><p class="eyebrow">What we'll cover</p><h2>Practical, not theory</h2><ul class="checks">
            <li>New Jersey notary duties, journals and fee limits</li>
            <li>Walking through a loan package page by page</li>
            <li>ID checks, signer awareness, and when to refuse</li>
            <li>Scanbacks, return shipping and avoiding funding delays</li>
            <li>Remote online notarization basics</li>
            <li>Running your schedule, invoicing and insurance</li>
          </ul></div>
          <div class="stack"><p class="eyebrow">Who it's for</p><h2>Built for</h2><ul class="checks">
            <li>New notaries who want to start doing loan signings</li>
            <li>Notaries adding RON or hospital and estate work</li>
            <li>Office staff at title companies and law firms</li>
            <li>Anyone who wants to join the MCC Solutions network</li>
          </ul></div>
        </div></section>
        <section class="band alt" id="join"><div class="wrap form-layout">
          <form class="form-card" id="trainForm" novalidate>
            <fieldset><legend>Get notified about classes</legend>
              <div class="field"><label for="t-name">Name</label><input id="t-name" required></div>
              <div class="field"><label for="t-email">Email</label><input id="t-email" type="email" required></div>
              <div class="field full"><label for="t-level">Where are you now?</label><select id="t-level"><option>Not a notary yet</option><option>Commissioned NJ notary, new to loan signings</option><option>Experienced signing agent</option><option>Title or law office staff</option></select></div>
              <input type="text" id="t-website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
            </fieldset>
            <div class="form-foot"><small>We'll email you when dates are set. See our <a href="/privacy">privacy policy</a>.</small><button class="btn btn-primary" type="submit">Join the list</button></div>
            <p class="form-msg" id="trainMsg" role="status"></p>
          </form>
          <aside class="stack"><h3>Already a signing agent?</h3><p>You can apply to the network now on our <a href="/notary/#notaries">For Notaries page</a>.</p></aside>
        </div></section>
        <script>
        document.getElementById("trainForm").addEventListener("submit", async function (e) {
          e.preventDefault();
          var g = function (id) { return document.getElementById(id).value.trim(); };
          var m = document.getElementById("trainMsg"), b = this.querySelector("button");
          if (!g("t-name") || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(g("t-email"))) { m.className = "form-msg"; m.textContent = "Enter your name and a valid email."; return; }
          b.disabled = true; m.className = "form-msg"; m.textContent = "Sending…";
          try {
            var r = await fetch("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: g("t-name"), email: g("t-email"), topic: "Notary training interest", website: g("t-website"), message: "Training interest: " + g("t-level") }) });
            var d = await r.json().catch(function () { return {}; });
            if (!r.ok) throw new Error(d.error || "Couldn't send. Try again.");
            if (window.mccTrack) window.mccTrack("generate_lead", { form: "training_interest" });
            this.reset(); m.className = "form-msg ok"; m.textContent = "You're on the list. We'll email you when dates are set.";
          } catch (err) { m.className = "form-msg"; m.textContent = err.message; }
          b.disabled = false;
        });
        </script>`,
        ctaTitle: "Questions about training? Call the desk.",
      },
      schema: [{ "@type": "WebPage", name: "Notary training", url: url + "/notary/training" }],
    }));
  });

  /* ---------- Privacy policy ---------- */
  app.get("/privacy", async (req, res) => {
    const biz = await business();
    const email = esc(biz.email);
    const crumbs = [["MCC Solutions", "/"], ["Privacy policy", "/privacy"]];
    res.send(layout({
      req, biz, path: "/privacy", crumbs,
      title: "Privacy Policy | MCC Solutions",
      description: "How MCC Solutions collects, uses, shares and protects personal information for notary, loan signing and remote notarization services.",
      body: {
        hero: `<h1>Privacy policy</h1><p class="lede" style="margin-top:14px">Last updated ${UPDATED}</p>`,
        main: legal([
          ["Who we are", p(`MCC Solutions ("MCC," "we," "us") arranges mobile notary, loan signing and remote notarization services. This policy explains what personal information we collect through our website, client portal and notary portal, how we use it, and the choices you have. Questions: ${email}.`)],
          ["Information we collect", ul([
            "<b>Booking and contact details:</b> names, email addresses, phone numbers, appointment addresses, signer names, company and file numbers, and notes you give us.",
            "<b>Documents:</b> closing packages, scanbacks and other files uploaded by clients, the desk or notaries.",
            "<b>Notary applicant and contractor information:</b> commission details, insurance and background check records, W-9 tax information, service areas, and agreement signatures.",
            "<b>Billing information:</b> invoice details. Card and bank payments are handled by Stripe; we don't store full card or bank account numbers.",
            "<b>Technical information:</b> IP addresses, browser type and pages visited, kept in server logs for security.",
            "<b>Cookies and analytics:</b> our public pages use Google Analytics, which sets cookies to measure visits and how pages are used. You can block these cookies in your browser or use Google's <a href=\"https://tools.google.com/dlpage/gaoptout\" rel=\"noopener\">opt-out add-on</a>. The notary and client portals and the desk dashboard don't use analytics; they use only the cookies needed to keep you signed in.",
          ])],
          ["How we use it", ul([
            "To schedule, assign and complete appointments, and to send confirmations, reminders and status updates.",
            "To verify notaries and keep their credentials current.",
            "To invoice clients and pay notaries.",
            "To answer questions, prevent fraud, keep our systems secure and meet legal obligations.",
          ]) + p("We don't sell personal information, and we don't use your documents for marketing.")],
          ["Who we share it with", ul([
            "<b>The assigned notary,</b> who receives the appointment details and documents needed to complete the signing.",
            "<b>The client who placed the order,</b> such as the title company, lender or attorney on the file.",
            "<b>Service providers</b> that run our systems: website hosting, database and file storage, email delivery, text messaging, website analytics (Google Analytics) and payment processing (Stripe). They may use the information only to provide their services to us.",
            "<b>Authorities,</b> when the law requires it, or to protect the rights and safety of our clients, signers, notaries or MCC.",
          ])],
          ["Text messages", p("Notaries who opt in may receive job offers, reminders and account notices by text. Clients may receive appointment updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. We don't sell or share phone numbers or text-message consent with third parties for their marketing.")],
          ["How long we keep it", ul([
            "Closing documents and scanbacks are deleted 30 days after an appointment is completed or canceled.",
            "Booking records, invoices and notary credential records are kept as long as needed for our business and legal obligations.",
            "Notaries keep their own notarial journals as New Jersey law requires; MCC does not control those records.",
          ])],
          ["How we protect it", p("We use encrypted connections, private access-controlled storage, single-use sign-in links for notaries and password-protected desk access. Notaries agree in writing to keep signer information confidential. No system is perfectly secure, so contact us right away if you believe your information was exposed.")],
          ["Your choices", p(`You can ask us to access, correct or delete your personal information, or to stop sending you texts or non-essential emails. Email ${email}. We may need to keep some records to meet legal obligations or complete an order already in progress.`)],
          ["Children", p("Our services are for adults. We don't knowingly collect information from children under 13.")],
          ["Changes", p("We may update this policy. The date at the top shows the latest version; significant changes will be posted on this page.")],
          ["Contact", p(`MCC Solutions · ${email} · <a href="${telHref(biz.phone)}">${esc(biz.phone)}</a>`)],
        ]),
      },
      schema: [],
    }));
  });

  /* ---------- Terms of service ---------- */
  app.get("/terms", async (req, res) => {
    const biz = await business();
    const email = esc(biz.email);
    const crumbs = [["MCC Solutions", "/"], ["Terms of service", "/terms"]];
    res.send(layout({
      req, biz, path: "/terms", crumbs,
      title: "Terms of Service | MCC Solutions",
      description: "Terms for booking notary, loan signing and remote notarization services with MCC Solutions, including fees, cancellations and limits of service.",
      body: {
        hero: `<h1>Terms of service</h1><p class="lede" style="margin-top:14px">Last updated ${UPDATED}</p>`,
        main: legal([
          ["Agreement", p(`These terms apply when you use our website, book an appointment, or use the client portal of MCC Solutions ("MCC," "we," "us"). By booking or using the site, you agree to them. Questions: ${email}.`)],
          ["What we do", p("MCC arranges notary and signing services performed by independent, commissioned notaries. We schedule appointments, assign notaries, coordinate documents and returns, and handle billing. Remote Online Notarization and Remote Ink-Signed Notarization are offered only where the law allows them and the receiving party accepts them.")],
          ["What we don't do", ul([
            "We are not a law firm. Neither MCC nor any notary gives legal, tax or financial advice, explains what a document means, or prepares documents.",
            "We don't guarantee that a lender, court, agency or other party will accept a document. Confirm requirements with them first.",
          ])],
          ["Signer requirements and the notary's judgment", p("Every signer must appear as required and present current, acceptable government photo identification. The notary must refuse to notarize if identity can't be verified, if the signer appears not to understand or not to be acting willingly, if the document is incomplete, or if the act would break the law. A refusal on these grounds is not a failure of service, and trip or cancellation fees may apply.")],
          ["Fees and payment", ul([
            "Fees are quoted before the appointment is confirmed. Notarial fees follow state limits; travel, printing, scanbacks, witnesses, rush, after-hours, weekend, waiting-time and other service fees are listed separately. Current prices are on our <a href=\"/notary/fees\">fees page</a>.",
            "Rush, after-hours, weekend and additional-signer fees are added automatically when they apply and appear in your confirmation.",
            "Business accounts: balances unpaid after the due date may be charged a late fee, stated on the invoice.",
            "Individuals pay when invoiced unless we agree otherwise. Business clients pay on the terms stated on their account or invoice.",
            "Payments are processed by Stripe. Unpaid balances may pause future orders.",
          ])],
          ["Cancellations, no-shows and changes", p("Cancel or reschedule as early as possible. Cancellations after documents are printed or after the notary has left for the appointment, signer no-shows and refusals to sign may carry a trip fee, and cancellations less than 2 hours before the start carry a late-cancellation fee, as listed on our fees page. Changed or late documents may require reprinting at an added fee.")],
          ["Your responsibilities", ul([
            "Give accurate appointment, signer and document information.",
            "Send complete, correct documents and return instructions, including prepaid shipping labels when required.",
            "Have the right to share any personal information and documents you send us.",
          ])],
          ["Documents and returns", p("Notaries ship documents using the carrier and label provided, and we send tracking when available. We're not responsible for carrier delays or loss after a package is handed to the carrier, though we'll help trace it. Closing documents stored with us are deleted as described in our <a href=\"/privacy\">privacy policy</a>.")],
          ["Limitation of liability", p("To the extent the law allows, MCC is not liable for indirect, incidental or consequential damages, including lost profits or delayed closings, and our total liability for any order is limited to the fees paid for that order. Nothing in these terms limits liability that can't be limited by law. Notaries carry their own errors and omissions insurance for their notarial acts.")],
          ["Website and portal use", p("Keep your sign-in links and passwords private, and don't misuse the site, upload harmful files, or try to access information that isn't yours. We may suspend access that puts the site, our clients or signers at risk.")],
          ["Governing law", p("These terms are governed by the laws of the State of New Jersey. Disputes will be resolved in the state or federal courts located in New Jersey.")],
          ["Changes", p("We may update these terms. The date at the top shows the latest version, and the version in effect when you book applies to that order.")],
          ["Contact", p(`MCC Solutions · ${email} · <a href="${telHref(biz.phone)}">${esc(biz.phone)}</a>`)],
        ]),
      },
      schema: [],
    }));
  });
}

module.exports = { register };
