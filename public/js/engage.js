// Small attention helpers for public pages:
//  1. A call/book bar pinned to the bottom of the screen on phones.
// Quiet by design: no animation, nothing on admin, portal or legal pages, and it hides itself on the booking form.
(function () {
  var path = location.pathname.replace(/\/+$/, "") || "/";
  if (/^\/(admin|portal|client|manage|privacy|terms|accessibility|legal|cookies|reviews)/.test(path) || /manage\.html$/.test(path)) return;
  var tel = document.querySelector('a[href^="tel:"]');
  var phone = tel ? tel.textContent.trim() : "(908) 444-6373";
  var telHref = tel ? tel.getAttribute("href") : "tel:+19084446373";
  if (!/\d{3}/.test(phone)) { phone = "(908) 444-6373"; telHref = "tel:+19084446373"; }
  function track(n, p) { try { if (window.mccTrack) window.mccTrack(n, p || { page_path: location.pathname }); } catch (e) {} }

  var C;
  if (/^\/bookkeeping/.test(path)) C = { label: "Get a quote", href: "/bookkeeping/#interest" };
  else if (/^\/websites/.test(path)) C = { label: "Get a quote", href: "/websites/#quote" };
  else if (/^\/notary\/become-a/.test(path)) C = null;
  else C = { label: "Book now", href: path === "/notary" ? "#order" : "/notary/#order" };

  if (!C) return;
  var css = document.createElement("style");
  css.textContent = ".mccbar{display:none}@media(max-width:700px){.mccbar{display:block;position:fixed;left:0;right:0;bottom:0;z-index:55;background:#10261e;color:#e9f0eb;border-top:3px solid #d8a24a;padding:8px 12px calc(8px + env(safe-area-inset-bottom));font-family:'Public Sans',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;box-shadow:0 -6px 20px rgba(0,0,0,.18)}"
    + ".mccbar[hidden]{display:none}.mccbar small{display:block;text-align:center;font-size:12px;color:#c9d6ce;margin:0 0 6px}.mccbar .r{display:flex;gap:10px}"
    + ".mccbar a{flex:1;text-align:center;text-decoration:none;font-weight:700;font-size:15px;padding:11px 8px;border-radius:5px;min-height:44px;box-sizing:border-box}"
    + ".mccbar a.c{background:transparent;color:#e9f0eb;border:1.5px solid #5d7a6a}.mccbar a.b{background:#d8a24a;color:#10261e}"
    + ".mccbar a:focus-visible{outline:2px solid #fff;outline-offset:2px}body.has-mccbar{padding-bottom:84px}.mccn{bottom:92px!important}}@media print{.mccbar{display:none!important}}";
  document.head.appendChild(css);
  var bar = document.createElement("div"); bar.className = "mccbar"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Contact");
  bar.innerHTML = '<div class="r"><a class="c"></a><a class="b"></a></div>';
  var a1 = bar.querySelector(".c"), a2 = bar.querySelector(".b");
  a1.href = telHref; a1.textContent = "Call"; a1.setAttribute("aria-label", "Call " + phone);
  a2.href = C.href; a2.textContent = C.label;
  a1.addEventListener("click", function () { track("bar_call"); }); a2.addEventListener("click", function () { track("bar_book"); });
  document.body.appendChild(bar); document.body.classList.add("has-mccbar");
  function sync() { bar.hidden = /^#(order|booker)/.test(location.hash) && path === "/notary"; }
  window.addEventListener("hashchange", sync); sync();
})();
