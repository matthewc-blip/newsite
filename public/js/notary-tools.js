(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  function el(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }

  /* ----- checklist ----- */
  if (window.MCC_CHECKLIST) {
    var D = window.MCC_CHECKLIST, sel = $("cl-doc"), docs = {};
    var g0 = document.createElement("optgroup"); g0.label = "General"; var o0 = new Option("Not sure / other document", "_other"); g0.appendChild(o0); sel.appendChild(g0);
    D.forEach(function (c) { var g = document.createElement("optgroup"); g.label = c.cat; c.docs.forEach(function (d) { docs[d.slug] = d; g.appendChild(new Option(d.title, d.slug)); }); sel.appendChild(g); });
    var q = new URLSearchParams(location.search).get("doc"); if (q && docs[q]) sel.value = q;
    var checked = {};
    var current = function () {
      var m = $("cl-mode").value, n = Math.max(1, Math.min(10, parseInt($("cl-n").value, 10) || 1)), d = docs[sel.value];
      var items = [];
      items.push("The document itself, " + (m === "rin" ? "printed on paper and not yet signed" : m === "ron" ? "ready to upload, not yet signed" : "unsigned. Don't sign until the notary is watching") + ".");
      items.push(n > 1 ? "A current government-issued photo ID for each of the " + n + " signers (driver's license or passport). Names should match the document." : "A current government-issued photo ID (driver's license or passport). The name should match the document.");
      if (d) d.items.forEach(function (t) { items.push(t); });
      items.push("Any instructions from the office asking for the document, such as the exact form, wording or number of copies.");
      if (m === "person") items.push("A pen with blue or black ink, and a quiet table where everyone can sign.");
      if (m === "ron") { items.push("A computer or phone with a camera, a microphone and a steady internet connection."); items.push("A quiet, well-lit room. Every signer must be on camera and show their ID on screen."); }
      if (m === "rin") { items.push("A pen with blue or black ink, a printer if needed, and a camera and microphone for the video session."); items.push("A prepaid envelope or shipping label to send the signed original to the notary, and a way to get it back to you."); }
      if (n > 1) items.push("Every signer present at the same time, unless the notary has told you otherwise.");
      return { items: items, d: d, mode: m };
    };
    var draw = function () {
      var r = current(), ul = $("cl-list"); ul.textContent = "";
      $("cl-title").textContent = "Checklist" + (r.d ? ": " + r.d.title : "");
      var lk = $("cl-link"); lk.textContent = ""; if (r.d) { var a = el("a", null, "Read about this document"); a.href = r.d.href; lk.appendChild(a); }
      r.items.forEach(function (t, i) {
        var key = sel.value + "|" + r.mode + "|" + t, li = el("li"); li.style.cssText = "margin:0 0 12px";
        var lb = el("label"); lb.style.cssText = "display:flex;gap:12px;align-items:flex-start;cursor:pointer";
        var cb = el("input"); cb.type = "checkbox"; cb.checked = !!checked[key]; cb.style.cssText = "margin-top:5px;flex:none;width:18px;height:18px";
        cb.addEventListener("change", function () { checked[key] = cb.checked; });
        lb.appendChild(cb); lb.appendChild(el("span", null, t)); li.appendChild(lb); ul.appendChild(li);
      });
    };
    ["cl-doc", "cl-mode", "cl-n"].forEach(function (id) { $(id).addEventListener("change", draw); $(id).addEventListener("input", draw); });
    $("cl-print").addEventListener("click", function () { window.print(); });
    $("cl-copy").addEventListener("click", function () {
      var r = current(), txt = "Notary appointment checklist" + (r.d ? " - " + r.d.title : "") + "\n\n" + r.items.map(function (t) { return "[ ] " + t; }).join("\n") + "\n\nGeneral guidance. The office asking for your document may require more.";
      var m = $("cl-msg"); var done = function (ok) { m.textContent = ok ? "Copied." : "Couldn't copy. Select the list and copy it."; setTimeout(function () { m.textContent = ""; }, 2500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(false); }); else done(false);
    });
    draw();
  }

  /* ----- earnings ----- */
  if (window.MCC_PAY) {
    var P = window.MCC_PAY, ids = { "e-mobile": "mobile", "e-loan": "loan", "e-hosp": "hospital" };
    var num = function (id, max) { var v = parseFloat($(id).value); return isFinite(v) && v > 0 ? Math.min(v, max) : 0; };
    var usd = function (n) { return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }); };
    var calc = function () {
      var jobs = 0, gross = 0;
      Object.keys(ids).forEach(function (id) { var n = Math.floor(num(id, 100)); jobs += n; gross += n * P[ids[id]]; });
      var cost = num("e-cost", 500), hrs = num("e-hrs", 12) || 1.5, net = gross - jobs * cost;
      $("r-wk").textContent = usd(net); $("r-mo").textContent = usd(net * 52 / 12);
      $("r-hr").textContent = jobs ? usd(net / (jobs * hrs)) : "$0";
      $("r-sum").textContent = jobs ? jobs + " job" + (jobs === 1 ? "" : "s") + " a week: " + usd(gross) + " in pay" + (cost ? ", minus " + usd(jobs * cost) + " in your costs" : "") + "." : "Enter a number of jobs to see an estimate.";
    };
    Object.keys(ids).concat(["e-cost", "e-hrs"]).forEach(function (id) { $(id).addEventListener("input", calc); });
    calc();
  }
})();
