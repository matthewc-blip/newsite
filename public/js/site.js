/* Shared site behavior: page router, state lists, business info, notary + contact forms */
window.MCC = (function () {
  const STATES = { AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming" };
  const ATTY = new Set(["CT", "DE", "DC", "GA", "MA", "NY", "NC", "SC", "WV"]);

  async function api(path, opts = {}) {
    const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong. Try again or call the desk."), { fields: data.fields || {}, status: res.status });
    return data;
  }

  /* coverage grid + state selects */
  const box = document.getElementById("states");
  function renderCoverage(live) {
    if (!box) return;
    box.innerHTML = "";
    Object.entries(STATES).forEach(([c, n]) => {
      const el = document.createElement("span");
      el.textContent = n + " ";
      const em = document.createElement("em");
      em.textContent = live.includes(c) ? "LIVE" : "SOON";
      if (live.includes(c)) { el.style.borderColor = "var(--ok)"; em.style.color = "var(--ok)"; }
      el.appendChild(em);
      box.appendChild(el);
    });
  }
  renderCoverage(["NJ"]);
  document.querySelectorAll(".state-select").forEach((sel) => {
    sel.innerHTML = '<option value="">Select state</option>' + Object.values(STATES).map((s) => `<option>${s}</option>`).join("");
  });
  document.querySelectorAll(".state-code-select").forEach((sel) => {
    sel.innerHTML = '<option value="">Select</option>' + Object.entries(STATES).map(([c, n]) => `<option value="${c}">${n}</option>`).join("") + (sel.hasAttribute("data-intl") ? '<option value="XX">Outside the U.S.</option>' : "");
  });

  /* router */
  const pages = ["home", "services", "ron", "rin", "how", "clients", "nj", "coverage", "notaries", "faq", "order", "contact"];
  const nav = document.getElementById("mainNav");
  const mb = document.getElementById("menuBtn");
  function route() {
    let h = (location.hash || "#home").slice(1);
    if (h === "book") h = "order";
    if (!pages.includes(h)) h = "home";
    document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === "p-" + h));
    nav.querySelectorAll("a").forEach((a) => (a.getAttribute("href") === "#" + h ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current")));
    nav.classList.remove("open");
    mb.setAttribute("aria-expanded", "false");
    window.scrollTo(0, 0);
    document.dispatchEvent(new CustomEvent("mcc:page", { detail: h }));
  }
  window.addEventListener("hashchange", route);
  mb.addEventListener("click", () => mb.setAttribute("aria-expanded", nav.classList.toggle("open")));

  document.querySelectorAll("[data-svc]").forEach((a) =>
    a.addEventListener("click", () => document.dispatchEvent(new CustomEvent("mcc:service", { detail: a.dataset.svc })))
  );

  /* replace placeholder phone/email with real values from the server */
  let config = null;
  const ready = api("/api/config").then((c) => {
    config = c;
    renderCoverage(c.liveStates || []);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      if (n.nodeValue.includes("(908) 444-6373")) n.nodeValue = n.nodeValue.replaceAll("(908) 444-6373", c.business.phone);
      if (n.nodeValue.includes("booking@mcc-solutionsnj.com")) n.nodeValue = n.nodeValue.replaceAll("booking@mcc-solutionsnj.com", c.business.email);
    });
    const digits = String(c.business.phone || "").replace(/\D/g, "").replace(/^1/, "");
    if (digits.length === 10) document.querySelectorAll('a[href^="tel:"]').forEach((a) => (a.href = "tel:+1" + digits));
    return c;
  }).catch(() => null);

  /* generic field errors */
  function showErrors(form, fields, map) {
    form.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
    form.querySelectorAll(".err.auto").forEach((e) => e.remove());
    Object.entries(fields || {}).forEach(([key, msg]) => {
      const id = map ? map[key] : null;
      const input = id ? form.querySelector("#" + id) : form.querySelector(`[name="${key}"]`);
      if (!input) return;
      input.setAttribute("aria-invalid", "true");
      const slot = input.closest(".field")?.querySelector(`[data-err="${key}"]`);
      if (slot) slot.textContent = msg;
      else {
        const e = document.createElement("span");
        e.className = "err auto";
        e.textContent = msg;
        input.insertAdjacentElement("afterend", e);
      }
    });
  }

  function wireForm(formId, okId, endpoint, map, checkboxes, okMsg) {
    const f = document.getElementById(formId);
    const ok = document.getElementById(okId);
    if (!f) return;
    const hp = document.createElement("div");
    hp.className = "hp";
    hp.setAttribute("aria-hidden", "true");
    hp.innerHTML = `<label for="${formId}-website">Website</label><input id="${formId}-website" tabindex="-1" autocomplete="off">`;
    f.appendChild(hp);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const body = { website: f.querySelector(`#${formId}-website`).value };
      Object.entries(map).forEach(([k, id]) => (body[k] = f.querySelector("#" + id).value));
      Object.entries(checkboxes || {}).forEach(([k, id]) => (body[k] = f.querySelector("#" + id).checked));
      const btn = f.querySelector("button[type=submit]");
      btn.disabled = true;
      ok.hidden = true;
      try {
        await api(endpoint, { method: "POST", body });
        if (window.mccTrack) window.mccTrack(formId === "joinForm" ? "notary_application" : "generate_lead", { form: formId });
        showErrors(f, {}, map);
        ok.hidden = false;
        ok.style.background = ""; ok.style.borderColor = "";
        ok.innerHTML = okMsg;
        f.reset();
      } catch (err) {
        showErrors(f, err.fields, map);
        ok.hidden = false;
        ok.style.background = "var(--warn-soft)"; ok.style.borderColor = "var(--warn)";
        ok.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // Pre-application check: the application stays hidden until every requirement is answered Yes.
  (function () {
    const scr = document.getElementById("joinScreen"), form = document.getElementById("joinForm"), out = document.getElementById("scOut");
    if (!scr || !form) return;
    const G = "/notary/become-a-notary/how-to-qualify";
    const NEED = {
      commission: `No active commission yet, or it's close to expiring? <a href="${G}#commission">Here's how to get or renew it, step by step</a>.`,
      eo: `No E&O insurance yet? It costs roughly $100 to $175 a year for $100,000 of coverage. <a href="${G}#eo">Here's how to get it</a>.`,
      bg: `Need a background check? <a href="${G}#background">Here's where to get one and what it costs</a>. The NNA signing agent package includes one.`,
      "1099": `This is independent contractor work, paid per job, with a 1099 at year end. If that works for you, change your answer to Yes. If not, no hard feelings.`,
      ethics: `Proper ID checks and honest notarization are non-negotiable for everyone on our network.`,
      travel: `We send in-person and RON jobs, and you'll need to be able to do at least one. <a href="${G}#gear">Here's what each one takes</a>.`,
    };
    const names = Object.keys(NEED);
    function check() {
      const ans = Object.fromEntries(names.map((n) => [n, (scr.querySelector(`input[name="sc-${n}"]:checked`) || {}).value]));
      const no = names.filter((n) => ans[n] === "no"), left = names.filter((n) => !ans[n]);
      out.hidden = !no.length && left.length > 0;
      if (no.length) { out.style.background = "var(--warn-soft)"; out.style.borderColor = "var(--warn)"; out.innerHTML = "<b>Not yet, and that\'s fine.</b> Here\'s how to get there: <ul style=\"margin:8px 0 8px 18px\">" + no.map((n) => "<li>" + NEED[n] + "</li>").join("") + "</ul>Start-to-finish guide: <a href=\"" + G + "\">how to qualify</a>. Come back and apply when you\'re set."; form.hidden = true; return; }
      if (left.length) { form.hidden = true; return; }
      out.style.background = ""; out.style.borderColor = ""; out.innerHTML = "<b>You meet the requirements.</b> Fill in the application below. We'll verify your commission, E&amp;O and background check documents before you're approved.";
      form.hidden = false;
    }
    scr.addEventListener("change", check);
  })();

  wireForm("joinForm", "joinOk", "/api/applications",
    { name: "j-name", email: "j-email", phone: "j-phone", zip: "j-zip", radius: "j-radius", commissionState: "j-state", commissionExpires: "j-exp", eo: "j-eo", backgroundDate: "j-bg", signings: "j-count", languages: "j-lang" },
    { nsa: "j-nna", ron: "j-ron", rin: "j-rin", laser: "j-printer", reverse: "j-reverse" },
    "<b>Application received.</b> We review applications within 3 business days. Once approved, you'll get an email to finish onboarding in the notary portal.");
  wireForm("contactForm", "contactOk", "/api/messages",
    { name: "c-name", email: "c-email", topic: "c-topic", message: "c-msg", heardFrom: "c-heard", heardNote: "c-heardnote" }, null,
    "<b>Message sent.</b> A coordinator will reply within one business day.");

  return { api, STATES, route, ready, getConfig: () => config, showErrors };
})();
