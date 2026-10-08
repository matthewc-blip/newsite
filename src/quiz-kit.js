// Shared pieces for the free quizzes: API routes (score + emailed report/lead) and the page markup.
const { rateLimit, emailOk, str } = require("./util");
const heard = require("./heard");

// cfg: { engine, checkApi, leadApi, topic, name, tag, quoteUrl, leadSubject, deskSubject, companyLabel }
function registerApi(app, cfg) {
  const { engine } = cfg;
  app.post(cfg.checkApi, rateLimit(30, 10 * 60000), (req, res) => {
    const ans = engine.cleanAnswers(req.body && req.body.answers);
    const miss = engine.missing(ans);
    if (miss.length) return res.status(400).json({ error: "Answer every question to see your results.", missing: miss });
    res.json({ result: engine.evaluate(ans) });
  });
  app.post(cfg.leadApi, rateLimit(4, 10 * 60000), async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(400).json({ error: "Rejected" });
    const name = str(b.name, 120), email = str(b.email, 160), company = str(b.company, 160), note = str(b.note, 600);
    if (!name) return res.status(400).json({ error: "Enter your name." });
    if (!emailOk(email)) return res.status(400).json({ error: "Enter a valid email." });
    const ans = engine.cleanAnswers(b.answers);
    if (engine.missing(ans).length) return res.status(400).json({ error: "Answer every question first." });
    const r = engine.evaluate(ans); // scored again here: the report never comes from client-supplied results
    const text = engine.reportText(r);
    const { db } = require("./db"); const mail = require("./email");
    const hf = heard.clean(str(b.heardFrom, 20)) || "other";
    try {
      await db.run("INSERT INTO messages(name,email,topic,message,heard_from,heard_note) VALUES($1,$2,$3,$4,$5,$6)",
        [name, email, cfg.topic, `${cfg.name}${company ? ` for ${company}` : ""}: ${r.score}/100 (${r.level}).${note ? `\n\nTheir note: ${note}` : ""}\n\n${text}`, hf, cfg.tag]);
      mail.deskNotice(cfg.deskSubject, `${name} <${email}>${company ? ` · ${company}` : ""} scored ${r.score}/100 (${r.level}): ${r.counts.fail} to fix, ${r.counts.warn} to improve.${note ? `\n\nNote: ${note}` : ""}\n\nThey were emailed the full report.`);
      mail.send({ to: email, subject: `${cfg.leadSubject}: ${r.score}/100`, text: `Hi ${name},\n\nHere is the report you asked for.\n\n${text}\n\nIf you'd like help with any of this, reply to this email or ask for a quote at ${cfg.quoteUrl}. We reply with a plain estimate and no obligation.\n\nMatthew Coleman\nMCC Solutions · Cranford, NJ` });
      res.status(201).json({ ok: true });
    } catch (e) { console.error(`${cfg.tag} lead:`, e); res.status(500).json({ error: "Something went wrong. Try again, or call the desk." }); }
  });
}

// Quiz card, results area, email form and config. `faqBand` is the FAQ section HTML shown below.
function mainHtml({ engine, checkApi, leadApi, event, allGood, disclaimer, faqBand }) {
  const cfg = JSON.stringify({ questions: engine.publicQuestions(), checkApi, leadApi, event, allGood }).replace(/</g, "\\u003c");
  return `<section class="band"><div class="wrap" style="max-width:860px">
    <div class="form-card" id="bk">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap"><p id="bk-step" style="margin:0;font-family:var(--f-mono);font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:var(--brass)"></p><p id="bk-grp" style="margin:0;color:var(--muted);font-size:.9rem"></p></div>
      <div role="progressbar" id="bk-bar" aria-label="Quiz progress" aria-valuemin="0" aria-valuemax="100" style="height:6px;background:var(--line);border-radius:99px;margin:10px 0 22px;overflow:hidden"><div id="bk-fill" style="height:100%;width:0;background:var(--brass);transition:width .25s ease"></div></div>
      <div id="bk-qs" aria-live="polite"></div>
      <div style="display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:22px;flex-wrap:wrap"><button class="btn btn-ghost" type="button" id="bk-back">Back</button><span class="form-msg" id="bk-msg" role="alert"></span><button class="btn btn-primary" type="button" id="bk-next" disabled>Next</button></div>
      <p style="margin-top:14px;color:var(--muted);font-size:.9rem">${disclaimer}</p></div>
    <div id="bk-out" hidden>
      <div class="form-card" style="margin-top:22px"><div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap"><div id="bk-score" style="font-family:var(--f-display);font-size:3.2rem;font-weight:800;line-height:1"></div><div><b id="bk-head"></b><p id="bk-sub" style="margin:4px 0 0;color:var(--ink-2)"></p></div></div></div>
      <p style="margin:14px 0 0"><button class="btn btn-ghost btn-sm" type="button" id="bk-retake">Retake the quiz</button></p>
      <div id="bk-start" style="margin-top:22px"></div><div id="bk-list" style="margin-top:12px"></div>
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
  ${faqBand}
  <script>window.MCC_QUIZ=${cfg};</script><script src="/js/quiz.js" defer></script>`;
}
module.exports = { registerApi, mainHtml };
