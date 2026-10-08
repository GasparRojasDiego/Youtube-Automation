/* ATRIL motion kit (K): piezas de motion design deterministas para el
   arnés de ATRIL. Todo lo que cambia con el tiempo va en el timeline de GSAP
   o en una función registrada con ATRIL.addRender(t => ...). */
(function () {
  var A = window.ATRIL;
  var K = window.K = {};
  var W = K.W = 1920, H = K.H = 1080;
  var stage = function () { return document.getElementById('stage'); };
  var NS = 'http://www.w3.org/2000/svg';
  var seed = 98765;
  K.rand = function (a, b) { seed = (seed * 1103515245 + 12345) % 2147483648; var r = seed / 2147483648; return a == null ? r : b == null ? r * a : a + r * (b - a); };
  K.lerp = function (a, b, k) { return a + (b - a) * k; };
  K.clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };

  /* ---------- tema ---------- */
  K.theme = function (p) {
    p = p || {};
    var s = stage().style, map = { bg: '--bg', fg: '--fg', accent: '--accent', muted: '--muted', paper: '--paper', ink: '--ink' };
    for (var k in map) if (p[k]) s.setProperty(map[k], p[k]);
    if (p.fontTitle) s.setProperty('--font-title', '"' + p.fontTitle + '"');
    if (p.fontBody) s.setProperty('--font-body', '"' + p.fontBody + '"');
    if (p.fontMono) s.setProperty('--font-mono', '"' + p.fontMono + '"');
    K.pal = Object.assign({}, K.pal || {}, p);
    return K.pal;
  };
  K.pal = {};

  /* ---------- DOM ---------- */
  K.el = function (tag, o, parent) {
    o = o || {};
    var e = document.createElement(tag || 'div');
    if (o.cls) e.className = o.cls;
    if (o.css) Object.assign(e.style, o.css);
    if (o.html != null) e.innerHTML = o.html;
    if (o.text != null) e.textContent = o.text;
    if (o.attrs) for (var a in o.attrs) e.setAttribute(a, o.attrs[a]);
    (parent ? (typeof parent === 'string' ? document.querySelector(parent) : parent) : stage()).appendChild(e);
    return e;
  };
  K.svg = function (tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var a in (attrs || {})) e.setAttribute(a, attrs[a]);
    if (parent) parent.appendChild(e);
    return e;
  };
  K.svgLayer = function (parent, o) {
    o = o || {};
    var s = K.svg('svg', { width: o.w || W, height: o.h || H, viewBox: '0 0 ' + (o.w || W) + ' ' + (o.h || H) });
    s.style.position = 'absolute'; s.style.left = (o.x || 0) + 'px'; s.style.top = (o.y || 0) + 'px'; s.style.overflow = 'visible';
    (parent || stage()).appendChild(s);
    return s;
  };
  K.canvas = function (parent, o) {
    o = o || {};
    var c = K.el('canvas', { attrs: { width: o.w || W, height: o.h || H }, css: { position: 'absolute', left: (o.x || 0) + 'px', top: (o.y || 0) + 'px' } }, parent);
    return c;
  };
  var $ = K.$ = function (x) { return typeof x === 'string' ? document.querySelector(x) : x; };

  /* ---------- escenas y transiciones ---------- */
  /** Contenedor a pantalla completa (oculto hasta K.show). */
  K.scene = function (o) {
    o = o || {};
    var e = K.el('div', { cls: 'k-scene', css: { background: o.bg || 'transparent', color: o.fg || '' } }, o.parent);
    if (o.id) e.id = o.id;
    return e;
  };
  /** Muestra una escena en `at` con un efecto: cut | fade | flash | wipe | iris | zoom | slide | glitch | blur. */
  K.show = function (tl, el, at, o) {
    o = o || {}; el = $(el); var fx = o.fx || 'cut', d = o.dur || 0.45;
    tl.set(el, { visibility: 'visible', opacity: 1 }, at);
    if (fx === 'fade') tl.fromTo(el, { opacity: 0 }, { opacity: 1, duration: d, ease: 'power2.out' }, at);
    else if (fx === 'zoom') tl.fromTo(el, { scale: 1.18, opacity: 0, filter: 'blur(12px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: d, ease: 'expo.out' }, at);
    else if (fx === 'blur') tl.fromTo(el, { opacity: 0, filter: 'blur(24px)' }, { opacity: 1, filter: 'blur(0px)', duration: d, ease: 'power3.out' }, at);
    else if (fx === 'slide') tl.fromTo(el, { xPercent: o.dir === 'right' ? -100 : 100 }, { xPercent: 0, duration: d, ease: 'expo.inOut' }, at);
    else if (fx === 'iris') tl.fromTo(el, { clipPath: 'circle(0% at ' + (o.cx || 50) + '% ' + (o.cy || 50) + '%)' }, { clipPath: 'circle(150% at ' + (o.cx || 50) + '% ' + (o.cy || 50) + '%)', duration: d * 1.6, ease: 'power3.inOut' }, at);
    else if (fx === 'flash') K.flash(tl, at - 0.06, { color: o.color || '#fff', dur: d * 0.7 });
    else if (fx === 'wipe') { tl.set(el, { visibility: 'hidden' }, at); K.wipe(tl, at - d / 2, { color: o.color || (K.pal.accent || '#C6F432'), dur: d, dir: o.dir }); tl.set(el, { visibility: 'visible' }, at); }
    else if (fx === 'glitch') K.glitch(tl, el, at, { dur: d * 0.8 });
    return el;
  };
  K.hide = function (tl, el, at, o) {
    o = o || {}; el = $(el); var fx = o.fx || 'cut', d = o.dur || 0.35;
    if (fx === 'fade') tl.to(el, { opacity: 0, duration: d, ease: 'power2.in' }, at);
    else if (fx === 'zoom') tl.to(el, { scale: 0.86, opacity: 0, filter: 'blur(10px)', duration: d, ease: 'power3.in' }, at);
    else if (fx === 'slide') tl.to(el, { xPercent: o.dir === 'right' ? 100 : -100, duration: d, ease: 'expo.inOut' }, at);
    tl.set(el, { visibility: 'hidden' }, at + (fx === 'cut' ? 0 : d));
    return el;
  };
  /** Pasa de una escena a otra en `at`. */
  K.swap = function (tl, from, to, at, o) {
    o = o || {}; var fx = o.fx || 'cut';
    var outFx = fx === 'fade' || fx === 'zoom' || fx === 'slide' ? fx : 'cut';
    K.hide(tl, from, at + (outFx === 'cut' ? 0 : 0) , { fx: outFx, dur: o.dur || 0.35, dir: o.dir });
    K.show(tl, to, at, o);
  };
  K.flash = function (tl, at, o) {
    o = o || {}; var f = K.el('div', { cls: 'k-flash', css: { background: o.color || '#fff', mixBlendMode: o.blend || 'normal' } }, o.parent);
    var d = o.dur || 0.3;
    tl.fromTo(f, { opacity: 0 }, { opacity: o.max || 1, duration: d * 0.25, ease: 'power1.in' }, at)
      .to(f, { opacity: 0, duration: d * 0.75, ease: 'power2.out' }, at + d * 0.25);
    return f;
  };
  K.wipe = function (tl, at, o) {
    o = o || {}; var d = o.dur || 0.6, rev = o.dir === 'right';
    var p = K.el('div', { cls: 'k-wipe', css: { background: o.color || '#111', transformOrigin: rev ? 'right center' : 'left center' } }, o.parent);
    tl.fromTo(p, { scaleX: 0 }, { scaleX: 1, duration: d / 2, ease: 'expo.in' }, at)
      .set(p, { transformOrigin: rev ? 'left center' : 'right center' }, at + d / 2)
      .to(p, { scaleX: 0, duration: d / 2, ease: 'expo.out' }, at + d / 2);
    return p;
  };
  /** Glitch digital: sacudida, separación RGB, cortes horizontales y parpadeo. */
  var glitchN = 0;
  K.glitch = function (tl, el, at, o) {
    o = o || {}; el = $(el) || stage(); var d = o.dur || 0.5, k = o.intensity || 1, id = 'kg' + (++glitchN);
    var defs = K.svgLayer(stage(), { w: 1, h: 1 }); defs.style.width = '0'; defs.style.height = '0';
    defs.innerHTML = '<filter id="' + id + '" x="-5%" y="0" width="110%" height="100%" color-interpolation-filters="sRGB">' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>' +
      '<feOffset in="r" dx="0" dy="0" result="ro"/>' +
      '<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="gb"/>' +
      '<feOffset in="gb" dx="0" dy="0" result="gbo"/>' +
      '<feBlend in="ro" in2="gbo" mode="screen"/></filter>';
    var offs = defs.querySelectorAll('feOffset');
    var lines = K.el('div', { cls: 'k-lines' }, stage());
    var bars = [];
    for (var i = 0; i < 7; i++) bars.push(K.el('div', { css: { background: i % 2 ? (K.pal.accent || '#0ff') : '#fff', mixBlendMode: 'difference' } }, lines));
    tl.set(el, { filter: 'url(#' + id + ')' }, at);
    var steps = Math.max(3, Math.round(d * 30 / 2));
    for (var s = 0; s < steps; s++) {
      var t = at + s * d / steps;
      var dx = K.rand(-26, 26) * k;
      tl.set(offs[0], { attr: { dx: dx } }, t).set(offs[1], { attr: { dx: -dx * 0.8 } }, t);
      tl.set(el, { x: K.rand(-18, 18) * k, skewX: K.rand(-4, 4) * k, clipPath: K.rand() < 0.4 ? 'inset(' + Math.round(K.rand(0, 60)) + '% 0 ' + Math.round(K.rand(0, 30)) + '% 0)' : 'inset(0% 0 0% 0)', opacity: K.rand() < 0.15 ? 0.6 : 1 }, t);
      bars.forEach(function (b) { tl.set(b, { top: K.rand(0, H) + 'px', height: K.rand(4, 40) + 'px', opacity: K.rand() < 0.5 ? K.rand(0.4, 0.9) : 0, x: K.rand(-200, 200) }, t); });
    }
    tl.set(el, { x: 0, skewX: 0, clipPath: 'inset(0% 0 0% 0)', opacity: 1, filter: 'none' }, at + d);
    bars.forEach(function (b) { tl.set(b, { opacity: 0 }, at + d); });
    return el;
  };

  /* ---------- fondos ---------- */
  var noiseUrl = function (freq, alpha) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="' + freq + '" numOctaves="3" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ' + alpha + ' 0"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>';
    return 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")';
  };
  /** Papel texturizado con cuadrícula tenue y marcas de cámara en las esquinas. */
  K.paper = function (parent, o) {
    o = o || {}; var c = o.color || 'var(--paper)';
    var e = K.el('div', { cls: 'k-layer', css: { background: c } }, parent);
    K.el('div', { cls: 'k-layer', css: { backgroundImage: noiseUrl(0.85, o.grain != null ? o.grain : 0.22), backgroundSize: '512px 512px', mixBlendMode: 'multiply' } }, e);
    if (o.grid !== false) {
      var g = o.gridSize || 54, gc = o.gridColor || 'rgba(20,20,20,.07)';
      K.el('div', { cls: 'k-layer', css: { backgroundImage: 'linear-gradient(' + gc + ' 1px,transparent 1px),linear-gradient(90deg,' + gc + ' 1px,transparent 1px)', backgroundSize: g + 'px ' + g + 'px', backgroundPosition: 'center center' } }, e);
    }
    if (o.marks !== false) K.marks(e, { color: o.markColor || 'rgba(20,20,20,.55)' });
    if (o.vignette !== false) K.el('div', { cls: 'k-layer', css: { background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,.10) 100%)' } }, e);
    return e;
  };
  /** Campo de color plano (con grano sutil). */
  K.field = function (parent, color, o) {
    o = o || {};
    var e = K.el('div', { cls: 'k-layer', css: { background: color || 'var(--bg)' } }, parent);
    if (o.grain !== false) K.el('div', { cls: 'k-layer', css: { backgroundImage: noiseUrl(0.9, o.grain || 0.12), backgroundSize: '512px 512px', mixBlendMode: 'overlay', opacity: 0.6 } }, e);
    if (o.dots) K.dotGrid(e, { color: o.dots, gap: o.gap || 48, size: o.size || 3 });
    if (o.rings) K.rings(e, { color: o.rings });
    return e;
  };
  K.dotGrid = function (parent, o) {
    o = o || {};
    return K.el('div', { cls: 'k-dotgrid', css: { backgroundImage: 'radial-gradient(' + (o.color || 'rgba(255,255,255,.25)') + ' ' + (o.size || 2.5) + 'px, transparent ' + ((o.size || 2.5) + 0.5) + 'px)', backgroundSize: (o.gap || 48) + 'px ' + (o.gap || 48) + 'px', backgroundPosition: 'center center' } }, parent);
  };
  /** Retícula circular (anillos concéntricos y radios), como un radar. */
  K.rings = function (parent, o) {
    o = o || {}; var s = K.svgLayer(parent); var c = o.color || 'rgba(255,255,255,.14)';
    var cx = o.x || W / 2, cy = o.y || H / 2;
    for (var r = o.step || 110; r < 1300; r += o.step || 110) K.svg('circle', { cx: cx, cy: cy, r: r, fill: 'none', stroke: c, 'stroke-width': 1.5 }, s);
    for (var a = 0; a < 12; a++) { var an = a * Math.PI / 6; K.svg('line', { x1: cx, y1: cy, x2: cx + Math.cos(an) * 1400, y2: cy + Math.sin(an) * 1400, stroke: c, 'stroke-width': 1 }, s); }
    return s;
  };
  K.marks = function (parent, o) {
    o = o || {}; var m = o.inset || 44, col = o.color || 'currentColor';
    [['left', 'top', '2px 0 0 2px'], ['right', 'top', '2px 2px 0 0'], ['left', 'bottom', '0 0 2px 2px'], ['right', 'bottom', '0 2px 2px 0']].forEach(function (p) {
      var css = { borderWidth: p[2], borderColor: col }; css[p[0]] = m + 'px'; css[p[1]] = m + 'px';
      K.el('div', { cls: 'k-mark', css: css }, parent);
    });
  };
  K.grain = function (parent, o) {
    o = o || {};
    var g = K.el('div', { cls: 'k-grain', css: { backgroundImage: noiseUrl(0.95, 0.9), backgroundSize: '400px 400px', opacity: o.opacity || 0.07 } }, parent);
    A.addRender(function (t) { var f = Math.floor(t * 12); g.style.transform = 'translate(' + ((f * 37) % 80 - 40) + 'px,' + ((f * 53) % 80 - 40) + 'px)'; });
    return g;
  };

  /* ---------- HUD ---------- */
  K.tc = function (t, fps) { fps = fps || 30; var f = Math.floor(t * fps + 1e-6); var p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(Math.floor(f / (3600 * fps))) + ':' + p(Math.floor(f / (60 * fps)) % 60) + ':' + p(Math.floor(f / fps) % 60) + ':' + p(f % fps); };
  /** Etiquetas en las esquinas. Usa 'TC' para un código de tiempo que corre. */
  K.hud = function (o, parent) {
    o = o || {}; var m = o.inset || 64, out = {};
    var pos = { tl: { left: m + 'px', top: (m - 6) + 'px' }, tr: { right: m + 'px', top: (m - 6) + 'px', textAlign: 'right' }, bl: { left: m + 'px', bottom: (m - 6) + 'px' }, br: { right: m + 'px', bottom: (m - 6) + 'px', textAlign: 'right' } };
    ['tl', 'tr', 'bl', 'br'].forEach(function (k) {
      if (!o[k]) return;
      var css = Object.assign({ color: o.color || 'currentColor' }, pos[k]);
      var e = K.el('div', { cls: 'k-hud', css: css }, parent);
      if (/^TC/.test(o[k])) { var pre = o[k].replace(/^TC\s*/, ''); var off = o.tcOffset || 0; A.addRender(function (t) { e.textContent = (pre ? pre + ' ' : 'TC ') + K.tc(t + off); }); }
      else e.innerHTML = o[k];
      out[k] = e;
    });
    return out;
  };

  /* ---------- tipografía ---------- */
  /** Título grande. o: {x,y (centro por defecto), size, font, italic, weight, color, align, maxW} */
  K.title = function (parent, text, o) {
    o = o || {};
    var css = { fontSize: (o.size || 140) + 'px', fontWeight: o.weight || 800, fontStyle: o.italic ? 'italic' : 'normal', color: o.color || 'currentColor', letterSpacing: (o.tracking != null ? o.tracking : -0.02) + 'em', textAlign: o.align || 'center' };
    if (o.font) css.fontFamily = '"' + o.font + '"';
    if (o.lines) { css.whiteSpace = 'normal'; css.lineHeight = o.lh || 1.04; css.width = (o.maxW || 1500) + 'px'; }
    var e = K.el('h1', { cls: 'k-title', css: css, html: text }, parent);
    K.place(e, o);
    if (o.fit !== false) A.fit(e, o.maxW || 1640, o.maxH || 900, 24);
    K.place(e, o);
    return e;
  };
  K.text = function (parent, text, o) {
    o = o || {}; o.size = o.size || 44; o.weight = o.weight || 500; o.tracking = o.tracking != null ? o.tracking : 0; o.lines = o.lines !== false;
    var e = K.title(parent, text, o); e.classList.add('k-text'); return e;
  };
  /** Posiciona un elemento por su centro (x,y) o por esquina (left/top). */
  K.place = function (e, o) {
    var w = e.offsetWidth, h = e.offsetHeight;
    if (o.left != null) e.style.left = o.left + 'px'; else e.style.left = ((o.x != null ? o.x : W / 2) - (o.align === 'left' ? 0 : o.align === 'right' ? w : w / 2)) + 'px';
    if (o.top != null) e.style.top = o.top + 'px'; else e.style.top = ((o.y != null ? o.y : H / 2) - h / 2) + 'px';
    return e;
  };
  /** Entrada por letras/palabras/líneas. fx: rise | blur | scale | drop | scramble | type */
  K.reveal = function (tl, el, at, o) {
    o = o || {}; el = $(el); var by = o.by || 'chars', fx = o.fx || 'rise';
    if (fx === 'scramble') { var txt = el.textContent; tl.fromTo(el, { opacity: 1 }, { duration: o.dur || 1, scrambleText: { text: txt, chars: o.chars || 'upperCase', speed: 0.6 }, ease: 'none' }, at); return el; }
    if (fx === 'type') { var full = el.textContent; tl.fromTo(el, { text: '' }, { text: full, duration: o.dur || full.length * 0.045, ease: 'none' }, at); return el; }
    var split = new SplitText(el, { type: by === 'lines' ? 'lines' : by === 'words' ? 'words' : 'words,chars', linesClass: 'k-line' });
    var parts = split[by] || split.chars;
    if (fx === 'rise') { gsap.set(el, { overflow: 'visible' }); tl.from(parts, { yPercent: 110, opacity: 0, rotate: o.rotate || 0, duration: o.dur || 0.7, stagger: o.stagger || (by === 'chars' ? 0.035 : 0.08), ease: o.ease || 'expo.out' }, at); }
    else if (fx === 'blur') tl.from(parts, { opacity: 0, filter: 'blur(14px)', y: 20, duration: o.dur || 0.8, stagger: o.stagger || 0.04, ease: 'power3.out' }, at);
    else if (fx === 'scale') tl.from(parts, { scale: 0, opacity: 0, transformOrigin: '50% 80%', duration: o.dur || 0.6, stagger: o.stagger || 0.03, ease: 'back.out(2)' }, at);
    else if (fx === 'drop') tl.from(parts, { y: -260, opacity: 0, duration: o.dur || 0.8, stagger: o.stagger || 0.05, ease: 'bounce.out' }, at);
    return split;
  };
  /** Contador numérico. o: {from, to, dur, decimals, prefix, suffix, sep(','), ease} */
  K.counter = function (tl, el, at, o) {
    o = o || {}; el = $(el); var p = { v: o.from || 0 }, dec = o.decimals || 0, sep = o.sep != null ? o.sep : ',';
    var fmt = function (v) { var s = v.toFixed(dec).split('.'); s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep); return (o.prefix || '') + s.join(o.dot || '.') + (o.suffix || ''); };
    el.textContent = fmt(p.v);
    tl.to(p, { v: o.to, duration: o.dur || 1.4, ease: o.ease || 'power2.out', onUpdate: function () { el.textContent = fmt(p.v); } }, at);
    tl.call(function () { el.textContent = fmt(o.to); }, null, at + (o.dur || 1.4));
    return el;
  };
  /** Cronómetro digital (HH:MM:SS) que pasa de `from` a `to` segundos. */
  K.timer = function (parent, o) {
    o = o || {};
    var e = K.el('div', { cls: 'k-timer', css: { color: o.color || 'currentColor', fontSize: (o.size || 64) + 'px' } }, parent);
    var lab = o.label ? '<small>' + o.label + '</small>' : '';
    var fmt = function (s) { s = Math.max(0, Math.round(s)); var p = function (n) { return (n < 10 ? '0' : '') + n; }; return p(Math.floor(s / 3600)) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60); };
    e.innerHTML = lab + '<span>' + fmt(o.from || 0) + '</span>';
    K.place(e, o);
    var sp = e.querySelector('span'), st = { v: o.from || 0 };
    e.run = function (tl, at, to, dur, ease) { tl.to(st, { v: to, duration: dur || 1.2, ease: ease || 'power2.inOut', onUpdate: function () { sp.textContent = fmt(st.v); } }, at); tl.call(function () { sp.textContent = fmt(to); }, null, at + (dur || 1.2)); };
    e.tick = function (rate) { A.addRender(function (t) { if (getComputedStyle(e).visibility !== 'hidden') sp.textContent = fmt(st.v - t * (rate || 1)); }); };
    return e;
  };
  /** Número enorme con etiqueta debajo ("353+" / "PROYECTOS"). */
  K.bigNumber = function (parent, o) {
    o = o || {};
    var n = K.el('div', { cls: 'k-num', css: { color: o.color || 'currentColor', fontSize: (o.size || 260) + 'px' }, text: o.text || '' }, parent);
    K.place(n, { x: o.x, y: (o.y != null ? o.y : H / 2) - 40 });
    var l = o.label ? K.el('div', { cls: 'k-label', css: { color: o.labelColor || 'currentColor' }, text: o.label }, parent) : null;
    if (l) K.place(l, { x: o.x, y: (o.y != null ? o.y : H / 2) + (o.size || 260) * 0.48 });
    return { num: n, label: l };
  };

  /* ---------- formas ---------- */
  K.circleD = function (cx, cy, r) { return 'M' + (cx - r) + ',' + cy + 'a' + r + ',' + r + ' 0 1,0 ' + (2 * r) + ',0a' + r + ',' + r + ' 0 1,0 ' + (-2 * r) + ',0Z'; };
  K.starD = function (cx, cy, R, r, n) { n = n || 5; r = r || R * 0.42; var d = ''; for (var i = 0; i < n * 2; i++) { var a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r : R; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(1) + ',' + (cy + Math.sin(a) * rr).toFixed(1); } return d + 'Z'; };
  K.polyD = function (cx, cy, r, n, rot) { var d = ''; for (var i = 0; i < n; i++) { var a = (rot || -Math.PI / 2) + i * 2 * Math.PI / n; d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r).toFixed(1) + ',' + (cy + Math.sin(a) * r).toFixed(1); } return d + 'Z'; };
  /** Forma SVG (path) en una capa propia. */
  K.shape = function (parent, d, o) {
    o = o || {}; var s = K.svgLayer(parent);
    return K.svg('path', { d: d, fill: o.fill || 'currentColor', stroke: o.stroke || 'none', 'stroke-width': o.sw || 0 }, s);
  };
  /** Transforma una forma en otra (MorphSVG). */
  K.morph = function (tl, path, toD, at, o) { o = o || {}; tl.to(path, { morphSVG: toD, duration: o.dur || 0.9, ease: o.ease || 'expo.inOut' }, at); return path; };
  /** Punto con sombra ovalada fija debajo. */
  K.dot = function (parent, o) {
    o = o || {}; var x = o.x != null ? o.x : W / 2, y = o.y != null ? o.y : H / 2, r = o.r || 70;
    var sh = K.el('div', { cls: 'k-abs', css: { left: (x - r * 1.1) + 'px', top: (y + r * 1.15) + 'px', width: (r * 2.2) + 'px', height: (r * 0.42) + 'px', borderRadius: '50%', background: o.shadow || 'rgba(0,0,0,.22)', filter: 'blur(6px)' } }, parent);
    var d = K.el('div', { cls: 'k-abs', css: { left: (x - r) + 'px', top: (y - r) + 'px', width: (2 * r) + 'px', height: (2 * r) + 'px', borderRadius: '50%', background: o.color || 'var(--accent)' } }, parent);
    return { el: d, shadow: sh, x: x, y: y, r: r };
  };
  /** El punto cae desde arriba con aplastamiento al tocar el suelo. */
  K.drop = function (tl, dot, at, o) {
    o = o || {}; var h = o.height || 620, d = o.dur || 0.9;
    tl.fromTo(dot.el, { y: -h }, { y: 0, duration: d, ease: 'bounce.out' }, at)
      .fromTo(dot.shadow, { scaleX: 0.3, opacity: 0.2 }, { scaleX: 1, opacity: 1, duration: d, ease: 'bounce.out' }, at)
      .fromTo(dot.el, { scaleY: 1.12, scaleX: 0.9 }, { scaleY: 1, scaleX: 1, duration: d * 0.6, ease: 'elastic.out(1,0.4)', transformOrigin: '50% 100%' }, at + d * 0.38);
    return dot;
  };
  /** Diagrama radial: núcleo + anillos de puntos (colores alternos). */
  K.radial = function (parent, o) {
    o = o || {}; var s = K.svgLayer(parent), cx = o.x || W / 2, cy = o.y || H / 2;
    var g = K.svg('g', {}, s), dots = [], rings = o.rings || [{ n: 8, r: 150, size: 20 }, { n: 16, r: 260, size: 14 }, { n: 24, r: 370, size: 10 }];
    var cols = o.colors || ['#111', K.pal.accent || '#C6F432'];
    if (o.grid !== false) for (var gr = 1; gr <= rings.length; gr++) K.svg('circle', { cx: cx, cy: cy, r: rings[gr - 1].r, fill: 'none', stroke: o.gridColor || 'rgba(0,0,0,.12)', 'stroke-width': 1.5, 'stroke-dasharray': '4 8' }, g);
    var core = K.svg('circle', { cx: cx, cy: cy, r: o.core || 74, fill: o.coreColor || K.pal.accent || '#C6F432' }, g);
    rings.forEach(function (ri, k) { for (var i = 0; i < ri.n; i++) { var a = i * 2 * Math.PI / ri.n + (k % 2 ? Math.PI / ri.n : 0); dots.push(K.svg('circle', { cx: cx + Math.cos(a) * ri.r, cy: cy + Math.sin(a) * ri.r, r: ri.size, fill: cols[(i + k) % cols.length], 'data-r': ri.r }, g)); } });
    return { svg: s, g: g, core: core, dots: dots, cx: cx, cy: cy };
  };
  K.burst = function (tl, rad, at, o) { o = o || {}; tl.from(rad.dots, { attr: { cx: rad.cx, cy: rad.cy }, opacity: 0, duration: o.dur || 0.9, ease: 'expo.out', stagger: { each: 0.008, from: 'start' } }, at); return rad; };
  K.implode = function (tl, rad, at, o) { o = o || {}; tl.to(rad.dots, { attr: { cx: rad.cx, cy: rad.cy }, duration: o.dur || 0.55, ease: 'expo.in', stagger: { each: 0.004, from: 'end' } }, at).to(rad.core, { attr: { r: o.toR || 40 }, duration: 0.3, ease: 'power2.in' }, at + (o.dur || 0.55) * 0.6); return rad; };
  K.spin = function (tl, el, at, dur, deg) { tl.to(el, { rotation: deg || 90, svgOrigin: W / 2 + ' ' + H / 2, duration: dur || 3, ease: 'none' }, at); };

  /* ---------- tarjetas, etiquetas y paneles ---------- */
  /** Etiquetas flotantes alrededor de un punto, con entrada escalonada y flotación suave. */
  K.tags = function (tl, parent, labels, at, o) {
    o = o || {}; var cx = o.x || W / 2, cy = o.y || H / 2, rx = o.rx || 640, ry = o.ry || 330, out = [];
    labels.forEach(function (lab, i) {
      var a = o.angles ? o.angles[i] : (-Math.PI * 0.85 + i * (Math.PI * 1.7) / Math.max(1, labels.length - 1)) + (i % 2 ? Math.PI : 0) * (o.alternate ? 1 : 0);
      var e = K.el('div', { cls: o.pill ? 'k-pill' : 'k-tag', html: (o.dot === false || o.pill ? '' : '<i></i>') + lab }, parent);
      var x = cx + Math.cos(a) * rx * K.rand(0.85, 1.05), y = cy + Math.sin(a) * ry * K.rand(0.8, 1.1);
      e.style.left = (x - e.offsetWidth / 2) + 'px'; e.style.top = (y - e.offsetHeight / 2) + 'px';
      var rot = K.rand(-6, 6);
      tl.fromTo(e, { scale: 0.4, opacity: 0, rotation: rot * 3, y: 30 }, { scale: 1, opacity: 1, rotation: rot, y: 0, duration: 0.6, ease: 'back.out(1.8)' }, at + i * (o.stagger || 0.12));
      K.float(e, { amp: o.amp || 8, speed: 0.35 + i * 0.05, phase: i });
      out.push(e);
    });
    return out;
  };
  /** Flotación continua (envuelve el elemento para no chocar con sus tweens). */
  K.float = function (el, o) {
    o = o || {}; el = $(el);
    var w = document.createElement('div'); w.className = 'k-layer'; w.style.pointerEvents = 'none';
    el.parentNode.insertBefore(w, el); w.appendChild(el);
    var amp = o.amp || 8, sp = o.speed || 0.4, ph = o.phase || 0;
    A.addRender(function (t) { w.style.transform = 'translate(' + (Math.sin(t * sp * 2 + ph) * amp * 0.6).toFixed(2) + 'px,' + (Math.cos(t * sp * 1.6 + ph * 1.3) * amp).toFixed(2) + 'px)'; });
    return w;
  };
  /** Deriva lenta de cámara para que el cuadro nunca quede congelado. */
  K.drift = function (el, o) {
    o = o || {}; el = $(el); var z = o.zoom || 0.04, d = o.dur || 10;
    A.addRender(function (t) { var k = Math.min(1, t / d); el.style.transform = 'scale(' + (1 + z * k).toFixed(4) + ') translate(' + ((o.x || 0) * k).toFixed(1) + 'px,' + ((o.y || 0) * k).toFixed(1) + 'px)'; el.style.transformOrigin = '50% 50%'; });
    return el;
  };
  /** Rectángulo de resaltador translúcido que se dibuja sobre un elemento. */
  K.highlight = function (tl, target, at, o) {
    o = o || {}; target = $(target); var r = target.getBoundingClientRect(), sr = stage().getBoundingClientRect(), p = o.pad || 14;
    var h = K.el('div', { cls: 'k-hl', css: { left: (r.left - sr.left - p) + 'px', top: (r.top - sr.top - p) + 'px', width: (r.width + 2 * p) + 'px', height: (r.height + 2 * p) + 'px', background: o.color || 'rgba(255,214,10,.45)', borderRadius: (o.radius || 6) + 'px' } }, o.parent || target.parentNode);
    tl.fromTo(h, { scaleX: 0 }, { scaleX: 1, duration: o.dur || 0.5, ease: 'power3.inOut' }, at);
    if (o.label) { var l = K.el('div', { cls: 'k-pill', css: { left: (r.left - sr.left - p) + 'px', top: (r.top - sr.top - p - 64) + 'px', background: o.labelBg || '#FFD60A', color: '#111', borderColor: 'transparent' }, text: o.label }, o.parent || target.parentNode); tl.from(l, { y: 16, opacity: 0, duration: 0.4, ease: 'back.out(2)' }, at + 0.3); }
    return h;
  };
  /** Columnas numeradas (01–05) con título, nota y valor. */
  K.columns = function (parent, items, o) {
    o = o || {};
    var wrap = K.el('div', { cls: 'k-cols', css: { left: (o.x || 140) + 'px', top: (o.y || 420) + 'px', width: (o.w || 1640) + 'px', color: o.color || 'currentColor' } }, parent);
    var cols = items.map(function (it, i) { return K.el('div', { cls: 'k-col', html: '<b>' + (it.num || ('0' + (i + 1)).slice(-2)) + '</b><h4>' + (it.title || '') + '</h4>' + (it.note ? '<p>' + it.note + '</p>' : '') + (it.value ? '<em>' + it.value + '</em>' : '') }, wrap); });
    return { wrap: wrap, cols: cols };
  };
  K.revealColumns = function (tl, c, at, o) { o = o || {}; tl.from(c.cols, { y: 60, opacity: 0, duration: 0.7, ease: 'expo.out', stagger: o.stagger || 0.12 }, at); return c; };
  /** Ventana de app (título, filas con interruptores o valores, botón). */
  K.window = function (parent, o) {
    o = o || {};
    var rows = (o.rows || []).map(function (r) { var v = r[1] === true ? '<span class="k-toggle on"></span>' : r[1] === false ? '<span class="k-toggle"></span>' : '<b>' + r[1] + '</b>'; return '<div class="k-row"><span>' + r[0] + '</span>' + v + '</div>'; }).join('');
    var e = K.el('div', { cls: 'k-win', css: { left: (o.x || 560) + 'px', top: (o.y || 240) + 'px', width: (o.w || 800) + 'px' }, html: '<div class="k-bar"><i></i><i></i><i></i><span>' + (o.title || '') + '</span></div><div class="k-body">' + (o.body || '') + rows + (o.button ? '<span class="k-btn">' + o.button + '</span>' : '') + '</div>' }, parent);
    return e;
  };
  /** Ventana de código con colores de sintaxis; .type(tl, at, dur) la escribe. */
  K.code = function (parent, o) {
    o = o || {};
    var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    var hl = function (s) { return esc(s).replace(/(\/\/.*$)/gm, '<span class="cm">$1</span>').replace(/("[^"]*"|'[^']*')/g, '<span class="st">$1</span>').replace(/\b(const|let|var|function|return|import|from|export|async|await|if|else|for|class|new|def|self)\b/g, '<span class="kw">$1</span>').replace(/\b(\d+(\.\d+)?)\b/g, '<span class="nu">$1</span>').replace(/\b([a-zA-Z_]\w*)(?=\()/g, '<span class="fn">$1</span>'); };
    var e = K.el('div', { cls: 'k-code', css: { left: (o.x || 360) + 'px', top: (o.y || 200) + 'px', width: (o.w || 1200) + 'px' }, html: '<div class="k-bar"><i></i><i></i><i></i><span style="margin-left:12px">' + (o.title || '') + '</span></div><pre>' + hl(o.code || '') + '</pre>' }, parent);
    var pre = e.querySelector('pre');
    e.type = function (tl, at, dur) { var full = pre.innerHTML, n = (o.code || '').length; var p = { k: 0 }; tl.to(p, { k: 1, duration: dur || 2, ease: 'none', onUpdate: function () { pre.innerHTML = hl((o.code || '').slice(0, Math.round(n * p.k))); } }, at); tl.call(function () { pre.innerHTML = full; }, null, at + (dur || 2)); };
    return e;
  };
  /** Barras ascendentes. o: {values[], labels[], x,y,w,h, color, accent(index resaltado)} */
  K.bars = function (parent, o) {
    o = o || {}; var max = Math.max.apply(null, o.values);
    var e = K.el('div', { cls: 'k-bars', css: { left: (o.x || 360) + 'px', top: (o.y || 260) + 'px', width: (o.w || 1200) + 'px', height: (o.h || 560) + 'px' } }, parent);
    var bars = o.values.map(function (v, i) { return K.el('div', { css: { height: (v / max * 100) + '%', background: i === o.accent ? (K.pal.accent || '#FF6A1A') : (o.color || 'currentColor'), position: 'relative', borderRadius: '6px 6px 0 0' }, html: o.labels ? '<span>' + o.labels[i] + '</span>' : '' }, e); });
    e.grow = function (tl, at) { tl.from(bars, { scaleY: 0, duration: 0.9, ease: 'expo.out', stagger: 0.07 }, at); };
    return e;
  };
  /** Anillo de progreso con porcentaje. */
  K.ring = function (parent, o) {
    o = o || {}; var r = o.r || 150, sw = o.sw || 22, s = K.svgLayer(parent, { x: (o.x || W / 2) - r - sw, y: (o.y || H / 2) - r - sw, w: 2 * (r + sw), h: 2 * (r + sw) });
    var c = r + sw;
    K.svg('circle', { cx: c, cy: c, r: r, fill: 'none', stroke: o.track || 'rgba(127,127,127,.25)', 'stroke-width': sw }, s);
    var arc = K.svg('circle', { cx: c, cy: c, r: r, fill: 'none', stroke: o.color || K.pal.accent || '#FF6A1A', 'stroke-width': sw, 'stroke-linecap': 'round', transform: 'rotate(-90 ' + c + ' ' + c + ')', 'stroke-dasharray': 2 * Math.PI * r, 'stroke-dashoffset': 2 * Math.PI * r }, s);
    var txt = K.svg('text', { x: c, y: c + 22, 'text-anchor': 'middle', fill: o.textColor || 'currentColor' }, s); txt.textContent = '0%';
    s.run = function (tl, at, dur) { var p = { v: 0 }; tl.to(p, { v: o.pct || 78, duration: dur || 1.4, ease: 'power3.out', onUpdate: function () { arc.setAttribute('stroke-dashoffset', 2 * Math.PI * r * (1 - p.v / 100)); txt.textContent = Math.round(p.v) + '%'; } }, at); };
    return s;
  };
  /** Paneles de curvas de aceleración con un punto que recorre cada una. */
  K.easeGraphs = function (tl, parent, eases, at, o) {
    o = o || {}; var cols = o.cols || 3, gw = o.w || 460, gh = o.h || 300, gap = 60, x0 = (W - (cols * gw + (cols - 1) * gap)) / 2, y0 = o.y || 200;
    var s = K.svgLayer(parent), col = o.color || 'currentColor', acc = o.accent || K.pal.accent || '#E8352B';
    var p = { k: 0 }, items = [];
    eases.forEach(function (name, i) {
      var gx = x0 + (i % cols) * (gw + gap), gy = y0 + Math.floor(i / cols) * (gh + 120), ease = gsap.parseEase(name);
      K.svg('rect', { x: gx, y: gy, width: gw, height: gh, fill: 'none', stroke: col, 'stroke-opacity': 0.25, 'stroke-width': 1.5 }, s);
      var d = ''; for (var j = 0; j <= 60; j++) { var u = j / 60; d += (j ? 'L' : 'M') + (gx + u * gw).toFixed(1) + ',' + (gy + gh - ease(u) * gh * 0.8 - gh * 0.1).toFixed(1); }
      var path = K.svg('path', { d: d, fill: 'none', stroke: col, 'stroke-width': 3 }, s);
      var dot = K.svg('circle', { r: 11, fill: acc }, s);
      var lab = K.svg('text', { x: gx, y: gy + gh + 46, fill: col, style: 'font:500 28px var(--font-mono);letter-spacing:.06em' }, s); lab.textContent = name.replace('.out', '-out').replace('.inOut', '-in-out').replace('.in', '-in');
      items.push({ ease: ease, gx: gx, gy: gy, dot: dot, path: path });
    });
    tl.from(s.querySelectorAll('path'), { drawSVG: '0%', duration: 0.8, stagger: 0.08, ease: 'power2.out' }, at);
    tl.to(p, { k: 1, duration: o.dur || 2.4, ease: 'none', repeat: o.repeat || 0 }, at + 0.6);
    A.addRender(function () { items.forEach(function (it) { var u = p.k, v = it.ease(u); it.dot.setAttribute('cx', it.gx + u * gw); it.dot.setAttribute('cy', it.gy + gh - v * gh * 0.8 - gh * 0.1); }); });
    return s;
  };

  /* ---------- generativos (canvas) ---------- */
  /** Nube de puntos 3D: rejilla ondulante ↔ toroide ↔ esfera. Tweenea .p: {morph, toSphere, rotX, rotY, wave, zoom, alpha} */
  K.points3d = function (parent, o) {
    o = o || {}; var c = K.canvas(parent), ctx = c.getContext('2d'), N = o.n || 46, M = o.m || 46;
    var p = { morph: 0, toSphere: 0, rotX: o.rotX != null ? o.rotX : 0.9, rotY: 0, wave: 1, zoom: 1, alpha: 1, phase: 0 };
    var col = o.color || '#fff', size = o.size || 2.6;
    var pts = [];
    for (var i = 0; i < N; i++) for (var j = 0; j < M; j++) pts.push([i / (N - 1), j / (M - 1)]);
    A.addRender(function (t) {
      ctx.clearRect(0, 0, W, H);
      var cx = Math.cos(p.rotX), sx = Math.sin(p.rotX), cy = Math.cos(p.rotY + t * (o.spin || 0.25)), sy = Math.sin(p.rotY + t * (o.spin || 0.25));
      var proj = [];
      for (var k = 0; k < pts.length; k++) {
        var u = pts[k][0], v = pts[k][1];
        var gx = (u - 0.5) * 1400, gz = (v - 0.5) * 1400, gy = Math.sin(u * 9 + t * 1.6 + p.phase) * Math.cos(v * 7 + t * 1.1) * 90 * p.wave;
        var U = u * 2 * Math.PI, V = v * 2 * Math.PI, R = 380, r = 150;
        var tx = (R + r * Math.cos(V)) * Math.cos(U), ty = r * Math.sin(V), tz = (R + r * Math.cos(V)) * Math.sin(U);
        var SR = 430, sx2 = SR * Math.sin(V / 2) * Math.cos(U), sy2 = SR * Math.cos(V / 2), sz2 = SR * Math.sin(V / 2) * Math.sin(U);
        var x = K.lerp(gx, tx, p.morph), y = K.lerp(gy, ty, p.morph), z = K.lerp(gz, tz, p.morph);
        x = K.lerp(x, sx2, p.toSphere); y = K.lerp(y, sy2, p.toSphere); z = K.lerp(z, sz2, p.toSphere);
        var x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
        var y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx;
        var f = 1100 / (1100 + z2 + 600) * p.zoom;
        proj.push([W / 2 + x1 * f, H / 2 + y1 * f, f]);
      }
      ctx.fillStyle = col;
      for (var q = 0; q < proj.length; q++) { var P = proj[q]; ctx.globalAlpha = K.clamp(P[2] * 0.9, 0.12, 1) * p.alpha; ctx.beginPath(); ctx.arc(P[0], P[1], size * P[2], 0, 6.2832); ctx.fill(); }
      ctx.globalAlpha = 1;
    });
    return { canvas: c, p: p };
  };
  /** Campo de líneas fluidas (energía). Tweenea .p: {alpha, speed, spread}; color o color2 */
  K.flow = function (parent, o) {
    o = o || {}; var c = K.canvas(parent), ctx = c.getContext('2d'), n = o.lines || 70, seeds = [];
    for (var i = 0; i < n; i++) seeds.push([K.rand(-100, W + 100), K.rand(-100, H + 100), K.rand()]);
    var p = { alpha: 1, speed: 1, spread: 1, mix: 0 };
    A.addRender(function (t) {
      ctx.clearRect(0, 0, W, H); ctx.lineWidth = o.width || 2; ctx.globalCompositeOperation = o.add ? 'lighter' : 'source-over';
      seeds.forEach(function (s, k) {
        var x = s[0], y = s[1]; ctx.beginPath(); ctx.moveTo(x, y);
        for (var st = 0; st < 90; st++) { var a = Math.sin(x * 0.0031 * p.spread + t * 0.5 * p.speed) * 1.7 + Math.cos(y * 0.0042 * p.spread - t * 0.35 * p.speed + s[2] * 3) * 1.4; x += Math.cos(a) * 14; y += Math.sin(a) * 14; ctx.lineTo(x, y); }
        ctx.strokeStyle = (o.color2 && (k % 3 === 0) ? o.color2 : (o.color || '#fff')); ctx.globalAlpha = p.alpha * (0.25 + 0.75 * s[2]); ctx.stroke();
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    });
    return { canvas: c, p: p };
  };
  /** Explosión de partículas desde un punto. .boom(tl, at, dur) */
  K.particles = function (parent, o) {
    o = o || {}; var c = K.canvas(parent), ctx = c.getContext('2d'), n = o.n || 420, ps = [];
    for (var i = 0; i < n; i++) ps.push({ a: K.rand(0, 6.2832), s: Math.pow(K.rand(), 0.6), r: K.rand(1.5, 5.5), c: K.rand() < 0.5 ? (o.color || '#FF6A1A') : (o.color2 || '#FFC46B') });
    var p = { k: 0 }, cx = o.x || W / 2, cy = o.y || H / 2, R = o.radius || 900;
    A.addRender(function () {
      ctx.clearRect(0, 0, W, H); if (p.k <= 0) return; ctx.globalCompositeOperation = 'lighter';
      var e = 1 - Math.pow(1 - p.k, 3);
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 260 * (1 - p.k * 0.7)); g.addColorStop(0, 'rgba(255,240,220,' + (1 - p.k) + ')'); g.addColorStop(1, 'rgba(255,120,40,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ps.forEach(function (q) { ctx.globalAlpha = Math.max(0, 1 - p.k * 0.9); ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(cx + Math.cos(q.a) * q.s * R * e, cy + Math.sin(q.a) * q.s * R * e, q.r * (1 - p.k * 0.5), 0, 6.2832); ctx.fill(); });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    });
    return { canvas: c, p: p, boom: function (tl, at, dur) { tl.fromTo(p, { k: 0.001 }, { k: 1, duration: dur || 1.6, ease: 'none' }, at); } };
  };
  /** Ondas concéntricas que se propagan desde el centro (con núcleo difuso). */
  K.ripples = function (parent, o) {
    o = o || {}; var c = K.canvas(parent), ctx = c.getContext('2d'), cx = o.x || W / 2, cy = o.y || H / 2, p = { alpha: 1, speed: 1 };
    A.addRender(function (t) {
      ctx.clearRect(0, 0, W, H);
      if (o.core !== false) { var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, o.coreR || 220); g.addColorStop(0, o.coreColor || 'rgba(0,0,0,.9)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.globalAlpha = p.alpha; ctx.fillRect(0, 0, W, H); }
      for (var i = 0; i < (o.n || 9); i++) { var r = ((t * 140 * p.speed + i * (o.gap || 130)) % ((o.n || 9) * (o.gap || 130))) + 40; ctx.globalAlpha = p.alpha * Math.max(0, 1 - r / ((o.n || 9) * (o.gap || 130))); ctx.strokeStyle = o.color || 'rgba(0,0,0,.6)'; ctx.lineWidth = o.width || 3; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke(); }
      ctx.globalAlpha = 1;
    });
    return { canvas: c, p: p };
  };
  /** Formas orgánicas que se deforman con fluidez. */
  K.blobs = function (parent, o) {
    o = o || {}; var s = K.svgLayer(parent), n = o.n || 3, items = [], p = { amp: 1 };
    for (var i = 0; i < n; i++) items.push({ path: K.svg('path', { fill: o.color || '#111' }, s), x: (o.x || W / 2) + K.rand(-260, 260), y: (o.y || H / 2) + K.rand(-160, 160), r: K.rand(120, 230), ph: K.rand(0, 6) });
    A.addRender(function (t) {
      items.forEach(function (b) {
        var pts = []; for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4, rr = b.r * (1 + 0.22 * p.amp * Math.sin(t * 1.3 + b.ph + k * 1.7) + 0.12 * p.amp * Math.cos(t * 0.9 + k * 2.3)); pts.push([b.x + Math.cos(a) * rr + Math.sin(t * 0.5 + b.ph) * 40, b.y + Math.sin(a) * rr + Math.cos(t * 0.4 + b.ph) * 30]); }
        var d = ''; for (var m = 0; m < 8; m++) { var p0 = pts[(m + 7) % 8], p1 = pts[m], p2 = pts[(m + 1) % 8], p3 = pts[(m + 2) % 8]; if (!m) d += 'M' + p1[0].toFixed(1) + ',' + p1[1].toFixed(1); d += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ',' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ',' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1); }
        b.path.setAttribute('d', d + 'Z');
      });
    });
    return { svg: s, p: p };
  };
  /** Retícula isométrica de cubos con un núcleo que late. */
  K.isoGrid = function (parent, o) {
    o = o || {}; var c = K.canvas(parent), ctx = c.getContext('2d'), n = o.n || 9, sz = o.size || 54, col = o.color || '#2F6BFF', p = { pulse: 1 };
    A.addRender(function (t) {
      ctx.clearRect(0, 0, W, H);
      var cells = []; for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) cells.push([i, j]);
      cells.sort(function (a, b) { return (a[0] + a[1]) - (b[0] + b[1]); });
      cells.forEach(function (q) {
        var i = q[0] - (n - 1) / 2, j = q[1] - (n - 1) / 2, dist = Math.sqrt(i * i + j * j);
        var hgt = sz * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 3 - dist * 0.9))) * p.pulse + (dist < 0.6 ? sz * 0.8 : 0);
        var x = W / 2 + (i - j) * sz, y = H / 2 + (i + j) * sz * 0.5 - hgt + 120;
        var glow = dist < 0.6 ? 1 : 0;
        ctx.fillStyle = glow ? '#BFE4FF' : col; ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + sz, y + sz * 0.5); ctx.lineTo(x, y + sz); ctx.lineTo(x - sz, y + sz * 0.5); ctx.closePath(); ctx.fill();
        ctx.fillStyle = glow ? '#7CC4FF' : shade(col, -0.25); ctx.beginPath(); ctx.moveTo(x - sz, y + sz * 0.5); ctx.lineTo(x, y + sz); ctx.lineTo(x, y + sz + hgt); ctx.lineTo(x - sz, y + sz * 0.5 + hgt); ctx.closePath(); ctx.fill();
        ctx.fillStyle = glow ? '#4DA6FF' : shade(col, -0.45); ctx.beginPath(); ctx.moveTo(x + sz, y + sz * 0.5); ctx.lineTo(x, y + sz); ctx.lineTo(x, y + sz + hgt); ctx.lineTo(x + sz, y + sz * 0.5 + hgt); ctx.closePath(); ctx.fill();
      });
      ctx.globalAlpha = 1;
    });
    return { canvas: c, p: p };
  };
  function shade(hex, k) { var m = /^#?([0-9a-f]{6})$/i.exec(hex); if (!m) return hex; var v = parseInt(m[1], 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255; var f = function (x) { return Math.round(K.clamp(x + x * k, 0, 255)); }; return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; }
  /** Barra de luz que cruza la pantalla (con resplandor). */
  K.lightBar = function (tl, parent, at, o) {
    o = o || {};
    var b = K.el('div', { cls: 'k-abs', css: { left: '-40%', top: ((o.y || H / 2) - (o.h || 90) / 2) + 'px', width: '40%', height: (o.h || 90) + 'px', borderRadius: '60px', background: 'linear-gradient(90deg, transparent, ' + (o.color || '#FF4A1A') + ' 30%, ' + (o.color2 || '#FFB21A') + ' 70%, transparent)', filter: 'blur(' + (o.blur || 6) + 'px)', boxShadow: '0 0 120px 40px ' + (o.glow || 'rgba(255,90,20,.45)') } }, parent);
    tl.fromTo(b, { x: 0 }, { x: W * 1.45, duration: o.dur || 1.4, ease: o.ease || 'power2.inOut' }, at);
    return b;
  };
  /** Mapa/imagen: imagen de la biblioteca con encuadre y movimiento (Ken Burns). */
  K.image = function (parent, key, o) {
    o = o || {};
    var e = K.el('div', { cls: 'k-abs', css: { left: (o.x || 0) + 'px', top: (o.y || 0) + 'px', width: (o.w || W) + 'px', height: (o.h || H) + 'px', backgroundImage: 'url("' + A.asset(key) + '")', backgroundSize: 'cover', backgroundPosition: (o.fx != null ? o.fx * 100 : 50) + '% ' + (o.fy != null ? o.fy * 100 : 50) + '%', borderRadius: (o.radius || 0) + 'px', overflow: 'hidden' } }, parent);
    return e;
  };

  A.kit = true;
})();
