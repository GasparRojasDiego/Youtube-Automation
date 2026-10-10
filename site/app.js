// Página de ATRIL: constelación de fondo, aparición al hacer scroll y datos de la última versión (con su huella SHA-256).
(function () {
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var css = getComputedStyle(document.documentElement);
  function primary() { return css.getPropertyValue("--p").trim() || "#7591ff"; }
  function hexA(h, a) { var n = parseInt(h.replace("#", ""), 16); return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
  var c = document.getElementById("stars"), x = c.getContext("2d"), W = 0, H = 0, P = [], mx = 0, my = 0, tx = 0, ty = 0;
  function size() {
    var d = Math.min(2, devicePixelRatio || 1); W = c.clientWidth; H = c.clientHeight; c.width = W * d; c.height = H * d; x.setTransform(d, 0, 0, d, 0, 0);
    var n = Math.min(90, Math.floor(W * H / 16000)); P = [];
    for (var i = 0; i < n; i++) P.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, r: .8 + Math.random() * 1.4, d: .3 + Math.random() * .7 });
  }
  addEventListener("mousemove", function (e) { tx = (e.clientX / innerWidth - .5) * 30; ty = (e.clientY / innerHeight - .5) * 30; });
  function draw() {
    var col = primary(); mx += (tx - mx) * .06; my += (ty - my) * .06; x.clearRect(0, 0, W, H);
    for (var i = 0; i < P.length; i++) { var p = P[i]; if (!reduce) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; } }
    x.lineWidth = .6;
    for (var i = 0; i < P.length; i++) for (var j = i + 1; j < P.length; j++) {
      var a = P[i], b = P[j], ax = a.x + mx * a.d, ay = a.y + my * a.d, bx = b.x + mx * b.d, by = b.y + my * b.d, d = Math.hypot(ax - bx, ay - by);
      if (d < 140) { x.strokeStyle = hexA(col, (1 - d / 140) * .3); x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke(); }
    }
    x.fillStyle = hexA(col, .65);
    for (var i = 0; i < P.length; i++) { var p = P[i]; x.beginPath(); x.arc(p.x + mx * p.d, p.y + my * p.d, p.r, 0, 6.283); x.fill(); }
    requestAnimationFrame(draw);
  }
  size(); addEventListener("resize", size); draw();
  var io = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } }); }, { threshold: .12 });
  document.querySelectorAll(".reveal").forEach(function (el, i) { el.style.transitionDelay = (i % 3) * 80 + "ms"; io.observe(el); });
  var ok = /^https:\/\/github\.com\/GasparRojasDiego\/Youtube-Automation\/releases\/download\//;
  fetch("https://api.github.com/repos/GasparRojasDiego/Youtube-Automation/releases/latest").then(function (r) { return r.json(); }).then(function (rel) {
    var v = String(rel.tag_name || "").replace(/^v/, "").replace(/[^0-9.]/g, "");
    var a = (rel.assets || []).find(function (x) { return /_instalador_x64\.exe$/i.test(x.name); });
    var z = (rel.assets || []).find(function (x) { return /_portable_x64\.zip$/i.test(x.name); });
    // Solo se aceptan enlaces de descarga del propio repositorio
    if (a && ok.test(a.browser_download_url)) {
      var mb = Math.round(a.size / 1048576);
      ["dl", "dl2"].forEach(function (id) { document.getElementById(id).href = a.browser_download_url; });
      document.getElementById("dlt").textContent = "Descargar ATRIL " + v;
      document.getElementById("meta").textContent = "Versión " + v + " · Windows 10/11 · 64 bits · " + mb + " MB · Se actualiza con un clic";
      if (/^sha256:[0-9a-f]{64}$/i.test(a.digest || "")) document.getElementById("sha").textContent = "SHA-256 del instalador " + v + ": " + a.digest.slice(7);
    }
    if (z && ok.test(z.browser_download_url)) document.getElementById("zip").href = z.browser_download_url;
    if (v) document.getElementById("ver").textContent = "v" + v;
  }).catch(function () {});
})();
