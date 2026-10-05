/* One orchestrated moment: the headline types out, then the hero details and the service index settle in.
   Skipped entirely for visitors who prefer reduced motion; the page is fully readable if this never runs
   (the html.motion class set in <head> is what hides anything). */
(function () {
  var root = document.documentElement;
  if (!root.classList.contains("motion")) return;
  var CH = 26, MAX = 1400;

  var h = document.querySelector("[data-type]");
  var typed = 0;
  if (h) {
    h.setAttribute("aria-label", h.textContent.replace(/\s+/g, " ").trim());
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
    chars.forEach(function (s, i) { setTimeout(function () { s.classList.add("on"); }, 200 + i * step); });
    setTimeout(function () { h.classList.remove("typing"); h.classList.add("typed"); }, 200 + typed + 500);
  }

  var start = 200 + typed * 0.7, n = 0, els = [];
  [".firm-hero .lede", ".firm-hero .ctas", ".firm-hero .strip"].forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (el) { el.setAttribute("data-reveal", ""); el.style.setProperty("--d", (start + n++ * 90) + "ms"); els.push(el); });
  });
  document.querySelectorAll(".practice").forEach(function (col, c) {
    col.querySelectorAll(".row").forEach(function (el, i) { el.setAttribute("data-reveal", ""); el.style.setProperty("--d", (start + 260 + c * 110 + i * 70) + "ms"); els.push(el); });
  });
  requestAnimationFrame(function () { requestAnimationFrame(function () { els.forEach(function (el) { el.classList.add("in"); }); }); });

  var hdr = document.querySelector("header.site");
  if (hdr) { var on = function () { hdr.classList.toggle("scrolled", window.scrollY > 8); }; on(); window.addEventListener("scroll", on, { passive: true }); }
})();
