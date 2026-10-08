// Soft "need help?" nudge: appears once after 20 seconds on a public page, never again for 7 days once seen.
// Counts only time the tab is visible, stays out of the way of forms and legal pages, and is easy to close.
(function () {
  var path = location.pathname.replace(/\/+$/, "") || "/";
  var SKIP = [/^\/notary$/, /^\/notary\/become-a-notary/, /^\/notary\/(which-service|appointment-checklist)/, /^\/bookkeeping\/health-check/, /^\/websites\/(quiz|seo-checker)/, /^\/(privacy|terms|accessibility|legal|cookies)/, /^\/(admin|portal|client|manage)/];
  if (SKIP.some(function (r) { return r.test(path); }) || /manage\.html$/.test(path)) return;
  var KEY = "mcc_nudge_seen", DAY = 864e5, seen;
  try { seen = Number(localStorage.getItem(KEY)) || 0; } catch (e) { seen = 0; }
  if (seen && Date.now() - seen < 7 * DAY) return;
  var tel = document.querySelector('a[href^="tel:"]');
  var phone = tel ? tel.textContent.trim() : "(908) 444-6373";
  var telHref = tel ? tel.getAttribute("href") : "tel:+19084446373";
  if (!/\d{3}/.test(phone)) phone = "(908) 444-6373";

  var C;
  if (/^\/bookkeeping/.test(path)) C = { k: "Bookkeeping", h: "Want the books off your plate?", p: "Matthew is a QuickBooks ProAdvisor. Tell us what you use and what's behind, and we reply with a plain quote, no pressure.", cta: "Get a quote", href: "/bookkeeping/#interest" };
  else if (/^\/websites/.test(path)) C = { k: "Websites & SEO", h: "Want a site that brings in calls?", p: "Tell us about your business and we'll reply with a clear price and a plan. No jargon.", cta: "Get a quote", href: "/websites/#quote" };
  else C = { k: "Notary", h: "Need something notarized?", p: "We come to you, or meet by video. Book online in about two minutes, or call and a real person will sort it out.", cta: "Book a notary", href: "/notary/#booker" };

  // Leaving-soon version: shown once, to desktop visitors whose mouse heads for the browser bar after a few seconds on the page.
  var X;
  if (/^\/bookkeeping/.test(path)) X = { k: "Before you go", h: "How healthy are your books?", p: "Answer a few quick questions and get a plain-English list of what to fix first. Free, no sign-up to see it.", cta: "Take the health check", href: "/bookkeeping/health-check" };
  else if (/^\/websites/.test(path)) X = { k: "Before you go", h: "Is your website working for you?", p: "A two-minute quiz and a free page check show what to fix first. No sign-up to see the results.", cta: "Try the free quiz", href: "/websites/quiz" };
  else X = { k: "Before you go", h: "Not sure which service you need?", p: "Answer four quick questions and we'll point you to the right one, with what to bring.", cta: "Find my service", href: "/notary/which-service" };
  var ms = 0, last = Date.now(), timer, shown = false;
  function typing() { var a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); }
  function tick() {
    var now = Date.now();
    if (!document.hidden) ms += now - last;
    last = now;
    if (ms >= 20000 && !shown) { if (typing()) { ms = 15000; } else show(); }
  }
  timer = setInterval(tick, 1000);
  document.addEventListener("mouseout", function (e) {
    if (shown || e.relatedTarget || e.clientY > 0 || ms < 8000 || typing() || (window.matchMedia && matchMedia("(pointer:coarse)").matches)) return;
    C = X; show();
  });
  document.addEventListener("visibilitychange", function () { last = Date.now(); });

  function track(n) { try { if (window.mccTrack) window.mccTrack(n, { page_path: location.pathname }); } catch (e) {} }
  function remember() { try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} }

  function show() {
    shown = true; clearInterval(timer); remember();
    var css = document.createElement("style");
    css.textContent = ".mccn{position:fixed;right:20px;bottom:20px;z-index:60;width:min(360px,calc(100vw - 32px));background:#10261e;color:#e9f0eb;border-radius:8px;border-left:4px solid #d8a24a;box-shadow:0 14px 40px rgba(0,0,0,.28);padding:20px 22px 18px;font-family:'Public Sans',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.5;opacity:0;transform:translateY(14px);transition:opacity .35s ease,transform .35s ease}"
      + ".mccn.in{opacity:1;transform:none}.mccn small{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#d8a24a;margin-bottom:6px}"
      + ".mccn b{display:block;font-family:Archivo,'Helvetica Neue',Arial,sans-serif;font-size:19px;line-height:1.25;margin-bottom:6px;padding-right:22px}.mccn p{margin:0 0 14px;color:#c9d6ce}"
      + ".mccn .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.mccn a.go{background:#d8a24a;color:#10261e;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:4px}"
      + ".mccn a.go:hover{background:#e6b45f}.mccn a.tel{color:#e9f0eb;text-decoration:underline;text-underline-offset:3px}"
      + ".mccn button.x{position:absolute;top:8px;right:8px;width:32px;height:32px;border:0;background:transparent;color:#9fb5aa;font-size:22px;line-height:1;cursor:pointer;border-radius:4px}.mccn button.x:hover{color:#fff}"
      + ".mccn a:focus-visible,.mccn button:focus-visible{outline:2px solid #fff;outline-offset:2px}"
      + "@media(max-width:560px){.mccn{right:16px;left:16px;bottom:16px;width:auto}}@media print{.mccn{display:none}}@media(prefers-reduced-motion:reduce){.mccn{transition:none}}";
    document.head.appendChild(css);
    var el = document.createElement("div");
    el.className = "mccn"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Need help?");
    el.innerHTML = '<button class="x" type="button" aria-label="Close">&times;</button><small></small><b></b><p></p><div class="row"><a class="go"></a><a class="tel"></a></div>';
    el.querySelector("small").textContent = C.k; el.querySelector("b").textContent = C.h; el.querySelector("p").textContent = C.p;
    var go = el.querySelector(".go"); go.textContent = C.cta; go.href = C.href;
    var t = el.querySelector(".tel"); t.textContent = "Call " + phone; t.href = telHref;
    function close() { el.classList.remove("in"); setTimeout(function () { el.remove(); }, 400); document.removeEventListener("keydown", esc); }
    function esc(e) { if (e.key === "Escape") close(); }
    el.querySelector(".x").onclick = function () { track("nudge_dismiss"); close(); };
    go.addEventListener("click", function () { track("nudge_click"); });
    t.addEventListener("click", function () { track("nudge_call"); });
    document.addEventListener("keydown", esc);
    document.body.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("in"); }); });
    track("nudge_shown");
  }
})();
