/* Booking wizard: Mobile notary, RON, RIN */
(function () {
  const { api, STATES } = window.MCC;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const form = $("#bookForm");
  if (!form) return;

  const CATEGORIES = {
    mobile: {
      "Loan signing": ["Refinance", "Purchase · buyer", "Purchase · seller", "HELOC", "Reverse mortgage", "Loan modification", "Hybrid e-closing"],
      "General notary": ["Power of attorney", "Affidavit or sworn statement", "Trust or estate documents", "Vehicle title or bill of sale", "Healthcare directive", "Business documents", "Other documents"],
    },
    ron: { "Documents": ["Power of attorney", "Affidavit or sworn statement", "Real estate closing", "Business documents", "Vehicle title or bill of sale", "Other documents"] },
    rin: { "Documents": ["Real estate closing", "Power of attorney", "Affidavit or sworn statement", "Trust or estate documents", "Other documents"] },
  };
  const LOAN = new Set(CATEGORIES.mobile["Loan signing"].concat(["Real estate closing"]));
  const STATE_TZ = { AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago", CA: "America/Los_Angeles", CO: "America/Denver", HI: "Pacific/Honolulu", ID: "America/Boise", IL: "America/Chicago", IA: "America/Chicago", KS: "America/Chicago", LA: "America/Chicago", MN: "America/Chicago", MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago", NV: "America/Los_Angeles", NM: "America/Denver", ND: "America/Chicago", OK: "America/Chicago", OR: "America/Los_Angeles", SD: "America/Chicago", TX: "America/Chicago", UT: "America/Denver", WA: "America/Los_Angeles", WI: "America/Chicago", WY: "America/Denver" };
  const TZS = [["America/New_York", "Eastern"], ["America/Chicago", "Central"], ["America/Denver", "Mountain"], ["America/Phoenix", "Arizona"], ["America/Los_Angeles", "Pacific"], ["America/Anchorage", "Alaska"], ["Pacific/Honolulu", "Hawaii"], ["America/Puerto_Rico", "Atlantic"]];
  const SVC_LABEL = { mobile: "Mobile notary", ron: "RON · online", rin: "RIN · video + ink" };

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  const st = { step: 1, service: "mobile", from: null, date: null, slot: null, tz: browserTz, today: null, maxDays: 60 };
  let config = null;

  /* ---------- setup ---------- */
  const tzSel = $("#b-tz");
  const tzList = TZS.some(([z]) => z === browserTz) ? TZS : [[browserTz, "Your time zone"], ...TZS];
  tzSel.innerHTML = tzList.map(([z, n]) => `<option value="${z}">${n} (${shortTz(z)})</option>`).join("");
  tzSel.value = browserTz;

  function shortTz(z) {
    try { return new Intl.DateTimeFormat("en-US", { timeZone: z, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName").value; }
    catch { return z; }
  }
  const fmtTime = (iso, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const fmtDateTz = (iso, tz) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const fmtFull = (iso, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  const addDays = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
  const money = (n) => "$" + Number(n).toFixed(Number(n) % 1 ? 2 : 0);

  function fillCategories() {
    const sel = $("#b-category");
    const prev = sel.value;
    sel.innerHTML = '<option value="">Choose one</option>' + Object.entries(CATEGORIES[st.service])
      .map(([g, items]) => `<optgroup label="${g}">${items.map((i) => `<option>${i}</option>`).join("")}</optgroup>`).join("");
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  function setService(s) {
    if (!CATEGORIES[s]) return;
    st.service = s;
    const r = $(`input[name=service][value="${s}"]`);
    if (r) r.checked = true;
    st.date = null; st.slot = null; st.from = null;
    fillCategories();
    if (config) renderAddons();
    $$("[data-for=mobile]").forEach((e) => (e.hidden = s !== "mobile"));
    $$("[data-for=remote]").forEach((e) => (e.hidden = s === "mobile"));
    $$("[data-for=rin]").forEach((e) => (e.hidden = s !== "rin"));
    $("#b-sloc").placeholder = s === "rin" ? "Mobile, AL" : "Lisbon, Portugal";
    remoteNote();
    syncLoan();
    summary();
  }

  function syncLoan() {
    const loan = LOAN.has($("#b-category").value);
    $$("[data-loan-only]").forEach((e) => (e.hidden = !loan));
  }

  function remoteNote() {
    const n = $("#remoteNote");
    const ss = $("#b-sstate").value;
    const rinStates = config?.rinStates || [];
    if (st.service === "ron") {
      n.innerHTML = "<b>RON:</b> " + (ss === "XX"
        ? "Many RON notaries can serve signers outside the U.S. A coordinator will confirm the document and country are eligible before your session."
        : "You'll need unexpired government photo ID and a computer or tablet with a camera. We confirm that your lender, title company or receiving agency accepts electronic notarization.");
    } else if (st.service === "rin") {
      n.innerHTML = "<b>RIN:</b> " + (ss === "XX"
        ? "RIN for signers outside the U.S. is limited. Alabama RIN, for example, only covers signers inside the U.S. as of October 1, 2026. We'll check your options or suggest RON."
        : `Our RIN notaries are commissioned in ${rinStates.join(", ") || "a limited set of states"}. A coordinator confirms that your document and the receiving party accept RIN before the session. Paper documents need about one business day to reach you.`);
    }
  }

  /* ---------- steps ---------- */
  function showStep(n) {
    st.step = n;
    $$(".bstep").forEach((s) => (s.hidden = Number(s.dataset.step) !== n));
    $$("#stepbar li").forEach((li) => {
      const k = Number(li.dataset.step);
      li.className = k < n ? "done" : k === n ? "current" : "";
    });
    $("#bBack").style.visibility = n === 1 ? "hidden" : "visible";
    $("#bNext").textContent = n === 5 ? "Book Appointment" : "Continue";
    msg("");
    if (n === 3) loadDays();
    if (n === 5) review();
    if ($("#booker").offsetParent) {
      const top = $("#booker").getBoundingClientRect().top + scrollY - 130;
      if (scrollY > top) scrollTo({ top, behavior: "smooth" });
    }
  }

  function msg(text, ok) {
    const m = $("#bMsg");
    m.textContent = text;
    m.className = "form-msg" + (ok ? " ok" : "");
  }

  function setErrs(errs) {
    $$("[data-err]", form).forEach((e) => (e.textContent = ""));
    $$("[aria-invalid]", form).forEach((e) => e.removeAttribute("aria-invalid"));
    Object.entries(errs).forEach(([k, v]) => {
      const slot = $(`[data-err="${k}"]`, form);
      if (slot) slot.textContent = v;
      const input = $(`[name="${k}"]`, form);
      if (input) input.setAttribute("aria-invalid", "true");
    });
    const first = Object.keys(errs)[0];
    if (first) $(`[name="${first}"]`, form)?.focus();
    return !Object.keys(errs).length;
  }

  function validate(n) {
    const v = (id) => $(id).value.trim();
    const e = {};
    if (n === 2) {
      if (!v("#b-category")) e.category = "Choose what needs to be notarized.";
      if (st.service === "mobile") {
        if (!v("#b-address")) e.address = "Enter the street address.";
        if (!v("#b-city")) e.city = "Enter the city.";
        if (!v("#b-state")) e.state = "Choose the state.";
        if (!/^\d{5}$/.test(v("#b-zip"))) e.zip = "Enter a 5-digit ZIP.";
      } else {
        if (!v("#b-sloc")) e.signerLocation = "Tell us where the signer will be.";
        if (st.service === "rin" && !v("#b-mail")) e.mailingAddress = "Enter where the paper documents should go.";
      }
    }
    if (n === 3 && !st.slot) e.start = "Pick a time.";
    if (n === 4) {
      if (!v("#b-cname")) e.contactName = "Enter your name.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v("#b-cemail"))) e.contactEmail = "Enter a valid email.";
      if (v("#b-cphone").replace(/\D/g, "").length < 10) e.contactPhone = "Enter a phone number with area code.";
    }
    if (n === 5 && !$("#b-agree").checked) e.agree = "Check the box to continue.";
    return setErrs(e);
  }

  $("#bNext").addEventListener("click", () => {
    if (!validate(st.step)) return;
    if (st.step < 5) showStep(st.step + 1);
    else submit();
  });
  $("#bBack").addEventListener("click", () => st.step > 1 && showStep(st.step - 1));

  /* ---------- dates & slots ---------- */
  async function loadDays() {
    if (!config) config = await window.MCC.ready;
    if (!config) { msg("We couldn't load availability. Refresh the page or call the desk."); return; }
    st.today = config.today;
    st.maxDays = config.services[st.service].maxDaysAhead;
    if (!st.from) st.from = st.today;
    const daysEl = $("#days");
    daysEl.classList.add("loading");
    let data;
    try { data = await api(`/api/availability/days?service=${st.service}&from=${st.from}&days=7`); }
    catch (e) { msg(e.message); daysEl.classList.remove("loading"); return; }
    daysEl.classList.remove("loading");
    daysEl.innerHTML = "";
    data.days.forEach((d) => {
      const [y, m, dd] = d.date.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, dd));
      const b = document.createElement("button");
      b.type = "button";
      b.className = "day";
      b.setAttribute("role", "option");
      b.disabled = !d.open;
      b.setAttribute("aria-selected", String(d.date === st.date));
      b.innerHTML = `<small>${dt.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</small><b>${dd}</b><small>${dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</small><span class="cnt">${d.open ? d.open + " open" : "Full"}</span>`;
      b.addEventListener("click", () => { st.date = d.date; st.slot = null; loadDays(); });
      daysEl.appendChild(b);
    });
    $("#daysPrev").disabled = st.from <= st.today;
    $("#daysNext").disabled = addDays(st.from, 7) > addDays(st.today, st.maxDays);
    if (!st.date || !data.days.some((d) => d.date === st.date && d.open)) {
      const first = data.days.find((d) => d.open);
      if (first && (!st.date || st.date < st.from || st.date > addDays(st.from, 6))) { st.date = first.date; return loadDays(); }
    }
    loadSlots();
  }
  $("#daysPrev").addEventListener("click", () => { st.from = addDays(st.from, -7) < st.today ? st.today : addDays(st.from, -7); st.date = null; loadDays(); });
  $("#daysNext").addEventListener("click", () => { st.from = addDays(st.from, 7); st.date = null; loadDays(); });

  async function loadSlots() {
    const box = $("#slots");
    const label = $("#slotsLabel");
    st.tz = tzSel.value;
    $("#tzHint").textContent = st.service === "mobile" ? "Use the time zone where the signing happens." : "Use the signer's time zone.";
    if (!st.date) { box.innerHTML = '<p class="empty">No open times in these dates. Try the next week.</p>'; label.textContent = ""; return; }
    box.classList.add("loading");
    let data;
    try { data = await api(`/api/availability?service=${st.service}&date=${st.date}`); }
    catch (e) { msg(e.message); box.classList.remove("loading"); return; }
    box.classList.remove("loading");
    const [y, m, d] = st.date.split("-").map(Number);
    label.textContent = `${data.slots.length} open times on ${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}, shown in ${shortTz(st.tz)}`;
    box.innerHTML = "";
    if (!data.slots.length) box.innerHTML = '<p class="empty">This day just filled up. Pick another date.</p>';
    data.slots.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.setAttribute("role", "option");
      const otherDay = fmtDateTz(s.start, st.tz) !== st.date;
      b.textContent = (otherDay ? new Intl.DateTimeFormat("en-US", { timeZone: st.tz, weekday: "short" }).format(new Date(s.start)) + " " : "") + fmtTime(s.start, st.tz);
      b.setAttribute("aria-selected", String(st.slot?.start === s.start));
      b.addEventListener("click", () => {
        st.slot = s;
        $$(".slot", box).forEach((x) => x.setAttribute("aria-selected", String(x === b)));
        setErrs({});
        summary();
      });
      box.appendChild(b);
    });
  }
  tzSel.addEventListener("change", () => { loadSlots(); summary(); });

  /* ---------- summary / review ---------- */
  /* ---------- checkout add-ons ---------- */
  function renderAddons() {
    const box = $("#addonsBox"), list = $("#addonList");
    const items = ((config && config.addons) || []).filter((a) => a.services.includes(st.service));
    const keep = selectedAddons();
    box.hidden = !items.length;
    list.innerHTML = "";
    items.forEach((a) => {
      const row = document.createElement("div");
      row.className = "addon-row";
      const id = "ad-" + a.id;
      const qty = keep[a.id] || 0;
      if (a.max > 1) {
        row.innerHTML = `<label for="${id}"><b></b><span class="addon-note"></span></label><select id="${id}" data-addon="${a.id}"></select>`;
        const sel = row.querySelector("select");
        for (let i = 0; i <= a.max; i++) { const o = document.createElement("option"); o.value = i; o.textContent = i === 0 ? "None" : `${i} × $${a.price.toFixed(2)}`; sel.appendChild(o); }
        sel.value = String(Math.min(qty, a.max));
      } else {
        row.innerHTML = `<label class="addon-check" for="${id}"><input type="checkbox" id="${id}" data-addon="${a.id}"><span><b></b><span class="addon-note"></span></span></label><span class="addon-price"></span>`;
        row.querySelector("input").checked = qty > 0;
        row.querySelector(".addon-price").textContent = "+$" + a.price.toFixed(2);
      }
      row.querySelector("b").textContent = a.label;
      row.querySelector(".addon-note").textContent = a.note || "";
      list.appendChild(row);
    });
  }
  function selectedAddons() {
    const out = {};
    $$("[data-addon]").forEach((el) => { const q = el.type === "checkbox" ? (el.checked ? 1 : 0) : Number(el.value) || 0; if (q) out[el.dataset.addon] = q; });
    return out;
  }
  function addonRows() {
    const sel = selectedAddons();
    return ((config && config.addons) || []).filter((a) => sel[a.id] && a.services.includes(st.service)).map((a) => ({ ...a, qty: sel[a.id] }));
  }
  // Extra fees that apply automatically (same rules as the server): rush, after-hours, weekend, extra signers.
  function autoFees() {
    if (!config || !st.slot) return [];
    const tz = (config.business && config.business.timezone) || "America/New_York";
    const start = new Date(st.slot.start);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(start);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    const mins = Number(get("hour")) * 60 + Number(get("minute")), wd = get("weekday");
    const signers = Number($("#b-signers").value) || 1;
    const perSigner = (config.pricing[st.service] || {}).perExtraSigner;
    const out = [];
    for (const f of (config.fees || [])) {
      if (!f.auto || !f.services.includes(st.service)) continue;
      if (f.auto === "rush" && start.getTime() - Date.now() < 4 * 3600e3) out.push({ ...f, qty: 1 });
      if (f.auto === "after_hours" && (mins < 480 || mins >= 1140)) out.push({ ...f, qty: 1 });
      if (f.auto === "weekend" && (wd === "Sat" || wd === "Sun")) out.push({ ...f, qty: 1 });
      if (f.auto === "extra_signer" && (perSigner == null || perSigner === "") && signers > 1) out.push({ ...f, qty: Math.min(f.max, signers - 1) });
    }
    return out;
  }
  const addonsTotal = () => addonRows().reduce((s, a) => s + a.qty * a.price, 0) + autoFees().reduce((s, a) => s + a.qty * a.price, 0);

  function fee() {
    if (!config) return null;
    const p = config.pricing[st.service] || {};
    const loan = LOAN.has($("#b-category").value);
    const base = st.service === "mobile" ? (loan ? p.loan : p.general) : p.base;
    if (base == null || base === "") return null;
    const signers = Number($("#b-signers").value) || 1;
    return Number(base) + (p.perExtraSigner ? (signers - 1) * Number(p.perExtraSigner) : 0);
  }

  function locationText() {
    if (st.service === "mobile") return [$("#b-address").value, $("#b-city").value, $("#b-state").value, $("#b-zip").value].map((s) => s.trim()).filter(Boolean).join(", ");
    const ss = $("#b-sstate").value;
    return [$("#b-sloc").value.trim(), ss && ss !== "XX" ? STATES[ss] : ss === "XX" ? "Outside the U.S." : ""].filter(Boolean).join(" · ");
  }

  function rows() {
    const r = [["Service", SVC_LABEL[st.service]]];
    if ($("#b-category").value) r.push(["For", $("#b-category").value]);
    r.push(["Signers", $("#b-signers").value]);
    if (st.slot) r.push(["When", fmtFull(st.slot.start, st.tz)]);
    const loc = locationText();
    if (loc) r.push([st.service === "mobile" ? "Where" : "Signer at", loc]);
    if (st.service === "rin" && $("#b-mail").value.trim()) r.push(["Docs mailed to", $("#b-mail").value.trim()]);
    const ad = addonRows();
    if (ad.length) r.push(["Add-ons", ad.map((a) => `${a.label}${a.qty > 1 ? " ×" + a.qty : ""}`).join(", ")]);
    const fx = autoFees();
    if (fx.length) r.push(["Extra fees", fx.map((a) => `${a.label}${a.qty > 1 ? " ×" + a.qty : ""} (${money(a.qty * a.price)})`).join(", ")]);
    return r;
  }

  function fillDl(dl, list) {
    dl.innerHTML = "";
    list.forEach(([k, v]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      dl.append(dt, dd);
    });
  }

  function summary() {
    fillDl($("#sumList"), rows());
    const f = fee(), extra = addonsTotal();
    $("#sumFee").textContent = f != null ? `Estimated fee: ${money(f + extra)}${extra ? ` (includes ${money(extra)} in add-ons and extra fees)` : ""}`
      : extra ? `Add-ons and extra fees: ${money(extra)}. The signing fee is confirmed by the desk before your appointment.` : "Fee confirmed by the desk before your appointment.";
  }

  function review() {
    const list = rows();
    list.push(["Contact", `${$("#b-cname").value.trim()} · ${$("#b-cphone").value.trim()} · ${$("#b-cemail").value.trim()}`]);
    if ($("#b-co").value.trim()) list.push(["Company", $("#b-co").value.trim() + ($("#b-file").value.trim() ? ` · File ${$("#b-file").value.trim()}` : "")]);
    if ($("#b-notes").value.trim()) list.push(["Notes", $("#b-notes").value.trim()]);
    const f = fee();
    const x = addonsTotal();
    list.push(["Fee", f != null ? `${money(f + x)} estimated${x ? ` (includes ${money(x)} in add-ons and extra fees)` : ""}` : x ? `${money(x)} in add-ons and extra fees, plus the signing fee quoted when we confirm` : "Quoted when we confirm"]);
    fillDl($("#review"), list);
  }

  /* ---------- submit ---------- */
  async function submit() {
    const btn = $("#bNext");
    btn.disabled = true;
    msg("Booking…", true);
    const val = (id) => $(id).value.trim();
    const body = {
      service: st.service, category: val("#b-category"), signers: Number(val("#b-signers")), start: st.slot.start, tz: st.tz,
      address: val("#b-address"), city: val("#b-city"), state: val("#b-state"), zip: val("#b-zip"),
      docsDelivery: LOAN.has(val("#b-category")) && st.service === "mobile" ? val("#b-docs") : "",
      signerLocation: st.service === "mobile" ? "" : locationText(), signerState: val("#b-sstate"),
      inUS: st.service === "mobile" ? true : val("#b-sstate") !== "XX",
      mailingAddress: st.service === "rin" ? val("#b-mail") : "",
      contactName: val("#b-cname"), contactEmail: val("#b-cemail"), contactPhone: val("#b-cphone"),
      signerNames: val("#b-snames"), company: val("#b-co"), fileNumber: val("#b-file"), notes: val("#b-notes"),
      website: $("#b-website").value,
      addons: selectedAddons(),
    };
    try {
      const res = await api("/api/bookings", { method: "POST", body });
      done(res);
    } catch (e) {
      const f = e.fields || {};
      if (f.start || e.status === 409) {
        st.slot = null;
        showStep(3);
        msg(e.message);
      } else if (Object.keys(f).some((k) => ["category", "address", "city", "state", "zip", "signerLocation", "mailingAddress"].includes(k))) {
        showStep(2); setErrs(f); msg(e.message);
      } else if (Object.keys(f).length) {
        showStep(4); setErrs(f); msg(e.message);
      } else msg(e.message);
    } finally {
      btn.disabled = false;
    }
  }

  function done(res) {
    const b = res.booking;
    if (window.mccTrack) window.mccTrack("generate_lead", { form: "booking", service: b.service, category: b.category });
    const token = new URLSearchParams(res.manageUrl.split("?")[1]).get("token");
    form.hidden = true;
    $("#stepbar").hidden = true;
    $("#bDone").hidden = false;
    $("#doneTitle").textContent = `Booking ${b.ref} received`;
    const next = {
      mobile: "A coordinator will confirm your appointment and email your notary's name. Every signer needs unexpired photo ID. Don't sign anything before the notary arrives.",
      ron: "A coordinator will confirm your session and email the secure signing link. Have your photo ID and a device with a camera ready.",
      rin: "A coordinator will confirm RIN eligibility and arrange for the paper documents to reach you before the video session.",
    }[b.service];
    $("#doneText").textContent = `We emailed a copy to ${$("#b-cemail").value.trim()}. ${next}`;
    fillDl($("#doneReview"), [["Booking", b.ref], ...rows()]);
    $("#doneIcs").href = `/api/bookings/${encodeURIComponent(b.ref)}/ics?token=${encodeURIComponent(token)}`;
    $("#doneManage").href = res.manageUrl;
    const cardBox = $("#doneCard");
    cardBox.hidden = !b.cardRequested;
    $("#doneCardBtn").onclick = async () => {
      const btn = $("#doneCardBtn"), m = $("#doneCardMsg");
      btn.disabled = true; m.textContent = "";
      try {
        const r = await api(`/api/bookings/${encodeURIComponent(b.ref)}/card`, { method: "POST", body: { token } });
        location.href = r.url;
      } catch (e) { m.textContent = e.message; btn.disabled = false; }
    };
    $("#bDone").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $("#doneAgain").addEventListener("click", (e) => {
    e.preventDefault();
    form.reset();
    st.slot = null; st.date = null; st.from = null;
    form.hidden = false; $("#stepbar").hidden = false; $("#bDone").hidden = true;
    setService("mobile");
    showStep(1);
  });

  /* ---------- events ---------- */
  $$("input[name=service]").forEach((r) => r.addEventListener("change", () => setService(r.value)));
  $("#b-category").addEventListener("change", () => { syncLoan(); summary(); });
  $("#b-sstate").addEventListener("change", () => {
    remoteNote(); summary();
    const z = STATE_TZ[$("#b-sstate").value] || ($("#b-sstate").value && $("#b-sstate").value !== "XX" ? "America/New_York" : null);
    if (z && [...tzSel.options].some((o) => o.value === z)) tzSel.value = z;
  });
  $("#b-state").addEventListener("change", () => {
    const s = $("#b-state").value;
    let note = $("#stateNote");
    if (!note) { note = document.createElement("div"); note.id = "stateNote"; note.className = "field full"; $("#b-zip").closest("fieldset").appendChild(note); }
    const live = (config && config.liveStates) || ["NJ"];
    note.innerHTML = s && !live.includes(s) ? `<div class="callout"><b>We're not dispatching mobile notaries in ${STATES[s]} yet.</b> You can still request it and the desk will confirm within a few hours whether we can cover it, or suggest a remote notarization instead.</div>` : "";
    const z = STATE_TZ[s] || (s ? "America/New_York" : null);
    if (z && [...tzSel.options].some((o) => o.value === z)) tzSel.value = z;
  });
  form.addEventListener("input", () => summary());
  form.addEventListener("submit", (e) => e.preventDefault());
  document.addEventListener("mcc:service", (e) => { setService(e.detail); showStep(1); });

  window.MCC.ready.then((c) => {
    config = c;
    if (!c) return;
    ["mobile", "ron", "rin"].forEach((k) => {
      const s = c.services[k];
      const el = $("#meta-" + k);
      if (el) el.textContent = s.enabled ? `${s.durationMin} min appointment · book up to ${s.maxDaysAhead} days out` : "Call the desk to book";
      const input = $(`input[name=service][value="${k}"]`);
      if (input && !s.enabled) { input.disabled = true; input.closest(".svc-opt").style.opacity = .5; }
    });
    remoteNote();
    renderAddons();
    summary();
  });

  setService("mobile");
  showStep(1);
  window.MCC.route();
})();
