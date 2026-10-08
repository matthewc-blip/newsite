// One-question-at-a-time quiz runner shared by the free quizzes. Config comes from window.MCC_QUIZ:
// { questions, checkApi, leadApi, event, allGood }. Answers are scored on the server.
(function () {
  var C = window.MCC_QUIZ; if (!C) return;
  var Q = C.questions, ans = {}, busy = false, idx = 0;
  var $ = function (i) { return document.getElementById(i); };
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function post(u, b) { return fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Something went wrong."); return j; }); }); }
  function vis(q) { return !q.ask || ans[q.ask[0]] === q.ask[1]; }
  function list() { return Q.filter(vis); }
  function track(n, p) { try { if (window.mccTrack) window.mccTrack(n, p || {}); } catch (e) {} }

  function show() {
    var qs = list(); if (idx >= qs.length) idx = qs.length - 1;
    var q = qs[idx], root = $("bk-qs"); root.textContent = "";
    $("bk-step").textContent = "Question " + (idx + 1) + " of " + qs.length; $("bk-grp").textContent = q.group;
    var pct = Math.round(idx / qs.length * 100); $("bk-fill").style.width = pct + "%"; $("bk-bar").setAttribute("aria-valuenow", pct);
    var f = el("fieldset"); f.style.cssText = "border:0;padding:0;margin:0;display:block";
    var lg = el("legend", null, q.text); lg.style.cssText = "font-family:var(--f-display);font-size:1.35rem;font-weight:700;line-height:1.3;letter-spacing:normal;text-transform:none;color:var(--ink);margin:0 0 16px;padding:0"; lg.tabIndex = -1; f.appendChild(lg);
    q.options.forEach(function (o, i) {
      var id = "q-" + q.id + "-" + i, on = ans[q.id] === o[0];
      var l = el("label"); l.setAttribute("for", id);
      l.style.cssText = "display:flex;gap:12px;align-items:flex-start;justify-content:flex-start;text-align:left;padding:13px 14px;margin:0 0 10px;border:1px solid " + (on ? "var(--brass)" : "var(--line)") + ";border-radius:6px;background:" + (on ? "var(--brass-soft)" : "var(--surface)") + ";cursor:pointer;font-weight:400;font-size:1rem;letter-spacing:normal;text-transform:none;color:var(--ink)";
      var r = el("input"); r.type = "radio"; r.name = q.id; r.id = id; r.value = o[0]; r.checked = on; r.style.cssText = "width:auto;flex:none;margin:4px 0 0;padding:0";
      r.addEventListener("change", function () { ans[q.id] = o[0]; $("bk-msg").textContent = ""; show(); var again = document.getElementById("q-" + q.id + "-" + i); if (again) again.focus(); });
      l.appendChild(r); l.appendChild(el("span", null, o[1])); f.appendChild(l);
    });
    root.appendChild(f);
    $("bk-back").style.visibility = idx === 0 ? "hidden" : "visible";
    $("bk-next").textContent = idx === qs.length - 1 ? "See my results" : "Next"; $("bk-next").disabled = !ans[q.id];
  }
  function next() {
    var qs = list(), q = qs[idx];
    if (!ans[q.id]) { $("bk-msg").textContent = "Choose an answer to continue."; return; }
    $("bk-msg").textContent = "";
    if (idx < qs.length - 1) { idx++; show(); var lg = document.querySelector("#bk-qs legend"); if (lg) lg.focus(); return; }
    if (busy) return; busy = true; $("bk-next").disabled = true; var m = $("bk-msg"); m.style.color = "var(--muted)"; m.textContent = "Scoring…";
    post(C.checkApi, { answers: ans }).then(function (j) { m.textContent = ""; m.style.color = ""; $("bk").hidden = true; (C.mode === "recommend" ? renderRec : render)(j.result); })
      .catch(function (err) { m.style.color = ""; m.textContent = err.message; }).then(function () { busy = false; $("bk-next").disabled = false; });
  }
  function retake() { ans = {}; idx = 0; $("bk-out").hidden = true; $("bk").hidden = false; show(); $("bk").scrollIntoView({ behavior: "smooth", block: "start" }); }
  function card(i) {
    var row = el("div"); row.style.cssText = "padding:14px 0;border-bottom:1px solid var(--line)";
    row.appendChild(el("b", null, i.question));
    var a = el("p", null, "Your answer: " + i.answer); a.style.cssText = "margin:3px 0 0;color:var(--muted)"; row.appendChild(a);
    var w = el("p", null, i.advice); w.style.cssText = "margin:6px 0 0"; row.appendChild(w);
    if (i.guide) { var p = el("p"); p.style.margin = "6px 0 0"; var l = el("a", null, "Read the guide →"); l.href = i.guide.href; p.appendChild(l); row.appendChild(p); }
    return row;
  }
  function render(r) {
    $("bk-out").hidden = false; var s = $("bk-score"); s.textContent = r.score; s.style.color = r.score >= 80 ? "var(--ok)" : r.score >= 50 ? "var(--warn)" : "#a33";
    $("bk-head").textContent = "out of 100: " + r.level; $("bk-sub").textContent = r.counts.pass + " in good shape, " + r.counts.warn + " to improve, " + r.counts.fail + " to fix.";
    var st = $("bk-start"); st.textContent = ""; var ls = $("bk-list"); ls.textContent = "";
    var by = {}; r.items.forEach(function (i) { by[i.id] = i; });
    if (r.startHere.length) { var h = el("h2", null, "Start here"); h.style.fontSize = "1.3rem"; st.appendChild(h); r.startHere.forEach(function (id) { st.appendChild(card(by[id])); }); }
    var rest = r.items.filter(function (i) { return i.status !== "pass" && r.startHere.indexOf(i.id) < 0; });
    if (rest.length) { var h2 = el("h2", null, "Then work on"); h2.style.cssText = "font-size:1.3rem;margin-top:26px"; ls.appendChild(h2); rest.forEach(function (i) { ls.appendChild(card(i)); }); }
    var ok = r.items.filter(function (i) { return i.status === "pass"; });
    if (ok.length) { var h3 = el("h2", null, "Already in good shape"); h3.style.cssText = "font-size:1.3rem;margin-top:26px"; ls.appendChild(h3); var u = el("ul", "checks"); ok.forEach(function (i) { u.appendChild(el("li", null, i.question.replace(/\?$/, "") + ": " + i.answer)); }); ls.appendChild(u); }
    if (!r.startHere.length && !rest.length) st.appendChild(el("p", null, C.allGood || "Nothing to fix based on your answers."));
    $("bk-out").scrollIntoView({ behavior: "smooth", block: "start" }); track(C.event + "_run", { score: r.score });
  }

  function renderRec(r) {
    $("bk-out").hidden = false; var root = $("bk-rec"); root.textContent = "";
    var box = el("div", "form-card"); box.style.borderLeft = "4px solid var(--brass)";
    var eb = el("p", null, "Our recommendation"); eb.style.cssText = "margin:0 0 6px;font-family:var(--f-mono);font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:var(--brass)"; box.appendChild(eb);
    var h = el("h2", null, r.title); h.style.cssText = "margin:0 0 8px;font-size:1.7rem"; box.appendChild(h);
    if (r.price) { var pr = el("p", null, r.price); pr.style.cssText = "margin:0 0 10px;font-weight:700;color:var(--brass-ink)"; box.appendChild(pr); }
    box.appendChild(el("p", null, r.why)).style.margin = "0 0 14px";
    if (r.steps && r.steps.length) { var hs = el("h3", null, "What happens next"); hs.style.margin = "16px 0 6px"; box.appendChild(hs); var ol = el("ol"); ol.style.cssText = "margin:0 0 12px;padding-left:20px"; r.steps.forEach(function (t) { ol.appendChild(el("li", null, t)).style.margin = "4px 0"; }); box.appendChild(ol); }
    (r.notes || []).forEach(function (t) { var n = el("p", "callout", t); n.style.margin = "12px 0 0"; box.appendChild(n); });
    var row = el("div"); row.style.cssText = "display:flex;gap:12px;flex-wrap:wrap;margin-top:20px";
    var b1 = el("a", "btn btn-primary", r.ctaLabel); b1.href = r.ctaHref; row.appendChild(b1);
    if (r.phone) { var b2 = el("a", "btn btn-ghost", "Call " + r.phone); b2.href = "tel:" + r.phone.replace(/[^\d+]/g, ""); row.appendChild(b2); }
    if (r.learnHref) { var b3 = el("a", "btn btn-ghost", "Read about it"); b3.href = r.learnHref; row.appendChild(b3); }
    box.appendChild(row); root.appendChild(box);
    b1.addEventListener("click", function () { track(C.event + "_book", { service: r.key }); });
    $("bk-out").scrollIntoView({ behavior: "smooth", block: "start" }); track(C.event + "_run", { service: r.key });
  }

  $("bk-next").addEventListener("click", next);
  $("bk-back").addEventListener("click", function () { if (idx > 0) { idx--; show(); } });
  $("bk-retake").addEventListener("click", retake);
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && !$("bk").hidden && document.activeElement && document.activeElement.type === "radio" && ans[list()[idx].id]) { e.preventDefault(); next(); } });
  if ($("b-go")) $("b-go").addEventListener("click", function () {
    var m = $("b-msg"); m.textContent = ""; m.style.color = ""; var n = $("b-name").value.trim(), em = $("b-email").value.trim();
    if (!n || !em) { m.textContent = "Enter your name and email."; return; }
    $("b-go").disabled = true;
    post(C.leadApi, { answers: ans, name: n, email: em, company: $("b-co").value, note: $("b-note").value, website: $("b-web").value, heardFrom: "other" })
      .then(function () { m.style.color = "var(--ok)"; m.textContent = "Sent. Check your inbox in a minute (and your spam folder)."; track("generate_lead", { form: C.event }); })
      .catch(function (err) { m.textContent = err.message; $("b-go").disabled = false; });
  });
  show();
})();
