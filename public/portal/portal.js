/* MCC Solutions notary portal */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => "$" + Number(n || 0).toFixed(2).replace(/\.00$/, "");
  const SVC = { mobile: "Mobile", ron: "RON", rin: "RIN" };
  let me = null, TZ = "America/New_York", tab = "jobs";

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      method: opts.method || "GET",
      headers: { "X-Requested-With": "mcc-portal", ...(opts.raw ? { "Content-Type": opts.type } : opts.body ? { "Content-Type": "application/json" } : {}) },
      body: opts.raw ? opts.raw : opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
    let j = {};
    try { j = await res.json(); } catch {}
    if (res.status === 401) { showSignin(j.error); throw new Error(j.error || "Sign in again."); }
    if (!res.ok) throw Object.assign(new Error(j.error || "Something went wrong."), { fields: j.fields });
    return j;
  }
  const when = (iso, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz || TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  const msg = (el, text, kind) => { el.textContent = text; el.className = "msg " + (kind || ""); };

  /* ---------- sign in ---------- */
  function showSignin(text) {
    $("#signin").hidden = false;
    $("#tabs").hidden = true;
    $$("section[data-tab]").forEach((s) => (s.hidden = true));
    if (text) msg($("#loginMsg"), text, "err");
  }
  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true;
    try {
      await api("/api/portal/request-link", { method: "POST", body: { email: $("#l-email").value.trim() } });
      msg($("#loginMsg"), "If that email is on our roster, a sign-in link is on its way. Check your inbox (and spam).", "ok");
    } catch (err) { msg($("#loginMsg"), err.message, "err"); }
    btn.disabled = false;
  });
  $("#logout").addEventListener("click", async () => { await api("/api/portal/logout", { method: "POST" }).catch(() => {}); location.href = "/portal/"; });

  /* ---------- tabs ---------- */
  $$("#tabs button[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  document.addEventListener("click", (e) => { const g = e.target.closest("[data-go]"); if (g) showTab(g.dataset.go); });
  function showTab(t) {
    tab = t;
    $$("#tabs button[data-tab]").forEach((b) => (b.dataset.tab === t ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
    $$("section[data-tab]").forEach((s) => (s.hidden = s.dataset.tab !== t));
    scrollTo(0, 0);
  }

  /* ---------- load ---------- */
  async function load() {
    me = await api("/api/portal/me");
    TZ = me.timezone;
    $("#signin").hidden = true;
    $("#tabs").hidden = false;
    $("#who").textContent = me.notary.name;
    const portalName = { witness: "Witness Portal", process_server: "Process Server Portal" }[me.role];
    if (portalName) { const bn = document.querySelector(".brand-name"); if (bn) bn.textContent = portalName; document.title = portalName + " · MCC Solutions"; }
    $("#bOnb").hidden = me.compliance.ready && me.compliance.items.every((i) => i.state === "ok");
    $("#notReady").hidden = me.compliance.ready;
    renderOnboarding();
    await loadJobs();
    await loadRequests();
    showTab(tab);
    const m = location.hash.match(/^#(?:job|req)-(\d+)$/);
    if (m) {
      showTab("jobs");
      const el = document.getElementById(location.hash.slice(1));
      if (el) { el.classList.add("hl"); el.scrollIntoView({ block: "start" }); }
    }
  }

  /* ---------- jobs ---------- */
  function details(j, full) {
    const rows = [
      ["When", when(j.start, j.service === "mobile" ? j.tz : TZ) + (j.service === "mobile" && j.tz && j.tz !== TZ ? " (signer's local time)" : "")],
      ["Type", `${SVC[j.service]} · ${j.category} · ${j.signers} signer${j.signers > 1 ? "s" : ""}`],
      [j.service === "mobile" ? (full ? "Address" : "Area") : "Signer at", full && j.service === "mobile" ? `${j.address}, ${j.area}` : j.area],
    ];
    if (j.docs_delivery) rows.push(["Documents", j.docs_delivery]);
    if (j.addons && j.addons.length) rows.push(["Also needed", j.addons.join(" · ")]);
    if (full) {
      rows.push(["Contact", `${j.contact_name} · ${j.contact_phone}`]);
      if (j.signer_names) rows.push(["Signers", j.signer_names]);
      if (j.company) rows.push(["Company", j.company + (j.file_number ? ` · File ${j.file_number}` : "")]);
      if (j.mailing_address) rows.push(["Docs mailed to", j.mailing_address]);
      if (j.notes) rows.push(["Notes", j.notes]);
    }
    return `<dl class="kvs">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`;
  }
  function head(j) {
    return `<div class="job-top"><div><p class="meta">${esc(j.ref)} · ${SVC[j.service]}${j.witness ? " · <b>Witness</b>" : ""}</p><h3>${j.witness ? "Witness: " : ""}${esc(j.category)}</h3></div>
      <div class="fee">${j.notary_fee != null ? money(j.notary_fee) : "—"}<small>Your fee</small></div></div>`;
  }

  async function loadJobs() {
    const { offers, upcoming, past, totals } = await api("/api/portal/jobs");
    const bj = $("#bJobs"); bj.hidden = !offers.length; bj.textContent = offers.length;

    $("#offers").innerHTML = offers.length ? offers.map((j) => `
      <article class="job" id="job-${j.id}">${head(j)}${details(j, false)}
        ${j.offer_expires_at ? `<p class="timer" data-expires="${esc(j.offer_expires_at)}"></p>` : ""}
        <p style="font-size:.86rem;color:var(--muted)">The full address, signer contact and documents appear after you accept.</p>
        ${j.witness
          ? `<div class="row"><button class="btn btn-primary" data-waccept="${j.witness_id}" ${me.compliance.ready ? "" : "disabled title='Finish onboarding first'"}>Accept</button>
          <input id="wreason-${j.witness_id}" placeholder="Reason for declining (optional)" aria-label="Reason for declining"><button class="btn btn-ghost" data-wdecline="${j.witness_id}">Decline</button></div>
          <p class="msg" id="wm-${j.witness_id}"></p>`
          : `<div class="row"><button class="btn btn-primary" data-accept="${j.id}" ${me.compliance.ready ? "" : "disabled title='Finish onboarding first'"}>Accept Job</button>
          <input id="reason-${j.id}" placeholder="Reason for declining (optional)" aria-label="Reason for declining"><button class="btn btn-ghost" data-decline="${j.id}">Decline</button></div>
          <p class="msg" id="m-${j.id}"></p>`}</article>`).join("")
      : `<div class="empty">No open offers right now. We'll email${me.notary.sms_ok ? " and text" : ""} you when one comes in.</div>`;

    $("#upcoming").innerHTML = upcoming.length ? upcoming.map((j) => {
      if (j.witness) return `<article class="job" id="job-${j.id}">${head(j)}${details(j, true)}
        ${j.notary_name ? `<p style="font-size:.9rem">Notary on this signing: <b>${esc(j.notary_name)}</b></p>` : ""}
        <p style="font-size:.86rem;color:var(--muted)">Bring your photo ID. The notary marks the signing complete; you're paid after it's done. Can't make it? Call the desk right away.</p></article>`;
      const started = Date.parse(j.start) <= Date.now() + 15 * 60000;
      const needsTracking = j.service !== "ron" && j.is_loan;
      return `<article class="job" id="job-${j.id}">${head(j)}${details(j, true)}${jobDocs(j)}
        <div class="row">
          ${started ? `<input id="trk-${j.id}" placeholder="${needsTracking ? "Return tracking number (required)" : "Return tracking number"}" aria-label="Return tracking number">
          <input id="note-${j.id}" placeholder="Note for the desk (optional)" aria-label="Note for the desk">
          <button class="btn btn-primary" data-complete="${j.id}">Mark Complete</button>` : `<span style="font-size:.88rem;color:var(--muted)">You can mark this complete once the appointment starts. Can't make it? Call the desk right away.</span>`}
        </div><p class="msg" id="m-${j.id}"></p></article>`;
    }).join("") : `<div class="empty">No upcoming jobs.</div>`;

    $$("[data-scan]").forEach((inp) => inp.addEventListener("change", () => uploadScans(inp)));
    $$("[data-delscan]").forEach((b) => b.addEventListener("click", async () => { await api("/api/portal/booking-documents/" + b.dataset.delscan, { method: "DELETE" }).catch((e) => alert(e.message)); loadJobs(); }));
    tickTimers();
    $$("[data-accept]").forEach((b) => b.addEventListener("click", () => act(b, `/api/portal/jobs/${b.dataset.accept}/accept`, {}, "Accepted. The details are below.")));
    $$("[data-decline]").forEach((b) => b.addEventListener("click", () => act(b, `/api/portal/jobs/${b.dataset.decline}/decline`, { reason: $("#reason-" + b.dataset.decline).value }, "Declined. Thanks for letting us know.")));
    $$("[data-waccept]").forEach((b) => b.addEventListener("click", () => wact(b, `/api/portal/witness/${b.dataset.waccept}/accept`, {}, "Accepted. The details are below.", "wm-" + b.dataset.waccept)));
    $$("[data-wdecline]").forEach((b) => b.addEventListener("click", () => wact(b, `/api/portal/witness/${b.dataset.wdecline}/decline`, { reason: $("#wreason-" + b.dataset.wdecline).value }, "Declined. Thanks for letting us know.", "wm-" + b.dataset.wdecline)));
    $$("[data-complete]").forEach((b) => b.addEventListener("click", () => act(b, `/api/portal/jobs/${b.dataset.complete}/complete`, { tracking: $("#trk-" + b.dataset.complete).value, note: $("#note-" + b.dataset.complete).value }, "Marked complete. Thank you.")));

    $("#tEarned").textContent = money(totals.earned);
    $("#tUnpaid").textContent = money(totals.unpaid);
    $("#pastRows").innerHTML = past.length ? past.map((j) => `<tr><td>${esc(when(j.start).replace(/, \d{1,2}:\d{2}.*/, ""))}</td><td>${esc(j.ref)} · ${esc(j.category)}${j.status === "no_show" ? " (no-show)" : ""}</td><td>${j.notary_fee != null ? money(j.notary_fee) : "—"}</td>
      <td>${j.notary_paid_at ? `<span class="pill p-ok">Paid ${esc(j.notary_paid_at.slice(0, 10))}</span>` : j.status === "completed" ? '<span class="pill p-warn">Pending</span>' : "—"}</td><td class="mono">${esc(j.return_tracking || "")}</td></tr>`).join("")
      : `<tr><td colspan="5" style="font-weight:400;color:var(--ink-2)">Completed jobs will show here.</td></tr>`;
  }

  /* ---------- service requests ---------- */
  async function loadRequests() {
    let data;
    try { data = await api("/api/portal/requests"); } catch { return; }
    const { offers, active, past, results } = data;
    $("#reqWrap").hidden = !(offers.length || active.length || past.length || me.role === "process_server");
    // Process servers only take service requests, so the notary booking sections are hidden for them.
    if (me.role === "process_server") $("#bookingJobs").hidden = true;
    const fmtDate = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
    const top = (j) => `<div class="job-top"><div><p class="meta">${esc(j.ref)} · ${esc(j.type_label)}${j.due_date ? ` · due ${esc(fmtDate(j.due_date))}` : ""}</p><h3>${esc(j.type_label)} · ${esc(j.area)}</h3></div>
      <div class="fee">${j.fee != null ? money(j.fee) : "—"}<small>Your pay</small></div></div>`;
    const resultOpts = Object.entries(results).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
    const html = [];
    offers.forEach((j) => html.push(`<article class="job" id="req-${j.id}">${top(j)}<p style="font-size:.86rem;color:var(--muted)">Full details and documents appear after you accept.</p>
      <div class="row"><button class="btn btn-primary" data-raccept="${j.id}" ${me.compliance.ready ? "" : "disabled title='Finish onboarding first'"}>Accept</button>
      <input id="rreason-${j.id}" placeholder="Reason for declining (optional)" aria-label="Reason for declining"><button class="btn btn-ghost" data-rdecline="${j.id}">Decline</button></div>
      <p class="msg" id="rm-${j.id}"></p></article>`));
    active.forEach((j) => html.push(`<article class="job" id="req-${j.id}">${top(j)}
      <dl class="kvs req">${j.details.map((d) => `<dt>${esc(d.label)}</dt><dd>${esc(d.value)}</dd>`).join("")}${j.notes ? `<dt>Notes</dt><dd>${esc(j.notes)}</dd>` : ""}<dt>Client</dt><dd>${esc(j.contact_name)}${j.company ? " · " + esc(j.company) : ""}${j.contact_phone ? " · " + esc(j.contact_phone) : ""}</dd></dl>
      <p class="sub" style="margin-top:12px">Documents</p>
      ${j.documents.length ? `<ul class="log">${j.documents.map((d) => `<li style="grid-template-columns:1fr auto"><a href="/api/portal/request-documents/${d.id}" target="_blank" rel="noopener">${esc(d.filename)}</a><span class="pill p-info">${esc(d.kind === "papers" ? "To serve" : d.kind === "proof" ? "Proof" : "Other")}</span></li>`).join("")}</ul>` : `<p style="font-size:.88rem;color:var(--muted)">No documents yet. The desk will upload them.</p>`}
      <p class="sub" style="margin-top:12px">Attempts</p>
      ${j.attempts.length ? `<ul class="log">${j.attempts.map((a) => `<li style="grid-template-columns:auto 1fr"><time>${esc(when(a.at))}</time><span><b>${esc(results[a.result] || a.result)}</b>${a.served_to ? " · " + esc(a.served_to) : ""}${a.description ? " · " + esc(a.description) : ""}</span></li>`).join("")}</ul>` : `<p style="font-size:.88rem;color:var(--muted)">No attempts logged yet.</p>`}
      <div class="row" style="flex-wrap:wrap;margin-top:8px">
        <select id="ra-res-${j.id}" aria-label="Result">${resultOpts}</select>
        <input id="ra-at-${j.id}" type="datetime-local" aria-label="When">
        <input id="ra-to-${j.id}" placeholder="Served to (name or description)" aria-label="Served to">
        <input id="ra-desc-${j.id}" placeholder="Notes (door color, who answered…)" aria-label="Notes">
        <button class="btn btn-ghost btn-sm" data-rattempt="${j.id}">Log attempt</button>
      </div>
      <div class="row" style="flex-wrap:wrap;margin-top:8px">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">Upload ${j.type === "process_serve" ? "signed affidavit" : "proof"}<input type="file" accept="application/pdf,image/*" data-rproof="${j.id}" hidden></label>
        <input id="rc-note-${j.id}" placeholder="Note for the desk (optional)" aria-label="Note for the desk">
        <button class="btn btn-primary btn-sm" data-rcomplete="${j.id}">Mark complete</button>
      </div>
      <p class="msg" id="rm-${j.id}"></p></article>`));
    if (past.length) html.push(`<p class="sub" style="margin-top:12px">Completed requests</p><ul class="log">${past.map((j) => `<li style="grid-template-columns:1fr auto"><span>${esc(j.ref)} · ${esc(j.type_label)}${j.fee != null ? " · " + money(j.fee) : ""}</span>${j.paid_at ? `<span class="pill p-ok">Paid</span>` : `<span class="pill p-warn">Pending</span>`}</li>`).join("")}</ul>`);
    $("#reqs").innerHTML = html.join("") || `<div class="empty">No service requests right now. We'll email you when one comes in.</div>`;
    const ract = async (btn, path, body, id, okText) => {
      btn.disabled = true;
      try { await api(path, { method: "POST", body }); await loadRequests(); alertTop(okText); }
      catch (e) { msg($("#rm-" + id), e.message, "err"); btn.disabled = false; }
    };
    $$("[data-raccept]").forEach((b) => b.addEventListener("click", () => ract(b, `/api/portal/requests/${b.dataset.raccept}/accept`, {}, b.dataset.raccept, "Accepted. The details are below.")));
    $$("[data-rdecline]").forEach((b) => b.addEventListener("click", () => ract(b, `/api/portal/requests/${b.dataset.rdecline}/decline`, { reason: $("#rreason-" + b.dataset.rdecline).value }, b.dataset.rdecline, "Declined. Thanks for letting us know.")));
    $$("[data-rattempt]").forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.rattempt, at = $("#ra-at-" + id).value;
      ract(b, `/api/portal/requests/${id}/attempts`, { result: $("#ra-res-" + id).value, at: at ? new Date(at).toISOString() : "", servedTo: $("#ra-to-" + id).value, description: $("#ra-desc-" + id).value }, id, "Attempt logged.");
    }));
    $$("[data-rcomplete]").forEach((b) => b.addEventListener("click", () => ract(b, `/api/portal/requests/${b.dataset.rcomplete}/complete`, { note: $("#rc-note-" + b.dataset.rcomplete).value }, b.dataset.rcomplete, "Marked complete. Thank you.")));
    $$("[data-rproof]").forEach((inp) => inp.addEventListener("change", async () => {
      const f = inp.files[0], id = inp.dataset.rproof; if (!f) return;
      msg($("#rm-" + id), "Uploading…", "ok");
      try { await api(`/api/portal/requests/${id}/documents?filename=${encodeURIComponent(f.name)}`, { method: "POST", raw: f, type: f.type || "application/octet-stream" }); await loadRequests(); alertTop("Uploaded."); }
      catch (e) { msg($("#rm-" + id), e.message, "err"); }
    }));
  }

  function jobDocs(j) {
    const pk = (j.documents || []).filter((d) => d.kind !== "scanback");
    const sc = (j.documents || []).filter((d) => d.kind === "scanback" && d.review_status !== "superseded");
    const needScans = j.service !== "ron";
    const rejected = sc.filter((d) => d.review_status === "rejected");
    const pill = { pending: '<span class="pill p-info">Under review</span>', approved: '<span class="pill p-ok">Approved</span>', rejected: '<span class="pill p-warn">Needs fix</span>' };
    return `<div class="jdocs">
      ${j.client_instructions ? `<div class="instr"><b>Client instructions:</b> ${esc(j.client_instructions)}</div>` : ""}
      <h4>Documents to print</h4>
      ${pk.length ? pk.map((d) => `<div class="jdoc">${d.purged_at ? `<span>${esc(d.filename)} <small style="color:var(--muted)">(deleted after retention period)</small></span>` : `<a href="/api/portal/booking-documents/${d.id}" target="_blank" rel="noopener">${esc(d.filename)}</a>`}<small style="color:var(--muted)">${(d.size_bytes / 1048576).toFixed(1)} MB${d.downloaded_at ? " · downloaded" : ""}</small></div>`).join("")
        : `<p style="font-size:.9rem;color:var(--muted)">${j.docs_delivery && /courier|already/i.test(j.docs_delivery) ? esc(j.docs_delivery) + "." : "Not uploaded yet. We'll email you when they're ready."}</p>`}
      ${needScans ? `<h4 style="margin-top:6px">Scanbacks</h4>
      ${rejected.length ? rejected.map((d) => `<p class="msg err">Fix needed on ${esc(d.filename)}: ${esc(d.review_note)}</p>`).join("") : ""}
      ${sc.filter((d) => d.review_status !== "rejected").map((d) => `<div class="jdoc"><a href="/api/portal/booking-documents/${d.id}" target="_blank" rel="noopener">${esc(d.filename)}</a><span>${pill[d.review_status] || ""} ${d.review_status === "pending" ? `<button class="linkbtn" data-delscan="${d.id}">Remove</button>` : ""}</span></div>`).join("")}
      <label class="btn btn-ghost btn-sm" style="align-self:flex-start;cursor:pointer">Upload scanbacks<input type="file" accept="application/pdf,image/*" multiple data-scan="${j.id}" hidden></label>
      <p class="msg" id="sm-${j.id}"></p>` : ""}
    </div>`;
  }

  async function uploadScans(inp) {
    const id = inp.dataset.scan, m = $("#sm-" + id);
    for (const f of inp.files) {
      if (f.size > 50 * 1024 * 1024) { msg(m, `${f.name} is over 50 MB.`, "err"); return; }
      msg(m, `Uploading ${f.name}…`, "ok");
      try { await api(`/api/portal/jobs/${id}/scanbacks?filename=${encodeURIComponent(f.name)}`, { method: "POST", raw: f, type: f.type || "application/octet-stream" }); }
      catch (e) { msg(m, e.message, "err"); return; }
    }
    await loadJobs();
    const m2 = $("#sm-" + id); if (m2) msg(m2, "Uploaded. The desk will review them.", "ok");
  }

  let timerInt;
  function tickTimers() {
    clearInterval(timerInt);
    const run = () => $$("[data-expires]").forEach((el) => {
      const ms = Date.parse(el.dataset.expires) - Date.now();
      el.textContent = ms > 0 ? `Answer within ${Math.floor(ms / 60000)} min ${String(Math.floor(ms / 1000) % 60).padStart(2, "0")} s, then it goes to the next notary.` : "This offer has expired.";
    });
    run(); timerInt = setInterval(run, 1000);
  }

  async function wact(btn, path, body, okText, msgId) {
    btn.disabled = true;
    try { await api(path, { method: "POST", body }); await loadJobs(); alertTop(okText); }
    catch (e) { const m = $("#" + msgId); if (m) msg(m, e.message, "err"); else alertTop(e.message); btn.disabled = false; }
  }
  async function act(btn, path, body, okText) {
    const id = path.split("/")[4];
    btn.disabled = true;
    try {
      await api(path, { method: "POST", body });
      await loadJobs();
      const m = $("#m-" + id);
      if (m) msg(m, okText, "ok");
      else { const el = document.getElementById("job-" + id); if (!el) alertTop(okText); }
    } catch (e) { msg($("#m-" + id), e.message, "err"); btn.disabled = false; }
  }
  function alertTop(text) {
    let b = $("#topNote");
    if (!b) { b = document.createElement("div"); b.id = "topNote"; b.className = "banner"; b.style.background = "var(--ok-soft)"; b.style.borderColor = "var(--ok)"; $("section[data-tab=jobs]").prepend(b); }
    b.textContent = text;
    setTimeout(() => b.remove(), 5000);
  }

  /* ---------- onboarding ---------- */
  function renderOnboarding() {
    const icon = { ok: "✓", warn: "!", missing: "", expired: "×" };
    $("#checklist").innerHTML = me.compliance.items.map((i) => `<li><span class="dot ${i.state}">${icon[i.state]}</span><span><b>${esc(i.label)}</b><small>${esc(i.detail)}</small></span>
      <span class="pill ${i.state === "ok" ? "p-ok" : i.state === "warn" ? "p-warn" : "p-info"}">${i.state === "ok" ? "Done" : i.state === "warn" ? "Renew soon" : i.state === "expired" ? "Expired" : "To do"}</span></li>`).join("");

    const n = me.notary;
    $("#c-num").value = n.commission_number || ""; $("#c-exp").value = n.commission_expires || "";
    $("#c-eoamt").value = n.eo_amount || ""; $("#c-eoexp").value = n.eo_expires || "";
    $("#c-bg").value = n.background_date || ""; $("#c-phone").value = n.phone || ""; $("#c-sms").checked = !!n.sms_ok;
    $("#c-zip").value = n.home_zip || ""; $("#c-miles").value = n.travel_miles || 30;

    const witness = me.role === "witness", server = me.role === "process_server";
    ["#c-num", "#c-exp", "#c-eoamt", "#c-eoexp"].forEach((sel) => { const f = $(sel) && $(sel).closest(".field"); if (f) f.hidden = witness || server; });
    $$("[data-ps]").forEach((f) => (f.hidden = !server));
    $("#c-lic").value = n.license_expires || ""; $("#c-reg").value = n.vehicle_reg_expires || ""; $("#c-ins").value = n.auto_insurance_expires || "";
    const kinds = server ? ["license", "registration", "auto_insurance", "background", "w9"] : witness ? ["id", "background", "w9"] : ["commission", "eo", "background", "w9", "certification"];
    $("#docs").innerHTML = kinds.map((k) => {
      const files = me.documents.filter((d) => d.kind === k);
      return `<div class="doc-row"><span><b>${esc(me.docKinds[k])}</b>${k === "certification" ? ' <span style="color:var(--muted);font-size:.85rem">(optional, e.g. NNA)</span>' : ""}</span>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer">${files.length ? "Replace" : "Upload"}<input type="file" accept="application/pdf,image/*" data-kind="${k}" hidden></label>
        ${files.length ? `<div class="files">${files.map((f) => `<span><a href="/api/portal/documents/${f.id}" target="_blank" rel="noopener">${esc(f.filename)}</a> · ${esc(f.uploaded_at.slice(0, 10))} <button class="linkbtn" data-del="${f.id}">Remove</button></span>`).join("")}</div>` : ""}
        <p class="msg" id="dm-${k}" style="grid-column:1/-1"></p></div>`;
    }).join("");
    $$("#docs input[type=file]").forEach((inp) => inp.addEventListener("change", () => upload(inp)));
    $$("#docs [data-del]").forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "Click again to remove"; return; }
      await api("/api/portal/documents/" + b.dataset.del, { method: "DELETE" }); await load();
    }));

    const rules = me.stateRules || [];
    $("#stateBox").hidden = !rules.length;
    $("#stateSub").textContent = `${[...new Set(rules.map((r) => r.state))].join(", ")} requirements`;
    $("#stateRules").innerHTML = rules.map((r) => {
      const done = me.attestations[r.key];
      return `<div class="doc-row" style="grid-template-columns:1fr"><b>${esc(r.label)}</b>
        <p style="font-size:.9rem;color:var(--ink-2)">${esc(r.text)}</p>
        ${done && done.at ? `<p><span class="pill p-ok">Confirmed ${esc(String(done.at).slice(0, 10))}</span>${done.value ? ` · ${esc(done.value)}` : ""}</p>`
        : `${r.input ? `<div class="field"><label for="at-${r.key}">${esc(r.input)}</label><input id="at-${r.key}"></div>` : ""}
           <label class="agree"><input type="checkbox" id="ac-${r.key}"> I confirm this is true</label>
           <div class="row"><button class="btn btn-ghost btn-sm" data-attest="${r.key}">Confirm</button><p class="msg" id="am-${r.key}"></p></div>`}</div>`;
    }).join("");
    $$("[data-attest]").forEach((b) => b.addEventListener("click", async () => {
      const k = b.dataset.attest;
      try { await api("/api/portal/attest", { method: "POST", body: { key: k, confirm: $("#ac-" + k).checked, value: $("#at-" + k)?.value || "" } }); await load(); showTab("onboarding"); }
      catch (e) { msg($("#am-" + k), e.message, "err"); }
    }));

    const a = me.agreement;
    const signedCurrent = n.agreement_at && n.agreement_version === a.version;
    $("#agreeBox").innerHTML = `<div class="agreement-text">${esc(a.text)}</div>
      ${signedCurrent ? `<p style="margin-top:14px"><span class="pill p-ok">Signed</span> by ${esc(n.agreement_name)} on ${esc(n.agreement_at.slice(0, 10))} (version ${esc(n.agreement_version)})</p>`
      : `<div class="grid2" style="margin-top:16px"><div class="field"><label for="a-name">Type your full legal name</label><input id="a-name" autocomplete="name" placeholder="${esc(n.name)}"></div></div>
         <label class="agree" style="margin-top:12px"><input type="checkbox" id="a-ok"> I have read and agree to the Independent Contractor &amp; Data Security Agreement (version ${esc(a.version)}).</label>
         <div class="row" style="margin-top:14px"><button class="btn btn-primary" id="a-sign">Sign Agreement</button><p class="msg" id="aMsg"></p></div>`}`;
    const sign = $("#a-sign");
    if (sign) sign.addEventListener("click", async () => {
      sign.disabled = true;
      try { await api("/api/portal/agreement", { method: "POST", body: { name: $("#a-name").value, agree: $("#a-ok").checked } }); await load(); showTab("onboarding"); }
      catch (e) { msg($("#aMsg"), e.message, "err"); sign.disabled = false; }
    });
  }

  async function upload(inp) {
    const file = inp.files[0];
    if (!file) return;
    const k = inp.dataset.kind;
    const m = $("#dm-" + k);
    if (file.size > 10 * 1024 * 1024) return msg(m, "That file is over 10 MB. Try a smaller scan or photo.", "err");
    msg(m, "Uploading…", "ok");
    try {
      await api(`/api/portal/documents?kind=${k}&filename=${encodeURIComponent(file.name)}`, { method: "POST", raw: file, type: file.type || "application/octet-stream" });
      await load(); showTab("onboarding");
    } catch (e) { msg(m, e.message, "err"); }
  }

  $("#credForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("/api/portal/me", { method: "PATCH", body: {
        commission_number: $("#c-num").value, commission_expires: $("#c-exp").value, eo_amount: $("#c-eoamt").value,
        eo_expires: $("#c-eoexp").value, background_date: $("#c-bg").value, phone: $("#c-phone").value, sms_ok: $("#c-sms").checked,
        home_zip: $("#c-zip").value.trim(), travel_miles: $("#c-miles").value,
        license_expires: $("#c-lic").value, vehicle_reg_expires: $("#c-reg").value, auto_insurance_expires: $("#c-ins").value,
      } });
      await load(); showTab("onboarding");
      msg($("#credMsg"), "Saved.", "ok");
    } catch (err) { msg($("#credMsg"), err.fields ? Object.values(err.fields).join(" ") : err.message, "err"); }
  });

  /* ---------- start ---------- */
  (async function start() {
    const q = new URLSearchParams(location.search);
    const t = q.get("t");
    if (t) {
      history.replaceState(null, "", "/portal/" + location.hash);
      try { await fetch("/api/portal/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t }) }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error); }); }
      catch (e) { showSignin(e.message); return; }
    }
    try { await load(); } catch {}
  })();
})();
