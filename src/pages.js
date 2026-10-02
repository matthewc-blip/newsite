// About, vendor packet, privacy policy and terms of service pages.
// Rendered with the same layout as the landing pages in seo.js.
const { layout, business, telHref, base, esc } = require("./seo");

const UPDATED = "October 2, 2026";
const FOUNDER = { name: "Matthew Coleman", role: "Founder", photo: "/img/matthew-coleman.jpg" };

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
      title: "About MCC Solutions | New Jersey Notary & Signing Desk",
      description: `Meet ${FOUNDER.name}, founder of MCC Solutions, a New Jersey notary and loan signing desk built to show up on time and keep clients updated.`,
      body: {
        hero: `<p class="eyebrow">About MCC Solutions</p><h1 style="margin-top:10px">A signing desk built on one promise: the closing happens on time.</h1>`,
        main: `<section class="band"><div class="wrap split">
          <div><img class="about-photo" src="${FOUNDER.photo}" alt="${esc(FOUNDER.name)}, ${esc(FOUNDER.role)} of MCC Solutions" width="360" height="360"><p style="margin-top:14px"><b>${esc(FOUNDER.name)}</b><br><span style="color:var(--muted)">${esc(FOUNDER.role)}, MCC Solutions</span></p></div>
          <div class="stack">
            <h2>Why I started MCC Solutions</h2>
            <p class="lede">I started MCC Solutions in New Jersey because signings fail for simple reasons: a notary who doesn't confirm, a missed initial, a package that ships late, a client left calling for updates.</p>
            <p>So we built a desk that fixes each of those. Every order is confirmed and assigned to a verified notary. Clients see status at each step. Every package is checked before it ships, and the tracking number goes straight to the people waiting on it.</p>
            <p>We serve title companies, lenders, attorneys, hospitals and families across New Jersey, in person and remotely. Notary work is where MCC starts. Bookkeeping, tax preparation and investment advising are coming next, for the same clients we already serve.</p>
          </div>
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
        { "@type": "Person", name: FOUNDER.name, jobTitle: FOUNDER.role, image: url + FOUNDER.photo, worksFor: { "@id": url + "/#business" } },
        { "@type": "Organization", "@id": url + "/#org", name: "MCC Solutions", url: url + "/", founder: { "@type": "Person", name: FOUNDER.name } },
      ],
    }));
  });

  /* ---------- Vendor packet ---------- */
  app.get("/notary/vendors", async (req, res) => {
    const biz = await business();
    const url = base(req);
    const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["Vendor packet", "/notary/vendors"]];
    const rows = [
      ["Company", "MCC Solutions"],
      ["Services", "Loan signings (purchase, refinance, HELOC, reverse, seller), general mobile notary, hospital and facility visits, Remote Online Notarization, Remote Ink-Signed Notarization"],
      ["Coverage", "New Jersey, all 21 counties"],
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
        hero: `<p class="eyebrow">For title, escrow &amp; lenders</p><h1 style="margin-top:10px">Vendor packet</h1><p class="lede" style="margin-top:14px">Everything your vendor management team needs to approve MCC Solutions as a signing vendor. Request the documents below and we'll send them the same business day.</p><div class="hero-ctas no-print" style="margin-top:22px"><a class="btn btn-primary" href="#request">Request the packet</a><button class="btn btn-ghost" type="button" onclick="window.print()">Print this page</button></div>`,
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
            "Fees are quoted before the appointment is confirmed. Notarial fees follow state limits; travel, printing, scanbacks, witnesses, after-hours and other service fees are listed separately.",
            "Individuals pay when invoiced unless we agree otherwise. Business clients pay on the terms stated on their account or invoice.",
            "Payments are processed by Stripe. Unpaid balances may pause future orders.",
          ])],
          ["Cancellations, no-shows and changes", p("Cancel or reschedule as early as possible. Cancellations after documents are printed or after the notary has left for the appointment, signer no-shows and refusals to sign may carry a fee, which we state when we confirm the order. Changed or late documents may require reprinting at an added fee.")],
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
