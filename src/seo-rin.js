// Remote ink-signed notarization (RIN): a short cluster of plain-language pages around the main service page.
// General information only. NJ points follow N.J.A.C. 17:50-1.14 as summarized by the desk; review once a year and
// whenever the Treasury changes its rules. No claims about price, speed or what any receiving office will accept.
const { fit } = require("./titles");
const BASE = "/notary/remote-ink-signed-notarization";
const RON = "/notary/remote-online-notarization";
const NOTE = "General information, not legal advice. Rules change, and the office receiving your document decides what it accepts, so confirm with them before you sign. Updated October 2026.";

const PAGES = [
  {
    slug: "rin-vs-ron", eyebrow: "Comparison",
    title: "RIN vs RON: Which Remote Notarization Do You Need?",
    description: "Remote ink-signed notarization (RIN) uses paper and a physical stamp. Remote online notarization (RON) is fully electronic. Learn the difference and how to choose.",
    h1: "RIN vs RON: which one do you need?",
    lede: "Both let you appear before a notary on video. The difference is the document: paper signed in ink, or an electronic file signed on screen.",
    sections: [
      ["The short version", ["<b>RON (remote online notarization)</b> is all electronic. You sign a digital document on screen, the notary applies an electronic seal, and you get a notarized file the same session.", "<b>RIN (remote ink-signed notarization)</b> keeps the paper. You sign a paper document in ink while the notary watches on video. The paper then goes to the notary, who completes the certificate and applies a physical stamp and seal."]],
      ["How to choose", ["<b>Ask the office that will receive the document.</b> This decides it. Some accept an electronic notarization, and some only accept paper with a physical stamp or seal. A recipient that insists on paper rules RON out.", "If the receiving office accepts electronic documents, RON is usually quicker, because nothing needs to be mailed. If it needs an original with ink and a physical seal, RIN is the one to ask about.", "If you're not sure, ask the recipient what they accept before you book, or tell us who it's for and we'll help you work out which fits."]],
      ["Side by side", ["<b>Document:</b> RON uses an electronic file. RIN uses paper.", "<b>Signing:</b> RON signs on screen. RIN signs in ink on camera.", "<b>Seal:</b> RON uses an electronic seal. RIN uses a physical stamp.", "<b>Timing:</b> RON is finished in the session. RIN is finished when the signed paper reaches the notary, so shipping time matters.", "<b>Availability:</b> RIN is a specialty service, quoted and confirmed by the desk before you book."]],
    ],
    links: [["Remote ink-signed notarization", BASE], ["Remote online notarization (RON)", RON], ["Which service do I need? (quiz)", "/notary/which-service"], ["How RIN works, step by step", BASE + "/how-it-works"]],
    faqs: [["Is RIN more official than RON?", "Neither is more valid in itself. Whether a receiving office accepts one or the other is up to that office, so ask them first."], ["Which is cheaper?", "Prices are set by the desk and confirmed before you book. RIN adds shipping and a longer process, so it's often priced differently from RON."], ["Can I switch from RON to RIN after I book?", "Tell us as soon as you learn the recipient needs paper. We'll confirm what's possible for your document and timing."]],
  },
  {
    slug: "physical-stamp-notarization", eyebrow: "When paper is required",
    title: "Notary With a Physical Stamp: Paper Notarization by Video",
    description: "Some offices won't accept an electronic notarization and need a physical stamp and seal. See how remote ink-signed notarization (RIN) can work in New Jersey.",
    h1: "Need a physical stamp and seal on a document you can't sign in person?",
    lede: "Some agencies, courts and businesses won't take an electronic notarization. If your document has to be paper with a physical stamp, remote ink-signed notarization may be an option.",
    sections: [
      ["Why some offices want a physical stamp", ["Many offices still process paper and haven't set up to accept electronic notarizations. Others have rules, forms or policies that call for an original with an ink signature and a physical notary stamp or seal.", "We don't decide what an office accepts, and we can't tell you what yours requires. If an office told you it only accepts the physical stamp version, that's the case RIN is built for."]],
      ["How it can work remotely", ["You sign the paper document in ink on a live video call, with the notary watching. You then send the signed original to the notary, who completes the notarial certificate and applies the physical stamp and seal, and sends it back to you or to the receiving office.", "It's a specialty service. The desk confirms it's possible for your document and your recipient before you book, and quotes the fee, plus postage for shipping."]],
      ["Things to know before you ask", ["<b>Ask the office first</b> whether they accept a notarization done remotely on video, even with a physical stamp. Some only accept one done in person.", "<b>Shipping adds time.</b> The signed paper has to reach the notary, and then come back to you. Plan for several days, not hours.", "<b>Start early.</b> If a deadline is close, tell us the date when you ask."]],
    ],
    links: [["Remote ink-signed notarization", BASE], ["RIN vs RON", BASE + "/rin-vs-ron"], ["How RIN works", BASE + "/how-it-works"], ["What to have ready for a RIN session", BASE + "/what-to-have-ready"]],
    faqs: [["Will every office accept a remote notarization with a physical stamp?", "No. Some offices only accept notarizations done in person. Check with the receiving office before you sign anything."], ["Can you come to me instead?", "If you're in our service area, a mobile notary can meet you in person, which some offices require. Ask us, or see our mobile notary page."], ["Do you guarantee it will be accepted?", "No. We can't guarantee what another office accepts. We can do the notarization correctly and give you the right paperwork."]],
  },
  {
    slug: "how-it-works", eyebrow: "Step by step",
    title: "How Remote Ink-Signed Notarization Works in NJ",
    description: "A plain-English walkthrough of a remote ink-signed notarization (RIN): the video session, ID check, signing in ink, shipping the original, and the notary's stamp.",
    h1: "How remote ink-signed notarization works, step by step",
    lede: "A RIN has a live video part and a paper part. Here is what happens in each, and what to expect in between.",
    sections: [
      ["1. We confirm it's the right fit", ["You tell us the document and who is receiving it. The desk checks that RIN makes sense for your situation, quotes the fee, and sends scheduling instructions."]],
      ["2. The video session", ["You join a live video call with the notary. The notary checks your identity. In New Jersey that means a visual check of your photo ID plus an additional method, such as an online dynamic knowledge-based quiz, biometric verification or a digital certificate, unless the notary knows you personally.", "The session is recorded, because New Jersey requires an audio and video recording of each remote notarial act and its retention for years. You'll be told this at the start."]],
      ["3. You sign in ink", ["With the notary watching on camera, you sign the paper document in pen. You also sign a declaration, a short statement that you signed the document during the session. The notary may ask you to show each signed page and your ID to the camera."]],
      ["4. You send the paper", ["The signed original goes to the notary. New Jersey sets a short deadline, currently three days after the session, for the notary to receive the signed document and declaration, so ship it the same day, with tracking."]],
      ["5. The notary finishes", ["When the paper arrives, the notary completes the certificate with the required wording, applies the physical stamp and seal, and sends it back to you or to the receiving office. The notarization takes effect as of the date you signed the declaration."]],
    ],
    links: [["Remote ink-signed notarization", BASE], ["What to have ready", BASE + "/what-to-have-ready"], ["Is RIN legal in New Jersey?", BASE + "/is-rin-legal-in-new-jersey"], ["RIN vs RON", BASE + "/rin-vs-ron"]],
    faqs: [["How long does the video session take?", "Plan on roughly half an hour to an hour, depending on the number of documents and signers."], ["What if the paper is late?", "Tell us immediately. The signed paper must reach the notary within the required window, so don't wait. We'll advise on what can be done, which may mean redoing the session."], ["Do I need special software?", "Usually just a device with a camera and microphone. We send the link and instructions when you book."]],
  },
  {
    slug: "what-to-have-ready", eyebrow: "Before your session",
    title: "What to Have Ready for a Remote Ink-Signed Notarization",
    description: "A checklist for your RIN session: the paper document, ID, a device with video, a pen, and a plan to ship the signed original with tracking.",
    h1: "What to have ready for your RIN session",
    lede: "A little preparation makes the session short and keeps the paper on schedule.",
    sections: [
      ["The document", ["The paper document, printed and complete, <b>not yet signed</b>. If the receiving office gave you instructions, a form or wording, have them handy. Print every page, and keep the original pages together."]],
      ["Your ID", ["A current government-issued photo ID, such as a driver's license or passport, where the name matches the document. You'll be asked to show it clearly to the camera. The notary may use an additional online identity check, and will tell you what to expect when you book."]],
      ["Your setup", ["A phone, tablet or computer with a working camera and microphone, a steady internet connection, and good light. A quiet room, because the notary may ask you to show the room to confirm you're alone. A pen with blue or black ink."]],
      ["Shipping", ["A way to mail the signed original the same day: a prepaid envelope or label, ideally with tracking. Keep the tracking number and tell us when it ships. The signed paper has to reach the notary within New Jersey's deadline after the session, so avoid Friday afternoons and weekends if you can, and ask us about faster shipping options.", "Postage is billed separately, at cost."]],
      ["Right before the call", ["Have everything on the table. Don't sign until the notary tells you to. Keep the pen and the document in view of the camera."]],
    ],
    links: [["Remote ink-signed notarization", BASE], ["How RIN works", BASE + "/how-it-works"], ["Printable appointment checklist", "/notary/appointment-checklist"], ["Which service do I need?", "/notary/which-service"]],
    faqs: [["Can I sign before the call?", "No. The notary has to watch you sign, so leave the document unsigned until the session."], ["Who pays for shipping?", "Postage is billed separately, at cost. The desk will explain how it works for your order when you book."], ["What if my printer isn't working?", "Tell us before the session. We may be able to suggest options, but the document must be on paper and complete when you sign."]],
  },
  {
    slug: "is-rin-legal-in-new-jersey", eyebrow: "Rules and requirements",
    title: "Is Remote Ink-Signed Notarization Legal in New Jersey?",
    description: "A plain-English summary of New Jersey's remote notarization rules for paper documents: video, ID checks, recording and the three-day deadline. Not legal advice.",
    h1: "Is remote ink-signed notarization legal in New Jersey?",
    lede: "New Jersey's rules allow a notary to notarize a paper document signed during a live video session, with conditions. Here is a plain summary of what they require.",
    sections: [
      ["What the rules allow", ["New Jersey's Notary Public regulations (N.J.A.C. 17:50-1.14) permit remote notarization using communication technology that lets the notary and signer see and hear each other in real time. A tangible, paper record can be notarized if the signer signs it, and a declaration, during the session."]],
      ["The main requirements", ["<b>Secure live video.</b> The session has to be interactive and secure, and can't be viewed or recorded by unauthorized people.", "<b>Identity proofing.</b> A visual check of a photo ID, plus personal knowledge or one of: online dynamic knowledge-based authentication, biometric verification, or a digital certificate.", "<b>Recording.</b> An audio and video recording of the act, kept for 10 years.", "<b>Deadline.</b> The signed paper and declaration must reach the notary within three days after the notarial act.", "<b>Notice.</b> The notary tells the State Treasurer which technologies they'll use before performing a remote act.", "<b>The certificate</b> states that communication technology was used."]],
      ["What the rules don't decide", ["Whether a receiving office, court, agency or lender accepts a remote notarization is up to them. Some only accept a notarization done in person. This page can't tell you what your recipient requires.", "A notary can't give legal advice or tell you whether a particular document may be notarized remotely. If you're unsure, ask an attorney or the office asking for the document."]],
      ["Check the current rule", ["Regulations change. This summary reflects the rule as the desk understands it in October 2026. For the current text, see the New Jersey Division of Revenue and Enterprise Services notary pages or an attorney."]],
    ],
    links: [["Remote ink-signed notarization", BASE], ["How RIN works", BASE + "/how-it-works"], ["Remote online notarization (RON)", RON], ["RIN vs RON", BASE + "/rin-vs-ron"]],
    faqs: [["Is it legal to notarize a paper document over video in NJ?", "New Jersey's remote notarization rules provide for it, with conditions on the video, identity checks, recording and the deadline for the paper to reach the notary. Confirm details for your document with an attorney or the receiving office."], ["Who can be the signer?", "A signer in New Jersey, and in some cases elsewhere, subject to the rule's conditions. Tell us where the signer will be when you ask."], ["Does it matter where the signer is located?", "It can. Other states and countries have their own rules, and the receiving office may not accept it. Tell us the signer's location and the recipient when you ask, and we'll confirm what's possible."]],
  },
];

const path = (p) => `${BASE}/${p.slug}`;
const paths = () => PAGES.map((p) => [path(p), "0.6"]);
const links = () => PAGES.map((p) => [p.h1, path(p)]);

function register(app, c) {
  const { layout, business, base, faqHtml, faqSchema, crumbSchema } = c;
  for (const pg of PAGES) {
    app.get(path(pg), async (req, res) => {
      const biz = await business(); const url = base(req); const pth = path(pg);
      const crumbs = [["MCC Solutions", "/"], ["Notary", "/notary/"], ["Remote ink-signed notarization", BASE], [pg.h1, pth]];
      res.send(layout({
        req, biz, path: pth, crumbs, title: fit(pg.title, "MCC Solutions"), description: pg.description,
        body: {
          hero: `<p class="eyebrow">${pg.eyebrow}</p><h1 style="margin-top:10px">${pg.h1}</h1><p class="lede" style="margin-top:14px">${pg.lede}</p><div class="hero-ctas" style="margin-top:18px"><a class="btn btn-primary" href="/notary/#order" data-svc="rin">Ask about RIN</a><a class="btn btn-ghost" href="${BASE}">About RIN</a></div>`,
          main: `<section class="band"><div class="wrap" style="max-width:860px">${pg.sections.map(([h, ps]) => `<h2 style="margin:28px 0 10px;font-size:1.5rem">${h}</h2>${ps.map((t) => `<p style="margin:0 0 12px">${t}</p>`).join("")}`).join("")}
            <h2 style="margin:28px 0 10px;font-size:1.5rem">Related</h2><ul class="county-links">${pg.links.map(([t, h]) => `<li><a href="${h}">${t}</a></li>`).join("")}</ul>
            <p style="color:var(--muted);font-size:.9rem;margin-top:22px">${NOTE}</p></div></section>
            <section class="band alt"><div class="wrap" style="max-width:860px"><div class="sec-head"><p class="eyebrow">FAQ</p><h2>Common questions</h2></div>${faqHtml(pg.faqs)}</div></section>`,
          ctaTitle: "Need a paper document notarized by video?", ctaHref: "/notary/#order", ctaLabel: "Ask about RIN",
        },
        schema: [
          { "@type": "Article", headline: pg.h1, description: pg.description, dateModified: "2026-10-08", datePublished: "2026-10-08", author: { "@type": "Person", name: "Matthew Coleman", url: url + "/about" }, publisher: { "@type": "Organization", name: "MCC Solutions", url: url + "/" }, mainEntityOfPage: url + pth, image: url + "/img/og.png" },
          faqSchema(pg.faqs), crumbSchema(url, crumbs),
        ],
      }));
    });
  }
}
module.exports = { register, paths, links, PAGES, BASE };
