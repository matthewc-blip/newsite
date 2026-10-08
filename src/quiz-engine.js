// Shared scoring engine for the free quizzes. Questions: { id, group, text, options: [[value, label, points 0-2]], advice, guide, ask: [id, value] }.
// Answers are cleaned and scored on the server; the browser only draws the form.
function create({ questions, guideBase, title, disclaimer, levels }) {
  const QUESTIONS = questions;
  const visible = (q, ans) => !q.ask || ans[q.ask[0]] === q.ask[1];
  const optPts = (q, v) => { const o = q.options.find((x) => x[0] === v); return o ? o[2] : null; };

  function cleanAnswers(raw) {
    const ans = {}; raw = raw && typeof raw === "object" ? raw : {};
    for (const q of QUESTIONS) {
      if (!visible(q, ans)) continue;
      const v = typeof raw[q.id] === "string" ? raw[q.id] : "";
      if (q.options.some((o) => o[0] === v)) ans[q.id] = v;
    }
    return ans;
  }
  const missing = (ans) => QUESTIONS.filter((q) => visible(q, ans) && !ans[q.id]).map((q) => q.id);

  function evaluate(ans) {
    let got = 0, max = 0; const items = [];
    for (const q of QUESTIONS) {
      if (!visible(q, ans) || !ans[q.id]) continue;
      const pts = optPts(q, ans[q.id]);
      max += 2; got += pts;
      const label = q.options.find((o) => o[0] === ans[q.id])[1];
      if (!q.advice) continue;
      items.push({ id: q.id, group: q.group, question: q.text, answer: label, status: pts === 2 ? "pass" : pts === 1 ? "warn" : "fail", advice: pts === 2 ? "" : q.advice,
        guide: pts === 2 || !q.guide ? null : { slug: q.guide, href: guideBase + q.guide } });
    }
    const score = max ? Math.round((got / max) * 100) : 0;
    const level = score >= 80 ? levels[0] : score >= 50 ? levels[1] : levels[2];
    const counts = { pass: 0, warn: 0, fail: 0 }; items.forEach((i) => counts[i.status]++);
    const startHere = items.filter((i) => i.status !== "pass").sort((a, b) => (a.status === "fail" ? 0 : 1) - (b.status === "fail" ? 0 : 1)).slice(0, 3).map((i) => i.id);
    return { score, level, counts, items, startHere };
  }

  function reportText(r) {
    const mark = { fail: "FIX", warn: "IMPROVE", pass: "OK" }; const order = { fail: 0, warn: 1, pass: 2 };
    const lines = [`${title}: ${r.score}/100 (${r.level})`, `${r.counts.pass} in good shape, ${r.counts.warn} to improve, ${r.counts.fail} to fix`, "", disclaimer, ""];
    for (const i of [...r.items].sort((a, b) => order[a.status] - order[b.status])) {
      lines.push(`[${mark[i.status]}] ${i.question}`, `    Your answer: ${i.answer}`);
      if (i.advice) lines.push(`    What to do: ${i.advice}`);
      if (i.guide) lines.push(`    Guide: https://mcc-solutionsnj.com${i.guide.href}`);
    }
    return lines.join("\n");
  }

  const publicQuestions = () => QUESTIONS.map((q) => ({ id: q.id, group: q.group, text: q.text, ask: q.ask || null, options: q.options.map((o) => [o[0], o[1]]) }));
  return { QUESTIONS, cleanAnswers, missing, evaluate, reportText, publicQuestions };
}
module.exports = { create };
