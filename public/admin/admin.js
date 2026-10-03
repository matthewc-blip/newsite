/* MCC Solutions dispatch dashboard */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const STATUS_LABEL = { requested: "Requested", confirmed: "Confirmed", assigned: "Assigned", completed: "Completed", canceled: "Canceled", no_show: "No-show" };
  const SVC = { mobile: "MOBILE", ron: "RON", rin: "RIN" };
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let TZ = "America/New_York";
  let settings = null, notaries = [], view = "upcoming", openId = null;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: { "Content-Type": opts.raw ? opts.type : "application/json", "X-Requested-With": "mcc-admin" },
      body: opts.raw ? opts.raw : opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
    let j = {};
    try { j = await res.json(); } catch {}
    if (res.status === 401) { showLogin(); throw new Error(j.error || "Sign in again."); }
    if (!res.ok) throw Object.assign(new Error(j.error || "Request failed"), { fields: j.fields, code: j.code, data: j });
    return j;
  }

  /* ---------- time helpers (business time zone) ---------- */
  function tzOffset(date, tz) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(date / 1000) * 1000;
  }
  function localToUtc(value, tz) { // "2026-10-06T18:30" in tz -> ISO
    const [d, t] = value.split("T");
    const [y, m, dd] = d.split("-").map(Number);
    const [h, mi] = t.split(":").map(Number);
    const guess = Date.UTC(y, m - 1, dd, h, mi);
    let utc = guess - tzOffset(new Date(guess), tz);
    const off2 = tzOffset(new Date(utc), tz);
    if (guess - off2 !== utc) utc = guess - off2;
    return new Date(utc).toISOString();
  }
  function utcToLocalInput(iso, tz) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  const dKey = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  const tFmt = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  const dFmt = (iso) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "short", day: "numeric" }).format(new Date(iso));
  const full = (iso, tz = TZ) => new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  const shortTz = () => new Intl.DateTimeFormat("en-US", { timeZone: TZ, timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName").value;
  function startOfDayUtc(offsetDays = 0) {
    const today = dKey(new Date().toISOString());
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
    return localToUtc(dt + "T00:00", TZ);
  }

  /* ---------- auth ---------- */
  function showLogin() { $("#login").hidden = false; $("#app").hidden = true; setTimeout(() => $("#pw").focus(), 50); }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#loginMsg").textContent = "";
    try {
      await api("/api/admin/login", { method: "POST", body: { password: $("#pw").value } });
      $("#pw").value = "";
      start();
    } catch (err) { $("#loginMsg").textContent = err.message; }
  });
  $("#logout").addEventListener("click", async () => { await api("/api/admin/logout", { method: "POST" }).catch(() => {}); showLogin(); });

  async function start() {
    let me;
    try { me = await api("/api/admin/me"); } catch { return; }
    $("#login").hidden = true; $("#app").hidden = false;
    $("#emailWarn").hidden = me.emailEnabled;
    settings = (await api("/api/admin/settings")).settings;
    TZ = settings.business.timezone;
    $("#tzLabel").textContent = `Times in ${shortTz()} · ${settings.business.name}`;
    $$(".bizTz").forEach((e) => (e.textContent = shortTz()));
    await loadNotaries();
    refresh();
  }

  /* ---------- tabs ---------- */
  $$("#tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  function showTab(t) {
    $$("#tabs button").forEach((b) => (b.dataset.tab === t ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    $$("section.tab").forEach((s) => (s.hidden = s.dataset.tab !== t));
    if (t === "board") refresh();
    if (t === "notaries") loadNotaries().then(renderNotaries);
    if (t === "applications") loadApps();
    if (t === "messages") loadMsgs();
    if (t === "settings") renderSettings();
    if (t === "payouts") loadPayouts();
    if (t === "clients") loadClients();
    if (t === "billing") loadBilling();
    if (t === "requests") loadRequests();
  }

  /* ---------- board ---------- */
  async function loadStats() {
    const s = await api("/api/admin/stats");
    const tiles = [
      ["today", s.today, "Signings today", false],
      ["requested", s.needsAction, "Need confirming", s.needsAction > 0],
      ["unassigned", s.unassigned, "No notary yet", s.unassigned > 0],
      ["offers", s.openOffers, "Offers awaiting notary", false],
      ["cred", s.credentialIssues, "Notaries needing docs", s.credentialIssues > 0],
      ["payouts", "$" + Math.round(s.unpaidPayouts || 0), "Owed to notaries", false],
      ["unfilled", s.unfilled, "Need a notary (auto-dispatch stopped)", s.unfilled > 0],
      ["scanbacks", s.scanbacksToReview, "Scanbacks to review", s.scanbacksToReview > 0],
    ];
    $("#tiles").innerHTML = tiles.map(([k, n, l, alert]) => `<button class="tile${alert ? " alert" : ""}" data-k="${k}"><b>${n}</b><span>${l}</span></button>`).join("");
    $$("#tiles .tile").forEach((t) => t.addEventListener("click", () => {
      const k = t.dataset.k;
      if (k === "cred") return showTab("notaries");
      if (k === "payouts") return showTab("payouts");
      if (k === "offers") return setView("upcoming");
      if (k === "unfilled" || k === "scanbacks") return setView(k);
      setView(k === "unassigned" ? "upcoming" : k);
      if (k === "unassigned") $("#search").value = "";
    }));
    const bc = $("#badgeCred"); bc.hidden = !s.credentialIssues; bc.textContent = s.credentialIssues;
    const ba = $("#badgeApps"), bm = $("#badgeMsgs");
    ba.hidden = !s.newApplications; ba.textContent = s.newApplications;
    bm.hidden = !s.openMessages; bm.textContent = s.openMessages;
    const br = $("#badgeReq"); br.hidden = !s.newRequests; br.textContent = s.newRequests;
  }

  function setView(v) {
    view = v;
    $$("#viewSeg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === v)));
    loadBoard();
  }
  $$("#viewSeg button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
  $("#svcFilter").addEventListener("change", loadBoard);
  let st;
  $("#search").addEventListener("input", () => { clearTimeout(st); st = setTimeout(loadBoard, 250); });

  async function loadBoard() {
    const q = new URLSearchParams();
    const now = new Date().toISOString();
    if (view === "upcoming") { q.set("from", startOfDayUtc(0)); q.set("active", "1"); }
    if (view === "today") { q.set("from", startOfDayUtc(0)); q.set("to", startOfDayUtc(1)); }
    if (view === "requested") { q.set("from", now); q.set("status", "requested"); }
    if (view === "past") { q.set("to", now); q.set("order", "desc"); }
    if (view === "canceled") { q.set("status", "canceled"); q.set("order", "desc"); }
    if (view === "unfilled") { q.set("from", now); q.set("unfilled", "1"); }
    if (view === "scanbacks") { q.set("scanbacks", "pending"); }
    if ($("#svcFilter").value) q.set("service", $("#svcFilter").value);
    if ($("#search").value.trim()) q.set("q", $("#search").value.trim());
    const { bookings } = await api("/api/admin/bookings?" + q);
    const box = $("#board");
    if (!bookings.length) {
      box.innerHTML = `<div class="empty-state"><h3>No bookings here</h3><p style="margin-top:6px">${view === "upcoming" ? "New online bookings appear here as soon as customers submit them. Use New Booking for phone orders." : "Nothing matches this view."}</p></div>`;
      return;
    }
    const groups = new Map();
    bookings.forEach((b) => { const k = dKey(b.start_utc); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); });
    box.innerHTML = [...groups.entries()].map(([k, list]) => `
      <div class="day-group"><div class="day-head"><b>${esc(dFmt(list[0].start_utc))}</b>${list.length} booking${list.length > 1 ? "s" : ""}</div>
      ${list.map(row).join("")}</div>`).join("");
    $$(".brow", box).forEach((r) => r.addEventListener("click", () => openBooking(Number(r.dataset.id))));
  }

  function row(b) {
    const loc = b.service === "mobile" ? `${b.city || ""}${b.state ? ", " + b.state : ""} ${b.zip || ""}` : b.signer_location || "";
    return `<button class="brow" data-id="${b.id}">
      <span class="stripe s-${b.status}"></span>
      <span class="time">${esc(tFmt(b.start_utc))}</span>
      <span class="svcpill svc">${SVC[b.service]}</span>
      <span class="main"><b>${esc(b.category)} · ${b.signers} signer${b.signers > 1 ? "s" : ""}</b><small>${esc(b.ref)} · ${esc(b.contact_name)}${b.client_company ? " · " + esc(b.client_company) : b.company ? " · " + esc(b.company) : ""}${b.scanback_status ? ` · <span style="color:var(--${b.scanback_status === "approved" ? "ok" : "warn"})">scanbacks ${b.scanback_status}</span>` : ""}</small></span>
      <span class="sub loc"><span>${esc(loc)}</span><small>${esc(b.contact_phone)}</small></span>
      <span class="sub not">${b.notary_name ? `<span>${esc(b.notary_name)}</span><small>${b.notary_status === "offered" ? (b.auto_dispatch ? "Auto-offer · waiting" : "Offer sent · waiting") : b.notary_status === "accepted" ? "Accepted" : ""}</small>` : `<span class="unassigned">${["canceled", "completed", "no_show"].includes(b.status) ? "—" : b.notary_status === "unfilled" ? "No notary found" : b.notary_status === "declined" || b.notary_status === "expired" ? "Finding next notary" : "Unassigned"}</span>`}</span>
      <span><span class="pill st-${b.status}">${STATUS_LABEL[b.status]}</span></span>
    </button>`;
  }

  function refresh() { loadStats(); loadBoard(); }
  setInterval(() => { if (!$("#app").hidden && !$("section[data-tab=board]").hidden && $("#drawer").hidden) refresh(); }, 60000);

  /* ---------- booking drawer ---------- */
  function openDrawer(el) { $("#scrim").hidden = false; el.hidden = false; }
  function closeDrawers() { $("#scrim").hidden = true; $("#drawer").hidden = true; $("#newDrawer").hidden = true; $("#notaryDrawer").hidden = true; openId = null; }
  $("#scrim").addEventListener("click", closeDrawers);
  $("#dClose").addEventListener("click", closeDrawers);
  $("#nbClose").addEventListener("click", closeDrawers);
  $("#ndClose").addEventListener("click", closeDrawers);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawers());

  async function openBooking(id) {
    openId = id;
    await loadNotaries();
    const [{ booking: b, events, manageUrl, invoice: binv, cardsOn, margin: mg, witnesses: wit, feeCatalog, notaryFeeShare }, { documents: bdocs }, cand, cl] = await Promise.all([
      api("/api/admin/bookings/" + id), api(`/api/admin/bookings/${id}/documents`), api(`/api/admin/bookings/${id}/candidates`), api("/api/admin/clients"),
    ]);
    $("#dSvc").textContent = `${SVC[b.service]} · ${b.ref}`;
    $("#dTitle").textContent = b.category;
    const eligible = notaries.filter((n) => n.active && (n.role || "notary") === "notary" && (b.service === "ron" ? n.ron : b.service === "rin" ? n.rin : true));
    const stateMatch = (n) => b.service !== "mobile" || !n.states || n.states.split(",").includes(b.state);
    const rank = (n) => (n.compliance.ready ? 2 : 0) + (stateMatch(n) ? 1 : 0);
    const opts = eligible.sort((a, c) => rank(c) - rank(a)).map((n) => `<option value="${n.id}" ${n.id === b.notary_id ? "selected" : ""}>${n.compliance.ready ? "✓" : "⚠"} ${esc(n.name)}${stateMatch(n) ? "" : " (other state)"}${n.compliance.ready ? "" : " · onboarding incomplete"}</option>`).join("");
    const nStatus = b.notary_id ? (b.notary_status === "offered" ? `<span class="pill p-warn">Offer sent · waiting for answer</span>` : b.notary_status === "accepted" ? `<span class="pill p-ok">Accepted${b.notary_responded_at ? " " + esc(full(b.notary_responded_at).replace(/, \d{4}/, "")) : ""}</span>` : "") : b.notary_status === "declined" ? `<span class="pill p-warn">Last notary declined</span>` : b.notary_status === "expired" ? `<span class="pill p-warn">Last offer expired</span>` : b.notary_status === "unfilled" ? `<span class="pill p-warn">Auto-dispatch couldn't find a notary</span>` : "";
    const active = ["requested", "confirmed", "assigned"].includes(b.status);
    const pk = bdocs.filter((d) => d.kind !== "scanback");
    const sc = bdocs.filter((d) => d.kind === "scanback" && d.review_status !== "superseded");
    const SCP = { pending: '<span class="pill p-info">Review</span>', approved: '<span class="pill p-ok">Approved</span>', rejected: '<span class="pill p-warn">Rejected</span>' };
    const fileLink = (d) => d.purged_at ? `${esc(d.filename)} <small>(deleted, retention)</small>` : `<a href="/api/admin/booking-documents/${d.id}" target="_blank" rel="noopener">${esc(d.filename)}</a>`;
    const docsHtml = `<div class="dsec"><h4>Closing documents</h4><div class="files">
        ${pk.length ? pk.map((d) => `<div class="frow"><span>${fileLink(d)} <small>· ${(d.size_bytes / 1048576).toFixed(1)} MB · from ${esc(d.uploaded_by_name || d.uploaded_by)}${d.downloaded_at ? " · notary downloaded" : ""}</small></span><span class="acts"><button class="linkbtn" data-deldoc="${d.id}">Remove</button></span></div>`).join("") : `<p style="font-size:.88rem;color:var(--muted)">No package uploaded.${b.docs_delivery ? " Docs: " + esc(b.docs_delivery) : ""}</p>`}
      </div><label class="btn btn-ghost btn-sm" style="cursor:pointer;margin-top:8px">Upload package<input type="file" id="dPkg" accept="application/pdf,image/*" multiple hidden></label></div>
      <div class="dsec"><h4>Scanbacks ${b.scanback_status ? SCP[b.scanback_status] || "" : ""}</h4><div class="files">
        ${sc.length ? sc.map((d) => `<div class="frow"><span>${fileLink(d)} <small>· ${esc(d.uploaded_by_name || d.uploaded_by)} · ${esc(full(d.created_at).replace(/, \d{4}/, ""))}</small></span><span class="acts">${SCP[d.review_status] || ""}${d.review_status === "pending" ? `<button class="btn btn-ghost btn-sm" data-ok="${d.id}">Approve</button>` : ""}</span>
          ${d.review_status === "pending" ? `<div class="full inline"><input placeholder="What needs fixing? (sent to the notary)" id="rj-${d.id}"><button class="btn btn-ghost btn-sm" data-rj="${d.id}">Reject</button></div>` : d.review_note ? `<small class="full">Note: ${esc(d.review_note)}</small>` : ""}</div>`).join("") : '<p style="font-size:.88rem;color:var(--muted)">None uploaded yet.</p>'}
      </div>${sc.some((d) => d.review_status === "pending") ? '<button class="btn btn-primary btn-sm" id="dApproveAll" style="margin-top:8px">Approve All &amp; Notify Client</button>' : ""}</div>`;
    const dispatchHtml = `<div class="dsec"><h4>Auto-dispatch ${b.auto_dispatch ? '<span class="pill p-ok">On</span>' : ""}</h4>
      ${active && b.notary_status !== "accepted" ? `<button class="btn btn-ghost btn-sm" id="dAuto" type="button">${b.auto_dispatch ? "Restart auto-dispatch" : "Auto-dispatch to nearest ready notary"}</button>` : ""}
      <div class="cand">${cand.eligible.length ? `<span><b>Can take it:</b> ${cand.eligible.map((n) => `${esc(n.name)}${n.miles != null ? ` (${n.miles} mi)` : ""}`).join(", ")}</span>` : "<span><b>No eligible notaries right now.</b></span>"}
        ${cand.skipped.length ? `<details><summary style="cursor:pointer;font-size:.86rem;padding:4px 0">Why others are skipped (${cand.skipped.length})</summary>${cand.skipped.map((n) => `<div>${esc(n.name)}: ${esc(n.why.join(", "))}</div>`).join("")}</details>` : ""}</div></div>`;
    const clientSel = `<div class="inline" style="margin-top:10px"><select id="dClient" aria-label="Client account"><option value="">No client account</option>${cl.accounts.map((a) => `<option value="${a.id}" ${a.id === b.client_account_id ? "selected" : ""}>${esc(a.company)}</option>`).join("")}</select><button class="btn btn-ghost btn-sm" id="dClientSave" type="button">Link</button></div>`;
    const loc = b.service === "mobile" ? [b.address, b.city, b.state, b.zip].filter(Boolean).join(", ") : b.signer_location;
    const kv = (pairs) => `<dl class="kvs">${pairs.filter(([, v]) => v !== "" && v != null).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
    $("#dBody").innerHTML = `
      <div class="dsec"><h4>Status</h4><div class="status-btns">${Object.entries(STATUS_LABEL).map(([k, l]) => `<button type="button" data-status="${k}" aria-pressed="${k === b.status}">${l}</button>`).join("")}</div>
        <label class="switch" style="margin-top:10px"><input type="checkbox" id="dNotify" checked> Email the customer about status changes</label></div>
      <div class="dsec"><h4>Appointment</h4>${kv([
        ["When", full(b.start_utc)],
        ["Customer sees", b.customer_tz && b.customer_tz !== TZ ? full(b.start_utc, b.customer_tz) : ""],
        ["Signers", b.signers], ["Signer names", b.signer_names],
        [b.service === "mobile" ? "Location" : "Signer at", loc],
        ["In U.S.", b.service === "mobile" ? "" : b.in_us === 0 ? "No" : "Yes"],
        ["Mail docs to", b.mailing_address], ["Loan docs", b.docs_delivery],
        ["Add-ons", (b.addons || []).filter((a) => a.kind !== "fee").map((a) => `${a.label}${a.qty > 1 ? " ×" + a.qty : ""} ($${(a.qty * a.price).toFixed(2)})`).join(", ")],
        ["Notes", b.notes], ["Source", b.source === "desk" ? "Entered by desk" : b.source === "client" ? "Client portal" : "Online booking"],
      ])}</div>
      <div class="dsec"><h4>Contact</h4>${kv([["Name", b.contact_name], ["Phone", b.contact_phone], ["Email", b.contact_email], ["Company", b.company], ["File #", b.file_number]])}${clientSel}</div>
      <div class="dsec"><h4>Notary</h4>${nStatus ? `<p style="margin-bottom:10px">${nStatus}</p>` : ""}
        <div class="inline"><select id="dNotary" aria-label="Notary"><option value="">Unassigned</option>${opts}</select><input id="dNFee" type="number" min="0" step="1" placeholder="Notary fee $" value="${b.notary_fee ?? ""}" style="max-width:150px"></div>
        <label class="switch" style="margin-top:8px"><input type="checkbox" id="dDirect"> Skip the offer (already confirmed with the notary by phone)</label>
        <div class="inline" style="margin-top:10px"><button class="btn btn-primary btn-sm" id="dAssign" type="button">Send Offer</button>${b.notary_status === "offered" ? '<button class="btn btn-ghost btn-sm" id="dResend" type="button">Resend Offer</button>' : ""}<button class="btn btn-ghost btn-sm" id="dFeeOnly" type="button">Save Fee Only</button></div>
        ${b.return_tracking ? `<p style="margin-top:10px;font-size:.9rem">Return tracking: <b class="mono">${esc(b.return_tracking)}</b></p>` : ""}
        ${b.notary_paid_at ? `<p style="margin-top:6px;font-size:.9rem"><span class="pill p-ok">Notary paid ${esc(b.notary_paid_at.slice(0, 10))}</span></p>` : ""}
        ${eligible.length ? "" : `<p style="color:var(--muted);font-size:.86rem;margin-top:8px">No active ${b.service === "mobile" ? "" : SVC[b.service] + "-capable "}notaries on the roster yet. Add them in the Notaries tab.</p>`}</div>
      ${docsHtml}
      ${dispatchHtml}
      ${(() => {
        const want = (b.addons || []).filter((a) => a.id === "witness").reduce((n, a) => n + a.qty, 0);
        const list = (wit && wit.list) || [], pool = (wit && wit.pool) || [];
        if (!want && !list.length) return "";
        const open = ["requested", "confirmed", "assigned"].includes(b.status);
        const st = { offered: ["p-warn", "Asked · waiting"], accepted: ["p-ok", "Accepted"], declined: ["p-info", "Declined"] };
        const avail = pool.filter((p) => !list.some((l) => l.witness_id === p.id && l.status !== "declined"));
        return `<div class="dsec"><h4>Witnesses${want ? ` · ${want} needed` : ""}</h4>
          ${list.length ? `<ul class="log" style="margin-bottom:10px">${list.map((w) => `<li style="grid-template-columns:1fr auto"><span>${esc(w.name)} <span class="pill ${(st[w.status] || [])[0] || "p-info"}">${(st[w.status] || [])[1] || esc(w.status)}</span>${w.fee != null ? ` · $${Number(w.fee).toFixed(2)}` : ""}${w.phone ? ` · ${esc(w.phone)}` : ""}</span>${open && !w.paid_at ? `<button class="linkbtn" data-wrm="${w.id}">Remove</button>` : ""}</li>`).join("")}</ul>` : ""}
          ${open ? (pool.length ? `<div class="inline"><select id="dWit" aria-label="Witness">${avail.map((p) => `<option value="${p.id}">${p.ready ? "✓" : "⚠"} ${esc(p.name)}${p.home_zip ? " · " + esc(p.home_zip) : ""}${p.ready ? "" : " · onboarding incomplete"}</option>`).join("")}</select>
            <input id="dWitFee" type="number" min="0" step="0.01" placeholder="Witness fee $" style="max-width:130px"><button class="btn btn-ghost btn-sm" id="dWitAsk" type="button" ${avail.length ? "" : "disabled"}>Ask witness</button></div>`
            : `<p style="font-size:.86rem;color:var(--muted)">No witnesses on the roster yet. Approve witness applications to add them.</p>`) : ""}
        </div>`;
      })()}
      <div class="dsec"><h4>Client fee</h4>
        <div class="inline"><input id="dFee" type="number" min="0" step="0.01" placeholder="${b.est_fee != null ? "Estimate $" + b.est_fee : "Total charged to client"}" value="${b.quoted_fee ?? ""}" ${b.invoice_id ? "disabled" : ""}>
          <input id="dNotarial" type="number" min="0" step="0.01" placeholder="${b.default_notarial != null ? "Notarial $" + b.default_notarial + " (" + esc(b.state) + " limit)" : "Notarial portion"}" value="${b.notarial_fee ?? ""}" ${b.invoice_id ? "disabled" : ""} title="Part of the client fee billed as the notarial fee">
          ${b.invoice_id ? "" : '<button class="btn btn-ghost btn-sm" id="dFeeSave" type="button">Save</button>'}</div>
        ${mg && !mg.unknown ? `<p style="margin-top:8px"><span class="pill ${mg.ok ? "p-ok" : "p-warn"}">Margin $${mg.kept.toFixed(2)} · ${mg.pct}%</span> <span style="font-size:.84rem;color:var(--muted)">${mg.ok ? `minimum ${mg.min}% · notary can be paid up to $${mg.maxNotaryFee.toFixed(2)}` : `below your ${mg.min}% minimum (override on file)`}</span></p>`
          : mg && mg.min > 0 ? `<p style="font-size:.84rem;color:var(--muted);margin-top:6px">Set the client fee and notary fee to see the margin (minimum ${mg.min}%).</p>` : ""}
        <p style="font-size:.84rem;color:var(--muted);margin-top:6px">Invoices list the notarial portion separately from the signing-service fee. Leave the notarial box empty to use the state default.</p>
        ${binv ? `<p style="margin-top:8px"><span class="pill ${binv.status === "paid" ? "p-ok" : binv.status === "void" ? "p-warn" : "p-info"}">Invoice ${esc(binv.number)} · ${esc(binv.status)}</span> <a href="/api/admin/billing/invoices/${binv.id}/view" target="_blank" rel="noopener" style="font-size:.86rem">View</a></p>`
          : b.status === "completed" ? `<button class="btn btn-ghost btn-sm" id="dInvoice" type="button" style="margin-top:8px">${b.client_account_id ? "Invoice this job now" : "Send invoice to customer"}</button>` : ""}</div>
      ${(() => {
        const fx = (b.addons || []).filter((a) => a.kind === "fee");
        const canceled = ["canceled", "no_show"].includes(b.status);
        const cancelTotal = fx.filter((a) => a.onCancel).reduce((s, a) => s + a.qty * a.price, 0);
        const locked = !!b.invoice_id;
        const cat = (feeCatalog || []).filter((f) => !fx.some((a) => a.id === f.id));
        return `<div class="dsec"><h4>Extra fees${fx.length ? ` · $${fx.reduce((s, a) => s + a.qty * a.price, 0).toFixed(2)}` : ""}</h4>
          ${fx.length ? `<div class="files" id="fxRows">${fx.map((a, i) => `<div class="frow fx-row" data-fxid="${esc(a.id)}" data-fxlabel="${esc(a.label)}" data-fxshare="${Number(a.share) || 0}" data-fxcancel="${a.onCancel ? 1 : ""}"><span>${esc(a.label)}${a.onCancel ? ' <small>(billable if canceled)</small>' : ""}</span><span class="acts">
              <input type="number" min="0" max="50" step="1" value="${a.qty}" data-fxqty aria-label="Quantity" style="max-width:64px" ${locked ? "disabled" : ""}>
              <input type="number" min="0" step="0.01" value="${a.price}" data-fxprice aria-label="Price" style="max-width:90px" ${locked ? "disabled" : ""}>
              ${locked ? "" : `<button class="linkbtn" data-fxrm="${i}" type="button">Remove</button>`}</span></div>`).join("")}</div>`
            : '<p style="font-size:.88rem;color:var(--muted)">No extra fees on this job.</p>'}
          ${locked ? '<p style="font-size:.84rem;color:var(--muted);margin-top:6px">Already invoiced. Void the invoice to change fees.</p>' : `<div class="inline" style="margin-top:10px"><select id="fxAdd" aria-label="Add a fee"><option value="">Add a fee…</option>${cat.map((f) => `<option value="${esc(f.id)}">${esc(f.label)} · $${f.price.toFixed(2)}${f.unit ? " " + esc(f.unit) : ""}</option>`).join("")}<option value="custom">Custom fee…</option></select>
            <input id="fxQty" type="number" min="1" max="50" value="1" aria-label="Quantity" style="max-width:64px"><input id="fxCLabel" placeholder="Fee name" hidden><input id="fxCPrice" type="number" min="0" step="0.01" placeholder="$" hidden style="max-width:90px">
            <button class="btn btn-ghost btn-sm" id="fxAddBtn" type="button">Add</button><button class="btn btn-primary btn-sm" id="fxSave" type="button">Save fees</button></div>`}
          ${notaryFeeShare > 0 ? `<p style="font-size:.86rem;margin-top:8px">Suggested notary share of these fees: <b>$${notaryFeeShare.toFixed(2)}</b>${b.notary_id && !b.notary_paid_at && !locked ? ` <button class="linkbtn" id="fxShare" type="button">Add to notary pay</button>` : ""}</p>` : ""}
          ${canceled && !binv && cancelTotal > 0 ? `<div class="inline" style="margin-top:8px">${b.client_account_id || !b.stripe_payment_method_id ? `<button class="btn btn-primary btn-sm" id="fxBill" type="button">Invoice $${cancelTotal.toFixed(2)} in trip / cancel fees</button>` : `<button class="btn btn-primary btn-sm" id="fxCharge" type="button">Charge card $${cancelTotal.toFixed(2)} in trip / cancel fees</button>`}</div>` : ""}
          <p style="font-size:.84rem;color:var(--muted);margin-top:6px">Rush, after-hours, weekend and extra-signer fees are added automatically when a job is booked. Change prices in Settings → Extra fees.</p></div>`;
      })()}
      ${cardsOn && !b.client_account_id ? `<div class="dsec"><h4>Card payment</h4>${(() => {
        const price = b.quoted_fee ?? b.est_fee;
        if (!b.stripe_payment_method_id) return `<p style="color:var(--muted);font-size:.9rem">No card on file. Individual customers are asked to save one when they book.</p>
          <button class="btn btn-ghost btn-sm" id="dCardLink" type="button" style="margin-top:8px">Email card link to customer</button>`;
        const card = `<p><span class="pill p-ok">${esc((b.card_brand || "card").replace(/^./, (c) => c.toUpperCase()))} ending ${esc(b.card_last4 || "")}</span> <span style="font-size:.85rem;color:var(--muted)">saved ${esc(full(b.card_saved_at).replace(/, \d{4}/, ""))}</span></p>`;
        if (binv) return card + (binv.provider === "card" && binv.status === "paid" ? `<p style="font-size:.9rem;margin-top:6px">Paid by card · ${esc(binv.number)}</p>` : binv.error ? `<p class="form-msg" style="margin-top:6px">${esc(binv.error)}</p>` : "");
        return card + `<div class="inline" style="margin-top:8px">
            ${b.status === "completed" && price != null ? `<button class="btn btn-primary btn-sm" id="dCharge" type="button">Charge $${(Number(price) + Number(b.addons_total || 0)).toFixed(2)}</button>` : ""}
            <input id="dFeeAmt" type="number" min="0" step="0.01" placeholder="Fee $" style="max-width:110px">
            <input id="dFeeNote" placeholder="${b.status === "no_show" ? "No-show fee" : b.status === "canceled" ? "Cancellation fee" : "Fee description"}">
            <button class="btn btn-ghost btn-sm" id="dChargeFee" type="button">Charge fee</button></div>
          <p style="font-size:.84rem;color:var(--muted);margin-top:6px">${b.status === "completed" ? "" : "The service fee can be charged once the job is completed (automatically, if auto-charge is on). "}Use Charge fee for no-shows, late cancellations or extra trips.</p>`;
      })()}</div>` : ""}
      <div class="dsec"><h4>Reschedule</h4><div class="inline"><input id="dStart" type="datetime-local" aria-label="New date and time" value="${utcToLocalInput(b.start_utc, TZ)}"><button class="btn btn-ghost btn-sm" id="dMove" type="button">Move</button></div></div>
      <div class="dsec"><h4>Internal notes</h4><textarea id="dNotes" rows="3" placeholder="Only the desk sees this">${esc(b.internal_notes)}</textarea><button class="btn btn-ghost btn-sm" id="dNotesSave" type="button" style="margin-top:8px">Save Notes</button></div>
      <div class="dsec"><h4>Customer link</h4><div class="copyline"><input id="dLink" readonly value="${esc(location.origin + manageUrl)}"><button class="btn btn-ghost btn-sm" id="dCopy" type="button">Copy</button></div></div>
      <div class="dsec"><h4>History</h4><ul class="log">${events.map((e) => `<li><time>${esc(full(e.at).replace(/, \d{4}/, ""))}</time><span>${esc(e.text)}${e.actor ? ` · ${esc(e.actor)}` : ""}</span></li>`).join("")}</ul></div>
      <p class="form-msg" id="dMsg" role="status"></p>`;
    openDrawer($("#drawer"));

    const patch = async (body, okText) => {
      try { await api("/api/admin/bookings/" + id, { method: "PATCH", body }); await openBooking(id); $("#dMsg").className = "form-msg ok"; $("#dMsg").textContent = okText; loadBoard(); loadStats(); }
      catch (e) {
        if (e.code === "margin" && !body.override_margin && confirm(e.message + "\n\nSave anyway? The override is recorded in the booking history.")) return patch({ ...body, override_margin: true }, okText + " (margin override)");
        $("#dMsg").className = "form-msg"; $("#dMsg").textContent = e.message;
      }
    };
    $$(".status-btns button", $("#dBody")).forEach((btn) => btn.addEventListener("click", () => patch({ status: btn.dataset.status, notify: $("#dNotify").checked }, "Status updated.")));
    const syncAssignLabel = () => {
      const same = Number($("#dNotary").value) === b.notary_id && b.notary_status === "accepted";
      $("#dAssign").disabled = same;
      $("#dAssign").textContent = same ? "Notary accepted" : !$("#dNotary").value ? "Remove Notary" : $("#dDirect").checked ? "Assign Notary" : "Send Offer";
    };
    $("#dNotary").onchange = syncAssignLabel; $("#dDirect").onchange = syncAssignLabel; syncAssignLabel();
    $("#dAssign").onclick = () => patch({ notary_id: $("#dNotary").value || null, notary_fee: $("#dNFee").value, direct: $("#dDirect").checked }, $("#dDirect").checked ? "Notary assigned." : "Offer sent. The notary gets an email (and a text if set up) to accept or decline.");
    $("#dFeeOnly").onclick = () => patch({ notary_fee: $("#dNFee").value }, "Notary fee saved.");
    if ($("#dResend")) $("#dResend").onclick = () => patch({ resend_offer: true }, "Offer resent.");
    if ($("#dFeeSave")) $("#dFeeSave").onclick = () => patch({ quoted_fee: $("#dFee").value, notarial_fee: $("#dNotarial").value }, "Fees saved.");
    if ($("#dInvoice")) $("#dInvoice").onclick = async () => {
      try { const { invoice } = await api("/api/admin/billing/invoices", { method: "POST", body: { bookingId: id } }); await openBooking(id);
        $("#dMsg").className = invoice.error ? "form-msg" : "form-msg ok"; $("#dMsg").textContent = invoice.error ? `Invoice ${invoice.number} saved as a draft. ${invoice.error}` : `Invoice ${invoice.number} sent${invoice.provider === "stripe" ? " through Stripe" : ""}.`; }
      catch (e) { $("#dMsg").className = "form-msg"; $("#dMsg").textContent = e.message; }
    };
    const chargeRun = async (body, okText) => {
      try { const r = await api(`/api/admin/bookings/${id}/charge`, { method: "POST", body }); await openBooking(id); $("#dMsg").className = "form-msg ok"; $("#dMsg").textContent = okText(r); loadBoard(); }
      catch (e) { await openBooking(id); $("#dMsg").className = "form-msg"; $("#dMsg").textContent = e.message; }
    };
    if ($("#dCharge")) $("#dCharge").onclick = (ev) => { ev.target.disabled = true; chargeRun({ kind: "service" }, (r) => `Charged $${r.amount.toFixed(2)}. Receipt emailed by Stripe (${r.invoice}).`); };
    if ($("#dChargeFee")) $("#dChargeFee").onclick = (ev) => {
      const amt = Number($("#dFeeAmt").value);
      if (!(amt > 0)) { $("#dMsg").className = "form-msg"; $("#dMsg").textContent = "Enter the fee amount."; return; }
      ev.target.disabled = true;
      chargeRun({ kind: "fee", amount: amt, note: $("#dFeeNote").value }, (r) => `Charged $${r.amount.toFixed(2)} (${r.invoice}).`);
    };
    // Extra fees editor
    const fxRead = () => $$(".fx-row", $("#dBody")).map((r) => {
      const id = r.dataset.fxid, qty = Number($("[data-fxqty]", r).value) || 0, price = $("[data-fxprice]", r).value;
      return id.startsWith("custom") ? { id: "custom", label: r.dataset.fxlabel, price, qty, share: Number(r.dataset.fxshare) || 0, onCancel: !!r.dataset.fxcancel } : { id, qty, price };
    });
    if ($("#fxAdd")) $("#fxAdd").onchange = () => { const c = $("#fxAdd").value === "custom"; $("#fxCLabel").hidden = !c; $("#fxCPrice").hidden = !c; };
    if ($("#fxAddBtn")) $("#fxAddBtn").onclick = () => {
      const v = $("#fxAdd").value, qty = Number($("#fxQty").value) || 1;
      if (!v) { $("#dMsg").className = "form-msg"; $("#dMsg").textContent = "Pick a fee to add."; return; }
      const list = fxRead();
      list.push(v === "custom" ? { id: "custom", label: $("#fxCLabel").value, price: $("#fxCPrice").value, qty } : { id: v, qty });
      patch({ fees: list }, "Fee added.");
    };
    if ($("#fxSave")) $("#fxSave").onclick = () => patch({ fees: fxRead() }, "Fees saved.");
    $$("[data-fxrm]", $("#dBody")).forEach((btn) => btn.addEventListener("click", () => { const list = fxRead(); list.splice(Number(btn.dataset.fxrm), 1); patch({ fees: list }, "Fee removed."); }));
    if ($("#fxShare")) $("#fxShare").onclick = () => patch({ notary_fee: Math.round(((Number(b.notary_fee) || 0) + notaryFeeShare) * 100) / 100 }, `Notary pay raised by $${notaryFeeShare.toFixed(2)}.`);
    if ($("#fxBill")) $("#fxBill").onclick = async (ev) => {
      ev.target.disabled = true;
      try { const { invoice } = await api("/api/admin/billing/invoices", { method: "POST", body: { bookingId: id } }); await openBooking(id);
        $("#dMsg").className = invoice.error ? "form-msg" : "form-msg ok"; $("#dMsg").textContent = invoice.error ? `Invoice ${invoice.number} saved as a draft. ${invoice.error}` : `Invoice ${invoice.number} sent.`; }
      catch (e) { ev.target.disabled = false; $("#dMsg").className = "form-msg"; $("#dMsg").textContent = e.message; }
    };
    if ($("#fxCharge")) $("#fxCharge").onclick = (ev) => { ev.target.disabled = true; chargeRun({ kind: "service" }, (r) => `Charged $${r.amount.toFixed(2)} (${r.invoice}).`); };
    if ($("#dCardLink")) $("#dCardLink").onclick = async () => {
      try { await api(`/api/admin/bookings/${id}/card-link`, { method: "POST", body: {} }); await openBooking(id); $("#dMsg").className = "form-msg ok"; $("#dMsg").textContent = "Emailed the customer a link to add their card."; }
      catch (e) { $("#dMsg").className = "form-msg"; $("#dMsg").textContent = e.message; }
    };
    if ($("#dWitAsk")) $("#dWitAsk").onclick = async (ev, override) => {
      const body = { witness_id: $("#dWit").value, fee: $("#dWitFee").value, override_margin: !!override };
      try { await api(`/api/admin/bookings/${id}/witnesses`, { method: "POST", body }); await openBooking(id); $("#dMsg").className = "form-msg ok"; $("#dMsg").textContent = "Witness request sent. They'll get an email to accept or decline."; }
      catch (e) {
        if (e.code === "margin" && !override && confirm(e.message + "\n\nSend anyway? The override is recorded in the booking history.")) return $("#dWitAsk").onclick(ev, true);
        $("#dMsg").className = "form-msg"; $("#dMsg").textContent = e.message;
      }
    };
    $$("[data-wrm]", $("#dBody")).forEach((btn) => btn.addEventListener("click", async () => {
      try { await api(`/api/admin/bookings/${id}/witnesses/${btn.dataset.wrm}`, { method: "DELETE" }); await openBooking(id); $("#dMsg").className = "form-msg ok"; $("#dMsg").textContent = "Witness removed."; }
      catch (e) { $("#dMsg").className = "form-msg"; $("#dMsg").textContent = e.message; }
    }));
    $("#dMove").onclick = () => $("#dStart").value && patch({ start: localToUtc($("#dStart").value, TZ) }, "Rescheduled. Let the customer know the new time.");
    $("#dNotesSave").onclick = () => patch({ internal_notes: $("#dNotes").value }, "Notes saved.");
    $("#dClientSave").onclick = () => patch({ client_account_id: $("#dClient").value || null }, "Client account updated.");
    if ($("#dAuto")) $("#dAuto").onclick = async () => {
      try { const r = await api("/api/admin/bookings/" + id, { method: "PATCH", body: { auto_dispatch: true } }); await openBooking(id); const d = r.dispatch || {};
        $("#dMsg").className = d.unfilled ? "form-msg" : "form-msg ok"; $("#dMsg").textContent = d.offered ? "Offer sent to the best available notary." : d.unfilled ? "No eligible notary. See the reasons under Auto-dispatch." : "Auto-dispatch is on."; loadBoard(); loadStats(); }
      catch (e) { $("#dMsg").className = "form-msg"; $("#dMsg").textContent = e.message; }
    };
    $("#dPkg").onchange = async () => {
      for (const f of $("#dPkg").files) {
        try { await api(`/api/admin/bookings/${id}/documents?kind=package&filename=${encodeURIComponent(f.name)}`, { method: "POST", raw: f, type: f.type || "application/octet-stream" }); }
        catch (e) { $("#dMsg").className = "form-msg"; $("#dMsg").textContent = e.message; return; }
      }
      await openBooking(id); $("#dMsg").className = "form-msg ok"; $("#dMsg").textContent = "Uploaded. The assigned notary was notified.";
    };
    $$("[data-deldoc]", $("#dBody")).forEach((btn) => btn.addEventListener("click", async () => {
      if (btn.dataset.confirm !== "1") { btn.dataset.confirm = "1"; btn.textContent = "Click again"; return; }
      await api("/api/admin/booking-documents/" + btn.dataset.deldoc, { method: "DELETE" }); openBooking(id);
    }));
    $$("[data-ok]", $("#dBody")).forEach((btn) => btn.addEventListener("click", async () => { await api(`/api/admin/booking-documents/${btn.dataset.ok}/review`, { method: "POST", body: { status: "approved" } }); openBooking(id); loadStats(); loadBoard(); }));
    $$("[data-rj]", $("#dBody")).forEach((btn) => btn.addEventListener("click", async () => {
      try { await api(`/api/admin/booking-documents/${btn.dataset.rj}/review`, { method: "POST", body: { status: "rejected", note: $("#rj-" + btn.dataset.rj).value } }); await openBooking(id); $("#dMsg").className = "form-msg ok"; $("#dMsg").textContent = "Sent back to the notary to fix."; loadStats(); }
      catch (e) { $("#dMsg").className = "form-msg"; $("#dMsg").textContent = e.message; }
    }));
    if ($("#dApproveAll")) $("#dApproveAll").onclick = async () => { await api(`/api/admin/bookings/${id}/scanbacks/approve`, { method: "POST", body: {} }); await openBooking(id); $("#dMsg").className = "form-msg ok"; $("#dMsg").textContent = "Scanbacks approved. The client was emailed."; loadStats(); loadBoard(); };
    $("#dCopy").onclick = () => { $("#dLink").select(); navigator.clipboard?.writeText($("#dLink").value).then(() => ($("#dCopy").textContent = "Copied")).catch(() => {}); };
  }

  /* ---------- new booking ---------- */
  $("#newBooking").addEventListener("click", () => {
    $("#nbForm").reset();
    $("#nbMsg").textContent = "";
    syncNb();
    openDrawer($("#newDrawer"));
  });
  function syncNb() {
    const s = $("#nb-service").value;
    $$(".nb-mobile").forEach((e) => (e.hidden = s !== "mobile"));
    $$(".nb-remote").forEach((e) => (e.hidden = s === "mobile"));
    $$(".nb-rin").forEach((e) => (e.hidden = s !== "rin"));
  }
  $("#nb-service").addEventListener("change", syncNb);
  $("#nbForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = (id) => $(id).value.trim();
    if (!v("#nb-start")) { $("#nbMsg").textContent = "Pick a start time."; return; }
    try {
      const r = await api("/api/admin/bookings", { method: "POST", body: {
        service: v("#nb-service"), category: v("#nb-category"), signers: v("#nb-signers"), start: localToUtc(v("#nb-start"), TZ), tz: TZ,
        address: v("#nb-address"), city: v("#nb-city"), state: v("#nb-state"), zip: v("#nb-zip"),
        signerLocation: v("#nb-sloc"), mailingAddress: v("#nb-mail"),
        contactName: v("#nb-cname"), contactPhone: v("#nb-cphone"), contactEmail: v("#nb-cemail"),
        company: v("#nb-co"), fileNumber: v("#nb-file"), notes: v("#nb-notes"),
        force: $("#nb-force").checked, notify: $("#nb-notify").checked,
      } });
      closeDrawers();
      refresh();
      openBooking(r.id);
    } catch (err) {
      $("#nbMsg").textContent = err.fields ? Object.values(err.fields).join(" ") : err.message;
    }
  });

  /* ---------- notaries ---------- */
  async function loadNotaries() { notaries = (await api("/api/admin/notaries")).notaries; }
  const CSTATE = { ok: ["Done", "p-ok"], warn: ["Renew soon", "p-warn"], missing: ["Missing", "p-info"], expired: ["Expired", "p-warn"] };
  function onboardingCell(n) {
    const bad = n.compliance.items.filter((i) => i.state === "missing" || i.state === "expired").length;
    const warn = n.compliance.items.filter((i) => i.state === "warn").length;
    if (!bad && !warn) return '<span class="pill p-ok">Ready</span>';
    if (!bad) return `<span class="pill p-warn">${warn} expiring</span>`;
    return `<span class="pill p-info">${bad} to do</span>`;
  }
  function renderNotaries() {
    const tb = $("#notaryRows");
    if (!notaries.length) { tb.innerHTML = `<tr><td colspan="9" style="font-weight:400;color:var(--ink-2)">No notaries yet. Approve them from Applications (they get an onboarding email) or add them here.</td></tr>`; return; }
    tb.innerHTML = notaries.map((n) => `<tr>
      <td><button class="linkbtn" style="color:var(--ink);font-size:.95rem;padding:0" data-open="${n.id}">${esc(n.name)}</button></td>
      <td>${esc(n.phone)}<br><small style="color:var(--muted)">${esc(n.email)}</small></td>
      <td class="mono">${esc(n.states)}</td>
      <td>${n.role === "witness" ? '<span class="pill p-warn">Witness</span>' : n.role === "process_server" ? '<span class="pill p-warn">Process server</span>' : ""}${n.ron ? '<span class="pill p-info">RON</span> ' : ""}${n.rin ? '<span class="pill p-info">RIN</span>' : ""}</td>
      <td>${onboardingCell(n)}</td>
      <td>${n.completed}${n.open_offers ? ` <small style="color:var(--muted)">+${n.open_offers} offer${n.open_offers > 1 ? "s" : ""}</small>` : ""}</td>
      <td>${n.unpaid ? "$" + Number(n.unpaid).toFixed(0) : "—"}</td>
      <td>${n.active ? '<span class="pill p-ok">Active</span>' : '<span class="pill p-warn">Inactive</span>'}</td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" data-open="${n.id}">Open</button> <button class="btn btn-ghost btn-sm" data-edit="${n.id}">Edit</button></td></tr>`).join("");
    $$("[data-edit]", tb).forEach((b) => b.addEventListener("click", () => editNotary(notaries.find((n) => n.id === Number(b.dataset.edit)))));
    $$("[data-open]", tb).forEach((b) => b.addEventListener("click", () => openNotary(Number(b.dataset.open))));
  }

  let docKinds = {};
  async function openNotary(id, note) {
    const res = await api("/api/admin/notaries");
    notaries = res.notaries; docKinds = res.docKinds;
    const n = notaries.find((x) => x.id === id);
    if (!n) return;
    $("#ndSub").textContent = `${n.states || "No states"} · ${n.active ? "Active" : "Inactive"}${n.last_login_at ? " · last sign-in " + n.last_login_at.slice(0, 10) : " · never signed in"}`;
    $("#ndTitle").textContent = n.name;
    const kinds = ["commission", "eo", "background", "w9", "certification", "other"];
    $("#ndBody").innerHTML = `
      ${note ? `<p class="form-msg ok">${esc(note)}</p>` : ""}
      <div class="dsec"><h4>Onboarding</h4><ul class="log" style="gap:10px">${n.compliance.items.map((i) => `<li style="grid-template-columns:120px 1fr"><span><span class="pill ${CSTATE[i.state][1]}">${CSTATE[i.state][0]}</span></span><span><b style="color:var(--ink)">${esc(i.label)}</b> · ${esc(i.detail)}</span></li>`).join("")}</ul>
        ${n.agreement_at ? `<p style="font-size:.85rem;color:var(--muted);margin-top:10px">Agreement signed as "${esc(n.agreement_name)}" on ${esc(full(n.agreement_at))} from ${esc(n.agreement_ip || "?")} · version ${esc(n.agreement_version)}</p>` : ""}</div>
      <div class="dsec"><h4>Portal access</h4>
        <div class="inline"><button class="btn btn-primary btn-sm" id="ndSend" type="button" ${n.email ? "" : "disabled"}>Email Onboarding Link</button><button class="btn btn-ghost btn-sm" id="ndCopy" type="button">Copy Sign-In Link</button></div>
        <div class="copyline" style="margin-top:8px" hidden id="ndLinkRow"><input id="ndLink" readonly></div>
        <p style="font-size:.85rem;color:var(--muted);margin-top:8px">Links work for 7 days. Notaries can also sign in any time at ${esc(location.origin)}/portal/ with their email.</p></div>
      <div class="dsec"><h4>Documents</h4>
        <ul class="log">${n.documents.length ? n.documents.map((d) => `<li style="grid-template-columns:150px 1fr auto"><span>${esc(docKinds[d.kind] || d.kind)}</span><span><a href="/api/admin/documents/${d.id}" target="_blank" rel="noopener">${esc(d.filename)}</a> <small style="color:var(--muted)">· ${esc(d.uploaded_at.slice(0, 10))} · by ${esc(d.uploaded_by)}</small></span><button class="linkbtn" data-deldoc="${d.id}">Remove</button></li>`).join("") : '<li style="display:block">No documents yet.</li>'}</ul>
        <div class="inline" style="margin-top:10px"><select id="ndKind">${kinds.map((k) => `<option value="${k}">${esc(docKinds[k])}</option>`).join("")}</select>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">Upload for notary<input type="file" id="ndFile" accept="application/pdf,image/*" hidden></label></div></div>
      <div class="dsec"><h4>Contact</h4><dl class="kvs"><dt>Email</dt><dd>${esc(n.email || "—")}</dd><dt>Phone</dt><dd>${esc(n.phone || "—")}</dd><dt>Commission #</dt><dd>${esc(n.commission_number || "—")}</dd><dt>E&amp;O amount</dt><dd>${esc(n.eo_amount || "—")}</dd><dt>Notes</dt><dd>${esc(n.notes || "—")}</dd></dl>
        <button class="btn btn-ghost btn-sm" id="ndEdit" type="button" style="margin-top:10px">Edit details &amp; dates</button></div>
      <p class="form-msg" id="ndMsg"></p>`;
    openDrawer($("#notaryDrawer"));
    const getLink = async (send) => (await api(`/api/admin/notaries/${n.id}/login-link`, { method: "POST", body: { send } })).link;
    $("#ndSend").onclick = async () => { try { await getLink(true); $("#ndMsg").className = "form-msg ok"; $("#ndMsg").textContent = `Onboarding email sent to ${n.email}.`; } catch (e) { $("#ndMsg").className = "form-msg"; $("#ndMsg").textContent = e.message; } };
    $("#ndCopy").onclick = async () => { const l = await getLink(false); $("#ndLinkRow").hidden = false; $("#ndLink").value = l; $("#ndLink").select(); navigator.clipboard?.writeText(l).then(() => ($("#ndCopy").textContent = "Copied")).catch(() => {}); };
    $("#ndEdit").onclick = () => { closeDrawers(); showTab("notaries"); editNotary(n); };
    $("#ndFile").onchange = async () => {
      const f = $("#ndFile").files[0]; if (!f) return;
      try { await api(`/api/admin/notaries/${n.id}/documents?kind=${$("#ndKind").value}&filename=${encodeURIComponent(f.name)}`, { method: "POST", raw: f, type: f.type || "application/octet-stream" }); openNotary(n.id, "Uploaded."); renderNotaries(); }
      catch (e) { $("#ndMsg").className = "form-msg"; $("#ndMsg").textContent = e.message; }
    };
    $$("[data-deldoc]", $("#ndBody")).forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Click again to remove"; return; }
      await api("/api/admin/documents/" + b.dataset.deldoc, { method: "DELETE" }); openNotary(n.id, "Removed."); renderNotaries();
    }));
  }

  function editNotary(n) {
    const f = $("#notaryForm");
    f.hidden = false;
    $("#nFormTitle").textContent = n ? `Edit ${n.name}` : "Add notary";
    $("#n-id").value = n?.id || "";
    $("#n-name").value = n?.name || ""; $("#n-phone").value = n?.phone || ""; $("#n-email").value = n?.email || "";
    $("#n-states").value = n?.states || ""; $("#n-notes").value = n?.notes || "";
    $("#n-cnum").value = n?.commission_number || ""; $("#n-cexp").value = n?.commission_expires || "";
    $("#n-eoamt").value = n?.eo_amount || ""; $("#n-eoexp").value = n?.eo_expires || ""; $("#n-bg").value = n?.background_date || ""; $("#n-zip").value = n?.home_zip || ""; $("#n-miles").value = n?.travel_miles || 30;
    $("#n-ron").checked = !!n?.ron; $("#n-rin").checked = !!n?.rin; $("#n-active").checked = n ? !!n.active : true;
    f.scrollIntoView({ behavior: "smooth", block: "start" });
    $("#n-name").focus({ preventScroll: true });
  }
  $("#addNotary").addEventListener("click", () => editNotary(null));
  $("#nCancel").addEventListener("click", () => ($("#notaryForm").hidden = true));
  $("#notaryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#n-id").value;
    const body = { name: $("#n-name").value, phone: $("#n-phone").value, email: $("#n-email").value, states: $("#n-states").value, notes: $("#n-notes").value, ron: $("#n-ron").checked, rin: $("#n-rin").checked, active: $("#n-active").checked,
      commission_number: $("#n-cnum").value, commission_expires: $("#n-cexp").value, eo_amount: $("#n-eoamt").value, eo_expires: $("#n-eoexp").value, background_date: $("#n-bg").value, home_zip: $("#n-zip").value, travel_miles: $("#n-miles").value };
    try {
      await api("/api/admin/notaries" + (id ? "/" + id : ""), { method: id ? "PATCH" : "POST", body });
      $("#notaryForm").hidden = true;
      await loadNotaries(); renderNotaries(); loadStats();
    } catch (err) { alertInline($("#notaryForm"), err.message); }
  });

  /* ---------- service requests ---------- */
  let reqView = "open";
  const REQ_ST = { new: ["p-warn", "New"], quoted: ["p-info", "Quoted"], in_progress: ["p-info", "In progress"], completed: ["p-ok", "Completed"], canceled: ["p-warn", "Canceled"] };
  const ASG_ST = { offered: "asked", accepted: "accepted", declined: "declined" };
  $$("#reqViews [data-rv]").forEach((b) => b.addEventListener("click", () => { reqView = b.dataset.rv; $$("#reqViews [data-rv]").forEach((x) => x.setAttribute("aria-pressed", x === b)); loadRequests(); }));
  async function loadRequests() {
    const { requests } = await api("/api/admin/requests?status=" + encodeURIComponent(reqView));
    $("#reqRows").innerHTML = requests.length ? requests.map((r) => `<tr data-req="${r.id}" style="cursor:pointer">
      <td><b>${esc(r.ref)}</b><br><small style="color:var(--muted)">${esc(full(r.created_at).replace(/, \d{4}.*/, ""))}${r.client_ref ? " · File " + esc(r.client_ref) : ""}</small></td>
      <td>${esc(r.type_label)}</td><td>${esc(r.company || r.contact_name)}<br><small style="color:var(--muted)">${esc(r.contact_email)}</small></td>
      <td>${esc(r.due_date || "—")}</td><td><span class="pill ${(REQ_ST[r.status] || [])[0]}">${(REQ_ST[r.status] || [])[1] || esc(r.status)}</span></td>
      <td>${r.assignee_name ? `${esc(r.assignee_name)} <small style="color:var(--muted)">${ASG_ST[r.assignee_status] || ""}</small>` : r.roles.length ? '<span style="color:var(--muted)">—</span>' : '<small style="color:var(--muted)">Desk / partner</small>'}</td>
      <td>${r.fee != null ? "$" + Number(r.fee).toFixed(2) : "—"}</td></tr>`).join("")
      : `<tr><td colspan="7" style="font-weight:400;color:var(--ink-2)">No requests here. Customers request process serving, recording and other services from your service pages.</td></tr>`;
    $$("[data-req]").forEach((tr) => tr.addEventListener("click", () => openRequest(Number(tr.dataset.req))));
  }

  async function openRequest(id) {
    const d = await api("/api/admin/requests/" + id);
    const r = d.request, mg = d.margin, open = ["new", "quoted", "in_progress"].includes(r.status);
    const kv = (pairs) => `<dl class="kvs">${pairs.filter(([, v]) => v !== "" && v != null).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
    $("#dSvc").textContent = `${r.type_label} · ${r.ref}`;
    $("#dTitle").textContent = r.company || r.contact_name;
    const det = d.fields.filter((f) => (r.details || {})[f.key]).map((f) => [f.label, r.details[f.key]]);
    $("#dBody").innerHTML = `
      <div class="dsec"><h4>Status</h4><div class="status-btns">${Object.entries(REQ_ST).map(([k, [, l]]) => `<button type="button" aria-pressed="${r.status === k}" data-rst="${k}">${l}</button>`).join("")}</div>
        <label class="agree" style="margin-top:8px"><input type="checkbox" id="rNotify" checked> Email the client about quoted, completed or canceled</label></div>
      <div class="dsec"><h4>Request</h4>${kv([...det, ["Needed by", r.due_date], ["Notes", r.notes]])}</div>
      <div class="dsec"><h4>Client</h4>${kv([["Name", r.contact_name], ["Company", r.company], ["Phone", r.contact_phone], ["Email", r.contact_email], ["Account", r.client_account_id ? "Client portal account" : ""]])}
        <div class="inline" style="margin-top:8px"><input id="rClientRef" placeholder="Client file / matter #" value="${esc(r.client_ref || "")}" aria-label="Client file or matter number"><button class="btn btn-ghost btn-sm" id="rRefSave" type="button">Save</button></div>
        ${r.type === "process_serve" || r.type === "inspection" ? `<label class="agree" style="margin-top:8px"><input type="checkbox" id="rNotifyAtt" ${r.notify_attempts !== 0 ? "checked" : ""}> Email the client each time an attempt is logged</label>` : ""}</div>
      <div class="dsec"><h4>Price &amp; costs</h4>
        <div class="inline"><input id="rFee" type="number" min="0" step="0.01" placeholder="Client fee $" value="${r.fee ?? ""}" ${r.invoice_id ? "disabled" : ""}>
          <input id="rVendor" type="number" min="0" step="0.01" placeholder="Partner cost $" value="${r.vendor_cost ?? ""}" title="Recording fees, translator, shredding company…">
          <input id="rDue" type="date" value="${r.due_date || ""}" aria-label="Due date"><button class="btn btn-ghost btn-sm" id="rSave" type="button">Save</button></div>
        ${mg && !mg.unknown ? `<p style="margin-top:8px"><span class="pill ${mg.ok ? "p-ok" : "p-warn"}">Margin $${mg.kept.toFixed(2)} · ${mg.pct}%</span> <span style="font-size:.84rem;color:var(--muted)">${mg.ok ? `minimum ${mg.min}%` : `below your ${mg.min}% minimum (override on file)`}</span></p>` : `<p style="font-size:.84rem;color:var(--muted);margin-top:6px">Set the client fee and the pay or partner cost to see the margin.</p>`}
        ${d.invoice ? `<p style="margin-top:8px"><span class="pill ${d.invoice.status === "paid" ? "p-ok" : "p-info"}">Invoice ${esc(d.invoice.number)} · ${esc(d.invoice.status)}</span> <a href="/api/admin/billing/invoices/${d.invoice.id}/view" target="_blank" rel="noopener" style="font-size:.86rem">View</a></p>`
          : r.fee != null && r.status !== "canceled" ? `<button class="btn btn-ghost btn-sm" id="rInvoice" type="button" style="margin-top:8px">Send invoice${Number(r.extras_total) ? ` ($${(Number(r.fee) + Number(r.extras_total)).toFixed(2)})` : ""}</button>` : ""}</div>
      ${(() => {
        const xs = r.extras || [], locked = !!r.invoice_id;
        const cat = (d.extrasCatalog || []).filter((f) => !xs.some((a) => a.id === f.id));
        return `<div class="dsec"><h4>Extras${xs.length ? ` · $${xs.reduce((t, a) => t + a.qty * a.price, 0).toFixed(2)}` : ""}</h4>
          ${xs.length ? `<div class="files">${xs.map((a, i) => `<div class="frow rx-row" data-rxid="${esc(a.id)}" data-rxlabel="${esc(a.label)}" data-rxshare="${Number(a.share) || 0}"><span>${esc(a.label)}</span><span class="acts">
              <input type="number" min="0" max="50" step="1" value="${a.qty}" data-rxqty aria-label="Quantity" style="max-width:64px" ${locked ? "disabled" : ""}>
              <input type="number" min="0" step="0.01" value="${a.price}" data-rxprice aria-label="Price" style="max-width:90px" ${locked ? "disabled" : ""}>
              ${locked ? "" : `<button class="linkbtn" data-rxrm="${i}" type="button">Remove</button>`}</span></div>`).join("")}</div>` : '<p style="font-size:.88rem;color:var(--muted)">No extras.</p>'}
          ${locked ? "" : `<div class="inline" style="margin-top:10px"><select id="rxAdd" aria-label="Add an extra"><option value="">Add an extra…</option>${cat.map((f) => `<option value="${esc(f.id)}">${esc(f.label)} · $${f.price.toFixed(2)}${f.unit ? " " + esc(f.unit) : ""}</option>`).join("")}<option value="custom">Custom…</option></select>
            <input id="rxQty" type="number" min="1" max="50" value="1" aria-label="Quantity" style="max-width:64px"><input id="rxCLabel" placeholder="Name" hidden><input id="rxCPrice" type="number" min="0" step="0.01" placeholder="$" hidden style="max-width:90px">
            <button class="btn btn-ghost btn-sm" id="rxAddBtn" type="button">Add</button><button class="btn btn-primary btn-sm" id="rxSave" type="button">Save extras</button></div>`}
          ${d.extrasShare > 0 ? `<p style="font-size:.86rem;margin-top:8px">Suggested share for the person doing the job: <b>$${d.extrasShare.toFixed(2)}</b></p>` : ""}
          <p style="font-size:.84rem;color:var(--muted);margin-top:6px">Rush and same-day serves add their fee automatically. Each extra is its own invoice line. Edit prices in Settings → Request extras.</p></div>`;
      })()}
      ${r.roles.length ? `<div class="dsec"><h4>Assigned to</h4>
        ${d.assignee ? `<p><b>${esc(d.assignee.name)}</b> <span class="pill ${r.assignee_status === "accepted" ? "p-ok" : r.assignee_status === "declined" ? "p-warn" : "p-info"}">${esc(ASG_ST[r.assignee_status] || r.assignee_status || "")}</span>${r.assignee_fee != null ? ` · pay $${Number(r.assignee_fee).toFixed(2)}` : ""}${d.assignee.phone ? ` · ${esc(d.assignee.phone)}` : ""} ${open && !r.assignee_paid_at ? '<button class="linkbtn" id="rUnassign">Remove</button>' : ""}</p>` : ""}
        ${open ? (d.pool.length ? `<div class="inline" style="margin-top:8px"><select id="rWho">${d.pool.map((p) => `<option value="${p.id}">${p.ready ? "✓" : "⚠"} ${esc(p.name)} · ${esc(p.role_label)}${p.home_zip ? " · " + esc(p.home_zip) : ""}${p.ready ? "" : " · onboarding incomplete"}</option>`).join("")}</select>
          <input id="rPay" type="number" min="0" step="0.01" placeholder="Their pay $" style="max-width:120px"><button class="btn btn-ghost btn-sm" id="rAssign" type="button">${d.assignee ? "Reassign" : "Send request"}</button></div>`
          : `<p style="font-size:.86rem;color:var(--muted)">No one on the team can take this yet. Approve ${r.type === "process_serve" ? "process server" : "team"} applications to add them.</p>`) : ""}</div>`
        : `<div class="dsec"><h4>Handled by</h4><p style="font-size:.9rem;color:var(--ink-2)">The desk or a partner. Track the partner's charge as the partner cost so the margin stays accurate.</p></div>`}
      <div class="dsec"><h4>Documents</h4>
        ${d.documents.length ? `<ul class="log" style="margin-bottom:8px">${d.documents.map((x) => `<li style="grid-template-columns:1fr auto auto"><a href="/api/admin/request-documents/${x.id}" target="_blank" rel="noopener">${esc(x.filename)}</a><span class="pill p-info">${x.kind === "papers" ? (x.uploaded_by === "customer" ? "From client" : "To serve") : x.kind === "proof" ? "Proof" : "Other"}</span><button class="linkbtn" data-rdel="${x.id}">Delete</button></li>`).join("")}</ul>` : ""}
        <div class="inline"><select id="rDocKind"><option value="papers">${r.type === "process_serve" ? "Papers to serve" : "Documents"}</option><option value="proof">Proof / affidavit</option><option value="other">Other</option></select>
          <label class="btn btn-ghost btn-sm" style="cursor:pointer">Upload<input type="file" id="rDocFile" accept="application/pdf,image/*" multiple hidden></label></div></div>
      ${r.type === "process_serve" || d.attempts.length ? `<div class="dsec"><h4>Attempts</h4>
        ${d.attempts.length ? `<ul class="log" style="margin-bottom:8px">${d.attempts.map((a) => `<li><time>${esc(full(a.at).replace(/, \d{4}/, ""))}</time><span><b>${esc(d.results[a.result] || a.result)}</b>${a.served_to ? " · " + esc(a.served_to) : ""}${a.description ? " · " + esc(a.description) : ""} · ${esc(a.by_name || "")}</span></li>`).join("")}</ul>` : `<p style="font-size:.86rem;color:var(--muted)">No attempts yet.</p>`}
        ${open ? `<div class="inline" style="flex-wrap:wrap"><select id="raRes">${Object.entries(d.results).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select><input id="raAt" type="datetime-local" aria-label="When"><input id="raTo" placeholder="Served to"><input id="raDesc" placeholder="Notes"><button class="btn btn-ghost btn-sm" id="raAdd" type="button">Log attempt</button></div>` : ""}</div>` : ""}
      <div class="dsec"><h4>Internal notes</h4><textarea id="rNotes" rows="3" placeholder="Only the desk sees this">${esc(r.internal_notes || "")}</textarea><button class="btn btn-ghost btn-sm" id="rNotesSave" type="button" style="margin-top:8px">Save Notes</button></div>
      <div class="dsec"><h4>History</h4><ul class="log">${d.events.map((e) => `<li><time>${esc(full(e.at).replace(/, \d{4}/, ""))}</time><span>${esc(e.text)}${e.actor ? ` · ${esc(e.actor)}` : ""}</span></li>`).join("")}</ul></div>
      <p class="form-msg" id="dMsg" role="status"></p>`;
    openDrawer($("#drawer"));
    const say = (t, ok) => { $("#dMsg").className = ok ? "form-msg ok" : "form-msg"; $("#dMsg").textContent = t; };
    const run = async (fn, okText, retry) => {
      try { await fn(false); await openRequest(id); say(okText, true); loadRequests(); loadStats(); }
      catch (e) {
        if (e.code === "margin" && retry && confirm(e.message + "\n\nSave anyway? The override is recorded in the history.")) { try { await fn(true); await openRequest(id); say(okText + " (margin override)", true); loadRequests(); } catch (e2) { say(e2.message); } return; }
        if (e.code === "no_serve" && confirm(e.message + "\n\nComplete it anyway?")) { try { await api("/api/admin/requests/" + id, { method: "PATCH", body: { status: "completed", force: true, notify: $("#rNotify").checked } }); await openRequest(id); say("Completed.", true); loadRequests(); } catch (e3) { say(e3.message); } return; }
        say(e.message);
      }
    };
    $$("[data-rst]", $("#dBody")).forEach((b) => b.addEventListener("click", () => run(() => api("/api/admin/requests/" + id, { method: "PATCH", body: { status: b.dataset.rst, notify: $("#rNotify").checked } }), "Status updated.")));
    $("#rSave").onclick = () => run((ov) => api("/api/admin/requests/" + id, { method: "PATCH", body: { fee: $("#rFee").value, vendor_cost: $("#rVendor").value, due_date: $("#rDue").value, override_margin: ov } }), "Saved.", true);
    if ($("#rAssign")) $("#rAssign").onclick = () => run((ov) => api(`/api/admin/requests/${id}/assign`, { method: "POST", body: { assignee_id: $("#rWho").value, assignee_fee: $("#rPay").value, override_margin: ov } }), "Request sent. They'll get an email to accept or decline.", true);
    if ($("#rUnassign")) $("#rUnassign").onclick = () => run(() => api(`/api/admin/requests/${id}/assign`, { method: "DELETE" }), "Removed.");
    if ($("#rInvoice")) $("#rInvoice").onclick = () => run(() => api(`/api/admin/requests/${id}/invoice`, { method: "POST", body: {} }), "Invoice created and sent.");
    const rxRead = () => $$(".rx-row", $("#dBody")).map((row) => {
      const xid = row.dataset.rxid, qty = Number($("[data-rxqty]", row).value) || 0, price = $("[data-rxprice]", row).value;
      return xid.startsWith("custom") ? { id: "custom", label: row.dataset.rxlabel, price, qty, share: Number(row.dataset.rxshare) || 0 } : { id: xid, qty, price };
    });
    const rxPatch = (list, okText) => run((ov) => api("/api/admin/requests/" + id, { method: "PATCH", body: { extras: list, override_margin: ov } }), okText, true);
    if ($("#rxAdd")) $("#rxAdd").onchange = () => { const c = $("#rxAdd").value === "custom"; $("#rxCLabel").hidden = !c; $("#rxCPrice").hidden = !c; };
    if ($("#rxAddBtn")) $("#rxAddBtn").onclick = () => {
      const v = $("#rxAdd").value, qty = Number($("#rxQty").value) || 1;
      if (!v) return say("Pick an extra to add.");
      const list = rxRead(); list.push(v === "custom" ? { id: "custom", label: $("#rxCLabel").value, price: $("#rxCPrice").value, qty } : { id: v, qty });
      rxPatch(list, "Extra added.");
    };
    if ($("#rxSave")) $("#rxSave").onclick = () => rxPatch(rxRead(), "Extras saved.");
    $$("[data-rxrm]", $("#dBody")).forEach((b) => b.addEventListener("click", () => { const list = rxRead(); list.splice(Number(b.dataset.rxrm), 1); rxPatch(list, "Extra removed."); }));
    $("#rRefSave").onclick = () => run(() => api("/api/admin/requests/" + id, { method: "PATCH", body: { client_ref: $("#rClientRef").value } }), "File number saved.");
    if ($("#rNotifyAtt")) $("#rNotifyAtt").onchange = () => run(() => api("/api/admin/requests/" + id, { method: "PATCH", body: { notify_attempts: $("#rNotifyAtt").checked } }), $("#rNotifyAtt").checked ? "The client will get attempt emails." : "Attempt emails turned off.");
    $("#rNotesSave").onclick = () => run(() => api("/api/admin/requests/" + id, { method: "PATCH", body: { internal_notes: $("#rNotes").value } }), "Notes saved.");
    if ($("#raAdd")) $("#raAdd").onclick = () => run(() => api(`/api/admin/requests/${id}/attempts`, { method: "POST", body: { result: $("#raRes").value, at: $("#raAt").value ? new Date($("#raAt").value).toISOString() : "", servedTo: $("#raTo").value, description: $("#raDesc").value } }), "Attempt logged.");
    $("#rDocFile").onchange = async () => {
      for (const f of $("#rDocFile").files) {
        try { await api(`/api/admin/requests/${id}/documents?kind=${$("#rDocKind").value}&filename=${encodeURIComponent(f.name)}`, { method: "POST", raw: f, type: f.type || "application/octet-stream" }); }
        catch (e) { say(e.message); return; }
      }
      await openRequest(id); say("Uploaded.", true);
    };
    $$("[data-rdel]", $("#dBody")).forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Click again"; return; }
      await api("/api/admin/request-documents/" + b.dataset.rdel, { method: "DELETE" }); openRequest(id);
    }));
  }

  /* ---------- payouts ---------- */
  async function loadPayouts() {
    const { unpaid, paid } = await api("/api/admin/payouts");
    const groups = new Map();
    unpaid.forEach((j) => { if (!groups.has(j.payee_id)) groups.set(j.payee_id, []); groups.get(j.payee_id).push(j); });
    $("#payoutGroups").innerHTML = groups.size ? [...groups.values()].map((list) => {
      const total = list.reduce((a, j) => a + (j.amount || 0), 0);
      const noFee = list.filter((j) => j.amount == null).length;
      return `<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><h3>${esc(list[0].payee_name)}</h3><b style="font-family:var(--f-display);font-size:1.5rem">$${total.toFixed(2)}</b></div>
        ${noFee ? `<p class="form-msg">${noFee} job${noFee > 1 ? "s have" : " has"} no fee set. Open the booking to add it.</p>` : ""}
        <ul class="log" style="margin:12px 0">${list.map((j) => `<li style="grid-template-columns:24px 1fr auto"><input type="checkbox" data-pay="${j.key}" checked aria-label="Include ${esc(j.ref)}"><span>${esc(j.ref)} · ${esc(j.category)} · ${esc(full(j.start_utc).replace(/, \d{4}.*/, ""))}</span><b>${j.amount != null ? "$" + Number(j.amount).toFixed(2) : "—"}</b></li>`).join("")}</ul>
        <button class="btn btn-primary btn-sm" style="align-self:flex-start" data-paygroup="${list[0].payee_id}">Mark Selected Paid</button></div>`;
    }).join("") : `<div class="empty-state">Nothing owed right now. Completed jobs with a notary or witness appear here until you mark them paid.</div>`;
    $$("[data-paygroup]").forEach((b) => b.addEventListener("click", async () => {
      const keys = $$("input[data-pay]", b.closest(".card")).filter((i) => i.checked).map((i) => i.dataset.pay);
      if (!keys.length) return;
      await api("/api/admin/payouts/mark-paid", { method: "POST", body: { keys } });
      loadPayouts(); loadStats();
    }));
    $("#paidRows").innerHTML = paid.length ? paid.map((j) => `<tr><td>${esc(String(j.paid_at).slice(0, 10))}</td><td>${esc(j.payee_name)}</td><td>${esc(j.ref)} · ${esc(j.category)}</td><td>${j.amount != null ? "$" + Number(j.amount).toFixed(2) : "—"}</td><td><button class="linkbtn" data-unpay="${j.key}">Undo</button></td></tr>`).join("")
      : `<tr><td colspan="5" style="font-weight:400;color:var(--ink-2)">No payments recorded yet.</td></tr>`;
    $$("[data-unpay]").forEach((b) => b.addEventListener("click", async () => { await api("/api/admin/payouts/mark-unpaid", { method: "POST", body: { key: b.dataset.unpay } }); loadPayouts(); loadStats(); }));
  }

  function alertInline(el, text) {
    let m = $(".form-msg", el);
    if (!m) { m = document.createElement("p"); m.className = "form-msg"; el.appendChild(m); }
    m.textContent = text;
  }

  /* ---------- billing ---------- */
  const usd = (n) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const INV_PILL = { draft: "p-info", open: "p-warn", paid: "p-ok", void: "p-info" };
  async function loadBilling() {
    const d = await api("/api/admin/billing");
    $("#billState").innerHTML = d.provider === "stripe"
      ? `<span class="pill p-ok">Stripe connected${d.stripe.test ? " · test mode" : ""}</span>${d.stripe.webhook ? "" : ' <span class="pill p-warn">Add the Stripe webhook for instant payment updates</span>'}`
      : '<span class="pill p-info">Stripe not connected · invoices are tracked here for you to send</span>';
    $("#billTiles").innerHTML = [["Outstanding", d.totals.outstanding], ["Overdue", d.totals.overdue], ["Paid last 30 days", d.totals.paid30]]
      .map(([l, v], i) => `<div class="tile${i === 1 && v > 0 ? " alert" : ""}"><b>${usd(v)}</b><span>${l}</span></div>`).join("");
    if (!$("#billThrough").value) $("#billThrough").value = new Date().toISOString().slice(0, 10);
    const jTotal = (j) => (j.price == null ? null : j.price + (j.extras || 0));
    const jobLine = (j) => `<li style="grid-template-columns:1fr auto"><span>${esc(j.ref)}${j.file_number ? " · File " + esc(j.file_number) : ""} · ${esc(j.category)} · ${esc(full(j.start_utc).replace(/, \d{4}.*/, ""))}${j.canceled ? ' <span class="pill p-warn">Trip / cancel fee</span>' : ""}</span><b>${j.price == null ? '<span style="color:var(--warn)">no fee</span>' : usd(jTotal(j)) + (j.notarial ? ` <small style="color:var(--muted)">incl. ${usd(j.notarial)} notarial</small>` : "") + (j.extras ? ` <small style="color:var(--muted)">incl. ${usd(j.extras)} extras</small>` : "")}</b></li>`;
    const cards = d.clients.map((c) => {
      const total = c.jobs.reduce((a, j) => a + (jTotal(j) || 0), 0), missing = c.jobs.filter((j) => j.price == null).length;
      return `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(c.company)}</h3><b style="font-family:var(--f-display);font-size:1.4rem">${usd(total)}</b></div>
        <p class="meta">${c.jobs.length} completed job${c.jobs.length > 1 ? "s" : ""}</p><ul class="log">${c.jobs.map(jobLine).join("")}</ul>
        ${missing ? `<p class="form-msg">${missing} job${missing > 1 ? "s need" : " needs"} a client fee. Open the booking to set it.</p>` : ""}
        <div class="actions"><button class="btn btn-primary btn-sm" data-billacct="${c.account_id}" ${missing ? "disabled" : ""}>Create &amp; Send Invoice</button><button class="btn btn-ghost btn-sm" data-billdraft="${c.account_id}" ${missing ? "disabled" : ""}>Save as Draft</button></div></div>`;
    });
    if (d.individuals.length) cards.push(`<div class="card"><h3>Individual customers</h3><p class="meta">One invoice per job, due on receipt</p><ul class="log">${d.individuals.map((j) => `<li style="grid-template-columns:1fr auto auto"><span>${esc(j.contact_name)} · ${esc(j.ref)} · ${esc(j.category)}</span><b>${j.price == null ? '<span style="color:var(--warn)">no fee</span>' : usd(jTotal(j))}${j.canceled ? ' <small style="color:var(--muted)">trip / cancel fee</small>' : ""}</b><button class="linkbtn" style="color:var(--brass-ink)" data-billone="${j.id}" ${j.price == null ? "disabled" : ""}>Invoice</button></li>`).join("")}</ul></div>`);
    $("#unbilled").innerHTML = cards.join("") || '<div class="empty-state" style="grid-column:1/-1">Nothing to bill. Completed jobs show up here until they\'re on an invoice.</div>';
    const run = async (body, btn) => {
      btn.disabled = true;
      try { const { invoice } = await api("/api/admin/billing/invoices", { method: "POST", body: { ...body, through: $("#billThrough").value } }); await loadBilling();
        $("#billMsg").className = invoice.error ? "form-msg" : "form-msg ok"; $("#billMsg").textContent = invoice.error ? `Invoice ${invoice.number} saved as a draft: ${invoice.error}` : `Invoice ${invoice.number} for ${usd(invoice.amount)} ${invoice.status === "draft" ? "saved as a draft" : "sent"}.`; }
      catch (e) { $("#billMsg").className = "form-msg"; $("#billMsg").textContent = e.message; btn.disabled = false; }
    };
    $$("[data-billacct]").forEach((b) => (b.onclick = () => run({ accountId: Number(b.dataset.billacct) }, b)));
    $$("[data-billdraft]").forEach((b) => (b.onclick = () => run({ accountId: Number(b.dataset.billdraft), send: false }, b)));
    $$("[data-billone]").forEach((b) => (b.onclick = () => run({ bookingId: Number(b.dataset.billone) }, b)));

    $("#invoiceRows").innerHTML = d.invoices.length ? d.invoices.map((i) => `<tr>
      <td class="mono">${esc(i.number)}${i.error ? `<br><small style="color:var(--warn);font-family:var(--f-body)">${esc(i.error)}</small>` : ""}</td><td>${esc(i.bill_to_name)}<br><small style="color:var(--muted)">${esc(i.bill_to_email)}</small></td>
      <td>${esc(i.invoice_date)}</td><td>${esc(i.due_date)}${i.status === "open" && i.due_date < new Date().toISOString().slice(0, 10) ? ' <span class="pill p-warn">Overdue</span>' : ""}</td>
      <td>${usd(i.amount)}</td><td><span class="pill ${INV_PILL[i.status]}">${esc(i.status)}</span>${i.provider === "stripe" ? ' <small style="color:var(--muted)">Stripe</small>' : ""}</td>
      <td style="white-space:nowrap"><a class="btn btn-ghost btn-sm" href="/api/admin/billing/invoices/${i.id}/view" target="_blank" rel="noopener">View</a>
        ${i.status === "draft" ? `<button class="btn btn-ghost btn-sm" data-isend="${i.id}">Send</button>` : ""}
        ${i.status === "open" && i.provider === "stripe" ? `<button class="btn btn-ghost btn-sm" data-isync="${i.id}">Check payment</button>` : ""}
        ${i.status === "open" && i.provider === "manual" ? `<button class="btn btn-ghost btn-sm" data-ipaid="${i.id}">Mark paid</button>` : ""}
        ${i.status === "open" && i.client_account_id && i.due_date < new Date().toISOString().slice(0, 10) ? `<button class="btn btn-ghost btn-sm" data-ilate="${i.id}" title="Bill the monthly late fee as a separate invoice">Late fee</button>` : ""}
        ${["draft", "open"].includes(i.status) ? `<button class="linkbtn" data-ivoid="${i.id}">Void</button>` : ""}</td></tr>`).join("")
      : '<tr><td colspan="7" style="font-weight:400;color:var(--ink-2)">No invoices yet.</td></tr>';
    const act = async (path, okText, btn) => {
      if (btn.dataset.ivoid && btn.dataset.confirm !== "1") { btn.dataset.confirm = "1"; btn.textContent = "Click again to void"; return; }
      try { await api(path, { method: "POST", body: {} }); await loadBilling(); $("#billMsg").className = "form-msg ok"; $("#billMsg").textContent = okText; }
      catch (e) { $("#billMsg").className = "form-msg"; $("#billMsg").textContent = e.message; }
    };
    $$("[data-isend]").forEach((b) => (b.onclick = () => act(`/api/admin/billing/invoices/${b.dataset.isend}/send`, "Invoice sent.", b)));
    $$("[data-isync]").forEach((b) => (b.onclick = () => act(`/api/admin/billing/invoices/${b.dataset.isync}/sync`, "Payment status updated.", b)));
    $$("[data-ilate]").forEach((b) => (b.onclick = () => act(`/api/admin/billing/invoices/${b.dataset.ilate}/late-fee`, "Late fee invoice created.", b)));
    $$("[data-ipaid]").forEach((b) => (b.onclick = () => act(`/api/admin/billing/invoices/${b.dataset.ipaid}/mark-paid`, "Marked paid.", b)));
    $$("[data-ivoid]").forEach((b) => (b.onclick = () => act(`/api/admin/billing/invoices/${b.dataset.ivoid}/void`, "Invoice voided. Its jobs are back in Ready to invoice.", b)));
  }
  $("#billThrough").addEventListener("change", loadBilling);

  /* ---------- clients ---------- */
  $("#clientUrl").textContent = location.origin + "/client/";
  let clientAccounts = [];
  async function loadClients() {
    clientAccounts = (await api("/api/admin/clients")).accounts;
    const box = $("#clientCards");
    if (!clientAccounts.length) { box.innerHTML = '<div class="empty-state" style="grid-column:1/-1">No client accounts yet. Add your title companies and lenders so they can order online.</div>'; return; }
    box.innerHTML = clientAccounts.map((a) => `<div class="card${a.active ? "" : " handled"}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><h3>${esc(a.company)}</h3><button class="btn btn-ghost btn-sm" data-editc="${a.id}">Edit</button></div>
      <p class="meta">${a.orders} order${a.orders === 1 ? "" : "s"} · ${a.open_orders} open${a.phone ? " · " + esc(a.phone) : ""}</p>
      ${a.instructions ? `<p>${esc(a.instructions)}</p>` : ""}
      <ul class="users">${a.users.map((u) => `<li><span>${esc(u.name)} · ${esc(u.email)} <small style="color:var(--muted)">${u.last_login_at ? "active " + esc(u.last_login_at.slice(0, 10)) : "not signed in yet"}${u.active ? "" : " · disabled"}</small></span>
        <span><button class="linkbtn" style="color:var(--brass-ink)" data-ulink="${u.id}">Copy link</button><button class="linkbtn" style="color:var(--brass-ink)" data-usend="${u.id}">Email link</button><button class="linkbtn" data-uact="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? "Disable" : "Enable"}</button></span></li>`).join("") || '<li style="color:var(--muted)">No users yet.</li>'}</ul>
      <div class="inline"><input placeholder="Name" id="un-${a.id}"><input placeholder="Email" type="email" id="ue-${a.id}"><button class="btn btn-ghost btn-sm" data-uadd="${a.id}">Add &amp; Invite</button></div>
      <p class="form-msg" id="cm-${a.id}"></p></div>`).join("");
    $$("[data-editc]", box).forEach((b) => b.addEventListener("click", () => editClient(clientAccounts.find((a) => a.id === Number(b.dataset.editc)))));
    $$("[data-uadd]", box).forEach((b) => b.addEventListener("click", async () => {
      const id = b.dataset.uadd, m = $("#cm-" + id);
      try { await api(`/api/admin/clients/${id}/users`, { method: "POST", body: { name: $("#un-" + id).value, email: $("#ue-" + id).value } }); await loadClients(); const m2 = $("#cm-" + id); m2.className = "form-msg ok"; m2.textContent = "Added. They were emailed a sign-in link."; }
      catch (e) { m.className = "form-msg"; m.textContent = e.message; }
    }));
    $$("[data-ulink]", box).forEach((b) => b.addEventListener("click", async () => { const { link } = await api(`/api/admin/client-users/${b.dataset.ulink}/login-link`, { method: "POST", body: {} }); navigator.clipboard?.writeText(link).then(() => (b.textContent = "Copied")).catch(() => { b.textContent = link; }); }));
    $$("[data-usend]", box).forEach((b) => b.addEventListener("click", async () => { await api(`/api/admin/client-users/${b.dataset.usend}/login-link`, { method: "POST", body: { send: true } }); b.textContent = "Sent"; }));
    $$("[data-uact]", box).forEach((b) => b.addEventListener("click", async () => { await api(`/api/admin/client-users/${b.dataset.uact}`, { method: "PATCH", body: { active: b.dataset.on === "1" } }); loadClients(); }));
  }
  function editClient(a) {
    $("#clientForm").hidden = false;
    $("#clTitle").textContent = a ? `Edit ${a.company}` : "Add client";
    $("#cl-id").value = a?.id || ""; $("#cl-company").value = a?.company || ""; $("#cl-phone").value = a?.phone || "";
    $("#cl-billing").value = a?.billing_email || ""; $("#cl-terms").value = a?.payment_terms_days ?? 30; $("#cl-instr").value = a?.instructions || ""; $("#cl-notes").value = a?.notes || "";
    $("#cl-active").checked = a ? !!a.active : true;
    $("#cl-company").focus();
  }
  $("#addClient").addEventListener("click", () => editClient(null));
  $("#clCancel").addEventListener("click", () => ($("#clientForm").hidden = true));
  $("#clientForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = $("#cl-id").value;
    const body = { company: $("#cl-company").value, phone: $("#cl-phone").value, billing_email: $("#cl-billing").value, payment_terms_days: $("#cl-terms").value, instructions: $("#cl-instr").value, notes: $("#cl-notes").value, active: $("#cl-active").checked };
    try { await api("/api/admin/clients" + (id ? "/" + id : ""), { method: id ? "PATCH" : "POST", body }); $("#clientForm").hidden = true; loadClients(); }
    catch (err) { alertInline($("#clientForm"), err.message); }
  });

  /* ---------- applications ---------- */
  async function loadApps() {
    const { applications } = await api("/api/admin/applications");
    const box = $("#appCards");
    if (!applications.length) { box.innerHTML = `<div class="empty-state" style="grid-column:1/-1">No applications yet. Notaries apply from the For Notaries page on your site.</div>`; return; }
    box.innerHTML = applications.map((a) => {
      const d = a.data;
      const caps = [d.nsa && "NSA certified", d.ron && "RON", d.rin && "RIN", d.laser && "Dual-tray laser", d.reverse && "Reverse mortgage"].filter(Boolean).join(" · ");
      if (d.role === "witness" || d.role === "process_server") return `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(d.name)} <span class="pill p-warn">${d.role === "witness" ? "Witness" : "Process server"}</span></h3><span class="pill ${a.status === "new" ? "p-warn" : a.status === "approved" ? "p-ok" : "p-info"}">${esc(a.status)}</span></div>
        <p class="meta">${esc(full(a.created_at))}</p>
        <dl class="kvs"><dt>Phone</dt><dd>${esc(d.phone)}</dd><dt>Email</dt><dd>${esc(d.email)}</dd><dt>Area</dt><dd>${esc(d.zip)} · ${esc(d.radius)}</dd><dt>Background</dt><dd>${esc(d.backgroundDate || "—")}</dd><dt>Available</dt><dd>${esc(d.availability || "—")}</dd>${d.vehicle ? `<dt>Vehicle</dt><dd>${esc(d.vehicle)}</dd>` : ""}${d.experience ? `<dt>Experience</dt><dd>${esc(d.experience)}</dd>` : ""}${d.languages ? `<dt>Languages</dt><dd>${esc(d.languages)}</dd>` : ""}</dl>
        ${a.status === "new" ? `<div class="actions"><button class="btn btn-primary btn-sm" data-app="${a.id}" data-s="approved">Approve &amp; send onboarding email</button><button class="btn btn-ghost btn-sm" data-app="${a.id}" data-s="declined">Decline</button></div>` : ""}</div>`;
      return `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(d.name)}</h3><span class="pill ${a.status === "new" ? "p-warn" : a.status === "approved" ? "p-ok" : "p-info"}">${esc(a.status)}</span></div>
        <p class="meta">${esc(full(a.created_at))}</p>
        <dl class="kvs"><dt>Phone</dt><dd>${esc(d.phone)}</dd><dt>Email</dt><dd>${esc(d.email)}</dd><dt>Commission</dt><dd>${esc(d.commissionState)} · exp ${esc(d.commissionExpires || "?")}</dd>
        <dt>Area</dt><dd>${esc(d.zip)} · ${esc(d.radius)}</dd><dt>E&amp;O</dt><dd>${esc(d.eo)}</dd><dt>Background</dt><dd>${esc(d.backgroundDate || "—")}</dd><dt>Signings</dt><dd>${esc(d.signings)}</dd><dt>Has</dt><dd>${esc(caps || "—")}</dd>${d.languages ? `<dt>Languages</dt><dd>${esc(d.languages)}</dd>` : ""}</dl>
        ${a.status === "new" ? `<div class="actions"><button class="btn btn-primary btn-sm" data-app="${a.id}" data-s="approved">Approve &amp; send onboarding email</button><button class="btn btn-ghost btn-sm" data-app="${a.id}" data-s="declined">Decline</button></div>` : ""}</div>`;
    }).join("");
    $$("[data-app]", box).forEach((b) => b.addEventListener("click", async () => {
      await api("/api/admin/applications/" + b.dataset.app, { method: "PATCH", body: { status: b.dataset.s, addToRoster: b.dataset.s === "approved" } });
      await loadNotaries(); loadApps(); loadStats();
    }));
  }

  /* ---------- messages ---------- */
  async function loadMsgs() {
    const { messages } = await api("/api/admin/messages");
    const box = $("#msgCards");
    if (!messages.length) { box.innerHTML = `<div class="empty-state" style="grid-column:1/-1">No messages yet. Messages from your site's Contact page land here.</div>`; return; }
    box.innerHTML = messages.map((m) => `<div class="card${m.handled ? " handled" : ""}"><h3>${esc(m.topic)}</h3><p class="meta">${esc(m.name)} · ${esc(m.email)} · ${esc(full(m.created_at))}</p><p>${esc(m.message)}</p>
      <div class="actions"><button class="btn btn-ghost btn-sm" data-msg="${m.id}" data-h="${m.handled ? 0 : 1}">${m.handled ? "Mark open" : "Mark handled"}</button></div></div>`).join("");
    $$("[data-msg]", box).forEach((b) => b.addEventListener("click", async () => {
      await api("/api/admin/messages/" + b.dataset.msg, { method: "PATCH", body: { handled: b.dataset.h === "1" } });
      loadMsgs(); loadStats();
    }));
  }

  /* ---------- settings ---------- */
  const STARTING = [["mobile", "Mobile notary visit"], ["loan", "Loan signing"], ["hospital", "Hospital or care facility visit"], ["process_serve", "Process serving"], ["apostille", "Apostille (per document)"], ["recording", "Document recording (per document)"], ["court_filing", "Court filing / run"], ["records", "Records retrieval"], ["skip_trace", "Skip trace"], ["medical_records", "Medical records pickup"], ["i9", "I-9 verification"]];
  function renderSettings() {
    const s = settings;
    const svcCard = (k) => {
      const c = s.services[k];
      const hours = [0, 1, 2, 3, 4, 5, 6].map((d) => {
        const h = c.hours[d];
        return `<span>${DOW[d]}</span><input type="time" data-h="${k}.${d}.0" value="${h ? h[0] : "09:00"}" ${h ? "" : "disabled"}><input type="time" data-h="${k}.${d}.1" value="${h ? (h[1] === "24:00" ? "23:59" : h[1]) : "17:00"}" ${h ? "" : "disabled"}><label><input type="checkbox" data-closed="${k}.${d}" ${h ? "" : "checked"}> Closed</label>`;
      }).join("");
      const p = s.pricing[k];
      const priceFields = k === "mobile"
        ? [["general", "General notary fee"], ["loan", "Loan signing fee"], ["perExtraSigner", "Per extra signer"]]
        : [["base", "Session fee"], ["perExtraSigner", "Per extra signer"]];
      return `<div class="set-card"><h3>${esc(c.label)}<label class="switch"><input type="checkbox" data-f="${k}.enabled" ${c.enabled ? "checked" : ""}> Taking bookings</label></h3>
        <div class="num-grid">
          <div class="field"><label>Appointment length (min)</label><input type="number" min="5" data-f="${k}.durationMin" value="${c.durationMin}"></div>
          <div class="field"><label>Start times every (min)</label><input type="number" min="5" data-f="${k}.slotStepMin" value="${c.slotStepMin}"></div>
          <div class="field"><label>At the same time (capacity)</label><input type="number" min="1" data-f="${k}.capacity" value="${c.capacity}"></div>
          <div class="field"><label>Minimum notice (hours)</label><input type="number" min="0" step="0.5" data-lead="${k}" value="${c.leadMinutes / 60}"></div>
          <div class="field"><label>Book up to (days ahead)</label><input type="number" min="1" data-f="${k}.maxDaysAhead" value="${c.maxDaysAhead}"></div>
        </div>
        <div class="field"><label>Hours (${esc(shortTz())})</label><div class="hours">${hours}</div></div>
        <div class="num-grid">${priceFields.map(([f, l]) => `<div class="field"><label>${l} ($)</label><input type="number" min="0" step="1" data-p="${k}.${f}" value="${p[f] ?? ""}" placeholder="Quote"></div>`).join("")}</div>
      </div>`;
    };
    $("#settingsBody").innerHTML = `
      <div class="set-grid">
        <div class="set-card"><h3>Business</h3>
          <div class="field"><label>Name</label><input data-b="name" value="${esc(s.business.name)}"></div>
          <div class="field"><label>Desk phone</label><input data-b="phone" value="${esc(s.business.phone)}"></div>
          <div class="field"><label>Desk email</label><input data-b="email" value="${esc(s.business.email)}"></div>
          <div class="field"><label>Send a test email to</label><div style="display:flex;gap:8px"><input id="testTo" type="email" placeholder="you@example.com" style="flex:1"><button type="button" class="btn" id="testEmailBtn">Send test</button></div><p class="form-msg" id="testEmailMsg" role="status"></p></div>
          <div class="field"><label>Desk time zone</label><select data-b="timezone">${["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"].map((z) => `<option ${z === s.business.timezone ? "selected" : ""}>${z}</option>`).join("")}</select></div>
          <div class="field"><label>RIN states (where your RIN notaries are commissioned)</label><input id="rinStates" value="${esc(s.rinStates.join(", "))}"></div>
          <div class="field"><label>States where you dispatch mobile notaries now</label><input id="liveStates" value="${esc((s.coverage?.liveStates || []).join(", "))}"></div>
        </div>
        <div class="set-card"><h3>Dispatch &amp; documents</h3>
          <label class="switch"><input type="checkbox" id="dsAuto" ${s.dispatch.auto ? "checked" : ""}> Auto-dispatch new online and client orders</label>
          <div class="num-grid">
            <div class="field"><label>Minutes to answer an offer</label><input type="number" min="5" id="dsMin" value="${s.dispatch.offerMinutes}"></div>
            <div class="field"><label>Minutes when under 4 hours away</label><input type="number" min="3" id="dsRush" value="${s.dispatch.rushOfferMinutes}"></div>
            <div class="field"><label>Notaries to try before alerting desk</label><input type="number" min="1" id="dsMax" value="${s.dispatch.maxOffers}"></div>
            <div class="field"><label>Delete documents after (days)</label><input type="number" min="1" id="dsRet" value="${s.documents.retentionDays}"></div>
          </div>
          <p style="font-size:.85rem;color:var(--muted)">Default notary fee offered on auto-dispatch ($). Leave blank to offer with no fee shown.</p>
          <div class="num-grid">
            <div class="field"><label>Mobile · loan signing</label><input type="number" min="0" id="nfLoan" value="${s.notaryFees.mobile.loan ?? ""}"></div>
            <div class="field"><label>Mobile · general notary</label><input type="number" min="0" id="nfGen" value="${s.notaryFees.mobile.general ?? ""}"></div>
            <div class="field"><label>RON session</label><input type="number" min="0" id="nfRon" value="${s.notaryFees.ron ?? ""}"></div>
            <div class="field"><label>RIN session</label><input type="number" min="0" id="nfRin" value="${s.notaryFees.rin ?? ""}"></div>
          </div>
        </div>
        <div class="set-card"><h3>Billing</h3>
          <p style="font-size:.86rem;color:var(--ink-2)">Invoices go out through Stripe when <span class="mono">STRIPE_SECRET_KEY</span> is set. Otherwise they're tracked here for you to send. Stripe pays out to the bank you connect in Stripe.</p>
          <label class="switch"><input type="checkbox" id="biStripeAch" ${s.billing.stripeAch !== false ? "checked" : ""}> Stripe: let clients pay by bank (ACH, 0.8% up to $5) as well as card</label>
          <div class="num-grid">
            <div class="field"><label>Client terms (days)</label><input type="number" min="0" id="biTerms" value="${s.billing.termsDays}"></div>
            <div class="field"><label>Individual terms (days)</label><input type="number" min="0" id="biInd" value="${s.billing.individualTermsDays}"></div>
          </div>
          <div class="field"><label>Copy invoices to (emails, comma-separated)</label><input id="biCc" value="${esc((s.billing.ccEmails || []).join(", "))}"></div>
          <div class="field"><label>Minimum margin (% of client fee kept after paying the notary)</label><input type="number" min="0" max="90" step="1" id="biMargin" value="${s.billing.minMarginPct ?? 20}"></div>
          <div class="field"><label>Late fee on overdue business invoices (% a month, 0 = off)</label><input type="number" min="0" max="5" step="0.1" id="biLate" value="${s.billing.lateFeePct ?? 1.5}"></div>
          <label class="switch"><input type="checkbox" id="biAutoFeesAcct" ${s.billing.autoFeesForAccounts !== false ? "checked" : ""}> Add rush, after-hours and weekend fees automatically on business-account orders too</label>
          <h4 style="margin-top:14px">Card on file (individual customers)</h4>
          <label class="switch"><input type="checkbox" id="biCards" ${(s.billing.cardAtBooking || "ask") !== "off" ? "checked" : ""}> Ask individuals to save a card when they book (needs Stripe)</label>
          <label class="switch"><input type="checkbox" id="biAutoCharge" ${s.billing.autoChargeCards !== false ? "checked" : ""}> Charge the saved card automatically when a job is marked completed</label>
        </div>
        <div class="set-card"><h3>Checkout add-ons</h3>
          <p style="font-size:.86rem;color:var(--ink-2)">Offered when customers and clients book. Prices are what the client pays and show as separate lines on invoices.</p>
          ${(s.addons || []).map((a, i) => `<div class="inline" style="margin-top:8px;align-items:center">
            <label class="switch" style="margin:0;min-width:0;flex:1"><input type="checkbox" data-ad-on="${i}" ${a.enabled !== false ? "checked" : ""}> ${esc(a.label)}</label>
            <input type="number" min="0" step="0.01" data-ad-price="${i}" value="${a.price}" style="max-width:110px" aria-label="${esc(a.label)} price"></div>`).join("")}
        </div>
        <div class="set-card"><h3>Extra fees</h3>
          <p style="font-size:.86rem;color:var(--ink-2)">Shown on the public fees page and added to jobs as separate invoice lines. "Auto" fees are added when a job is booked; the rest you add from the booking. Notary share is the % suggested as extra pay.</p>
          ${(s.fees || []).map((f, i) => `<div class="inline" style="margin-top:8px;align-items:center">
            <label class="switch" style="margin:0;min-width:0;flex:1"><input type="checkbox" data-fe-on="${i}" ${f.enabled !== false ? "checked" : ""}> ${esc(f.label)}${f.unit ? ` <small>${esc(f.unit)}</small>` : ""}${f.auto ? ' <span class="pill p-info">Auto</span>' : ""}</label>
            <input type="number" min="0" step="0.01" data-fe-price="${i}" value="${f.price}" style="max-width:96px" aria-label="${esc(f.label)} price">
            <input type="number" min="0" max="100" step="5" data-fe-share="${i}" value="${f.share ?? 0}" style="max-width:76px" aria-label="${esc(f.label)} notary share %" title="Notary share %"></div>`).join("")}
          <p style="font-size:.8rem;color:var(--muted);margin-top:6px">Columns: price · notary share %</p>
        </div>
        <div class="set-card"><h3>Request extras</h3>
          <p style="font-size:.86rem;color:var(--ink-2)">Extras on process serves and other requests. Rush and same-day serves are added automatically when the client picks them.</p>
          ${(s.requestFees || []).map((f, i) => `<div class="inline" style="margin-top:8px;align-items:center">
            <label class="switch" style="margin:0;min-width:0;flex:1"><input type="checkbox" data-rf-on="${i}" ${f.enabled !== false ? "checked" : ""}> ${esc(f.label)}${f.unit ? ` <small>${esc(f.unit)}</small>` : ""}${f.auto ? ' <span class="pill p-info">Auto</span>' : ""}</label>
            <input type="number" min="0" step="0.01" data-rf-price="${i}" value="${f.price}" style="max-width:96px" aria-label="${esc(f.label)} price">
            <input type="number" min="0" max="100" step="5" data-rf-share="${i}" value="${f.share ?? 0}" style="max-width:76px" aria-label="${esc(f.label)} team share %" title="Team share %"></div>`).join("")}
        </div>
        <div class="set-card"><h3>Starting prices on the website</h3>
          <p style="font-size:.86rem;color:var(--ink-2)">Shown as "starting at" on the homepage and service pages. Leave one blank to hide it. Each job's actual quote is still yours to set.</p>
          ${STARTING.map(([k, label]) => `<div class="inline" style="margin-top:8px;align-items:center"><label for="sp-${k}" style="flex:1;min-width:0">${esc(label)}</label>
            <input type="number" min="0" step="1" id="sp-${k}" data-sp="${k}" value="${s.publicPrices && s.publicPrices[k] != null ? s.publicPrices[k] : ""}" placeholder="Hidden" style="max-width:110px"></div>`).join("")}
        </div>
        <div class="set-card"><h3>Google reviews</h3>
          <p style="font-size:.86rem;color:var(--ink-2)">After a job is completed, the customer gets one email asking for a Google review. Each email address is asked at most once per ${Number(s.reviews?.repeatDays) || 180} days and can opt out.</p>
          <label class="switch"><input type="checkbox" id="rvOn" ${s.reviews?.enabled ? "checked" : ""}> Send review requests</label>
          <div class="field"><label>Google review link</label><input id="rvUrl" type="url" placeholder="https://g.page/r/…/review" value="${esc(s.reviews?.googleUrl || "")}"></div>
          <div class="num-grid">
            <div class="field"><label>Hours after completion</label><input type="number" min="0" max="168" id="rvDelay" value="${s.reviews?.delayHours ?? 3}"></div>
            <div class="field"><label>Ask again after (days)</label><input type="number" min="30" id="rvRepeat" value="${s.reviews?.repeatDays ?? 180}"></div>
          </div>
        </div>
        <div class="set-card"><h3>Closed dates</h3>
          <ul class="blackouts" id="blackouts">${(s.blackouts || []).map((b, i) => `<li><span>${esc(b.date)} · ${esc(b.service === "all" ? "All services" : SVC[b.service])}${b.note ? " · " + esc(b.note) : ""}</span><button class="linkbtn" data-rm="${i}">Remove</button></li>`).join("") || '<li style="color:var(--muted)">No closed dates.</li>'}</ul>
          <div class="num-grid"><div class="field"><label>Date</label><input type="date" id="boDate"></div><div class="field"><label>Service</label><select id="boSvc"><option value="all">All</option><option value="mobile">Mobile</option><option value="ron">RON</option><option value="rin">RIN</option></select></div></div>
          <div class="inline"><input id="boNote" placeholder="Note (e.g. Thanksgiving)"><button class="btn btn-ghost btn-sm" id="boAdd" type="button">Add date</button></div>
        </div>
      </div>
      <div class="set-grid">${["mobile", "ron", "rin"].map(svcCard).join("")}</div>`;
    $$("[data-closed]").forEach((c) => c.addEventListener("change", () => {
      const [k, d] = c.dataset.closed.split(".");
      $$(`[data-h^="${k}.${d}."]`).forEach((i) => (i.disabled = c.checked));
    }));
    $$("[data-rm]").forEach((b) => b.addEventListener("click", () => { collectSettings(); settings.blackouts.splice(Number(b.dataset.rm), 1); renderSettings(); }));
    $("#boAdd").addEventListener("click", () => {
      if (!$("#boDate").value) return;
      collectSettings();
      settings.blackouts = [...(settings.blackouts || []), { date: $("#boDate").value, service: $("#boSvc").value, note: $("#boNote").value.trim() }].sort((a, b) => a.date.localeCompare(b.date));
      renderSettings();
    });
  }

  function collectSettings() {
    const s = JSON.parse(JSON.stringify(settings));
    $$("[data-b]").forEach((i) => (s.business[i.dataset.b] = i.value.trim()));
    const num = (id) => ($(id).value === "" ? null : Number($(id).value));
    s.dispatch = { auto: $("#dsAuto").checked, offerMinutes: num("#dsMin") || 30, rushOfferMinutes: num("#dsRush") || 10, maxOffers: num("#dsMax") || 6 };
    s.documents = { retentionDays: num("#dsRet") || 30 };
    s.notaryFees = { mobile: { loan: num("#nfLoan"), general: num("#nfGen") }, ron: num("#nfRon"), rin: num("#nfRin") };
    s.billing = { ...s.billing, termsDays: num("#biTerms") ?? 30, individualTermsDays: num("#biInd") ?? 0,
      stripeAch: $("#biStripeAch").checked, ccEmails: $("#biCc").value.split(/[,\s]+/).filter(Boolean),
      cardAtBooking: $("#biCards").checked ? "ask" : "off", autoChargeCards: $("#biAutoCharge").checked, minMarginPct: num("#biMargin") ?? 20,
      lateFeePct: num("#biLate") ?? 0, autoFeesForAccounts: $("#biAutoFeesAcct").checked };
    s.requestFees = (s.requestFees || []).map((f, i) => ({ ...f, enabled: $(`[data-rf-on="${i}"]`) ? $(`[data-rf-on="${i}"]`).checked : f.enabled !== false,
      price: $(`[data-rf-price="${i}"]`) ? Math.max(0, Number($(`[data-rf-price="${i}"]`).value) || 0) : f.price,
      share: $(`[data-rf-share="${i}"]`) ? Math.max(0, Math.min(100, Number($(`[data-rf-share="${i}"]`).value) || 0)) : f.share }));
    s.fees = (s.fees || []).map((f, i) => ({ ...f, enabled: $(`[data-fe-on="${i}"]`) ? $(`[data-fe-on="${i}"]`).checked : f.enabled !== false,
      price: $(`[data-fe-price="${i}"]`) ? Math.max(0, Number($(`[data-fe-price="${i}"]`).value) || 0) : f.price,
      share: $(`[data-fe-share="${i}"]`) ? Math.max(0, Math.min(100, Number($(`[data-fe-share="${i}"]`).value) || 0)) : f.share }));
    s.addons = (s.addons || []).map((a, i) => ({ ...a, enabled: $(`[data-ad-on="${i}"]`) ? $(`[data-ad-on="${i}"]`).checked : a.enabled !== false, price: $(`[data-ad-price="${i}"]`) ? Math.max(0, Number($(`[data-ad-price="${i}"]`).value) || 0) : a.price }));
    s.reviews = { enabled: $("#rvOn").checked, googleUrl: $("#rvUrl").value.trim(), delayHours: num("#rvDelay") ?? 3, repeatDays: num("#rvRepeat") || 180 };
    s.coverage = { liveStates: $("#liveStates").value.toUpperCase().split(/[^A-Z]+/).filter((x) => x.length === 2) };
    s.rinStates = $("#rinStates").value.toUpperCase().split(/[^A-Z]+/).filter((x) => x.length === 2);
    $$("[data-f]").forEach((i) => {
      const [k, f] = i.dataset.f.split(".");
      s.services[k][f] = i.type === "checkbox" ? i.checked : Number(i.value);
    });
    $$("[data-lead]").forEach((i) => (s.services[i.dataset.lead].leadMinutes = Math.round(Number(i.value) * 60)));
    ["mobile", "ron", "rin"].forEach((k) => {
      for (let d = 0; d < 7; d++) {
        const closed = $(`[data-closed="${k}.${d}"]`).checked;
        if (closed) s.services[k].hours[d] = null;
        else {
          let a = $(`[data-h="${k}.${d}.0"]`).value, b = $(`[data-h="${k}.${d}.1"]`).value;
          if (b === "23:59") b = "24:00";
          s.services[k].hours[d] = [a, b];
        }
      }
    });
    s.publicPrices = s.publicPrices || {};
    $$("[data-sp]").forEach((i) => { s.publicPrices[i.dataset.sp] = i.value === "" ? null : Number(i.value); });
    $$("[data-p]").forEach((i) => {
      const [k, f] = i.dataset.p.split(".");
      s.pricing[k][f] = i.value === "" ? null : Number(i.value);
    });
    settings = s;
    return s;
  }

  document.addEventListener("click", async (ev) => {
    if (!ev.target.closest || !ev.target.closest("#testEmailBtn")) return;
    const m = $("#testEmailMsg"), btn = $("#testEmailBtn");
    btn.disabled = true; m.className = "form-msg"; m.textContent = "Sending…";
    try {
      const r = await api("/api/admin/test-email", { method: "POST", body: { to: $("#testTo").value.trim() } });
      m.className = "form-msg ok"; m.textContent = `Sent from ${r.from} to ${r.to}. Check that inbox (and spam).`;
    } catch (e) { m.className = "form-msg"; m.textContent = e.message; }
    btn.disabled = false;
  });

  $("#saveSettings").addEventListener("click", async () => {
    const m = $("#settingsMsg");
    try {
      settings = (await api("/api/admin/settings", { method: "PUT", body: { settings: collectSettings() } })).settings;
      TZ = settings.business.timezone;
      m.className = "form-msg ok"; m.textContent = "Saved. Online booking uses the new settings right away.";
      renderSettings();
    } catch (e) { m.className = "form-msg"; m.textContent = e.message; }
  });

  start().catch(showLogin);
})();
