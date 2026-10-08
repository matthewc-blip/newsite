// "Have us call you": a tiny form that sends a name and a phone number to the desk.
(function () {
  document.querySelectorAll("form[data-callback]").forEach(function (f) {
    var msg = f.querySelector(".cb-msg"), btn = f.querySelector("button[type=submit]");
    f.addEventListener("submit", function (e) {
      e.preventDefault(); msg.textContent = ""; msg.style.color = "";
      var d = { name: f.elements.name.value.trim(), phone: f.elements.phone.value.trim(), need: f.elements.need ? f.elements.need.value.trim() : "", website: f.elements.website.value, page: location.pathname };
      if (!d.name || d.phone.replace(/\D/g, "").length < 10) { msg.textContent = "Enter your name and a phone number with area code."; return; }
      btn.disabled = true; msg.style.color = "inherit"; msg.textContent = "Sending…";
      fetch("/api/callback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "Something went wrong."); }); })
        .then(function () { f.querySelectorAll("input,textarea").forEach(function (i) { i.disabled = true; }); btn.hidden = true; msg.textContent = "Got it. We'll call you during desk hours. If it's urgent, call the desk."; try { if (window.mccTrack) window.mccTrack("generate_lead", { form: "callback" }); } catch (x) {} })
        .catch(function (err) { msg.textContent = err.message; btn.disabled = false; });
    });
  });
})();
