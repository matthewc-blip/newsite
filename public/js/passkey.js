/* Passkey (WebAuthn) screens shared by the client portal and the notary portal.
   MCCPasskey.gate({root, base, header, onDone}): the required second step after the emailed link.
   MCCPasskey.manager({root, base, header}): list, add and remove passkeys. */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toBuf = (b64u) => { const p = b64u.replace(/-/g, "+").replace(/_/g, "/"), s = atob(p + "=".repeat((4 - (p.length % 4)) % 4)); return Uint8Array.from(s, (c) => c.charCodeAt(0)).buffer; };
  const toB64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const supported = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);

  function client(base, header) {
    return async (path, method, body) => {
      const res = await fetch(base + path, { method: method || "GET", credentials: "same-origin",
        headers: { "X-Requested-With": header, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
      let j = {}; try { j = await res.json(); } catch {}
      if (!res.ok) throw Object.assign(new Error(j.error || "Something went wrong."), { code: j.code, status: res.status });
      return j;
    };
  }
  const friendly = (e) => {
    if (e && (e.name === "NotAllowedError" || e.name === "AbortError")) return "That was canceled or timed out. Try again and approve the prompt on your device.";
    if (e && e.name === "InvalidStateError") return "That device already has a passkey on this account.";
    if (e && e.name === "SecurityError") return "Your browser blocked the passkey on this address. Open the site at its normal web address and try again.";
    return (e && e.message) || "Something went wrong. Try again.";
  };

  async function createPasskey(call, name) {
    const { options, state } = await call("/register/options", "POST", {});
    options.challenge = toBuf(options.challenge);
    options.user.id = toBuf(options.user.id);
    (options.excludeCredentials || []).forEach((c) => (c.id = toBuf(c.id)));
    const cred = await navigator.credentials.create({ publicKey: options });
    const r = cred.response;
    await call("/register/verify", "POST", { state, name, response: {
      id: cred.id, rawId: toB64u(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment || undefined, clientExtensionResults: cred.getClientExtensionResults(),
      response: { clientDataJSON: toB64u(r.clientDataJSON), attestationObject: toB64u(r.attestationObject), transports: r.getTransports ? r.getTransports() : [] },
    } });
  }
  async function usePasskey(call) {
    const { options, state } = await call("/auth/options", "POST", {});
    options.challenge = toBuf(options.challenge);
    (options.allowCredentials || []).forEach((c) => (c.id = toBuf(c.id)));
    const cred = await navigator.credentials.get({ publicKey: options });
    const r = cred.response;
    await call("/auth/verify", "POST", { state, response: {
      id: cred.id, rawId: toB64u(cred.rawId), type: cred.type, authenticatorAttachment: cred.authenticatorAttachment || undefined, clientExtensionResults: cred.getClientExtensionResults(),
      response: { clientDataJSON: toB64u(r.clientDataJSON), authenticatorData: toB64u(r.authenticatorData), signature: toB64u(r.signature), userHandle: r.userHandle ? toB64u(r.userHandle) : undefined },
    } });
  }

  async function gate({ root, base, header, onDone, after, lost }) {
    after = after || "the email link";
    const call = client(base, header);
    root.innerHTML = '<p class="eyebrow">Two-step sign-in</p><p style="color:var(--ink-2)">Checking your account…</p>';
    let st;
    try { st = await call("/status"); } catch (e) { root.innerHTML = `<p class="eyebrow">Two-step sign-in</p><p class="msg err">${esc(e.message)}</p><p><a href="">Start over</a></p>`; return; }
    if (st.verified) return onDone();
    const has = st.passkeys.length > 0;
    root.innerHTML = `<p class="eyebrow">Two-step sign-in</p>
      <h2>${has ? "Confirm it's you" : "Set up your passkey"}</h2>
      <p style="color:var(--ink-2)">${has
        ? "Use the passkey you registered: your fingerprint, face or device PIN, or a security key."
        : `Your account needs a second step after ${after}. A passkey uses your device's fingerprint, face or PIN (or a security key) and can't be phished or intercepted. We don't use text-message codes.`}</p>
      ${has ? "" : '<div class="field"><label for="pk-name">Name this passkey <span class="opt">(optional)</span></label><input id="pk-name" maxlength="60" placeholder="Work laptop, iPhone…"></div>'}
      <button class="btn btn-primary" type="button" id="pk-go">${has ? "Use my passkey" : "Create a passkey"}</button>
      <p class="msg" id="pk-msg" role="status"></p>
      <p style="font-size:.85rem;color:var(--muted)">${has ? (lost || "Lost your passkey or changed devices? Contact the desk and we'll reset it so you can register a new one.") : "You'll do this once per account, then confirm it each time you sign in."}</p>`;
    const msg = $m(root);
    if (!supported()) { msg("This browser doesn't support passkeys. Use a current version of Chrome, Safari, Edge or Firefox.", "err"); root.querySelector("#pk-go").disabled = true; return; }
    root.querySelector("#pk-go").onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true; msg("Waiting for your device…");
      try {
        if (has) await usePasskey(call); else await createPasskey(call, (root.querySelector("#pk-name").value || "").trim() || "Passkey");
        msg("Confirmed.", "ok"); onDone();
      } catch (e) { msg(friendly(e), "err"); b.disabled = false; }
    };
  }
  const $m = (root) => (t, k) => { const m = root.querySelector("#pk-msg"); if (m) { m.textContent = t; m.className = "msg " + (k || ""); } };

  async function manager({ root, base, header, note }) {
    const call = client(base, header);
    async function draw(note, kind) {
      let st; try { st = await call("/status"); } catch (e) { root.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; return; }
      const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "never");
      root.innerHTML = `<ul style="list-style:none;margin:0;padding:0">${st.passkeys.map((p) => `<li style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--line)"><span><b>${esc(p.name || "Passkey")}</b><br><small style="color:var(--muted)">Added ${esc(fmt(p.created_at))} · last used ${esc(fmt(p.last_used_at))}</small></span><button class="linkbtn" data-rm="${p.id}" style="color:var(--warn)">Remove</button></li>`).join("") || '<li style="padding:10px 0">No passkey yet.</li>'}</ul>
        <div style="margin-top:12px"><button class="btn btn-ghost btn-sm" type="button" id="pk-add">Add another passkey</button></div>
        <p class="msg ${kind || ""}" id="pk-msg" role="status">${esc(note || "")}</p>
        <p style="font-size:.85rem;color:var(--muted);margin-top:8px">${esc(note || "Sign-in uses your emailed link plus a passkey. Register one on each device you use, so losing one doesn't lock you out.")}</p>`;
      const msg = $m(root);
      root.querySelector("#pk-add").onclick = async (ev) => {
        if (!supported()) return msg("This browser doesn't support passkeys.", "err");
        ev.currentTarget.disabled = true; msg("Waiting for your device…");
        try { await createPasskey(call, "Passkey " + (st.passkeys.length + 1)); draw("Passkey added.", "ok"); } catch (e) { msg(friendly(e), "err"); ev.currentTarget.disabled = false; }
      };
      root.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
        if (b.dataset.c !== "1") { b.dataset.c = "1"; b.textContent = "Click again to remove"; return; }
        try { await call("/passkeys/" + b.dataset.rm, "DELETE"); draw("Passkey removed.", "ok"); } catch (e) { msg(e.message, "err"); }
      }));
    }
    draw();
  }

  window.MCCPasskey = { gate, manager, supported };
})();
