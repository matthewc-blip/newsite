/* Page motion: headline types out, content fades up in sequence. Everything is skipped for visitors who prefer reduced motion,
   and the page reads normally if this script never runs (the html.motion class is what hides things). */
(function () {
  var root = document.documentElement;
  if (!root.classList.contains("motion")) return;
  var CH = 26, MAX = 1500; // ms per character, cap on total typing time

  // 1. Typewriter on the main headline. The real text stays in the DOM (spans only toggle visibility), so layout never jumps.
  var h = document.querySelector("[data-type]");
  var typed = 0;
  if (h) {
    var label = h.textContent.replace(/\s+/g, " ").trim();
    h.setAttribute("aria-label", label);
    var chars = [];
    (function wrap(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var f = document.createDocumentFragment();
          n.textContent.split("").forEach(function (c) {
            if (/\s/.test(c)) { f.appendChild(document.createTextNode(c)); return; }
            var s = document.createElement("span"); s.className = "tc"; s.setAttribute("aria-hidden", "true"); s.textContent = c; f.appendChild(s); chars.push(s);
          });
          n.parentNode.replaceChild(f, n);
        } else if (n.nodeType === 1) wrap(n);
      });
    })(h);
    var step = Math.min(CH, MAX / Math.max(chars.length, 1));
    typed = chars.length * step;
    h.classList.add("typing");
    chars.forEach(function (s, i) { setTimeout(function () { s.classList.add("on"); }, 250 + i * step); });
    setTimeout(function () { h.classList.remove("typing"); h.classList.add("typed"); }, 250 + typed + 500);
  }

  // 2. Fade-up reveals, staggered within each group; items already on screen wait for the headline.
  var groups = [".tiles .tile", ".cols3 > div", ".steps li", ".who > div", ".why > div", ".svc-grid > *", ".spot > a"];
  var singles = [".pick-hero .eyebrow", ".pick-hero .lede", ".hero .eyebrow", ".hero .lede", ".hero .ctas", ".hero-grid > *", ".trust", ".else", ".sec-head", "form.card", ".contact", ".fine", ".ledger", ".band .wrap > p", ".creds"];
  var seen = new Set(), items = [];
  function add(el, i, base) { if (seen.has(el)) return; seen.add(el); el.setAttribute("data-reveal", ""); el.style.setProperty("--d", (base + i * 70) + "ms"); items.push(el); }
  groups.forEach(function (sel) { document.querySelectorAll(sel).forEach(function (el, i) { add(el, i, 0); }); });
  singles.forEach(function (sel) { document.querySelectorAll(sel).forEach(function (el) { add(el, 0, 0); }); });

  var lead = 250 + typed * 0.55; // first-screen items start while the headline is still typing
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target; io.unobserve(el);
      if (!el._initial) el.style.setProperty("--d", "0ms"); // below the fold: no extra wait once scrolled to
      el.classList.add("in");
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  items.forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.95) { el._initial = true; el.style.setProperty("--d", (lead + parseFloat(el.style.getPropertyValue("--d"))) + "ms"); }
    io.observe(el);
  });

  // 3. Header gains a soft shadow once the page scrolls.
  var hdr = document.querySelector("header.site");
  if (hdr) { var on = function () { hdr.classList.toggle("scrolled", window.scrollY > 8); }; on(); window.addEventListener("scroll", on, { passive: true }); }
})();
