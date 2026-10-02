/* MCC Solutions client portal (title companies, lenders, law firms) */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SVC = { mobile: "Mobile", ron: "RON", rin: "RIN" };
  const STATUS = { requested: ["Received", "p-info"], confirmed: ["Confirmed", "p-info"], assigned: ["Notary assigned", "p-ok"], completed: ["Signed", "p-ok"], canceled: ["Canceled", "p-warn"], no_show: ["Missed", "p-warn"] };
  const SCAN = { pending: ["Scanbacks in review", "p-info"], approved: ["Scanbacks ready", "p-ok"], rejected: ["Scanbacks being corrected", "p-warn"] };
  const CATS = {
    mobile: ["Refinance", "Purchase · buyer", "Purchase · seller", "HELOC", "Reverse mortgage", "Loan modification", "Hybrid e-closing", "Power of attorney", "Affidavit or sworn statement", "Other documents"],
    ron: ["Real estate closing", "Power of attorney", "Affidavit or sworn statement", "Business documents", "Other documents"],
    rin: ["Real estate closing", "Power of attorney", "Affidavit or sworn statement", "Other documents"],
  };
  let me = null, orders = [], filter = "open", current = null, tab = "orders";
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: { "X-Requested-With": "mcc-client", ...(opts.raw ? { "Content-Type": opts.type } : opts.body ? { "Content-Type": "application/json" } : {}) },
      body: opts.raw ? opts.raw : opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
    let j = {};
    try { j = await res.json(); } catch {}
    if (res.status === 401) { showSignin(j.error); throw new Error(j.error || "Sign in again."); }
    if (!res.ok) throw Object.assign(new Error(j.error || "Something went wrong."), { fields: j.fields });
    return j;
  }
  const msg = (el, t, k) => { el.textContent = t; el.className = "msg " + (k || ""); };
  const when = (iso, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz || browserTz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  const pill = ([t, c]) => `<span class="pill ${c}">${esc(t)}</span>`;

  /* ---------- auth ---------- */
  function showSignin(t) { $("#signin").hidden = false; $("#tabs").hidden = true; $$("section[data-tab]").forEach((s) => (s.hidden = true)); if (t) msg($("#loginMsg"), t, "err"); }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api("/api/client/request-link", { method: "POST", body: { email: $("#l-email").value.trim() } }); msg($("#loginMsg"), "If that email has an account, a sign-in link is on its way.", "ok"); }
    catch (err) { msg($("#loginMsg"), err.message, "err"); }
  });
  $("#logout").addEventListener("click", async () => { await api("/api/client/logout", { method: "POST" }).catch(() => {}); location.href = "/client/"; });

  /* ---------- tabs ---------- */
  function showTab(t) {
    tab = t;
    $$("#tabs button[data-tab]").forEach((b) => (b.dataset.tab === t || (t === "detail" && b.dataset.tab === "orders") || ((t === "reqdetail" || t === "newreq") && b.dataset.tab === "requests") ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    $$("section[data-tab]").forEach((s) => (s.hidden = s.dataset.tab !== t));
    if (t === "orders") { history.replaceState(null, "", "/client/"); loadOrders(); }
    if (t === "new") prepNew();
    if (t === "invoices") loadInvoices();
    if (t === "requests") { history.replaceState(null, "", "/client/#requests"); loadRequests(); }
    if (t === "newreq") prepNewReq();
    scrollTo(0, 0);
  }
  $$("#tabs button[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) showTab(g.dataset.go); });

  /* ---------- orders ---------- */
  $$("#filter button").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; $$("#filter button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderOrders(); }));
  $("#q").addEventListener("input", renderOrders);
  async function loadOrders() { orders = (await api("/api/client/orders")).orders; renderOrders(); }
  function renderOrders() {
    const q = $("#q").value.trim().toLowerCase();
    const open = (o) => ["requested", "confirmed", "assigned"].includes(o.status);
    let list = orders.filter((o) => (filter === "all" ? true : filter === "open" ? open(o) : !open(o)));
    if (q) list = list.filter((o) => [o.ref, o.file_number, o.signer_names, o.location, o.category].join(" ").toLowerCase().includes(q));
    if (filter === "open") list = [...list].reverse();
    $("#orders").innerHTML = list.length ? list.map((o) => `<button class="orow" data-id="${o.id}">
        <span class="when"><b>${esc(when(o.start, o.tz).replace(/, \d{1,2}:\d{2}.*/, ""))}</b><small>${esc(new Intl.DateTimeFormat("en-US", { timeZone: o.tz || browserTz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(o.start)))}</small></span>
        <span><b>${esc(o.signer_names || o.contact_name)}</b><small>${esc(o.ref)}${o.file_number ? " · File " + esc(o.file_number) : ""} · ${SVC[o.service]} · ${esc(o.category)}</small></span>
        <span class="hide-sm"><b>${esc(o.location || "")}</b><small>${o.notary ? "Notary: " + esc(o.notary) : open(o) ? "Finding a notary" : ""}</small></span>
        <span class="hide-sm"><b>${o.package_count ? o.package_count + " document" + (o.package_count > 1 ? "s" : "") : open(o) ? '<span style="color:var(--warn)">No package yet</span>' : "—"}</b></span>
        <span class="pills">${pill(STATUS[o.status])}${o.scanback_status ? pill(SCAN[o.scanback_status]) : ""}</span></button>`).join("")
      : `<div class="empty">${filter === "open" ? "No open orders." : "Nothing here yet."} <button class="linkbtn" style="color:var(--brass-ink)" data-go="new">Place an order</button></div>`;
    $$(".orow").forEach((r) => r.addEventListener("click", () => openOrder(Number(r.dataset.id))));
  }

  async function openOrder(id) {
    const { order: o, events, documents } = await api("/api/client/orders/" + id);
    current = o;
    history.replaceState(null, "", "/client/#order-" + id);
    showTabNoLoad("detail");
    $("#dTitle").textContent = `${o.signer_names || o.contact_name} · ${o.category}`;
    $("#dStatus").innerHTML = pill(STATUS[o.status]) + " " + (o.scanback_status ? pill(SCAN[o.scanback_status]) : "");
    const rows = [["Order", o.ref], ["File #", o.file_number], ["When", when(o.start, o.tz)], ["Service", `${SVC[o.service]} · ${o.signers} signer${o.signers > 1 ? "s" : ""}`],
      [o.service === "mobile" ? "Location" : "Signer at", o.location], ["Signer phone", o.contact_phone], ["Notary", o.notary || (["requested", "confirmed", "assigned"].includes(o.status) ? "Being assigned" : "—")],
      ["Docs mailed to", o.mailing_address], ["Return tracking", o.return_tracking], ["Instructions", o.notes], ["Add-ons", o.addons], ["Fee", o.quoted_fee != null ? "$" + Number(o.quoted_fee).toFixed(2) : ""]];
    $("#dKv").innerHTML = rows.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    const pk = documents.filter((d) => d.kind !== "scanback"), sc = documents.filter((d) => d.kind === "scanback");
    const fileRow = (d, label) => `<div class="file"><span>${d.purged_at ? esc(d.filename) + ' <small style="color:var(--muted)">(deleted per retention policy)</small>' : `<a href="/api/client/booking-documents/${d.id}" target="_blank" rel="noopener">${esc(d.filename)}</a>`} <small style="color:var(--muted)">${label}</small></span>
      ${d.uploaded_by === "client" && !d.downloaded_at && !d.purged_at ? `<button class="linkbtn" data-del="${d.id}">Remove</button>` : d.downloaded_at ? '<small style="color:var(--ok)">Notary downloaded</small>' : ""}</div>`;
    $("#dFiles").innerHTML = (pk.length ? pk.map((d) => fileRow(d, "Closing package")).join("") : '<p style="color:var(--ink-2);font-size:.92rem">No closing package uploaded yet.</p>')
      + (sc.length ? '<p class="sub" style="margin-top:10px">Approved scanbacks</p>' + sc.map((d) => fileRow(d, "Scanback")).join("") : "");
    $$("#dFiles [data-del]").forEach((b) => b.addEventListener("click", async () => {
      try { await api("/api/client/booking-documents/" + b.dataset.del, { method: "DELETE" }); openOrder(id); } catch (e) { msg($("#dMsg"), e.message, "err"); }
    }));
    $("#drop").hidden = ["completed", "canceled", "no_show"].includes(o.status);
    $("#dTimeline").innerHTML = events.map((e) => `<li><time>${esc(when(e.at).replace(/, \d{4}/, ""))}</time><span>${esc(e.text)}</span></li>`).join("");
    $("#dCancelBox").hidden = !o.can_cancel;
    msg($("#dMsg"), ""); msg($("#dCancelMsg"), "");
  }
  function showTabNoLoad(t, parent = "orders") {
    $$("#tabs button[data-tab]").forEach((b) => (b.dataset.tab === parent ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    $$("section[data-tab]").forEach((s) => (s.hidden = s.dataset.tab !== t));
    scrollTo(0, 0);
  }

  async function uploadFiles(files, orderId, m) {
    for (const f of files) {
      if (f.size > 50 * 1024 * 1024) { msg(m, `${f.name} is over 50 MB.`, "err"); return false; }
      msg(m, `Uploading ${f.name}…`, "ok");
      try { await api(`/api/client/orders/${orderId}/documents?filename=${encodeURIComponent(f.name)}`, { method: "POST", raw: f, type: f.type || "application/octet-stream" }); }
      catch (e) { msg(m, `${f.name}: ${e.message}`, "err"); return false; }
    }
    return true;
  }
  $("#dUpload").addEventListener("change", async (e) => { if (await uploadFiles(e.target.files, current.id, $("#dMsg"))) { await openOrder(current.id); msg($("#dMsg"), "Uploaded. The notary has been notified.", "ok"); } e.target.value = ""; });
  const drop = $("#drop");
  ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", async (e) => { if (await uploadFiles(e.dataTransfer.files, current.id, $("#dMsg"))) { await openOrder(current.id); msg($("#dMsg"), "Uploaded. The notary has been notified.", "ok"); } });
  $("#dCancel").addEventListener("click", async () => {
    const b = $("#dCancel");
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Click again to cancel this order"; return; }
    try { await api(`/api/client/orders/${current.id}/cancel`, { method: "POST", body: { reason: $("#dReason").value } }); b.dataset.confirm = ""; b.textContent = "Cancel Order"; openOrder(current.id); }
    catch (e) { msg($("#dCancelMsg"), e.message, "err"); }
  });

  /* ---------- new order ---------- */
  const svc = () => $('input[name="nsvc"]:checked').value;
  let addonCatalog = null;
  async function renderClientAddons(s) {
    if (!addonCatalog) { try { addonCatalog = (await fetch("/api/config").then((r) => r.json())).addons || []; } catch { addonCatalog = []; } }
    const keep = {};
    $$("[data-naddon]").forEach((el) => { const q = el.type === "checkbox" ? (el.checked ? 1 : 0) : Number(el.value) || 0; if (q) keep[el.dataset.naddon] = q; });
    const items = addonCatalog.filter((a) => a.services.includes(s));
    $("#n-addons-wrap").hidden = !items.length;
    $("#n-addons").innerHTML = items.map((a) => a.max > 1
      ? `<div class="addon-row"><label for="na-${a.id}"><b>${esc(a.label)}</b><span class="addon-note">${esc(a.note || "")}</span></label><select id="na-${a.id}" data-naddon="${a.id}">${Array.from({ length: a.max + 1 }, (_, i) => `<option value="${i}" ${i === (keep[a.id] || 0) ? "selected" : ""}>${i === 0 ? "None" : `${i} × $${a.price.toFixed(2)}`}</option>`).join("")}</select></div>`
      : `<div class="addon-row"><label class="addon-check" for="na-${a.id}"><input type="checkbox" id="na-${a.id}" data-naddon="${a.id}" ${keep[a.id] ? "checked" : ""}><span><b>${esc(a.label)}</b><span class="addon-note">${esc(a.note || "")}</span></span></label><span class="addon-price">+$${a.price.toFixed(2)}</span></div>`).join("");
  }
  const clientAddons = () => { const o = {}; $$("[data-naddon]").forEach((el) => { const q = el.type === "checkbox" ? (el.checked ? 1 : 0) : Number(el.value) || 0; if (q) o[el.dataset.naddon] = q; }); return o; };
  function prepNew() {
    const s = svc();
    const sel = $("#n-cat"), prev = sel.value;
    sel.innerHTML = CATS[s].map((c) => `<option>${c}</option>`).join("");
    if (CATS[s].includes(prev)) sel.value = prev;
    $$(".nm").forEach((e) => (e.hidden = s !== "mobile"));
    $$(".nr").forEach((e) => (e.hidden = s === "mobile"));
    $$(".nrin").forEach((e) => (e.hidden = s !== "rin"));
    renderClientAddons(s);
    if (!$("#n-date").value) {
      const d = new Date(Date.now() + 864e5);
      $("#n-date").value = new Intl.DateTimeFormat("en-CA", { timeZone: me?.timezone || browserTz }).format(d);
    }
    loadTimes();
  }
  $$('input[name="nsvc"]').forEach((r) => r.addEventListener("change", prepNew));
  $("#n-date").addEventListener("change", loadTimes);
  async function loadTimes() {
    const sel = $("#n-time");
    const d = $("#n-date").value;
    $("#tzLbl").textContent = `(${new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName").value})`;
    if (!d) return;
    sel.innerHTML = "<option>Loading…</option>";
    const { slots } = await fetch(`/api/availability?service=${svc()}&date=${d}`).then((r) => r.json());
    sel.innerHTML = slots.length ? slots.map((s) => `<option value="${s.start}">${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(s.start))}</option>`).join("") : '<option value="">No open times that day. Try another date or call the desk.</option>';
  }
  $("#newForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = $("#nMsg"), btn = e.target.querySelector("button[type=submit]");
    const v = (id) => $(id).value.trim();
    if (!v("#n-time")) return msg(m, "Pick an open time.", "err");
    btn.disabled = true;
    msg(m, "Placing order…", "ok");
    try {
      const s = svc();
      const { order } = await api("/api/client/orders", { method: "POST", body: {
        service: s, category: v("#n-cat"), signers: v("#n-signers"), start: v("#n-time"), tz: browserTz,
        signerNames: v("#n-snames"), contactPhone: v("#n-phone"), signerEmail: v("#n-email"), fileNumber: v("#n-file"),
        address: v("#n-addr"), city: v("#n-city"), state: v("#n-state").toUpperCase(), zip: v("#n-zip"),
        docsDelivery: s === "mobile" ? v("#n-docs") : "", signerLocation: s === "mobile" ? "" : v("#n-sloc"), mailingAddress: s === "rin" ? v("#n-mail") : "",
        notes: v("#n-notes"), inUS: true, addons: clientAddons(),
      } });
      const files = $("#n-pkg").files;
      if (files.length) await uploadFiles(files, order.id, m);
      e.target.reset();
      $("#n-date").value = "";
      await openOrder(order.id);
      msg($("#dMsg"), `Order ${order.ref} placed. We're assigning a notary now.`, "ok");
    } catch (err) {
      msg(m, err.fields ? Object.values(err.fields).join(" ") : err.message, "err");
    } finally { btn.disabled = false; }
  });

  /* ---------- service requests ---------- */
  const RST = { new: ["Received", "p-info"], quoted: ["Quoted", "p-info"], in_progress: ["In progress", "p-ok"], completed: ["Completed", "p-ok"], canceled: ["Canceled", "p-warn"] };
  let reqs = [], rFilter = "open", curReq = null, reqTypes = null;
  const reqOpen = (r) => ["new", "quoted", "in_progress"].includes(r.status);
  $$("#rFilter button").forEach((b) => b.addEventListener("click", () => { rFilter = b.dataset.f; $$("#rFilter button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); renderReqs(); }));
  $("#rq").addEventListener("input", renderReqs);
  async function loadRequests() { reqs = (await api("/api/client/requests")).requests; renderReqs(); }
  const day = (iso) => iso ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso.length === 10 ? iso + "T12:00:00" : iso)) : "";
  function renderReqs() {
    const q = $("#rq").value.trim().toLowerCase();
    let list = reqs.filter((r) => (rFilter === "all" ? true : rFilter === "open" ? reqOpen(r) : !reqOpen(r)));
    if (q) list = list.filter((r) => [r.ref, r.client_ref, r.summary, r.type_label].join(" ").toLowerCase().includes(q));
    $("#reqList").innerHTML = list.length ? list.map((r) => `<button class="orow" data-rid="${r.id}">
        <span class="when"><b>${esc(day(r.created_at))}</b><small>${r.due_date ? "Due " + esc(day(r.due_date)) : "No due date"}</small></span>
        <span><b>${esc(r.summary || r.type_label)}</b><small>${esc(r.ref)}${r.client_ref ? " · File " + esc(r.client_ref) : ""} · ${esc(r.type_label)}</small></span>
        <span class="hide-sm"><b>${r.attempt_count ? r.attempt_count + " attempt" + (r.attempt_count > 1 ? "s" : "") : "—"}</b><small>${r.last_result ? "Last: " + esc(r.last_result) : ""}</small></span>
        <span class="hide-sm"><b>${r.fee != null ? "$" + Number(r.fee).toFixed(2) : "Quote pending"}</b></span>
        <span class="pills">${pill(RST[r.status] || [r.status, "p-info"])}</span></button>`).join("")
      : `<div class="empty">${rFilter === "open" ? "No open requests." : "Nothing here yet."} <button class="linkbtn" style="color:var(--brass-ink)" data-go="newreq">Send a request</button></div>`;
    $$("[data-rid]").forEach((b) => b.addEventListener("click", () => openReq(Number(b.dataset.rid))));
  }
  async function openReq(id) {
    const d = await api("/api/client/requests/" + id);
    const r = d.request; curReq = r;
    history.replaceState(null, "", "/client/#request-" + id);
    showTabNoLoad("reqdetail", "requests");
    $("#rTitle").textContent = `${r.summary || r.type_label} · ${r.type_label}`;
    $("#rStatus").innerHTML = pill(RST[r.status] || [r.status, "p-info"]);
    const rows = [["Request", r.ref], ["Your file #", r.client_ref], ["Service", r.type_label], ...d.details.map((x) => [x.label, x.value]), ["Needed by", r.due_date ? day(r.due_date) : ""], ["Instructions", r.notes], ["Price", r.fee != null ? "$" + Number(r.fee).toFixed(2) : "The desk will confirm the price"]];
    $("#rKv").innerHTML = rows.filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
    $("#rFiles").innerHTML = d.documents.length ? d.documents.map((x) => `<div class="file"><span><a href="/api/client/request-documents/${x.id}" target="_blank" rel="noopener">${esc(x.filename)}</a> <small style="color:var(--muted)">${esc(x.label)}</small></span></div>`).join("")
      : '<p style="color:var(--ink-2);font-size:.92rem">No documents yet.</p>';
    $("#rDrop").hidden = !d.can_upload;
    const showAtt = r.type === "process_serve" || r.type === "inspection" || d.attempts.length;
    $("#rAttBox").hidden = !showAtt;
    $("#rAttempts").innerHTML = d.attempts.length ? d.attempts.map((a) => `<li><time>${esc(when(a.at).replace(/, \d{4}/, ""))}</time><span><b>${esc(a.result_label)}</b>${a.served_to ? " · " + esc(a.served_to) : ""}${a.description ? `<br><span style="color:var(--ink-2)">${esc(a.description)}</span>` : ""}</span></li>`).join("")
      : '<li><span style="color:var(--ink-2)">No attempts yet. You\'ll get an email as soon as one is logged.</span></li>';
    $("#rTimeline").innerHTML = d.events.map((e) => `<li><time>${esc(when(e.at).replace(/, \d{4}/, ""))}</time><span>${esc(e.text)}</span></li>`).join("");
    $("#rCancelBox").hidden = !r.can_cancel;
    msg($("#rMsg"), ""); msg($("#rCancelMsg"), "");
  }
  async function uploadReqFiles(files, id, m) {
    for (const f of files) {
      if (f.size > 50 * 1024 * 1024) { msg(m, `${f.name} is over 50 MB.`, "err"); return false; }
      msg(m, `Uploading ${f.name}…`, "ok");
      try { await api(`/api/client/requests/${id}/documents?filename=${encodeURIComponent(f.name)}`, { method: "POST", raw: f, type: f.type || "application/octet-stream" }); }
      catch (e) { msg(m, `${f.name}: ${e.message}`, "err"); return false; }
    }
    return true;
  }
  $("#rUpload").addEventListener("change", async (e) => { if (await uploadReqFiles(e.target.files, curReq.id, $("#rMsg"))) { await openReq(curReq.id); msg($("#rMsg"), "Uploaded. The desk has been notified.", "ok"); } e.target.value = ""; });
  const rDrop = $("#rDrop");
  ["dragenter", "dragover"].forEach((ev) => rDrop.addEventListener(ev, (e) => { e.preventDefault(); rDrop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => rDrop.addEventListener(ev, (e) => { e.preventDefault(); rDrop.classList.remove("over"); }));
  rDrop.addEventListener("drop", async (e) => { if (await uploadReqFiles(e.dataTransfer.files, curReq.id, $("#rMsg"))) { await openReq(curReq.id); msg($("#rMsg"), "Uploaded. The desk has been notified.", "ok"); } });
  $("#rCancel").addEventListener("click", async () => {
    const b = $("#rCancel");
    if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Click again to cancel this request"; return; }
    try { await api(`/api/client/requests/${curReq.id}/cancel`, { method: "POST", body: {} }); b.dataset.confirm = ""; b.textContent = "Cancel Request"; openReq(curReq.id); }
    catch (e) { msg($("#rCancelMsg"), e.message, "err"); }
  });

  async function prepNewReq() {
    if (!reqTypes) reqTypes = (await api("/api/client/request-types")).types;
    const sel = $("#q-type");
    if (!sel.options.length) {
      sel.innerHTML = Object.entries(reqTypes).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join("");
      sel.addEventListener("change", renderReqFields);
    }
    renderReqFields();
  }
  function renderReqFields() {
    const t = reqTypes[$("#q-type").value];
    $("#q-fields").innerHTML = t.fields.map((f) => {
      const id = "qf-" + f.key, lab = `<label for="${id}">${esc(f.label)}${f.required ? "" : ' <span class="opt">(optional)</span>'}</label>`;
      const ctl = f.options ? `<select id="${id}" data-qk="${f.key}">${f.options.map((o) => `<option>${esc(o)}</option>`).join("")}</select>`
        : f.textarea ? `<textarea id="${id}" data-qk="${f.key}" rows="2"></textarea>` : `<input id="${id}" data-qk="${f.key}">`;
      return `<div class="field${f.wide || f.textarea ? " full" : ""}">${lab}${ctl}</div>`;
    }).join("");
  }
  $("#reqForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = $("#qMsg"), btn = e.target.querySelector("button[type=submit]");
    const details = {}; $$("[data-qk]").forEach((el) => (details[el.dataset.qk] = el.value.trim()));
    btn.disabled = true; msg(m, "Sending…", "ok");
    try {
      const { request } = await api("/api/client/requests", { method: "POST", body: { type: $("#q-type").value, details, clientRef: $("#q-ref").value.trim(), dueDate: $("#q-due").value, contactPhone: $("#q-phone").value.trim(), notes: $("#q-notes").value.trim() } });
      const files = $("#q-files").files;
      if (files.length) await uploadReqFiles(files, request.id, m);
      e.target.reset(); renderReqFields();
      await openReq(request.id);
      msg($("#rMsg"), `Request ${request.ref} sent. The desk will confirm the price shortly.`, "ok");
    } catch (err) {
      msg(m, err.fields ? Object.values(err.fields).join(" ") : err.message, "err");
    } finally { btn.disabled = false; }
  });

  /* ---------- invoices ---------- */
  async function loadInvoices() {
    const { invoices } = await api("/api/client/invoices");
    const today = new Date().toISOString().slice(0, 10);
    const P = { open: ["Due", "p-warn"], paid: ["Paid", "p-ok"], void: ["Void", "p-info"] };
    $("#invRows").innerHTML = invoices.length ? invoices.map((i) => `<tr><td class="mono">${esc(i.number)}</td><td>${i.period_start ? esc(i.period_start) + " – " + esc(i.period_end) : "—"}</td>
      <td>${esc(i.due_date)}${i.status === "open" && i.due_date < today ? ' <span class="pill p-warn">Overdue</span>' : ""}</td><td>$${Number(i.amount).toFixed(2)}</td>
      <td>${pill(P[i.status] || [i.status, "p-info"])}</td>
      <td style="white-space:nowrap"><a class="btn btn-ghost btn-sm" href="/api/client/invoices/${i.id}/view" target="_blank" rel="noopener">View</a>${i.status === "open" && i.payment_url ? ` <a class="btn btn-primary btn-sm" href="${esc(i.payment_url)}" target="_blank" rel="noopener">Pay</a>` : ""}</td></tr>`).join("")
      : '<tr><td colspan="6" style="font-weight:400;color:var(--ink-2)">No invoices yet. We bill completed signings monthly.</td></tr>';
  }

  /* ---------- account ---------- */
  function renderAccount() {
    $("#aCompany").textContent = me.account.company;
    $("#aInstr").textContent = me.account.instructions || "None on file.";
    $("#aTeam").innerHTML = me.team.map((t) => `<li><time>${t.last_login_at ? "Active " + esc(t.last_login_at.slice(0, 10)) : "Invited"}</time><span>${esc(t.name)} · ${esc(t.email)}</span></li>`).join("");
    $("#aDesk").textContent = `${me.business.phone} · ${me.business.email}`;
  }

  window.addEventListener("hashchange", () => {
    const m = location.hash.match(/^#order-(\d+)$/); if (m && me) openOrder(Number(m[1])).catch(() => {});
    const r = location.hash.match(/^#request-(\d+)$/); if (r && me) openReq(Number(r[1])).catch(() => {});
  });
  // keep statuses fresh while the page is open
  setInterval(() => {
    if (!me || document.hidden) return;
    if (tab === "orders" && !$("section[data-tab=orders]").hidden) loadOrders().catch(() => {});
    if (current && !$("section[data-tab=detail]").hidden && !$("#dUpload").files.length) openOrder(current.id).catch(() => {});
    if (tab === "requests" && !$("section[data-tab=requests]").hidden) loadRequests().catch(() => {});
    if (curReq && !$("section[data-tab=reqdetail]").hidden) openReq(curReq.id).catch(() => {});
  }, 60000);

  /* ---------- start ---------- */
  (async function start() {
    const t = new URLSearchParams(location.search).get("t");
    if (t) {
      history.replaceState(null, "", "/client/" + location.hash);
      const r = await fetch("/api/client/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t }) });
      if (!r.ok) { showSignin((await r.json().catch(() => ({}))).error || "That link expired."); return; }
    }
    try { me = await api("/api/client/me"); } catch { return; }
    $("#signin").hidden = true; $("#tabs").hidden = false;
    $("#who").textContent = `${me.account.company} · ${me.user.name}`;
    renderAccount();
    const m = location.hash.match(/^#order-(\d+)$/), rq = location.hash.match(/^#request-(\d+)$/);
    if (m) openOrder(Number(m[1])).catch(() => showTab("orders"));
    else if (rq) openReq(Number(rq[1])).catch(() => showTab("requests"));
    else if (location.hash === "#requests") showTab("requests");
    else showTab("orders");
  })();
})();
