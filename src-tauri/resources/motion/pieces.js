/* ATRIL · Piezas listas (P): animaciones completas y universales construidas sobre el kit (K).
   Cada pieza se llama P.<id>(tl, at, opciones) → { scene, end, ...elementos } y se puede:
   1) usar tal cual (solo cambian los textos, cifras, íconos e imágenes),
   2) copiar su código y cambiar una parte, o
   3) servir de referencia para crear algo desde cero.
   Todo es determinista: ningún reloj, todo en el timeline o en ATRIL.addRender.
   Cada pieza va entre marcas «@piece id» y «@end» para que la app pueda mostrar su código. */
(function () {
  var A = window.ATRIL, K = window.K, W = 1920, H = 1080;
  if (!K || typeof gsap === 'undefined') return;
  var P = window.P = {};

  /* ---------- curvas ---------- */
  // Entradas: ease-out fuerte (rápido al principio, se asienta suave); nunca ease-in al entrar.
  // Movimientos dentro del cuadro: in-out. Progreso continuo (barras de tiempo, derivas): lineal.
  // Salidas: ~70 % de la entrada y por el mismo camino. Rebote solo para un acento (sello, golpe).
  try {
    CustomEase.create('p-out', '0.23,1,0.32,1');
    CustomEase.create('p-arrive', '0.16,1,0.3,1');
    CustomEase.create('p-inout', '0.77,0,0.175,1');
    CustomEase.create('p-in', '0.55,0,1,0.45');
    CustomEase.create('p-drift', '0.37,0,0.63,1');
  } catch (e) { /* sin CustomEase: GSAP usa su curva por defecto */ }
  var E = P.ease = { out: 'p-out', arrive: 'p-arrive', inOut: 'p-inout', in: 'p-in', drift: 'p-drift', pop: 'back.out(1.4)', snap: 'expo.out' };

  /* ---------- estilos de las piezas ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '.p-label{position:absolute;margin:0;font:500 26px/1.15 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;white-space:nowrap;color:var(--muted)}',
    '.p-head{position:absolute;margin:0;font-family:var(--font-title);font-weight:700;line-height:.98;letter-spacing:-.01em;color:var(--fg);white-space:nowrap}',
    '.p-body{position:absolute;margin:0;font-family:var(--font-body);font-size:40px;line-height:1.28;color:var(--fg)}',
    '.p-num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum"}',
    '.p-acc{color:var(--accent)}',
    '.p-mark{position:relative;display:inline-block;z-index:0}',
    '.p-mark>i{position:absolute;left:-.08em;right:-.08em;top:.08em;bottom:.02em;background:var(--accent);z-index:-1;transform-origin:0 50%;transform:scaleX(0)}',
    '.p-card{position:absolute;border-radius:22px;background:color-mix(in srgb,var(--fg) 6%,var(--bg));border:1.5px solid color-mix(in srgb,var(--fg) 14%,transparent)}',
    '.p-chip{position:absolute;display:flex;align-items:center;gap:18px;padding:18px 28px;border-radius:16px;background:color-mix(in srgb,var(--bg) 82%,transparent);border:1.5px solid color-mix(in srgb,var(--fg) 16%,transparent);color:var(--fg);white-space:nowrap;backdrop-filter:blur(10px)}',
    '.pw-mask,.pc-mask,.pl-mask{padding:.14em .06em .3em;margin:-.14em -.06em -.3em}',
    '.p-balance{text-wrap:balance}'
  ].join('\n');
  document.head.appendChild(css);

  /* ---------- utilidades ---------- */
  var mix = P.mix = function (pct, a, b) { return 'color-mix(in srgb,' + (a || 'var(--fg)') + ' ' + pct + '%,' + (b || 'transparent') + ')'; };
  var esc = P.esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var icons = function () { return A.icons || {}; };
  var num = P.num = function (v, dec, sep) { var s = Number(v || 0).toFixed(dec || 0).split('.'); s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, sep == null ? ',' : sep); return s.join('.'); };
  var decOf = function (v) { var m = String(v).match(/\.(\d+)/); return m ? m[1].length : 0; };

  /** Texto posicionado. o: {x, y, align:'left'|'center'|'right', size, cls, color, maxW, maxH, weight, font, italic, lines} */
  P.text = function (parent, html, o) {
    o = o || {};
    var e = K.el('div', { cls: o.cls || 'p-head', html: html }, parent);
    var st = e.style;
    if (o.size) st.fontSize = o.size + 'px';
    if (o.color) st.color = o.color;
    if (o.weight) st.fontWeight = o.weight;
    if (o.font) st.fontFamily = '"' + o.font + '"';
    if (o.italic) st.fontStyle = 'italic';
    if (o.tracking != null) st.letterSpacing = o.tracking + 'em';
    if (o.lines) { st.whiteSpace = 'normal'; st.width = (o.maxW || 1200) + 'px'; e.classList.add('p-balance'); }
    if (o.align) st.textAlign = o.align;
    if (o.maxW || o.maxH) A.fit(e, o.maxW || 1640, o.maxH || 900, o.min || 22);
    P.place(e, o);
    return e;
  };
  /** Coloca por el punto (x, y): align decide qué borde horizontal cae en x; y es el centro vertical (o top si o.top). */
  P.place = function (e, o) {
    var w = e.offsetWidth, h = e.offsetHeight, x = o.x != null ? o.x : W / 2;
    e.style.left = (o.align === 'left' ? x : o.align === 'right' ? x - w : x - w / 2) + 'px';
    e.style.top = (o.top != null ? o.top : (o.y != null ? o.y : H / 2) - h / 2) + 'px';
    return e;
  };
  P.label = function (parent, text, o) { o = Object.assign({ cls: 'p-label' }, o || {}); return P.text(parent, esc(text), o); };

  /** Entrada por palabras/letras/líneas a través de una máscara (suben desde abajo, sin recortes en descendentes). */
  P.rise = function (tl, el, at, o) {
    o = o || {};
    var by = o.by || 'words';
    var sp = new SplitText(el, { type: by === 'chars' ? 'words,chars' : by, mask: by, wordsClass: 'pw', charsClass: 'pc', linesClass: 'pl' });
    var parts = sp[by];
    gsap.set(parts, { transformOrigin: '0% 100%' });
    tl.from(parts, { yPercent: o.from != null ? o.from : 140, rotate: o.rot != null ? o.rot : 5, duration: o.dur || 0.95, stagger: o.stagger != null ? o.stagger : (by === 'chars' ? 0.028 : 0.07), ease: o.ease || E.out }, at);
    return parts;
  };
  /** Salida rápida hacia arriba por la misma máscara. */
  P.sink = function (tl, parts, at, o) { o = o || {}; tl.to(parts, { yPercent: -110, duration: o.dur || 0.45, stagger: o.stagger != null ? o.stagger : 0.03, ease: E.in }, at); };
  /** Aparición suave con desenfoque (para textos secundarios). */
  P.fadeUp = function (tl, el, at, o) { o = o || {}; tl.from(el, { opacity: 0, y: o.y != null ? o.y : 24, filter: 'blur(' + (o.blur != null ? o.blur : 10) + 'px)', duration: o.dur || 0.8, ease: E.out, immediateRender: o.immediate !== false }, at); return el; };
  /** Marca de resaltador detrás de una palabra: envuelve la primera aparición de `word` en el texto del elemento. */
  P.markWord = function (el, word) {
    if (!word) return null;
    var html = el.innerHTML, i = html.toLowerCase().indexOf(String(word).toLowerCase());
    if (i < 0) return null;
    el.innerHTML = html.slice(0, i) + '<span class="p-mark"><i></i>' + html.slice(i, i + word.length) + '</span>' + html.slice(i + word.length);
    return el.querySelector('.p-mark');
  };
  /** Envuelve la primera aparición de `word` para cambiarle el color después (tl.to(span, {color})). */
  P.tint = function (el, word) {
    if (!word) return null;
    var html = el.innerHTML, i = html.toLowerCase().indexOf(String(word).toLowerCase());
    if (i < 0) return null;
    el.innerHTML = html.slice(0, i) + '<span class="p-tint">' + html.slice(i, i + word.length) + '</span>' + html.slice(i + word.length);
    return el.querySelector('.p-tint');
  };
  /** Grupo SVG en su propia capa: rota y escala con svgOrigin sin mover la capa. */
  P.group = function (parent) { var s = K.svgLayer(parent); return K.svg('g', {}, s); };
  P.sweepMark = function (tl, mark, at, o) {
    o = o || {}; if (!mark) return;
    tl.to(mark.querySelector('i'), { scaleX: 1, duration: o.dur || 0.55, ease: E.inOut }, at);
    if (o.ink !== false) tl.to(mark, { color: o.ink || 'var(--bg)', duration: 0.2, ease: 'none' }, at + (o.dur || 0.55) * 0.45);
  };

  /** Ícono si existe; si no, una figura geométrica (nunca falla por un ícono que falta). */
  var SH = ['circle', 'square', 'tri', 'hex', 'diamond', 'star'];
  P.glyph = function (parent, key, o) {
    o = o || {}; var size = o.size || 120, x = o.x != null ? o.x : W / 2, y = o.y != null ? o.y : H / 2;
    if (key && icons()[key]) return K.icon(parent, key, { x: x, y: y, size: size, color: o.color || 'var(--accent)', bg: o.bg });
    var e = K.el('div', { cls: 'k-abs', css: { left: (x - size / 2) + 'px', top: (y - size / 2) + 'px', width: size + 'px', height: size + 'px', color: o.color || 'var(--accent)' } }, parent);
    if (o.text != null) {
      e.innerHTML = '<div style="position:absolute;inset:0;border-radius:50%;border:3px solid currentColor"></div><div class="p-num" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 ' + Math.round(size * 0.36) + 'px/1 var(--font-mono);letter-spacing:.02em">' + esc(o.text) + '</div>';
      return e;
    }
    var s = K.svg('svg', { viewBox: '0 0 100 100', width: size, height: size }, e);
    K.svg('path', { d: K.shapeD(SH[(o.i || 0) % SH.length], 50, 50, 30), fill: 'none', stroke: 'currentColor', 'stroke-width': 6, 'stroke-linejoin': 'round' }, s);
    return e;
  };
  /** Dibuja los trazos del glifo/ícono y lo hace aparecer con un pequeño rebote. */
  P.popGlyph = function (tl, g, at) {
    tl.from(g, { scale: 0.86, opacity: 0, filter: 'blur(8px)', duration: 0.7, ease: E.arrive }, at);
    var paths = g.querySelectorAll('path,circle,line,polyline,polygon,rect,ellipse');
    if (paths.length) tl.from(paths, { drawSVG: '0%', duration: 0.8, stagger: 0.04, ease: E.inOut }, at + 0.05);
    return g;
  };

  /** Fondo de escena: 'field' (color liso con grano), 'dots', 'grid', 'paper' o 'none'. */
  P.bg = function (s, kind) {
    kind = kind || 'field';
    if (kind === 'none') return null;
    if (kind === 'paper') return K.paper(s, { marks: false });
    var f = K.field(s, 'var(--bg)', { grain: 0.1 });
    if (kind === 'dots') K.dotGrid(f, { color: mix(9), gap: 54, size: 2 });
    if (kind === 'grid') K.el('div', { cls: 'k-layer', css: { backgroundImage: 'linear-gradient(' + mix(5) + ' 1px,transparent 1px),linear-gradient(90deg,' + mix(5) + ' 1px,transparent 1px)', backgroundSize: '96px 96px', backgroundPosition: 'center center' } }, f);
    K.el('div', { cls: 'k-layer', css: { background: 'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 50%, rgba(0,0,0,.28) 100%)' } }, f);
    return f;
  };

  /**
   * Escena a pantalla completa con fondo, cámara (cam.world) y una deriva lenta que mantiene vivo el cuadro.
   * o: {dur, bg, enter: fx de K.show, drift:false, parent}
   */
  P.stage = function (tl, at, o) {
    o = o || {};
    var s = K.scene({ parent: o.parent });
    P.bg(s, o.bg);
    var cam = K.camera(s);
    var dur = o.dur || 6;
    if (o.drift !== false) tl.fromTo(cam.rig, { scale: 1 }, { scale: 1.035, transformOrigin: '50% 46%', duration: dur, ease: 'none', immediateRender: false }, at);
    K.show(tl, s, at, { fx: o.enter || 'cut', dir: o.dir, color: o.color });
    return { s: s, cam: cam, w: cam.world, dur: dur, end: at + dur };
  };
  /** Capa transparente para piezas sobre video (sin fondo). */
  P.layer = function (o) { o = o || {}; return K.el('div', { cls: 'k-layer' }, o.parent); };

  /** Anillos que se expanden desde un punto (pulso de llegada). */
  P.pulse = function (tl, parent, at, o) {
    o = o || {}; var s = K.svgLayer(parent), x = o.x != null ? o.x : W / 2, y = o.y != null ? o.y : H / 2, n = o.n || 3;
    for (var i = 0; i < n; i++) {
      var c = K.svg('circle', { cx: x, cy: y, r: o.r || 40, fill: 'none', stroke: o.color || 'var(--accent)', 'stroke-width': o.sw || 3 }, s);
      tl.fromTo(c, { scale: 0.2, opacity: 0.9, svgOrigin: x + ' ' + y }, { scale: o.to || 4, opacity: 0, duration: o.dur || 1.4, ease: 'power2.out', immediateRender: false }, at + i * (o.gap || 0.18));
      gsap.set(c, { opacity: 0 });
    }
    return s;
  };
  /** Trazo de una curva suave (Catmull-Rom) que pasa por los puntos. */
  P.smoothD = function (pts, k) {
    k = k == null ? 0.5 : k; if (pts.length < 2) return '';
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1 = [p1[0] + (p2[0] - p0[0]) * k / 3, p1[1] + (p2[1] - p0[1]) * k / 3], c2 = [p2[0] - (p3[0] - p1[0]) * k / 3, p2[1] - (p3[1] - p1[1]) * k / 3];
      d += 'C' + c1[0].toFixed(1) + ',' + c1[1].toFixed(1) + ' ' + c2[0].toFixed(1) + ',' + c2[1].toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    return d;
  };
  /** Contador sobre un elemento: respeta decimales, prefijo y sufijo. */
  P.count = function (tl, el, at, o) {
    var to = Number(o.to), dec = o.decimals != null ? o.decimals : decOf(o.to);
    return K.counter(tl, el, at, { from: o.from || 0, to: to, dur: o.dur || 1.4, decimals: dec, prefix: o.prefix || '', suffix: o.suffix || '', sep: o.sep, ease: o.ease || 'power3.out' });
  };

  /* ---------- transiciones entre piezas ---------- */
  /** Cambia de la escena `from` a la pieza que empieza en `at`. Devuelve el fx de entrada que debe usar la nueva escena. */
  P.transition = function (tl, from, at, fx, o) {
    o = o || {};
    if (!from) return 'cut';
    if (fx === 'cover' || fx === 'tiles') {
      var r = fx === 'tiles' ? K.tiles(tl, at - 0.75, { color: o.color, from: o.from }) : K.cover(tl, at - 0.6, { from: o.from || 'right', shape: o.shape, color: o.color });
      K.hide(tl, from, r.mid); return 'cut';
    }
    if (fx === 'whip') { K.hide(tl, from, at - 0.28, { fx: 'whip', dur: 0.28, dir: o.dir }); return 'whip'; }
    if (fx === 'push') { tl.to(from, { xPercent: -100, duration: 0.7, ease: E.inOut }, at); tl.set(from, { visibility: 'hidden' }, at + 0.7); return 'slide'; }
    if (fx === 'zoom') { tl.to(from, { scale: 1.6, opacity: 0, filter: 'blur(18px)', duration: 0.55, ease: E.in }, at - 0.2); tl.set(from, { visibility: 'hidden' }, at + 0.4); return 'zoom'; }
    tl.set(from, { visibility: 'hidden' }, at + (fx === 'cut' || fx === 'flash' ? 0 : 0.9));
    return fx;
  };
  /**
   * Encadena piezas en una sola composición con transiciones entre ellas.
   * items: [{ p:'stat', dur:4, fx:'cover', ...opciones de la pieza }]. Devuelve el instante final.
   */
  P.seq = function (tl, at, items) {
    var t = at, prev = null, out = [];
    items.forEach(function (it, i) {
      var fn = P[it.p]; if (!fn) { A.errors.push('Pieza inexistente: ' + it.p); return; }
      var dur = it.dur || fn.dur || 6;
      var enter = i ? P.transition(tl, prev && prev.scene, t, it.fx || 'cover', it) : (it.enter || 'cut');
      var r = fn(tl, t, Object.assign({}, it, { dur: dur, enter: enter }));
      out.push(r); prev = r; t += dur;
    });
    out.end = t;
    return out;
  };

  /* =====================================================================
     APERTURA Y ESTRUCTURA
     ===================================================================== */

  /*@piece title*/
  /** Título de apertura: antetítulo, título en 1–2 líneas que sube por máscaras, línea de acento y bajada. */
  P.title = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.title.dur, bg: o.bg || 'dots', enter: o.enter, parent: o.parent }), w = st.w;
    var left = o.align === 'left', x = left ? 200 : W / 2, al = left ? 'left' : 'center';
    var t = P.text(w, esc(o.title || 'Título'), { x: x, y: o.sub ? 450 : 480, align: al, size: o.size || 176, maxW: 1520, maxH: 400, lines: true, min: 64 });
    t.style.lineHeight = '0.98';
    if (!left) t.style.textAlign = 'center';
    var tint = P.tint(t, o.highlight);
    var top = t.offsetTop, bottom = top + t.offsetHeight;
    var line = K.el('div', { cls: 'k-abs', css: { left: (left ? x : x - 90) + 'px', top: (top - 46) + 'px', width: '180px', height: '6px', background: 'var(--accent)', transformOrigin: left ? '0 50%' : '50% 50%' } }, w);
    var kick = o.kicker ? P.label(w, o.kicker, { x: x, y: top - 92, align: al, color: 'var(--accent)' }) : null;
    var sub = o.sub ? P.text(w, esc(o.sub), { cls: 'p-body', x: x, top: bottom + 44, align: al, size: 44, maxW: 1200, lines: true }) : null;
    if (sub) { sub.style.color = mix(78); if (!left) sub.style.textAlign = 'center'; P.place(sub, { x: x, top: bottom + 44, align: al }); }
    tl.from(line, { scaleX: 0, duration: 0.9, ease: E.inOut }, at + 0.1);
    if (kick) tl.from(kick, { opacity: 0, letterSpacing: '0.5em', duration: 1.1, ease: E.out }, at + 0.2);
    var words = P.rise(tl, t, at + 0.35, { stagger: 0.08 });
    tl.fromTo(t, { letterSpacing: '-0.02em' }, { letterSpacing: '0.005em', duration: st.dur, ease: 'none', immediateRender: false }, at);
    if (tint) tl.to(tint, { color: 'var(--accent)', duration: 0.5, ease: 'power2.out' }, at + 0.35 + words.length * 0.08 + 0.4);
    if (sub) P.fadeUp(tl, sub, at + 1.1);
    if (o.exit) { P.sink(tl, words, st.end - 0.5); }
    return { scene: st.s, end: st.end, title: t, kicker: kick, sub: sub, line: line, cam: st.cam };
  };
  P.title.dur = 5;
  /*@end*/

  /*@piece chapter*/
  /** Separador de capítulo: número enorme que se dibuja en contorno y se llena desde abajo, línea vertical y título. */
  P.chapter = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.chapter.dur, bg: o.bg || 'grid', enter: o.enter, parent: o.parent }), w = st.w;
    var n = String(o.n != null ? o.n : '01');
    var base = { position: 'absolute', margin: 0, font: '700 560px/1 var(--font-title)', letterSpacing: '-0.03em', whiteSpace: 'nowrap' };
    var outline = K.el('div', { cls: 'p-num', css: Object.assign({ color: 'transparent', WebkitTextStroke: '3px ' + mix(55) }, base), text: n }, w);
    var fill = K.el('div', { cls: 'p-num', css: Object.assign({ color: 'var(--accent)' }, base), text: n }, w);
    P.place(outline, { x: 610, y: 500 }); P.place(fill, { x: 610, y: 500 });
    var div = K.el('div', { cls: 'k-abs', css: { left: '1000px', top: '290px', width: '3px', height: '400px', background: mix(30), transformOrigin: '50% 0' } }, w);
    var kick = P.label(w, o.kicker || 'Capítulo', { x: 1080, y: 360, align: 'left', color: 'var(--accent)' });
    var t = P.text(w, esc(o.title || 'Título del capítulo'), { x: 1080, y: 500, align: 'left', size: 120, maxW: 700, maxH: 300, lines: true, min: 54 });
    t.style.lineHeight = '1'; P.place(t, { x: 1080, y: 500, align: 'left' });
    tl.fromTo(outline, { clipPath: 'inset(100% -5% -5% -5%)' }, { clipPath: 'inset(-5% -5% -5% -5%)', duration: 1.1, ease: E.inOut }, at);
    tl.fromTo(fill, { clipPath: 'inset(100% -5% -5% -5%)' }, { clipPath: 'inset(-5% -5% -5% -5%)', duration: 1.2, ease: E.inOut }, at + 0.55);
    tl.from([outline, fill], { y: 60, duration: 1.6, ease: E.out }, at);
    st.cam.set(tl, at, { x: 610, y: 500, zoom: 1.18 });
    st.cam.to(tl, at + 0.6, { x: W / 2, y: H / 2 - 20, zoom: 1, dur: 1.5, ease: E.inOut });
    tl.from(div, { scaleY: 0, duration: 0.9, ease: E.inOut }, at + 0.9);
    tl.from(kick, { opacity: 0, x: -30, duration: 0.8, ease: E.out }, at + 1.2);
    var words = P.rise(tl, t, at + 1.3, { stagger: 0.07 });
    if (o.exit) P.sink(tl, words, st.end - 0.5);
    return { scene: st.s, end: st.end, number: fill, outline: outline, title: t, kicker: kick, cam: st.cam };
  };
  P.chapter.dur = 5;
  /*@end*/

  /*@piece question*/
  /** Pregunta gancho: un punto crece hasta ser un «?» gigante detrás, la pregunta entra por palabras y una palabra clave se resalta. */
  P.question = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.question.dur, bg: o.bg || 'dots', enter: o.enter, parent: o.parent }), w = st.w;
    var q = K.el('div', { css: { position: 'absolute', font: '700 900px/1 var(--font-title)', color: mix(9, 'var(--accent)'), left: '0', top: '0' }, text: '?' }, w);
    P.place(q, { x: 1340, y: 470 });
    var dot = K.el('div', { cls: 'k-abs', css: { left: '1320px', top: '460px', width: '40px', height: '40px', borderRadius: '50%', background: 'var(--accent)' } }, w);
    var t = P.text(w, esc(o.text || '¿Qué pasó realmente?'), { x: 200, y: 480, align: 'left', size: 150, maxW: 1150, maxH: 460, lines: true, min: 56 });
    t.style.lineHeight = '1.02';
    var mark = P.markWord(t, o.highlight);
    P.place(t, { x: 200, y: 480, align: 'left' });
    gsap.set(dot, { left: '1320px', top: '820px' });
    tl.from(dot, { scale: 0.6, opacity: 0, duration: 0.45, ease: E.out }, at + 0.1);
    tl.to(dot, { y: -180, scale: 0.4, opacity: 0, duration: 0.7, ease: E.inOut }, at + 0.5);
    tl.fromTo(q, { clipPath: 'inset(100% -10% -10% -10%)' }, { clipPath: 'inset(-10% -10% -10% -10%)', duration: 1.2, ease: E.inOut }, at + 0.55);
    tl.from(q, { rotationY: -50, y: 80, transformPerspective: 900, transformOrigin: '50% 80%', duration: 1.6, ease: E.out }, at + 0.55);
    tl.to(q, { rotation: 6, y: -20, duration: st.dur, ease: E.drift }, at + 0.6);
    var words = P.rise(tl, t, at + 0.5, { stagger: 0.075 });
    P.sweepMark(tl, mark, at + 0.5 + words.length * 0.075 + 0.5);
    P.pulse(tl, w, at + 1.9, { x: 1340, y: 520, r: 60, to: 6, color: mix(30, 'var(--accent)') });
    if (o.exit) P.sink(tl, words, st.end - 0.5);
    return { scene: st.s, end: st.end, text: t, glyph: q, mark: mark, cam: st.cam };
  };
  P.question.dur = 5;
  /*@end*/

  /* =====================================================================
     CIFRAS Y DATOS
     ===================================================================== */

  /*@piece stat*/
  /** Cifra protagonista: un punto estalla en ondas, un anillo con marcas se traza alrededor y la cifra cuenta hasta su valor exacto. */
  P.stat = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.stat.dur, bg: o.bg || 'dots', enter: o.enter, parent: o.parent }), w = st.w;
    var cx = W / 2, cy = 460;
    var to = Number(o.value != null ? o.value : 353), dec = o.decimals != null ? o.decimals : decOf(o.value);
    var n = P.text(w, (o.prefix || '') + num(to, dec) + (o.suffix || ''), { cls: 'p-head p-num', x: cx, y: cy - 30, size: o.size || 210, maxW: 680, maxH: 260, min: 90 });
    var R = K.clamp(n.offsetWidth / 2 + 90, 300, 370);
    P.place(n, { x: cx, y: cy - (o.note ? 62 : 26) });
    var g = P.group(w);
    var track = K.svg('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: mix(10), 'stroke-width': 2 }, g);
    var arc = K.svg('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 6, 'stroke-linecap': 'round', transform: 'rotate(-90 ' + cx + ' ' + cy + ')' }, g);
    var ticks = [];
    for (var i = 0; i < 72; i++) {
      var a = i / 72 * Math.PI * 2 - Math.PI / 2, r1 = R + 22, r2 = R + (i % 6 ? 32 : 46);
      ticks.push(K.svg('line', { x1: cx + Math.cos(a) * r1, y1: cy + Math.sin(a) * r1, x2: cx + Math.cos(a) * r2, y2: cy + Math.sin(a) * r2, stroke: i % 6 ? mix(22) : mix(55), 'stroke-width': 2 }, g));
    }
    var dot = K.svg('circle', { cx: cx, cy: cy, r: 22, fill: 'var(--accent)' }, P.group(w));
    var lab = o.label ? P.label(w, o.label, { x: cx, y: cy + (o.note ? 78 : 112), color: 'var(--fg)', size: 30, maxW: R * 1.6 }) : null;
    var note = o.note ? P.text(w, esc(o.note), { cls: 'p-body', x: cx, y: cy + 158, size: 34, maxW: R * 1.5, lines: true }) : null;
    if (note) { note.style.color = mix(72); note.style.textAlign = 'center'; }
    tl.from(dot, { scale: 0.5, opacity: 0, svgOrigin: cx + ' ' + cy, duration: 0.4, ease: E.out }, at + 0.05);
    tl.to(dot, { attr: { r: R }, opacity: 0, duration: 0.8, ease: E.out }, at + 0.45);
    P.pulse(tl, w, at + 0.45, { x: cx, y: cy, r: 60, to: R / 40, n: 3, gap: 0.12 });
    tl.from(track, { scale: 0.7, opacity: 0, svgOrigin: cx + ' ' + cy, duration: 0.9, ease: E.out }, at + 0.5);
    tl.fromTo(arc, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.7, ease: E.inOut }, at + 0.55);
    tl.from(ticks, { opacity: 0, duration: 0.3, stagger: { each: 0.014 }, ease: 'none' }, at + 0.55);
    tl.to(g, { rotation: 10, svgOrigin: cx + ' ' + cy, duration: st.dur, ease: 'none' }, at);
    tl.from(n, { scale: 0.9, opacity: 0, filter: 'blur(14px)', duration: 0.8, ease: E.out }, at + 0.55);
    P.count(tl, n, at + 0.55, { to: to, decimals: dec, prefix: o.prefix, suffix: o.suffix, dur: 1.7 });
    if (lab) P.fadeUp(tl, lab, at + 1.3);
    if (note) P.fadeUp(tl, note, at + 1.6);
    tl.fromTo(n, { scale: 1 }, { scale: 1.05, duration: 0.16, ease: 'power2.out', yoyo: true, repeat: 1, immediateRender: false }, at + 2.25);
    return { scene: st.s, end: st.end, number: n, label: lab, note: note, ring: arc, cam: st.cam };
  };
  P.stat.dur = 5;
  /*@end*/

  /*@piece bars*/
  /** Barras comparativas horizontales: crecen con su cifra, la destacada se enciende y la cámara se acerca a ella. */
  P.bars = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.bars.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var items = (o.items || [{ label: 'A', value: 40 }, { label: 'B', value: 75 }, { label: 'C', value: 100 }]).slice(0, 6);
    var hi = o.highlight != null ? o.highlight : items.reduce(function (b, it, i) { return Number(it.value) > Number(items[b].value) ? i : b; }, 0);
    var max = Math.max.apply(0, items.map(function (it) { return Number(it.value) || 0; })) || 1;
    var top = o.title ? 270 : 200, bottom = 810, gap = (bottom - top) / items.length, bh = Math.min(88, gap * 0.58);
    var x0 = 680, maxW = 940;
    var title = o.title ? P.label(w, o.title, { x: 200, y: 165, align: 'left', color: 'var(--accent)', size: 28 }) : null;
    var axis = K.el('div', { cls: 'k-abs', css: { left: (x0 - 2) + 'px', top: (top + 4) + 'px', width: '3px', height: (bottom - top - 8) + 'px', background: mix(35), transformOrigin: '50% 0' } }, w);
    tl.from(axis, { scaleY: 0, duration: 0.8, ease: E.inOut }, at + 0.1);
    var rows = items.map(function (it, i) {
      var y = top + gap * i + gap / 2, on = i === hi, v = Number(it.value) || 0, bw = Math.max(10, maxW * v / max);
      var lab = P.text(w, esc(it.label), { cls: 'p-head', x: x0 - 44, y: y, align: 'right', size: 52, maxW: 440, maxH: 64, min: 26 });
      lab.style.color = on ? 'var(--fg)' : mix(72); P.place(lab, { x: x0 - 44, y: y, align: 'right' });
      var trk = K.el('div', { cls: 'k-abs', css: { left: x0 + 'px', top: (y - bh / 2) + 'px', width: maxW + 'px', height: bh + 'px', background: mix(5), borderRadius: '0 ' + bh / 2 + 'px ' + bh / 2 + 'px 0' } }, w);
      var bar = K.el('div', { cls: 'k-abs', css: { left: x0 + 'px', top: (y - bh / 2) + 'px', width: bw + 'px', height: bh + 'px', borderRadius: '0 ' + bh / 2 + 'px ' + bh / 2 + 'px 0', background: on ? 'var(--accent)' : mix(30), transformOrigin: '0 50%' } }, w);
      var val = K.el('div', { cls: 'p-head p-num', css: { fontSize: '58px', color: on ? 'var(--accent)' : 'var(--fg)' }, text: '0' }, w);
      val.style.left = (x0 + bw + 28) + 'px'; val.style.top = (y - 31) + 'px';
      if (x0 + bw + 28 + 200 > W - 60) { val.style.left = (x0 + bw - 24) + 'px'; val.style.transform = 'translateX(-100%)'; val.style.color = on ? 'var(--bg)' : 'var(--fg)'; }
      var t0 = at + 0.35 + i * 0.15;
      tl.from(lab, { opacity: 0, x: -30, duration: 0.7, ease: E.out }, t0);
      tl.from(trk, { scaleX: 0, transformOrigin: '0 50%', duration: 0.9, ease: E.out }, t0);
      tl.from(bar, { scaleX: 0, duration: 1.25, ease: E.out }, t0 + 0.1);
      tl.from(val, { opacity: 0, x: -bw, duration: 1.25, ease: E.out }, t0 + 0.1);
      P.count(tl, val, t0 + 0.1, { to: v, prefix: o.prefix, suffix: o.suffix || it.suffix, dur: 1.25 });
      return { y: y, bar: bar, label: lab, value: val, track: trk };
    });
    var tf = at + 0.5 + items.length * 0.15 + 1.15;
    rows.forEach(function (r, i) { if (i !== hi) tl.to([r.bar, r.label, r.value], { opacity: 0.32, duration: 0.6, ease: 'power2.out' }, tf); });
    st.cam.to(tl, tf, { x: 1010, y: rows[hi].y, zoom: 1.1, dur: 1.5, ease: E.inOut });
    tl.fromTo(rows[hi].bar, { filter: 'brightness(1)' }, { filter: 'brightness(1.22)', duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, tf + 0.2);
    if (title) P.fadeUp(tl, title, at + 0.2);
    return { scene: st.s, end: st.end, rows: rows, title: title, cam: st.cam };
  };
  P.bars.dur = 6;
  /*@end*/

  /*@piece units*/
  /** «N de cada M»: una rejilla de puntos aparece en ola y se encienden N mientras la cifra cuenta. */
  P.units = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.units.dur, bg: o.bg || 'dots', enter: o.enter, parent: o.parent }), w = st.w;
    var of = Math.max(2, Math.min(400, Math.round(o.of || 100))), n = Math.max(0, Math.min(of, Math.round(o.n != null ? o.n : 27)));
    var cols = of <= 10 ? of : of <= 100 ? 10 : Math.ceil(Math.sqrt(of * 1.25)), rows = Math.ceil(of / cols);
    var gw = 640, gh = 600, cell = Math.min(gw / cols, gh / rows), r = cell * 0.34, gx = 1300 - cols * cell / 2, gy = 470 - rows * cell / 2;
    var svg = K.svgLayer(w), dots = [];
    for (var i = 0; i < of; i++) {
      var c = i % cols, rr = Math.floor(i / cols);
      dots.push(K.svg('circle', { cx: gx + c * cell + cell / 2, cy: gy + rr * cell + cell / 2, r: r, fill: mix(20) }, svg));
    }
    var big = P.text(w, '0', { cls: 'p-head p-num', x: 200, y: 400, align: 'left', size: 250 });
    big.innerHTML = '0<span style="font-size:.36em;color:var(--muted);letter-spacing:0"> / ' + num(of) + '</span>';
    var bnum = document.createTextNode('0'); big.replaceChild(bnum, big.firstChild);
    var lab = P.text(w, esc(o.label || 'personas'), { cls: 'p-body', x: 206, top: 560, align: 'left', size: 44, maxW: 640, lines: true });
    lab.style.color = mix(80);
    tl.from(dots, { scale: 0, transformOrigin: '50% 50%', duration: 0.5, ease: E.pop, stagger: { each: Math.min(0.012, 0.9 / of), from: 'start', grid: [rows, cols] } }, at + 0.2);
    var t1 = at + 1.1, d = 1.8, p = { v: 0 };
    tl.to(p, { v: n, duration: d, ease: 'power2.inOut', onUpdate: function () {
      var k = Math.round(p.v); bnum.nodeValue = String(k);
      for (var j = 0; j < of; j++) dots[j].setAttribute('fill', j < k ? 'var(--accent)' : mix(20));
    } }, t1);
    tl.call(function () { bnum.nodeValue = String(n); }, null, t1 + d);
    tl.from(big, { opacity: 0, y: 30, duration: 0.8, ease: E.out }, at + 0.4);
    P.fadeUp(tl, lab, at + 0.7);
    var lit = dots.slice(0, n);
    if (lit.length) tl.to(lit, { scale: 1.25, transformOrigin: '50% 50%', duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out', stagger: { each: 0.4 / Math.max(1, n) } }, t1 + d + 0.1);
    st.cam.to(tl, at + 0.2, { x: 1000, y: 470, zoom: 1.05, dur: st.dur - 0.2, ease: E.drift });
    return { scene: st.s, end: st.end, dots: dots, number: big, label: lab, cam: st.cam };
  };
  P.units.dur = 5;
  /*@end*/

  /*@piece ring*/
  /** Porcentaje en anillo: el arco se llena con una cabeza luminosa mientras cuenta; a la derecha, etiqueta y nota. */
  P.ring = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.ring.dur, bg: o.bg || 'dots', enter: o.enter, parent: o.parent }), w = st.w;
    var pct = Math.max(0, Math.min(100, Number(o.pct != null ? o.pct : 68))), cx = 640, cy = 470, R = 250;
    var svg = P.group(w);
    K.svg('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: mix(12), 'stroke-width': 40 }, svg);
    var arc = K.svg('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 40, 'stroke-linecap': 'round', transform: 'rotate(-90 ' + cx + ' ' + cy + ')' }, svg);
    var head = K.svg('circle', { cx: cx, cy: cy - R, r: 30, fill: 'var(--fg)' }, svg);
    var inner = K.svg('circle', { cx: cx, cy: cy, r: R - 60, fill: 'none', stroke: mix(18), 'stroke-width': 2, 'stroke-dasharray': '2 12' }, svg);
    var n = P.text(w, num(pct, decOf(o.pct)) + '%', { cls: 'p-head p-num', x: cx, y: cy, size: 150 });
    var lab = P.text(w, esc(o.label || 'de los encuestados'), { x: 1040, y: 420, align: 'left', size: 78, maxW: 760, maxH: 260, lines: true, min: 40 });
    var note = o.note ? P.text(w, esc(o.note), { cls: 'p-body', x: 1044, top: lab.offsetTop + lab.offsetHeight + 34, align: 'left', size: 38, maxW: 700, lines: true }) : null;
    if (note) { note.style.color = mix(70); P.place(note, { x: 1044, top: lab.offsetTop + lab.offsetHeight + 34, align: 'left' }); }
    var p = { k: 0 }, d = 1.8, t1 = at + 0.5, L = 2 * Math.PI * R;
    gsap.set(arc, { attr: { 'stroke-dasharray': L, 'stroke-dashoffset': L } });
    var paint = function () { var k = p.k * pct / 100, a = k * Math.PI * 2 - Math.PI / 2; arc.setAttribute('stroke-dashoffset', (L * (1 - k)).toFixed(2)); head.setAttribute('cx', (cx + Math.cos(a) * R).toFixed(2)); head.setAttribute('cy', (cy + Math.sin(a) * R).toFixed(2)); };
    A.addRender(paint);
    tl.from(svg, { scale: 0.7, opacity: 0, svgOrigin: cx + ' ' + cy, duration: 0.9, ease: E.out }, at);
    tl.to(p, { k: 1, duration: d, ease: E.inOut }, t1);
    tl.from(head, { attr: { r: 0 }, duration: 0.4, ease: E.pop }, t1);
    tl.to(inner, { rotation: 90, svgOrigin: cx + ' ' + cy, duration: st.dur, ease: 'none' }, at);
    P.count(tl, n, t1, { to: pct, decimals: decOf(o.pct), suffix: '%', dur: d, ease: E.inOut });
    var words = P.rise(tl, lab, at + 0.7, { stagger: 0.06 });
    if (note) P.fadeUp(tl, note, at + 1.4);
    P.pulse(tl, w, t1 + d, { x: cx, y: cy, r: R, to: 1.35, n: 2, sw: 2, dur: 1 });
    return { scene: st.s, end: st.end, arc: arc, number: n, label: lab, note: note, words: words, cam: st.cam };
  };
  P.ring.dur = 5;
  /*@end*/

  /*@piece trend*/
  /** Tendencia: la línea se traza con una cabeza luminosa que la cámara sigue; al final se aleja para ver toda la curva. */
  P.trend = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.trend.dur, bg: o.bg || 'grid', enter: o.enter, parent: o.parent, drift: false }), w = st.w;
    var pts = o.points || [{ x: '2000', v: 12 }, { x: '2005', v: 18 }, { x: '2010', v: 15 }, { x: '2015', v: 31 }, { x: '2020', v: 44 }, { x: '2024', v: 71 }];
    var vs = pts.map(function (p) { return Number(p.v) || 0; }), lo = Math.min(0, Math.min.apply(0, vs)), hi = Math.max.apply(0, vs) || 1;
    var x0 = 260, x1 = 1600, y0 = 210, y1 = 760;
    var xy = pts.map(function (p, i) { return [x0 + (x1 - x0) * i / Math.max(1, pts.length - 1), y1 - (y1 - y0) * ((Number(p.v) || 0) - lo) / (hi - lo)]; });
    var svg = K.svgLayer(w), d = P.smoothD(xy, 0.6);
    var base = K.svg('line', { x1: x0 - 40, y1: y1 + 2, x2: x1 + 80, y2: y1 + 2, stroke: mix(40), 'stroke-width': 2 }, svg);
    var area = K.svg('path', { d: d + 'L' + x1 + ',' + y1 + 'L' + x0 + ',' + y1 + 'Z', fill: mix(12, 'var(--accent)'), stroke: 'none' }, svg);
    var line = K.svg('path', { d: d, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 7, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    var glow = K.svg('circle', { cx: xy[0][0], cy: xy[0][1], r: 34, fill: mix(28, 'var(--accent)') }, svg);
    var head = K.svg('circle', { cx: xy[0][0], cy: xy[0][1], r: 13, fill: 'var(--fg)' }, svg);
    var L = line.getTotalLength(), marks = [];
    pts.forEach(function (p, i) {
      var lx = P.label(w, p.x, { x: xy[i][0], y: y1 + 48, size: 26 });
      var dt = K.svg('circle', { cx: xy[i][0], cy: xy[i][1], r: 8, fill: 'var(--bg)', stroke: 'var(--accent)', 'stroke-width': 4 }, svg);
      marks.push({ x: lx, dot: dt, at: i / Math.max(1, pts.length - 1) });
    });
    var badge = K.el('div', { cls: 'p-chip' }, w);
    badge.innerHTML = '<b class="p-num" style="font:700 46px/1 var(--font-title)">0</b>' + (o.unit ? '<span class="p-label" style="position:static">' + esc(o.unit) + '</span>' : '');
    var bnum = badge.querySelector('b');
    var p = { k: 0, pull: 0 }, t1 = at + 0.3, dd = Math.max(2.2, st.dur - 2.2);
    gsap.set(line, { attr: { 'stroke-dasharray': L, 'stroke-dashoffset': L } });
    var paint = function () {
      var q = line.getPointAtLength(L * p.k), z = K.lerp(1.45, 1, p.pull), cx = K.lerp(Math.min(Math.max(q.x, 640), 1280), W / 2, p.pull), cy = K.lerp(K.lerp(q.y, 485, 0.45), 485, p.pull);
      line.setAttribute('stroke-dashoffset', (L * (1 - p.k)).toFixed(2));
      head.setAttribute('cx', q.x.toFixed(1)); head.setAttribute('cy', q.y.toFixed(1)); glow.setAttribute('cx', q.x.toFixed(1)); glow.setAttribute('cy', q.y.toFixed(1));
      area.style.clipPath = 'inset(-2px ' + Math.max(0, x1 - q.x).toFixed(1) + 'px -2px -2px)';
      gsap.set(w, { x: W / 2 - cx * z, y: H / 2 - cy * z, scale: z, transformOrigin: '0 0' });
      var vi = Math.min(pts.length - 1, Math.max(0, p.k * (pts.length - 1))), i0 = Math.floor(vi), f = vi - i0, v = vs[i0] + ((vs[i0 + 1] != null ? vs[i0 + 1] : vs[i0]) - vs[i0]) * f;
      bnum.textContent = (o.prefix || '') + num(v, decOf(o.decimals != null ? '0.' + '0'.repeat(o.decimals) : pts[pts.length - 1].v)) + (o.suffix || '');
      badge.style.left = (q.x + 30).toFixed(0) + 'px'; badge.style.top = (q.y - 110).toFixed(0) + 'px';
      marks.forEach(function (m) { var on = p.k >= m.at - 0.001; m.x.style.opacity = on ? 1 : 0.25; m.dot.style.opacity = on ? 1 : 0; });
    };
    A.addRender(paint);
    tl.from(base, { attr: { x2: x0 - 40 }, duration: 0.8, ease: E.inOut }, at);
    tl.to(p, { k: 1, duration: dd, ease: 'power1.inOut' }, t1);
    tl.from(badge, { opacity: 0, scale: 0.8, duration: 0.5, ease: E.pop }, t1 + 0.2);
    tl.to(p, { pull: 1, duration: 1.4, ease: E.inOut }, t1 + dd - 0.2);
    var last = xy[xy.length - 1];
    P.pulse(tl, w, t1 + dd, { x: last[0], y: last[1], r: 20, to: 5 });
    tl.to(head, { attr: { r: 18 }, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out' }, t1 + dd);
    return { scene: st.s, end: st.end, line: line, badge: badge, cam: st.cam };
  };
  P.trend.dur = 6;
  /*@end*/
  /*@piece donut*/
  /** Partes de un todo: los segmentos de una dona se trazan uno tras otro, el centro cuenta el porcentaje destacado y una leyenda los nombra. */
  P.donut = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.donut.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var parts = (o.parts || [{ label: 'A', value: 50 }, { label: 'B', value: 30 }, { label: 'C', value: 20 }]).slice(0, 6);
    var total = parts.reduce(function (s, p) { return s + (Number(p.value) || 0); }, 0) || 1;
    var hi = o.highlight != null ? o.highlight : parts.reduce(function (b, p, i) { return Number(p.value) > Number(parts[b].value) ? i : b; }, 0);
    var cx = 640, cy = 470, R = 240, sw = 86, C = 2 * Math.PI * R, acc = 0, gap = 8;
    var g = P.group(w);
    K.svg('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: mix(5), 'stroke-width': sw }, g);
    var tones = [55, 36, 24, 16, 11, 8], k = 0;
    var segs = parts.map(function (p, i) {
      var f = (Number(p.value) || 0) / total, len = Math.max(0.1, C * f - gap), mid = (acc + C * f / 2) / C * Math.PI * 2 - Math.PI / 2;
      var sg = K.svg('g', {}, g);
      var c = K.svg('circle', { cx: cx, cy: cy, r: R, fill: 'none', stroke: i === hi ? 'var(--accent)' : mix(tones[k++ % tones.length]), 'stroke-width': sw, 'stroke-dasharray': '0 ' + C, 'stroke-dashoffset': -acc, transform: 'rotate(-90 ' + cx + ' ' + cy + ')' }, sg);
      var s0 = { g: sg, c: c, len: len, mid: mid, f: f };
      acc += C * f;
      return s0;
    });
    var pct = Math.round(segs[hi].f * 100);
    var n = P.text(w, pct + '%', { cls: 'p-head p-num', x: cx, y: cy - 22, size: 130 });
    var cl = P.label(w, parts[hi].label, { x: cx, y: cy + 62, color: 'var(--fg)', size: 26, maxW: 300 });
    var t0 = at + 0.35, each = Math.min(0.55, 2 / parts.length);
    tl.from(g, { scale: 0.9, opacity: 0, svgOrigin: cx + ' ' + cy, duration: 0.8, ease: E.out }, at);
    segs.forEach(function (s0, i) { tl.to(s0.c, { attr: { 'stroke-dasharray': s0.len + ' ' + C }, duration: each * 1.4, ease: E.inOut }, t0 + i * each); });
    var tEnd = t0 + parts.length * each + each * 0.4;
    P.count(tl, n, t0, { to: pct, suffix: '%', dur: tEnd - t0, ease: E.inOut });
    P.fadeUp(tl, cl, t0 + 0.4);
    var lx = 1060, rowH = Math.min(104, 560 / parts.length), ly = 470 - (parts.length - 1) * rowH / 2;
    var legend = parts.map(function (p, i) {
      var y = ly + i * rowH, on = i === hi;
      var sq = K.el('div', { cls: 'k-abs', css: { left: lx + 'px', top: (y - 14) + 'px', width: '28px', height: '28px', borderRadius: '8px', background: segs[i].c.getAttribute('stroke') } }, w);
      var lb = P.text(w, esc(p.label), { cls: 'p-head', x: lx + 54, y: y, align: 'left', size: 46, maxW: 520, maxH: 60, min: 24 });
      lb.style.color = on ? 'var(--fg)' : mix(75);
      var pv = P.label(w, Math.round(segs[i].f * 100) + '%', { x: 1680, y: y, align: 'right', size: 32, color: on ? 'var(--accent)' : 'var(--muted)' });
      tl.from([sq, lb, pv], { opacity: 0, x: -24, duration: 0.6, ease: E.out }, t0 + i * each + 0.1);
      return { sq: sq, label: lb, value: pv };
    });
    var sh = segs[hi];
    tl.to(sh.g, { x: Math.cos(sh.mid) * 22, y: Math.sin(sh.mid) * 22, duration: 0.7, ease: E.out }, tEnd + 0.2);
    segs.forEach(function (s0, i) { if (i !== hi) tl.to(s0.c, { opacity: 0.55, duration: 0.6 }, tEnd + 0.2); });
    tl.to(g, { rotation: 8, svgOrigin: cx + ' ' + cy, duration: st.dur, ease: 'none' }, at);
    return { scene: st.s, end: st.end, segments: segs, legend: legend, number: n, cam: st.cam };
  };
  P.donut.dur = 6;
  /*@end*/

  /*@piece ranking*/
  /** Ranking en cuenta regresiva: las filas entran del último al primero; el n.º 1 llega con el color de acento y la cámara se le acerca. */
  P.ranking = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.ranking.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var items = (o.items || ['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco']).slice(0, 6).map(function (x) { return typeof x === 'string' ? { label: x } : x; });
    var n = items.length, top = o.title ? 250 : 190, bottom = 820, gp = 18, rh = Math.min(112, (bottom - top - gp * (n - 1)) / n);
    var x = 300, rw = 1320;
    var title = o.title ? P.label(w, o.title, { x: x, y: 165, align: 'left', color: 'var(--accent)', size: 28 }) : null;
    var rows = items.map(function (it, i) {
      var y = top + i * (rh + gp), first = i === 0;
      var box = K.el('div', { cls: 'k-abs', css: { left: x + 'px', top: y + 'px', width: rw + 'px', height: rh + 'px', borderRadius: '18px', background: first ? 'var(--accent)' : mix(6), border: first ? 'none' : '1.5px solid ' + mix(10) } }, w);
      var rk = K.el('div', { cls: 'p-head p-num', css: { left: '34px', top: '50%', transform: 'translateY(-50%)', fontSize: Math.round(rh * 0.62) + 'px', color: first ? 'var(--bg)' : 'var(--muted)' }, text: String(i + 1) }, box);
      var lb = K.el('div', { cls: 'p-head', css: { left: Math.round(rh * 1.25) + 'px', top: '50%', transform: 'translateY(-50%)', fontSize: Math.round(rh * 0.42) + 'px', color: first ? 'var(--bg)' : 'var(--fg)', maxWidth: (rw - rh * 1.25 - 260) + 'px', overflow: 'hidden', textOverflow: 'ellipsis' }, text: it.label }, box);
      var vl = it.value != null ? K.el('div', { cls: 'p-label p-num', css: { right: '34px', top: '50%', transform: 'translateY(-50%)', fontSize: Math.round(rh * 0.3) + 'px', color: first ? 'var(--bg)' : 'var(--fg)', letterSpacing: '.04em' }, text: String(it.value) }, box) : null;
      return { y: y + rh / 2, box: box, rank: rk, label: lb, value: vl };
    });
    var t0 = at + 0.3, step = Math.min(0.42, (st.dur - 2.6) / n);
    for (var j = n - 1; j >= 0; j--) {
      var r = rows[j], tt = t0 + (n - 1 - j) * step;
      if (j === 0) {
        tt += 0.15;
        tl.from(r.box, { x: 120, opacity: 0, scale: 1.04, filter: 'blur(10px)', duration: 0.7, ease: E.arrive }, tt);
        K.shake(tl, st.cam.rig, tt + 0.32, { dur: 0.25, amp: 7 });
        rows.slice(1).forEach(function (q) { tl.to(q.box, { opacity: 0.42, duration: 0.6 }, tt + 0.5); });
        st.cam.to(tl, tt + 0.4, { x: x + rw / 2, y: (rows[0].y + rows[n - 1].y) / 2 - 40, zoom: 1.06, dur: 1.4, ease: E.inOut });
      } else tl.from(r.box, { x: 120, opacity: 0, filter: 'blur(10px)', duration: 0.7, ease: E.out }, tt);
    }
    if (title) P.fadeUp(tl, title, at + 0.15);
    return { scene: st.s, end: st.end, rows: rows, title: title, cam: st.cam };
  };
  P.ranking.dur = 6;
  /*@end*/

  /*@piece scale*/
  /** Escala real: un círculo pequeño, la cámara se aleja mientras el grande crece desde él (áreas proporcionales) y aparece «×N». */
  P.scale = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.scale.dur, bg: o.bg || 'dots', enter: o.enter, parent: o.parent }), w = st.w;
    var a = o.a || { label: 'A', value: 1 }, b = o.b || { label: 'B', value: 20 };
    var sm = Number(a.value) <= Number(b.value) ? a : b, bg = sm === a ? b : a;
    var ratio = (Number(bg.value) || 1) / Math.max(1e-9, Number(sm.value) || 1);
    var R = 300, r = Math.max(5, R * Math.sqrt(1 / ratio)), cx = 820, cy = 470, by = cy + R;
    var g = P.group(w);
    var big = K.svg('circle', { cx: cx, cy: by - r, r: r, fill: mix(9, 'var(--accent)'), stroke: 'var(--accent)', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke' }, g);
    var small = K.svg('circle', { cx: cx, cy: by - r, r: r, fill: 'var(--accent)' }, g);
    var z0 = K.clamp(150 / r, 1, 9);
    var sl = P.text(w, esc(sm.label), { cls: 'p-head', x: cx + r * 1.5, y: by - r, align: 'left', size: 54 / z0 });
    var bl = P.text(w, esc(bg.label), { cls: 'p-head', x: cx + R * 0.74 + 40, y: cy - R * 0.74, align: 'left', size: 64, maxW: 560, maxH: 140, lines: true, min: 30 });
    var rt = P.text(w, '×' + num(ratio, ratio < 10 ? 1 : 0), { cls: 'p-head p-num p-acc', x: 1360, y: 560, align: 'left', size: 200 });
    var rl = P.label(w, o.ratioLabel || 'veces más', { x: 1366, y: 680, align: 'left', size: 28 });
    var p = { r: r };
    st.cam.set(tl, at, { x: cx, y: by - r, zoom: z0 });
    tl.from(small, { attr: { r: r * 0.5 }, opacity: 0, duration: 0.5, ease: E.out }, at + 0.2);
    P.fadeUp(tl, sl, at + 0.45, { y: 8 / z0 });
    tl.to(sl, { opacity: 0, duration: 0.4 }, at + 1.3);
    var sl2 = P.label(w, sm.label, { x: cx + r + 22, y: by - r, align: 'left', size: 26, color: 'var(--fg)' });
    P.fadeUp(tl, sl2, at + 2.7);
    tl.to(p, { r: R, duration: 1.8, ease: E.inOut, onUpdate: function () { big.setAttribute('r', p.r.toFixed(2)); big.setAttribute('cy', (by - p.r).toFixed(2)); } }, at + 1.2);
    st.cam.to(tl, at + 1.1, { x: 960, y: 470, zoom: 1, dur: 1.9, ease: E.inOut });
    P.fadeUp(tl, bl, at + 2.5);
    tl.from(rt, { opacity: 0, x: -30, duration: 0.7, ease: E.out }, at + 2.7);
    K.counter(tl, rt, at + 2.7, { from: 1, to: ratio, dur: 1.1, decimals: ratio < 10 ? 1 : 0, prefix: '×', ease: 'power3.out' });
    P.fadeUp(tl, rl, at + 3);
    return { scene: st.s, end: st.end, big: big, small: small, ratio: rt, cam: st.cam };
  };
  P.scale.dur = 6;
  /*@end*/

  /*@piece timeline*/
  /** Línea de tiempo: la cámara viaja de un hito al siguiente sobre una línea que avanza; al final se aleja para ver toda la historia. */
  P.timeline = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.timeline.dur, bg: o.bg || 'grid', enter: o.enter, parent: o.parent, drift: false }), w = st.w;
    var ev = (o.events || [{ year: '1900', label: 'Inicio' }, { year: '1950', label: 'Cambio' }, { year: '2000', label: 'Hoy' }]).slice(0, 7);
    var n = ev.length, sp = 640, x0 = 420, ly = 560, xl = x0 + (n - 1) * sp;
    var base = K.el('div', { cls: 'k-abs', css: { left: (x0 - 420) + 'px', top: (ly - 1.5) + 'px', width: (xl - x0 + 840) + 'px', height: '3px', background: mix(22) } }, w);
    var prog = K.el('div', { cls: 'k-abs', css: { left: (x0 - 420) + 'px', top: (ly - 2.5) + 'px', width: (xl - x0 + 420) + 'px', height: '5px', background: 'var(--accent)', transformOrigin: '0 50%' } }, w);
    gsap.set(prog, { scaleX: 0 });
    var slot = (st.dur - 1.9) / n, t0 = at + 0.25, items = [];
    ev.forEach(function (e, i) {
      var x = x0 + i * sp;
      var dot = K.el('div', { cls: 'k-abs', css: { left: (x - 15) + 'px', top: (ly - 15) + 'px', width: '30px', height: '30px', borderRadius: '50%', background: 'var(--bg)', border: '4px solid ' + mix(40) } }, w);
      var yr = P.text(w, esc(e.year), { cls: 'p-head p-num', x: x, y: ly - 140, size: 150 });
      var lb = P.text(w, esc(e.label), { cls: 'p-body', x: x, top: ly + 54, size: 40, maxW: 500, lines: true });
      lb.style.textAlign = 'center'; lb.style.color = mix(82);
      var t = t0 + i * slot;
      st.cam.to(tl, t - (i ? 0.2 : 0), { x: x, y: 520, zoom: 1, dur: i ? 0.95 : 0.01, ease: E.inOut });
      tl.to(prog, { scaleX: (x - x0 + 420) / (xl - x0 + 420), duration: i ? 0.95 : 0.6, ease: E.inOut }, t - (i ? 0.2 : 0));
      tl.to(dot, { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', scale: 1.25, duration: 0.35, ease: E.out }, t + 0.45);
      P.pulse(tl, w, t + 0.45, { x: x, y: ly, r: 18, to: 4, n: 2 });
      P.rise(tl, yr, t + 0.4, { by: 'chars', stagger: 0.04 });
      P.fadeUp(tl, lb, t + 0.65);
      if (i) tl.to([items[i - 1].year, items[i - 1].label], { opacity: 0.35, duration: 0.5 }, t);
      items.push({ year: yr, label: lb, dot: dot, x: x });
    });
    var span = xl - x0 + 700, z = Math.min(1, 1680 / span), tp = st.end - 1.45;
    st.cam.to(tl, tp, { x: (x0 + xl) / 2, y: 540, zoom: z, dur: 1.15, ease: E.inOut });
    tl.to(items.map(function (it) { return [it.year, it.label]; }).flat(), { opacity: 1, duration: 0.6 }, tp + 0.3);
    return { scene: st.s, end: st.end, items: items, cam: st.cam };
  };
  P.timeline.dur = 8;
  /*@end*/

  /*@piece year*/
  /** Salto temporal: los dígitos del año giran como un odómetro con desenfoque de movimiento y estelas; el año final aterriza con un golpe. */
  P.year = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.year.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var a = String(o.from != null ? o.from : '1990'), b = String(o.to != null ? o.to : '2024'), L = Math.max(a.length, b.length);
    a = a.padStart(L, '0'); b = b.padStart(L, '0');
    var size = o.size || 380, h = size;
    var box = K.el('div', { cls: 'k-abs', css: { display: 'flex', gap: '0px', font: '700 ' + size + 'px/1 var(--font-title)', color: 'var(--fg)', letterSpacing: '-0.02em' } }, w);
    var cols = [];
    for (var i = 0; i < L; i++) {
      var win = K.el('div', { css: { position: 'relative', height: h + 'px', overflow: 'hidden' } }, box);
      var col = K.el('div', { cls: 'p-num', css: { position: 'relative' } }, win);
      var da = +a[i], db = +b[i], loops = a.slice(0, i + 1) === b.slice(0, i + 1) ? 0 : Math.max(1, i + 1 - (L - 3)), steps = loops * 10 + ((db - da + 10) % 10);
      if (!isNaN(da) && a[i] !== b[i] && steps === 0) steps = 10;
      var seq = []; for (var k = 0; k <= steps; k++) seq.push((da + k) % 10);
      if (isNaN(da) || isNaN(db)) seq = [a[i], b[i]];
      col.innerHTML = seq.map(function (d) { return '<div style="height:' + h + 'px">' + d + '</div>'; }).join('');
      cols.push({ col: col, n: seq.length });
    }
    P.place(box, { x: W / 2, y: 450 });
    var lines = K.el('div', { cls: 'k-layer' }, st.s), streaks = [];
    for (var s0 = 0; s0 < 18; s0++) streaks.push(K.el('div', { cls: 'k-abs', css: { left: '0', top: K.rand(120, 860) + 'px', width: K.rand(160, 520) + 'px', height: K.rand(2, 5) + 'px', background: s0 % 4 ? mix(30) : 'var(--accent)', opacity: 0 } }, lines));
    var t0 = at + 0.45, land = t0;
    cols.forEach(function (c, i) {
      var d = 1.3 + i * 0.22;
      if (c.n > 1) {
        tl.to(c.col, { y: -(c.n - 1) * h, duration: d, ease: 'power3.inOut' }, t0);
        tl.fromTo(c.col, { filter: 'blur(0px)' }, { keyframes: [{ filter: 'blur(9px)', duration: d * 0.45, ease: 'power2.in' }, { filter: 'blur(0px)', duration: d * 0.55, ease: 'power2.out' }], immediateRender: false }, t0);
      }
      land = Math.max(land, t0 + d);
    });
    streaks.forEach(function (e, i) { tl.fromTo(e, { x: W + 100, opacity: 0.9 }, { x: -700, opacity: 0, duration: K.rand(0.45, 0.8), ease: 'power1.in', immediateRender: false }, t0 + 0.2 + K.rand(0, land - t0 - 0.8)); });
    tl.from(box, { opacity: 0, y: 40, duration: 0.6, ease: E.out }, at + 0.05);
    tl.fromTo(box, { scale: 1.07 }, { scale: 1, duration: 0.45, ease: E.out, immediateRender: false }, land);
    K.flash(tl, land, { color: 'var(--fg)', max: 0.12, dur: 0.4, parent: st.s });
    K.shake(tl, st.cam.rig, land, { dur: 0.3, amp: 9 });
    var bar = K.el('div', { cls: 'k-abs', css: { left: (W / 2 - 110) + 'px', top: (450 + h / 2 + 20) + 'px', width: '220px', height: '6px', background: 'var(--accent)', transformOrigin: '50% 50%' } }, w);
    tl.from(bar, { scaleX: 0, duration: 0.7, ease: E.out }, land + 0.05);
    var lab = o.label ? P.label(w, o.label, { x: W / 2, y: 450 + h / 2 + 90, color: 'var(--fg)', size: 30 }) : null;
    if (lab) P.fadeUp(tl, lab, land + 0.15);
    return { scene: st.s, end: st.end, digits: box, label: lab, cam: st.cam };
  };
  P.year.dur = 4;
  /*@end*/

  /*@piece map*/
  /** Ubicación en el mapa: el mundo se dibuja, el país se ilumina, la cámara vuela hasta él, cae un pin y aparecen el nombre y las coordenadas. Requiere libs ["map"]. */
  P.map = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.map.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent, drift: false }), w = st.w;
    if (!window.d3 || !window.topojson || !window.ATRIL_WORLD) { A.errors.push('P.map necesita libs ["map"]'); return { scene: st.s, end: st.end }; }
    var land = topojson.feature(ATRIL_WORLD, ATRIL_WORLD.objects.land), countries = topojson.feature(ATRIL_WORLD, ATRIL_WORLD.objects.countries).features;
    var proj = d3.geoNaturalEarth1().fitExtent([[110, 100], [1810, 880]], { type: 'Sphere' }), path = d3.geoPath(proj);
    var svg = K.svgLayer(w);
    K.svg('path', { d: path(d3.geoGraticule10()), fill: 'none', stroke: mix(6), 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }, svg);
    var lf = K.svg('path', { d: path(land), fill: mix(10), stroke: 'none' }, svg);
    var ls = K.svg('path', { d: path(land), fill: 'none', stroke: mix(45), 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke' }, svg);
    var name = String(o.country || '').toLowerCase();
    var target = name ? countries.filter(function (f) { return String(f.properties && f.properties.name || '').toLowerCase() === name; })[0] : null;
    var tp = target ? K.svg('path', { d: path(target), fill: 'var(--accent)', stroke: 'var(--bg)', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke', opacity: 0 }, svg) : null;
    var pt = o.lon != null && o.lat != null ? proj([o.lon, o.lat]) : target ? path.centroid(target) : [W / 2, H / 2];
    var ll = proj.invert(pt), z = 3;
    if (target) { var bb = path.bounds(target), sz = Math.max(bb[1][0] - bb[0][0], (bb[1][1] - bb[0][1]) * 1.78); z = K.clamp(620 / Math.max(1, sz), 1.5, 9); }
    if (o.zoom) z = o.zoom;
    tl.fromTo(ls, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.5, ease: E.inOut }, at + 0.1);
    tl.from(lf, { opacity: 0, duration: 1, ease: 'power2.out' }, at + 0.6);
    if (tp) tl.to(tp, { opacity: 1, duration: 0.6, ease: 'power2.out' }, at + 1.4);
    st.cam.to(tl, at + 1.5, { x: pt[0], y: pt[1], zoom: z, dur: 1.7, ease: E.inOut });
    tl.to(lf, { fill: mix(7), duration: 1 }, at + 1.6);
    var tPin = at + 3.1;
    var pin = K.el('div', { cls: 'k-abs', css: { left: (W / 2 - 34) + 'px', top: (H / 2 - 92) + 'px', width: '68px', height: '92px' } }, st.s);
    pin.innerHTML = '<svg viewBox="0 0 68 92" width="68" height="92"><path d="M34 90C34 90 4 54 4 33a30 30 0 0 1 60 0c0 21-30 57-30 57z" fill="var(--accent)" stroke="var(--bg)" stroke-width="3"/><circle cx="34" cy="33" r="11" fill="var(--bg)"/></svg>';
    gsap.set(pin, { transformOrigin: '50% 100%' });
    tl.from(pin, { y: -70, opacity: 0, duration: 0.55, ease: E.arrive }, tPin);
    tl.fromTo(pin, { scaleY: 1 }, { keyframes: [{ scaleY: 0.86, scaleX: 1.08, duration: 0.09 }, { scaleY: 1, scaleX: 1, duration: 0.25, ease: E.out }], immediateRender: false }, tPin + 0.45);
    P.pulse(tl, st.s, tPin + 0.45, { x: W / 2, y: H / 2, r: 14, to: 6 });
    var card = K.el('div', { cls: 'p-chip', css: { left: (W / 2 + 70) + 'px', top: (H / 2 - 150) + 'px', flexDirection: 'column', alignItems: 'flex-start', gap: '8px' } }, st.s);
    var fmt = function (v, p, nn) { return Math.abs(v).toFixed(2) + '°' + (v >= 0 ? p : nn); };
    card.innerHTML = '<b style="font:700 54px/1 var(--font-title)">' + esc(o.label || (target && target.properties.name) || '') + '</b><span class="p-label" style="position:static;color:var(--accent)">' + fmt(ll[1], 'N', 'S') + '  ' + fmt(ll[0], 'E', 'W') + '</span>';
    tl.from(card, { opacity: 0, x: -24, filter: 'blur(8px)', duration: 0.6, ease: E.out }, tPin + 0.5);
    var co = card.querySelector('span');
    tl.fromTo(co, { opacity: 1 }, { duration: 0.9, scrambleText: { text: co.textContent, chars: '0123456789°.', speed: 0.6 }, ease: 'none', immediateRender: false }, tPin + 0.6);
    return { scene: st.s, end: st.end, pin: pin, card: card, cam: st.cam, projection: proj };
  };
  P.map.dur = 6;
  /*@end*/

  /*@piece process*/
  /** Proceso en pasos: una curva une los pasos y un pulso de luz la recorre; cada paso se enciende al llegar el pulso, con su ícono y su nombre. */
  P.process = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.process.dur, bg: o.bg || 'dots', enter: o.enter, parent: o.parent }), w = st.w;
    var steps = (o.steps || [{ label: 'Uno' }, { label: 'Dos' }, { label: 'Tres' }]).slice(0, 5).map(function (x) { return typeof x === 'string' ? { label: x } : x; });
    var n = steps.length, xa = n > 3 ? 280 : 420, xb = W - xa, pts = steps.map(function (s0, i) { return [xa + (xb - xa) * i / Math.max(1, n - 1), 420 + (i % 2 ? 70 : -70)]; });
    var full = [[pts[0][0] - 260, pts[0][1] + 40]].concat(pts, [[pts[n - 1][0] + 260, pts[n - 1][1] + (n % 2 ? -40 : 40)]]);
    var svg = K.svgLayer(w), d = P.smoothD(full, 0.7);
    var track = K.svg('path', { d: d, fill: 'none', stroke: mix(18), 'stroke-width': 3, 'stroke-dasharray': '2 12', 'stroke-linecap': 'round' }, svg);
    var lit = K.svg('path', { d: d, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 4, 'stroke-linecap': 'round' }, svg);
    var glow = K.svg('circle', { r: 26, fill: mix(25, 'var(--accent)') }, svg), head = K.svg('circle', { r: 10, fill: 'var(--fg)' }, svg);
    var Lf = lit.getTotalLength();
    var lenAt = function (x) { var lo = 0, hi = Lf; for (var k = 0; k < 24; k++) { var m = (lo + hi) / 2; if (lit.getPointAtLength(m).x < x) lo = m; else hi = m; } return lo / Lf; };
    var p = { k: 0 }, t0 = at + 0.6, D = Math.max(2.4, st.dur - 2.2);
    gsap.set(lit, { attr: { 'stroke-dasharray': Lf, 'stroke-dashoffset': Lf } });
    A.addRender(function () { var q = lit.getPointAtLength(Lf * p.k); lit.setAttribute('stroke-dashoffset', (Lf * (1 - p.k)).toFixed(1)); head.setAttribute('cx', q.x); head.setAttribute('cy', q.y); glow.setAttribute('cx', q.x); glow.setAttribute('cy', q.y); });
    tl.from(track, { drawSVG: '0%', duration: 1.1, ease: E.inOut }, at);
    tl.to(p, { k: 1, duration: D, ease: 'none' }, t0);
    tl.from([head, glow], { opacity: 0, duration: 0.3 }, t0);
    var nodes = steps.map(function (s0, i) {
      var x = pts[i][0], y = pts[i][1], k = lenAt(x), t = t0 + D * k;
      var ring = K.el('div', { cls: 'k-abs', css: { left: (x - 84) + 'px', top: (y - 84) + 'px', width: '168px', height: '168px', borderRadius: '50%', background: 'var(--bg)', border: '3px solid ' + mix(28) } }, w);
      var gl = P.glyph(w, s0.icon, { x: x, y: y, size: 80, color: mix(55), text: s0.icon ? null : String(i + 1).padStart(2, '0'), i: i });
      var lb = P.text(w, esc(s0.label), { cls: 'p-head', x: x, top: y + 116, size: 52, maxW: n > 3 ? 340 : 420, lines: true });
      lb.style.textAlign = 'center';
      tl.from(ring, { scale: 0.85, opacity: 0, duration: 0.6, ease: E.out }, at + 0.2 + i * 0.08);
      tl.from(gl, { opacity: 0, duration: 0.5 }, at + 0.3 + i * 0.08);
      tl.to(ring, { borderColor: 'var(--accent)', backgroundColor: mix(10, 'var(--accent)', 'var(--bg)'), scale: 1.08, duration: 0.35, ease: E.out }, t);
      tl.to(ring, { scale: 1, duration: 0.5, ease: E.out }, t + 0.35);
      tl.to(gl, { color: 'var(--accent)', duration: 0.3 }, t);
      P.pulse(tl, w, t, { x: x, y: y, r: 84, to: 1.7, n: 2, sw: 2, dur: 0.9 });
      P.rise(tl, lb, t + 0.05, { stagger: 0.05 });
      return { ring: ring, glyph: gl, label: lb };
    });
    st.cam.to(tl, at, { x: 860, y: 480, zoom: 1.05, dur: 0.01 });
    st.cam.to(tl, t0, { x: 1060, y: 480, zoom: 1.05, dur: D, ease: E.drift });
    st.cam.to(tl, st.end - 1.1, { x: W / 2, y: 500, zoom: 1, dur: 1, ease: E.inOut });
    return { scene: st.s, end: st.end, nodes: nodes, cam: st.cam };
  };
  P.process.dur = 7;
  /*@end*/

  /*@piece cause*/
  /** Causa y efecto: cada causa empuja a la siguiente por una flecha que se dibuja; el efecto recibe el golpe. La cámara sigue la cadena. */
  P.cause = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.cause.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var ch = (o.chain || [{ label: 'Causa' }, { label: 'Efecto' }]).slice(0, 3).map(function (x) { return typeof x === 'string' ? { label: x } : x; });
    var n = ch.length, xs = n === 3 ? [400, 960, 1520] : [600, 1320], y = 420, S = 230;
    var t = at + 0.25, step = Math.min(1.25, (st.dur - 1.8) / n);
    var nodes = ch.map(function (c, i) {
      var x = xs[i], last = i === n - 1;
      var card = K.el('div', { cls: 'p-card', css: { left: (x - S / 2) + 'px', top: (y - S / 2) + 'px', width: S + 'px', height: S + 'px', borderRadius: '48px', background: last ? 'var(--accent)' : null, borderColor: last ? 'transparent' : null } }, w);
      var gl = P.glyph(w, c.icon, { x: x, y: y, size: 112, color: last ? 'var(--bg)' : 'var(--accent)', i: i });
      var lb = P.text(w, esc(c.label), { cls: 'p-head', x: x, top: y + S / 2 + 40, size: 50, maxW: n === 3 ? 420 : 560, lines: true });
      lb.style.textAlign = 'center';
      var ti = t + i * step;
      if (i === 0) tl.from([card, gl], { scale: 0.9, opacity: 0, filter: 'blur(10px)', duration: 0.7, ease: E.out }, ti);
      else {
        var ar = K.arrow(w, { from: [xs[i - 1] + S / 2 + 26, y], to: [x - S / 2 - 30, y], width: 8, head: 22 });
        ar.draw(tl, ti - 0.55, 0.5); ar.flow(tl, ti - 0.1, 0.8);
        tl.from([card, gl], { x: -60, opacity: 0, duration: 0.25, ease: 'power3.in' }, ti - 0.1);
        tl.fromTo(card, { scale: 1.12 }, { scale: 1, duration: 0.5, ease: E.out, immediateRender: false }, ti + 0.15);
        K.shake(tl, card, ti + 0.15, { dur: 0.25, amp: 8 });
        P.pulse(tl, w, ti + 0.15, { x: x, y: y, r: S / 2, to: 1.7, n: 2, sw: 2, dur: 0.8 });
        if (last) K.shake(tl, st.cam.rig, ti + 0.15, { dur: 0.3, amp: 6 });
      }
      P.rise(tl, lb, ti + 0.2, { stagger: 0.05 });
      return { card: card, glyph: gl, label: lb };
    });
    st.cam.set(tl, at, { x: xs[0] + 120, y: y + 60, zoom: 1.18 });
    nodes.forEach(function (nd, i) { if (i) st.cam.to(tl, t + i * step - 0.6, { x: xs[i] - (i === n - 1 ? 120 : 0), y: y + 60, zoom: 1.18, dur: 0.9, ease: E.inOut }); });
    st.cam.to(tl, t + n * step - 0.2, { x: W / 2, y: 500, zoom: 1, dur: 1.1, ease: E.inOut });
    return { scene: st.s, end: st.end, nodes: nodes, cam: st.cam };
  };
  P.cause.dur = 6;
  /*@end*/

  /*@piece versus*/
  /** Versus: dos paneles entran desde los lados y se encuentran en una diagonal; el «VS» cae con un golpe y aparecen los datos de cada lado. */
  P.versus = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.versus.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var a = o.a || { label: 'A' }, b = o.b || { label: 'B' };
    var pa = { l: 'polygon(0 0, 54% 0, 46% 100%, 0 100%)', r: 'polygon(54% 0, 100% 0, 100% 100%, 46% 100%)' };
    var left = K.el('div', { cls: 'k-layer', css: { background: mix(7, 'var(--fg)', 'var(--bg)'), clipPath: pa.l } }, w);
    var right = K.el('div', { cls: 'k-layer', css: { background: mix(16, 'var(--accent)', 'var(--bg)'), clipPath: pa.r } }, w);
    var div = K.svgLayer(w), line = K.svg('line', { x1: 1037, y1: -20, x2: 883, y2: 1100, stroke: 'var(--accent)', 'stroke-width': 6 }, div);
    var side = function (s0, x, i, ton) {
      var gl = P.glyph(w, s0.icon, { x: x, y: 360, size: 170, color: ton, i: i });
      var lb = P.text(w, esc(s0.label), { cls: 'p-head', x: x, y: 570, size: 88, maxW: 640, maxH: 200, lines: true, min: 40 }); lb.style.textAlign = 'center';
      var vl = s0.value != null ? P.label(w, String(s0.value), { x: x, y: 690, size: 40, color: ton }) : null;
      return { glyph: gl, label: lb, value: vl };
    };
    var A1 = side(a, 470, 0, 'var(--fg)'), B1 = side(b, 1450, 1, 'var(--accent)');
    var badge = K.el('div', { cls: 'k-abs', css: { left: (W / 2 - 86) + 'px', top: (470 - 86) + 'px', width: '172px', height: '172px', borderRadius: '50%', background: 'var(--bg)', border: '4px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 70px/1 var(--font-title)', color: 'var(--fg)' }, text: 'VS' }, w);
    tl.from(left, { xPercent: -100, duration: 0.9, ease: E.inOut }, at + 0.05);
    tl.from(right, { xPercent: 100, duration: 0.9, ease: E.inOut }, at + 0.05);
    tl.from(line, { drawSVG: '50% 50%', duration: 0.6, ease: E.out }, at + 0.85);
    var tb = at + 1.05;
    tl.fromTo(badge, { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.32, ease: 'power4.in' }, tb);
    K.shake(tl, st.cam.rig, tb + 0.32, { dur: 0.3, amp: 10 });
    K.flash(tl, tb + 0.3, { color: 'var(--fg)', max: 0.14, dur: 0.35, parent: st.s });
    [A1, B1].forEach(function (S0, i) {
      var t2 = tb + 0.35 + i * 0.12;
      P.popGlyph(tl, S0.glyph, t2);
      P.rise(tl, S0.label, t2 + 0.15, { stagger: 0.06 });
      if (S0.value) P.fadeUp(tl, S0.value, t2 + 0.4);
    });
    if (o.winner === 'a' || o.winner === 'b') {
      var tw = st.end - 1.6, win = o.winner === 'a';
      tl.to(left, { clipPath: win ? 'polygon(0 0, 62% 0, 54% 100%, 0 100%)' : 'polygon(0 0, 46% 0, 38% 100%, 0 100%)', duration: 0.9, ease: E.inOut }, tw);
      tl.to(right, { clipPath: win ? 'polygon(62% 0, 100% 0, 100% 100%, 54% 100%)' : 'polygon(46% 0, 100% 0, 100% 100%, 38% 100%)', duration: 0.9, ease: E.inOut }, tw);
      tl.to(line, { attr: win ? { x1: 1190, x2: 1036 } : { x1: 883, x2: 729 }, duration: 0.9, ease: E.inOut }, tw);
      tl.to(badge, { x: win ? 153 : -153, duration: 0.9, ease: E.inOut }, tw);
      var lose = win ? B1 : A1;
      tl.to([lose.glyph, lose.label, lose.value].filter(Boolean), { opacity: 0.35, duration: 0.6 }, tw + 0.2);
    }
    return { scene: st.s, end: st.end, a: A1, b: B1, badge: badge, cam: st.cam };
  };
  P.versus.dur = 5;
  /*@end*/

  /*@piece network*/
  /** Red de actores: el centro aparece, las conexiones se trazan hacia cada actor y paquetes de luz corren por ellas; al final se enfoca una relación. */
  P.network = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.network.dur, bg: o.bg || 'dots', enter: o.enter, parent: o.parent }), w = st.w;
    var c0 = o.center || { label: 'Centro' }, nodes = (o.nodes || [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }]).slice(0, 8).map(function (x) { return typeof x === 'string' ? { label: x } : x; });
    var n = nodes.length, cx = 960, cy = 470, rx = 600, ry = 245;
    var svg = K.svgLayer(w), links = [], packets = [];
    var pos = nodes.map(function (nd, i) { var a = -Math.PI / 2 + (i + (n % 2 ? 0 : 0.5)) * 2 * Math.PI / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
    pos.forEach(function (p0) { links.push(K.svg('line', { x1: cx, y1: cy, x2: p0[0], y2: p0[1], stroke: mix(26), 'stroke-width': 2.5 }, svg)); });
    pos.forEach(function (p0, i) { var pk = K.svg('circle', { r: 6, fill: 'var(--accent)', opacity: 0 }, svg); packets.push({ el: pk, p0: p0, ph: K.rand(0, 1), on: { a: 0 } }); });
    A.addRender(function (t) { packets.forEach(function (q, i) { var f = (t * 0.55 + q.ph) % 1, out = i % 2 === 0; var k = out ? f : 1 - f; q.el.setAttribute('cx', (cx + (q.p0[0] - cx) * k).toFixed(1)); q.el.setAttribute('cy', (cy + (q.p0[1] - cy) * k).toFixed(1)); q.el.setAttribute('opacity', (q.on.a * Math.sin(Math.PI * f)).toFixed(2)); }); });
    var core = K.el('div', { cls: 'k-abs', css: { left: (cx - 100) + 'px', top: (cy - 100) + 'px', width: '200px', height: '200px', borderRadius: '50%', background: 'var(--accent)' } }, w);
    var cg = P.glyph(w, c0.icon, { x: cx, y: cy, size: 96, color: 'var(--bg)', text: c0.icon ? null : '' });
    if (!c0.icon) cg.innerHTML = '';
    var cl = P.text(w, esc(c0.label), { cls: 'p-head', x: cx, y: cy + 138, size: 44 });
    cl.style.background = 'var(--bg)'; cl.style.padding = '6px 16px'; cl.style.borderRadius = '10px'; P.place(cl, { x: cx, y: cy + 138 });
    var sat = nodes.map(function (nd, i) {
      var p0 = pos[i];
      var ring = K.el('div', { cls: 'k-abs', css: { left: (p0[0] - 62) + 'px', top: (p0[1] - 62) + 'px', width: '124px', height: '124px', borderRadius: '50%', background: 'var(--bg)', border: '3px solid ' + mix(30) } }, w);
      var gl = P.glyph(w, nd.icon, { x: p0[0], y: p0[1], size: 60, color: 'var(--fg)', i: i });
      var below = p0[1] >= cy - 10;
      var lb = P.text(w, esc(nd.label), { cls: 'p-head', x: p0[0], y: p0[1] + (below ? 104 : -104), size: 36, maxW: 340, maxH: 50, min: 22 });
      return { ring: ring, glyph: gl, label: lb };
    });
    tl.from(core, { scale: 0.8, opacity: 0, filter: 'blur(12px)', duration: 0.7, ease: E.out }, at + 0.1);
    if (c0.icon) P.popGlyph(tl, cg, at + 0.3);
    P.fadeUp(tl, cl, at + 0.4);
    P.pulse(tl, w, at + 0.35, { x: cx, y: cy, r: 100, to: 2.4, n: 2, sw: 2 });
    links.forEach(function (ln, i) {
      var t = at + 0.6 + i * 0.12;
      tl.from(ln, { drawSVG: '0%', duration: 0.6, ease: E.inOut }, t);
      tl.from([sat[i].ring, sat[i].glyph], { scale: 0.85, opacity: 0, duration: 0.5, ease: E.out }, t + 0.45);
      tl.from(sat[i].label, { opacity: 0, y: 12, duration: 0.5, ease: E.out }, t + 0.55);
      tl.to(packets[i].on, { a: 1, duration: 0.4 }, t + 0.7);
    });
    var f = o.focus != null ? o.focus : null;
    if (f != null && sat[f]) {
      var tf = st.end - 1.9;
      links.forEach(function (ln, i) { tl.to(ln, i === f ? { stroke: 'var(--accent)', attr: { 'stroke-width': 6 }, duration: 0.5 } : { opacity: 0.25, duration: 0.5 }, tf); });
      sat.forEach(function (s0, i) { if (i !== f) tl.to([s0.ring, s0.glyph, s0.label], { opacity: 0.3, duration: 0.5 }, tf); });
      tl.to(sat[f].ring, { borderColor: 'var(--accent)', scale: 1.12, duration: 0.5, ease: E.out }, tf);
      st.cam.to(tl, tf, { x: cx + (pos[f][0] - cx) * 0.3, y: cy + (pos[f][1] - cy) * 0.25, zoom: 1.1, dur: 1.4, ease: E.inOut });
    }
    return { scene: st.s, end: st.end, center: core, nodes: sat, links: links, cam: st.cam };
  };
  P.network.dur = 6;
  /*@end*/
  /* =====================================================================
     TEXTO Y EVIDENCIA
     ===================================================================== */

  /** Subrayado de acento que se dibuja bajo una frase (sigue los saltos de línea). */
  P.underline = function (el, phrase) {
    if (!phrase) return null;
    var html = el.innerHTML, i = html.toLowerCase().indexOf(String(phrase).toLowerCase());
    if (i < 0) return null;
    el.innerHTML = html.slice(0, i) + '<span class="p-ul" style="background:linear-gradient(var(--accent),var(--accent)) 0 94%/0% .09em no-repeat;-webkit-box-decoration-break:clone;box-decoration-break:clone">' + html.slice(i, i + phrase.length) + '</span>' + html.slice(i + phrase.length);
    return el.querySelector('.p-ul');
  };

  /*@piece quote*/
  /** Cita: unas comillas enormes se materializan, el texto aparece palabra por palabra, una frase clave se subraya y entra la atribución. */
  P.quote = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.quote.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var qm = K.el('div', { css: { position: 'absolute', left: '170px', top: '120px', font: '700 420px/1 var(--font-body)', color: 'var(--accent)' }, text: '“' }, w);
    var t = P.text(w, esc(o.text || 'Una cita breve y exacta.'), { cls: 'p-body', x: 300, y: 460, align: 'left', size: o.size || 76, maxW: 1360, maxH: 440, lines: true, min: 36 });
    t.style.lineHeight = '1.22';
    var ul = P.underline(t, o.highlight);
    P.place(t, { x: 300, y: 460, align: 'left' });
    var bottom = t.offsetTop + t.offsetHeight;
    var rule = K.el('div', { cls: 'k-abs', css: { left: '304px', top: (bottom + 58) + 'px', width: '64px', height: '4px', background: 'var(--accent)', transformOrigin: '0 50%' } }, w);
    var au = o.author ? P.label(w, o.author, { x: 392, y: bottom + 60, align: 'left', color: 'var(--fg)', size: 28 }) : null;
    var ro = o.role ? P.text(w, esc(o.role), { cls: 'p-body', x: 392, top: bottom + 86, align: 'left', size: 30 }) : null;
    if (ro) ro.style.color = mix(65);
    tl.from(qm, { opacity: 0, scale: 0.9, filter: 'blur(14px)', transformOrigin: '30% 40%', duration: 0.9, ease: E.out }, at + 0.1);
    tl.to(qm, { y: -16, duration: st.dur, ease: E.drift }, at);
    var sp = new SplitText(t, { type: 'words', wordsClass: 'pw' });
    tl.from(sp.words, { opacity: 0, y: 14, filter: 'blur(8px)', duration: 0.7, stagger: Math.min(0.06, 1.8 / sp.words.length), ease: E.out }, at + 0.4);
    var tw = at + 0.4 + Math.min(0.06, 1.8 / sp.words.length) * sp.words.length + 0.3;
    if (ul) tl.to(ul, { backgroundSize: '100% .09em', duration: 0.8, ease: E.inOut }, tw);
    tl.from(rule, { scaleX: 0, duration: 0.6, ease: E.out }, tw + 0.2);
    if (au) P.fadeUp(tl, au, tw + 0.35, { y: 10 });
    if (ro) P.fadeUp(tl, ro, tw + 0.45, { y: 10 });
    st.cam.to(tl, at, { x: 940, y: 520, zoom: 1.03, dur: st.dur, ease: E.drift });
    return { scene: st.s, end: st.end, text: t, underline: ul, author: au, cam: st.cam };
  };
  P.quote.dur = 6;
  /*@end*/

  /*@piece definition*/
  /** Definición de diccionario: la palabra se escribe con un cursor, debajo la pronunciación y la categoría; una línea se traza y la definición aparece con su palabra clave resaltada. */
  P.definition = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.definition.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var word = String(o.word || 'palabra');
    var wd = P.text(w, esc(word), { cls: 'p-head', x: 200, y: 330, align: 'left', size: 210, maxW: 1400, maxH: 240, min: 80 });
    var full = wd.textContent; wd.textContent = '';
    var caret = K.el('div', { cls: 'k-abs', css: { width: '10px', height: (parseFloat(wd.style.fontSize) || 210) * 0.8 + 'px', background: 'var(--accent)' } }, w);
    var meta = P.label(w, [o.phonetic, o.kind].filter(Boolean).join('   ·   ') || ' ', { x: 206, y: 480, align: 'left', size: 30 });
    meta.style.textTransform = 'none'; meta.style.letterSpacing = '.04em';
    var rule = K.el('div', { cls: 'k-abs', css: { left: '200px', top: '540px', width: '1520px', height: '2px', background: mix(25), transformOrigin: '0 50%' } }, w);
    var nb = P.label(w, '1.', { x: 200, y: 618, align: 'left', color: 'var(--accent)', size: 34 });
    var df = P.text(w, esc(o.def || 'Definición breve.'), { cls: 'p-body', x: 270, top: 590, align: 'left', size: 52, maxW: 1400, maxH: 230, lines: true, min: 30 });
    df.style.lineHeight = '1.3';
    var mk = P.markWord(df, o.highlight);
    P.place(df, { x: 270, top: 590, align: 'left' });
    var p = { k: 0 }, tT = at + 0.3, dT = Math.min(1.4, 0.09 * full.length + 0.3);
    var caretX = function () { return wd.offsetLeft + wd.offsetWidth + 14; };
    A.addRender(function (t) {
      var n = Math.round(p.k * full.length); if (wd.textContent.length !== n) wd.textContent = full.slice(0, n);
      caret.style.left = caretX() + 'px'; caret.style.top = (wd.offsetTop + wd.offsetHeight * 0.12) + 'px';
      caret.style.opacity = t < tT + dT + 0.6 ? (Math.floor(t * 2.6) % 2 === 0 || (t > tT && t < tT + dT) ? 1 : 0) : 0;
    });
    tl.to(p, { k: 1, duration: dT, ease: 'none' }, tT);
    P.fadeUp(tl, meta, tT + dT * 0.6, { y: 10 });
    tl.from(rule, { scaleX: 0, duration: 0.9, ease: E.inOut }, tT + dT * 0.5);
    tl.from(nb, { opacity: 0, x: -14, duration: 0.5, ease: E.out }, tT + dT + 0.1);
    var sp = new SplitText(df, { type: 'words', wordsClass: 'pw' });
    tl.from(sp.words, { opacity: 0, filter: 'blur(8px)', y: 10, duration: 0.6, stagger: Math.min(0.05, 1.4 / sp.words.length), ease: E.out }, tT + dT + 0.2);
    P.sweepMark(tl, mk, tT + dT + 0.3 + Math.min(0.05, 1.4 / sp.words.length) * sp.words.length + 0.2);
    return { scene: st.s, end: st.end, word: wd, def: df, cam: st.cam };
  };
  P.definition.dur = 6;
  /*@end*/

  /*@piece document*/
  /** Documento o evidencia: una hoja entra inclinada y se asienta; una barra de censura se retira de la frase clave, un resaltador la marca, la cámara se acerca y cae un sello. */
  P.document = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.document.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var px = 470, py = 120, pw = 980;
    var sheet = K.el('div', { cls: 'k-abs', css: { left: px + 'px', top: py + 'px', width: pw + 'px', height: '1180px', background: 'var(--paper)', color: 'var(--ink)', borderRadius: '6px', boxShadow: '0 40px 90px rgba(0,0,0,.45), 0 2px 0 rgba(0,0,0,.08)', padding: '70px 80px', boxSizing: 'border-box' } }, w);
    sheet.innerHTML = '<div style="font:500 22px/1 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;opacity:.6">' + esc(o.kicker || 'Documento') + '</div>' +
      '<div style="font:700 50px/1.1 var(--font-body);margin:26px 0 10px">' + esc(o.title || 'Informe') + '</div>' +
      '<div style="font:500 22px/1 var(--font-mono);opacity:.55">' + esc(o.date || '') + '</div><div style="height:2px;background:currentColor;opacity:.2;margin:34px 0 30px"></div>';
    var widths = [96, 88, 92, 70, 0, 94, 82, 90, 64, 86, 78];
    var red = [];
    var hl = null, hlWrap = null;
    widths.forEach(function (wd, i) {
      if (wd === 0) {
        hlWrap = K.el('div', { css: { position: 'relative', margin: '14px 0 22px', font: '600 34px/1.35 var(--font-body)' } }, sheet);
        hl = K.el('span', { css: { position: 'relative', zIndex: 1 }, text: o.highlight || 'La frase clave del documento.' }, hlWrap);
        return;
      }
      var bar = K.el('div', { css: { height: '16px', width: wd + '%', borderRadius: '4px', background: 'currentColor', opacity: (i === 2 || i === 7) ? 0.92 : 0.12, margin: '0 0 22px' } }, sheet);
      if (i === 2 || i === 7) red.push(bar);
    });
    var cover = K.el('div', { css: { position: 'absolute', inset: '-4px -10px', background: 'var(--ink)', borderRadius: '4px', zIndex: 2, transformOrigin: '100% 50%' } }, hlWrap);
    var marker = K.el('div', { css: { position: 'absolute', left: '-8px', right: '-8px', top: '6px', bottom: '2px', background: mix(70, 'var(--accent)'), zIndex: 0, transformOrigin: '0 50%', transform: 'scaleX(0)' } }, hlWrap);
    tl.from(sheet, { y: 520, rotation: -7, rotationX: 22, transformPerspective: 1800, opacity: 0, duration: 1.2, ease: E.out }, at + 0.05);
    tl.to(sheet, { rotation: -1.5, duration: st.dur, ease: E.drift }, at + 0.05);
    var tr = at + 1.5;
    tl.to(cover, { scaleX: 0, duration: 0.6, ease: E.inOut }, tr);
    tl.to(marker, { scaleX: 1, duration: 0.6, ease: E.inOut }, tr + 0.55);
    var hy = py + hlWrap.offsetTop + hlWrap.offsetHeight / 2;
    st.cam.to(tl, tr - 0.2, { x: px + pw / 2, y: hy, zoom: 1.45, dur: 1.3, ease: E.inOut });
    var stamp = null;
    if (o.stamp) {
      stamp = K.el('div', { cls: 'k-abs', css: { left: (px + pw - 560) + 'px', top: (hy + 70) + 'px', padding: '14px 30px', border: '7px solid var(--accent)', borderRadius: '14px', color: 'var(--accent)', font: '700 76px/1 var(--font-title)', letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }, text: o.stamp }, w);
      K.slam(tl, stamp, tr + 1.5, { rot: -9, from: 2.2, shakeEl: st.cam.rig, amp: 8 });
    }
    return { scene: st.s, end: st.end, sheet: sheet, highlight: hl, stamp: stamp, cam: st.cam };
  };
  P.document.dur = 6;
  /*@end*/

  /*@piece checklist*/
  /** Lista que se marca: las filas entran y cada casilla se llena y se tilda (o se tacha) una tras otra; la última queda resaltada. */
  P.checklist = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.checklist.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var items = (o.items || ['Uno', 'Dos', 'Tres']).slice(0, 6), n = items.length, cross = o.mode === 'cross';
    var gap = Math.min(140, 600 / n), y0 = (o.title ? 500 : 470) - (n - 1) * gap / 2, x = 420;
    var title = o.title ? P.label(w, o.title, { x: x, y: y0 - gap * 0.9, align: 'left', color: 'var(--accent)', size: 28 }) : null;
    var rows = items.map(function (txt, i) {
      var y = y0 + i * gap;
      var box = K.el('div', { cls: 'k-abs', css: { left: x + 'px', top: (y - 34) + 'px', width: '68px', height: '68px', borderRadius: '16px', border: '3px solid ' + mix(35), boxSizing: 'border-box' } }, w);
      var sv = K.svgLayer(w), mk = cross ? K.svg('path', { d: 'M' + (x + 20) + ',' + (y - 14) + 'L' + (x + 48) + ',' + (y + 14) + 'M' + (x + 48) + ',' + (y - 14) + 'L' + (x + 20) + ',' + (y + 14), fill: 'none', stroke: 'var(--bg)', 'stroke-width': 8, 'stroke-linecap': 'round' }, sv)
        : K.svg('path', { d: 'M' + (x + 16) + ',' + (y + 1) + 'L' + (x + 29) + ',' + (y + 14) + 'L' + (x + 53) + ',' + (y - 13), fill: 'none', stroke: 'var(--bg)', 'stroke-width': 8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, sv);
      var lb = P.text(w, esc(txt), { cls: 'p-head', x: x + 112, y: y, align: 'left', size: 64, maxW: 1200, maxH: 80, min: 28 });
      tl.from(box, { opacity: 0, scale: 0.9, duration: 0.5, ease: E.out }, at + 0.2 + i * 0.1);
      tl.from(lb, { opacity: 0, x: -20, duration: 0.6, ease: E.out }, at + 0.25 + i * 0.1);
      gsap.set(mk, { drawSVG: '0%' });
      return { box: box, mark: mk, label: lb };
    });
    var t0 = at + 0.5 + n * 0.1, step = Math.min(0.6, (st.dur - 1.6 - (t0 - at)) / n);
    rows.forEach(function (r, i) {
      var t = t0 + i * step;
      tl.to(r.box, { backgroundColor: 'var(--accent)', borderColor: 'var(--accent)', duration: 0.2, ease: 'power2.out' }, t);
      tl.fromTo(r.box, { scale: 1 }, { keyframes: [{ scale: 1.12, duration: 0.1 }, { scale: 1, duration: 0.3, ease: E.out }], immediateRender: false }, t);
      tl.to(r.mark, { drawSVG: '100%', duration: 0.3, ease: E.out }, t + 0.08);
      if (cross) tl.to(r.label, { opacity: 0.45, duration: 0.3 }, t + 0.15);
      if (i === n - 1 && !cross) tl.to(r.label, { color: 'var(--accent)', duration: 0.3 }, t + 0.15);
    });
    if (title) P.fadeUp(tl, title, at + 0.1);
    st.cam.to(tl, at, { x: 980, y: 500, zoom: 1.04, dur: st.dur, ease: E.drift });
    return { scene: st.s, end: st.end, rows: rows, cam: st.cam };
  };
  P.checklist.dur = 5;
  /*@end*/

  /*@piece myth*/
  /** Mito o realidad: la tarjeta del mito se tacha y falla un instante; gira en 3D y por detrás aparece la realidad con su marca. */
  P.myth = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.myth.dur, bg: o.bg || 'dots', enter: o.enter, parent: o.parent }), w = st.w;
    var cw = 1320, ch = 540, cx = (W - cw) / 2, cy = 470 - ch / 2;
    var wrap = K.el('div', { cls: 'k-abs', css: { left: cx + 'px', top: cy + 'px', width: cw + 'px', height: ch + 'px', transformStyle: 'preserve-3d' } }, w);
    gsap.set(wrap, { transformPerspective: 2200 });
    var face = function (back) {
      var f = K.el('div', { cls: 'p-card', css: { left: 0, top: 0, width: cw + 'px', height: ch + 'px', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', padding: '70px 90px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: back ? mix(14, 'var(--accent)', 'var(--bg)') : null, borderColor: back ? mix(50, 'var(--accent)') : null } }, wrap);
      if (back) gsap.set(f, { rotationY: 180 });
      return f;
    };
    var fa = face(false), fb = face(true);
    var la = P.label(fa, o.mythLabel || 'Mito', { x: 0, top: 0, align: 'left', size: 30 }); la.style.position = 'relative';
    var ta = P.text(fa, esc(o.myth || 'Lo que todos creen.'), { cls: 'p-head', x: 0, top: 0, align: 'left', size: 84, maxW: cw - 180, maxH: ch - 220, lines: true, min: 40 });
    ta.style.position = 'relative'; ta.style.marginTop = '40px'; ta.style.left = '0'; ta.style.top = '0';
    var strike = K.el('div', { cls: 'k-abs', css: { left: '80px', top: (ch / 2 + 30) + 'px', width: (cw - 160) + 'px', height: '8px', background: 'var(--fg)', transformOrigin: '0 50%', transform: 'rotate(-3deg) scaleX(0)' } }, fa);
    var lb = P.label(fb, o.factLabel || 'Realidad', { x: 0, top: 0, align: 'left', size: 30, color: 'var(--accent)' }); lb.style.position = 'relative';
    var tb = P.text(fb, esc(o.fact || 'Lo que muestran los datos.'), { cls: 'p-head', x: 0, top: 0, align: 'left', size: 84, maxW: cw - 180, maxH: ch - 220, lines: true, min: 40 });
    tb.style.position = 'relative'; tb.style.marginTop = '40px'; tb.style.left = '0'; tb.style.top = '0';
    var chk = K.svgLayer(fb, { w: 120, h: 120, x: cw - 190, y: 60 }), cp = K.svg('path', { d: 'M22,62 L50,90 L100,30', fill: 'none', stroke: 'var(--accent)', 'stroke-width': 12, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, chk);
    tl.from(wrap, { y: 60, opacity: 0, rotationX: 12, duration: 0.9, ease: E.out }, at + 0.1);
    var words = P.rise(tl, ta, at + 0.35, { stagger: 0.06 });
    var ts = at + 1.4;
    tl.to(strike, { scaleX: 1, rotation: -3, duration: 0.45, ease: E.inOut }, ts);
    tl.to(ta, { opacity: 0.4, duration: 0.3 }, ts + 0.3);
    K.glitch(tl, fa, ts + 0.6, { dur: 0.3, intensity: 0.6 });
    var tf = ts + 1.0;
    gsap.set(fb, { visibility: 'hidden' });
    tl.to(wrap, { rotationY: 180, duration: 1, ease: E.inOut }, tf);
    tl.set(fa, { visibility: 'hidden' }, tf + 0.5); tl.set(fb, { visibility: 'visible' }, tf + 0.5);
    tl.fromTo(wrap, { scale: 1 }, { keyframes: [{ scale: 0.94, duration: 0.5, ease: 'power2.out' }, { scale: 1, duration: 0.5, ease: 'power2.in' }], immediateRender: false }, tf);
    tl.from(cp, { drawSVG: '0%', duration: 0.45, ease: E.out }, tf + 1.0);
    P.rise(tl, tb, tf + 0.7, { stagger: 0.06 });
    return { scene: st.s, end: st.end, card: wrap, myth: ta, fact: tb, cam: st.cam };
  };
  P.myth.dur = 6;
  /*@end*/

  /*@piece chat*/
  /** Conversación: los mensajes aparecen de dos lados con un indicador de escritura antes de cada uno; la columna sube cuando se llena. */
  P.chat = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.chat.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var msgs = (o.messages || [{ from: 'a', text: 'Hola' }, { from: 'b', text: 'Hola' }]).slice(0, 8);
    var col = K.el('div', { cls: 'k-abs', css: { left: '410px', top: '0px', width: '1100px', height: '2000px' } }, w);
    var y = 170, built = [], seen = {};
    msgs.forEach(function (m, i) {
      var b = m.from === 'b';
      if (!seen[m.from] && (b ? o.b : o.a)) { seen[m.from] = 1; var nm = P.label(col, b ? o.b : o.a, { x: b ? 1100 : 0, top: y, align: b ? 'right' : 'left', size: 24 }); y += 46; built.push({ name: nm, i: i }); }
      var bub = K.el('div', { cls: 'k-abs', css: { maxWidth: '760px', padding: '24px 32px', borderRadius: b ? '30px 30px 8px 30px' : '30px 30px 30px 8px', background: b ? 'var(--accent)' : mix(11, 'var(--fg)', 'var(--bg)'), color: b ? 'var(--bg)' : 'var(--fg)', font: '500 40px/1.3 var(--font-body)', top: y + 'px' }, text: m.text }, col);
      bub.style[b ? 'right' : 'left'] = '0px';
      var typ = K.el('div', { cls: 'k-abs', css: { top: y + 'px', padding: '26px 30px', borderRadius: '30px', background: mix(9, 'var(--fg)', 'var(--bg)'), display: 'flex', gap: '12px' } }, col);
      typ.style[b ? 'right' : 'left'] = '0px';
      typ.innerHTML = '<i style="width:14px;height:14px;border-radius:50%;background:var(--muted)"></i><i style="width:14px;height:14px;border-radius:50%;background:var(--muted)"></i><i style="width:14px;height:14px;border-radius:50%;background:var(--muted)"></i>';
      built.push({ bub: bub, typ: typ, b: b, y: y, h: bub.offsetHeight });
      y += bub.offsetHeight + 26;
    });
    var bubbles = built.filter(function (x) { return x.bub; });
    var off = Math.max(0, (800 - y) / 2);
    if (off) { col.style.top = off + 'px'; bubbles.forEach(function (x) { x.y += off; }); }
    var step = Math.min(1.1, (st.dur - 1.2) / bubbles.length), t = at + 0.3;
    var dots = [];
    bubbles.forEach(function (x, i) {
      var ti = t + i * step, td = Math.min(0.45, step * 0.45);
      gsap.set([x.bub, x.typ], { opacity: 0 });
      tl.to(x.typ, { opacity: 1, duration: 0.15 }, ti);
      tl.to(x.typ, { opacity: 0, duration: 0.1 }, ti + td);
      [].slice.call(x.typ.children).forEach(function (d, k) { dots.push({ d: d, k: k, t0: ti, t1: ti + td }); });
      tl.fromTo(x.bub, { opacity: 0, scale: 0.92, y: 16, transformOrigin: x.b ? '100% 100%' : '0% 100%' }, { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: E.out, immediateRender: false }, ti + td);
      var over = x.y + x.h - 780;
      if (over > 0) tl.to(col, { y: -over, duration: 0.5, ease: E.inOut }, ti + td);
    });
    built.forEach(function (x) { if (x.name) { var bb = bubbles.filter(function (q) { return q.y > (parseFloat(x.name.style.top) || 0); })[0]; var tt = bb ? t + bubbles.indexOf(bb) * step : t; tl.from(x.name, { opacity: 0, duration: 0.3 }, tt); } });
    A.addRender(function (tt) { dots.forEach(function (q) { if (tt >= q.t0 && tt <= q.t1) q.d.style.transform = 'translateY(' + (-Math.max(0, Math.sin((tt - q.t0) * 12 - q.k * 0.9)) * 8).toFixed(1) + 'px)'; }); });
    return { scene: st.s, end: st.end, column: col, bubbles: bubbles.map(function (x) { return x.bub; }), cam: st.cam };
  };
  P.chat.dur = 6;
  /*@end*/

  /*@piece search*/
  /** Búsqueda: una barra genérica escribe la consulta, aparecen los resultados en cascada y el cursor hace clic en el primero. */
  P.search = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.search.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var bx = 410, by = 250, bw = 1100, bh = 112;
    var bar = K.el('div', { cls: 'k-abs', css: { left: bx + 'px', top: by + 'px', width: bw + 'px', height: bh + 'px', borderRadius: '56px', background: mix(8, 'var(--fg)', 'var(--bg)'), border: '2px solid ' + mix(18), boxSizing: 'border-box' } }, w);
    var sv = K.svgLayer(bar, { w: 60, h: 60, x: 36, y: 24 }); var mg = [K.svg('circle', { cx: 26, cy: 26, r: 16, fill: 'none', stroke: 'var(--muted)', 'stroke-width': 4 }, sv), K.svg('line', { x1: 38, y1: 38, x2: 52, y2: 52, stroke: 'var(--muted)', 'stroke-width': 4, 'stroke-linecap': 'round' }, sv)];
    var q = K.el('div', { cls: 'k-abs', css: { left: '118px', top: '50%', transform: 'translateY(-50%)', font: '500 44px/1 var(--font-body)', color: 'var(--fg)', whiteSpace: 'nowrap' } }, bar);
    var caret = K.el('div', { cls: 'k-abs', css: { top: '30px', width: '4px', height: '52px', background: 'var(--accent)' } }, bar);
    var full = String(o.query || 'búsqueda'), p = { k: 0 }, tT = at + 0.5, dT = Math.min(1.6, 0.06 * full.length + 0.3);
    A.addRender(function (t) { var n = Math.round(p.k * full.length); if (q.textContent.length !== n) q.textContent = full.slice(0, n); caret.style.left = (118 + q.offsetWidth + 6) + 'px'; caret.style.opacity = t < tT + dT + 0.3 ? (Math.floor(t * 2.6) % 2 === 0 || (t > tT && t < tT + dT) ? 1 : 0) : 0; });
    var res = (o.results || ['Resultado uno', 'Resultado dos', 'Resultado tres']).slice(0, 4);
    var cards = res.map(function (r, i) {
      var c = K.el('div', { cls: 'p-card', css: { left: bx + 'px', top: (by + bh + 40 + i * 122) + 'px', width: bw + 'px', height: '104px', borderRadius: '20px', padding: '20px 34px', boxSizing: 'border-box' } }, w);
      c.innerHTML = '<div style="font:600 38px/1.1 var(--font-title);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(typeof r === 'string' ? r : r.title) + '</div><div style="margin-top:8px;height:10px;width:' + (40 + (i * 17) % 35) + '%;border-radius:5px;background:' + mix(14) + '"></div>';
      return c;
    });
    var cur = K.cursor(w, { x: 1560, y: 960, size: 52 });
    tl.from(bar, { opacity: 0, scale: 0.96, duration: 0.6, ease: E.out }, at + 0.1);
    tl.from(mg, { drawSVG: '0%', duration: 0.6, ease: E.inOut }, at + 0.2);
    tl.to(p, { k: 1, duration: dT, ease: 'none' }, tT);
    var tr = tT + dT + 0.25;
    tl.fromTo(bar, { scale: 1 }, { keyframes: [{ scale: 0.985, duration: 0.08 }, { scale: 1, duration: 0.25, ease: E.out }], immediateRender: false }, tr - 0.1);
    tl.from(cards, { opacity: 0, y: 30, filter: 'blur(8px)', duration: 0.6, stagger: 0.09, ease: E.out }, tr);
    var tc = tr + 0.4 + cards.length * 0.09;
    tl.from(cur.el, { opacity: 0, duration: 0.2 }, tc - 0.3);
    cur.move(tl, tc - 0.3, { x: bx + 260, y: by + bh + 92, dur: 0.8 });
    cur.click(tl, tc + 0.55);
    tl.to(cards[0], { borderColor: 'var(--accent)', backgroundColor: mix(12, 'var(--accent)', 'var(--bg)'), duration: 0.25 }, tc + 0.6);
    st.cam.set(tl, at, { x: bx + bw / 2, y: by + bh / 2 + 40, zoom: 1.35 });
    st.cam.to(tl, tr - 0.2, { x: W / 2, y: 480, zoom: 1, dur: 1.1, ease: E.inOut });
    return { scene: st.s, end: st.end, bar: bar, results: cards, cursor: cur, cam: st.cam };
  };
  P.search.dur = 6;
  /*@end*/

  /*@piece headlines*/
  /** Titulares: recortes de prensa genéricos (sin logotipos reales) caen uno sobre otro con profundidad; la cámara recorre la mesa y se marca la frase clave del último. */
  P.headlines = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.headlines.dur, bg: o.bg || 'field', enter: o.enter, parent: o.parent }), w = st.w;
    var items = (o.items || [{ source: 'Diario', headline: 'Titular' }]).slice(0, 4), n = items.length;
    var spots = [[620, 360, -5], [1320, 420, 4], [800, 640, -2], [1180, 300, 6]];
    var cards = items.map(function (it, i) {
      var sp = spots[i % spots.length], cw = 860;
      var c = K.el('div', { cls: 'k-abs', css: { left: (sp[0] - cw / 2) + 'px', top: (sp[1] - 170) + 'px', width: cw + 'px', padding: '34px 44px 40px', boxSizing: 'border-box', background: 'var(--paper)', color: 'var(--ink)', borderRadius: '4px', boxShadow: '0 30px 70px rgba(0,0,0,.45)' } }, w);
      c.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid currentColor;padding-bottom:12px;margin-bottom:20px"><b style="font:700 30px/1 var(--font-body);letter-spacing:.04em;text-transform:uppercase">' + esc(it.source || '') + '</b><span style="font:500 20px/1 var(--font-mono);opacity:.6">' + esc(it.date || '') + '</span></div>' +
        '<div class="p-hd" style="font:700 52px/1.08 var(--font-body)">' + esc(it.headline || '') + '</div>' +
        '<div style="margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:12px 22px">' + [1, 2, 3, 4].map(function () { return '<i style="display:block;height:10px;border-radius:3px;background:currentColor;opacity:.13"></i>'; }).join('') + '</div>';
      gsap.set(c, { rotation: sp[2] });
      return { el: c, x: sp[0], y: sp[1] };
    });
    var step = Math.min(0.75, (st.dur - 2.2) / n), t0 = at + 0.2;
    cards.forEach(function (c, i) {
      var t = t0 + i * step;
      tl.from(c.el, { scale: 1.35, opacity: 0, y: -60, filter: 'blur(14px)', rotation: '+=8', duration: 0.6, ease: E.arrive }, t);
      K.shake(tl, st.cam.rig, t + 0.42, { dur: 0.18, amp: 4 });
      if (i) tl.to(cards.slice(0, i).map(function (q) { return q.el; }), { filter: 'brightness(.7)', duration: 0.4 }, t + 0.2);
    });
    var last = cards[n - 1], hd = last.el.querySelector('.p-hd'), mk = P.markWord(hd, o.highlight);
    if (mk) { mk.querySelector('i').style.background = mix(70, 'var(--accent)'); P.sweepMark(tl, mk, t0 + n * step + 0.3, { ink: false }); }
    st.cam.set(tl, at, { x: cards[0].x, y: cards[0].y, zoom: 1.12 });
    cards.forEach(function (c, i) { if (i) st.cam.to(tl, t0 + i * step - 0.1, { x: K.lerp(W / 2, c.x, 0.5), y: K.lerp(500, c.y, 0.5), zoom: 1.08, dur: 0.8, ease: E.inOut }); });
    st.cam.to(tl, t0 + n * step, { x: last.x, y: last.y, zoom: 1.3, dur: 1.2, ease: E.inOut });
    return { scene: st.s, end: st.end, cards: cards.map(function (c) { return c.el; }), cam: st.cam };
  };
  P.headlines.dur = 6;
  /*@end*/

  /* =====================================================================
     CON IMÁGENES (claves de ATRIL.asset: img1, img2…; «_cut» = recorte sin fondo)
     ===================================================================== */

  var hasAsset = function (k) { return !!(A.assets || {})[k]; };

  /*@piece photo*/
  /** Foto con foco: la imagen se acerca lentamente a un punto, el resto se oscurece, un anillo lo rodea y una línea lo une con su etiqueta. */
  P.photo = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.photo.dur, bg: 'none', enter: o.enter, parent: o.parent, drift: false }), w = st.w;
    var key = o.img || 'img1';
    var img = hasAsset(key) ? K.image(st.s, key, {}) : P.bg(st.s, 'field');
    if (img && img.parentNode !== st.s) st.s.insertBefore(img, st.s.firstChild);
    var fx = o.focus ? o.focus.x : 0.6, fy = o.focus ? o.focus.y : 0.42, x = fx * W, y = fy * H;
    tl.fromTo(img, { scale: 1.02 }, { scale: 1.14, transformOrigin: (fx * 100) + '% ' + (fy * 100) + '%', duration: st.dur, ease: 'none', immediateRender: true }, at);
    K.spotlight(tl, at + 0.6, { x: x, y: y, r: 170, dark: 0.62, soft: 90, parent: st.s });
    var sv = K.svgLayer(st.s), ring = K.svg('circle', { cx: x, cy: y, r: 120, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 5, transform: 'rotate(-90 ' + x + ' ' + y + ')' }, sv);
    var right = fx < 0.6, ex = x + (right ? 1 : -1) * 260, ey = y - 150, hx = ex + (right ? 1 : -1) * 120;
    var lead = K.svg('polyline', { points: [x + (right ? 1 : -1) * 85, y - 85, ex, ey, hx, ey].join(' '), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 3 }, sv);
    var card = K.el('div', { cls: 'p-chip', css: { flexDirection: 'column', alignItems: right ? 'flex-start' : 'flex-end', gap: '8px' } }, st.s);
    card.innerHTML = (o.kicker ? '<span class="p-label" style="position:static;color:var(--accent)">' + esc(o.kicker) + '</span>' : '') + '<b style="font:700 54px/1.05 var(--font-title)">' + esc(o.label || '') + '</b>';
    card.style.left = (right ? hx + 16 : hx - 16 - card.offsetWidth) + 'px'; card.style.top = (ey - card.offsetHeight / 2) + 'px';
    tl.from(ring, { drawSVG: '0%', duration: 0.8, ease: E.inOut }, at + 0.9);
    tl.from(lead, { drawSVG: '0%', duration: 0.6, ease: E.inOut }, at + 1.5);
    tl.from(card, { opacity: 0, x: right ? -20 : 20, filter: 'blur(8px)', duration: 0.6, ease: E.out }, at + 1.95);
    P.pulse(tl, st.s, at + 1.2, { x: x, y: y, r: 120, to: 1.5, n: 2, sw: 2, dur: 1 });
    return { scene: st.s, end: st.end, image: img, ring: ring, card: card, cam: st.cam };
  };
  P.photo.dur = 5;
  /*@end*/

  /*@piece depth*/
  /** Texto detrás del sujeto: la palabra sube por detrás de la persona u objeto recortado y se queda entre el fondo y el sujeto (necesita «img_cut»; sin recorte, queda sobre la foto). */
  P.depth = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.depth.dur, bg: 'none', enter: o.enter, parent: o.parent, drift: false });
    var key = o.img || 'img1';
    var d = K.depth(st.s, key, {});
    if (!d.front) K.el('div', { cls: 'k-layer', css: { background: 'rgba(0,0,0,.28)' } }, d.mid);
    var t = P.text(d.mid, esc(o.text || 'TEXTO'), { cls: 'p-head', x: o.x != null ? o.x : W / 2, y: o.y != null ? o.y : 400, size: o.size || 330, maxW: 1760, maxH: 420, min: 90 });
    t.style.color = o.color || 'var(--fg)'; t.style.letterSpacing = '-0.02em'; t.style.textTransform = o.upper === false ? 'none' : 'uppercase';
    P.place(t, { x: o.x != null ? o.x : W / 2, y: o.y != null ? o.y : 400 });
    var layers = [d.back, d.mid, d.front].filter(Boolean);
    tl.fromTo(layers, { scale: 1 }, { scale: 1.07, transformOrigin: '50% 70%', duration: st.dur, ease: 'none', immediateRender: true }, at);
    tl.from(t, { yPercent: 70, opacity: 0, duration: 1.3, ease: E.out }, at + 0.3);
    tl.fromTo(t, { letterSpacing: '-0.02em' }, { letterSpacing: '0.02em', duration: st.dur, ease: 'none', immediateRender: false }, at);
    var kick = o.kicker ? P.label(st.s, o.kicker, { x: 96, y: 96, align: 'left', color: 'var(--fg)' }) : null;
    if (kick) P.fadeUp(tl, kick, at + 1, { y: 10 });
    return { scene: st.s, end: st.end, back: d.back, mid: d.mid, front: d.front, text: t, cam: st.cam };
  };
  P.depth.dur = 5;
  /*@end*/

  /*@piece compare*/
  /** Antes y después: una línea divisoria barre la imagen revelando la segunda y vuelve al centro para dejar ambas a la vista. */
  P.compare = function (tl, at, o) {
    o = o || {};
    var st = P.stage(tl, at, { dur: o.dur || P.compare.dur, bg: 'none', enter: o.enter, parent: o.parent, drift: false });
    var a = K.image(st.s, o.a || 'img1', {}), b = K.image(st.s, o.b || 'img2', {});
    tl.fromTo([a, b], { scale: 1 }, { scale: 1.05, duration: st.dur, ease: 'none', immediateRender: true }, at);
    var line = K.el('div', { cls: 'k-abs', css: { top: 0, width: '6px', height: H + 'px', marginLeft: '-3px', background: 'var(--accent)' } }, st.s);
    var knob = K.el('div', { cls: 'k-abs', css: { top: (H / 2 - 40) + 'px', width: '80px', height: '80px', marginLeft: '-40px', borderRadius: '50%', background: 'var(--accent)', color: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '700 40px/1 var(--font-mono)' }, text: '‹ ›' }, st.s);
    var la = K.el('div', { cls: 'p-chip', css: { left: '96px', top: '80px' } }, st.s); la.innerHTML = '<span class="p-label" style="position:static;color:var(--fg)">' + esc(o.labelA || 'Antes') + '</span>';
    var lb = K.el('div', { cls: 'p-chip', css: { right: '96px', top: '80px' } }, st.s); lb.innerHTML = '<span class="p-label" style="position:static;color:var(--accent)">' + esc(o.labelB || 'Después') + '</span>';
    var p = { x: 1 };
    A.addRender(function () { var X = p.x * W; b.style.clipPath = 'inset(0 0 0 ' + X.toFixed(1) + 'px)'; line.style.left = X.toFixed(1) + 'px'; knob.style.left = X.toFixed(1) + 'px'; la.style.opacity = K.clamp((p.x * W - 420) / 200, 0, 1); lb.style.opacity = K.clamp((W - 420 - p.x * W) / 200, 0, 1); });
    tl.from([line, knob], { opacity: 0, duration: 0.3 }, at + 0.3);
    tl.to(p, { x: 0.12, duration: 1.6, ease: E.inOut }, at + 0.5);
    tl.to(p, { x: 0.5, duration: 1.1, ease: E.inOut }, at + 2.3);
    return { scene: st.s, end: st.end, a: a, b: b, line: line, cam: st.cam };
  };
  P.compare.dur = 5;
  /*@end*/

  /* =====================================================================
     SOBRE EL VIDEO (capas transparentes; respetan márgenes y la franja de subtítulos)
     ===================================================================== */

  /*@piece lower*/
  /** Rótulo de nombre: una barra de acento crece, el nombre sube por una máscara y el cargo se descifra debajo; sale por el mismo camino. */
  P.lower = function (tl, at, o) {
    o = o || {};
    var L = P.layer(o), dur = o.dur || P.lower.dur, end = at + dur, x = 96, y = 700;
    var bar = K.el('div', { cls: 'k-abs', css: { left: x + 'px', top: y + 'px', width: '8px', height: '118px', background: 'var(--accent)', transformOrigin: '50% 100%' } }, L);
    var panel = K.el('div', { cls: 'k-abs', css: { left: (x + 8) + 'px', top: y + 'px', height: '118px', padding: '0 40px 0 30px', background: mix(84, 'var(--bg)'), display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px' } }, L);
    var nm = K.el('div', { css: { font: '700 60px/1 var(--font-title)', color: 'var(--fg)', whiteSpace: 'nowrap' }, text: o.name || 'Nombre Apellido' }, panel);
    var rl = K.el('div', { cls: 'p-label', css: { position: 'static', color: 'var(--accent)', fontSize: '26px' }, text: o.role || 'Cargo' }, panel);
    tl.from(bar, { scaleY: 0, duration: 0.5, ease: E.out }, at);
    tl.fromTo(panel, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.7, ease: E.inOut }, at + 0.15);
    var words = P.rise(tl, nm, at + 0.35, { stagger: 0.05 });
    tl.fromTo(rl, { opacity: 1 }, { duration: 0.8, scrambleText: { text: rl.textContent, chars: 'upperCase', speed: 0.7 }, ease: 'none', immediateRender: false }, at + 0.55);
    tl.from(rl, { opacity: 0, duration: 0.2 }, at + 0.55);
    if (o.exit !== false) {
      tl.to(panel, { clipPath: 'inset(0 100% 0 0)', duration: 0.45, ease: E.in }, end - 0.55);
      tl.to(bar, { scaleY: 0, duration: 0.3, ease: E.in }, end - 0.3);
    }
    return { layer: L, end: end, name: nm, role: rl, panel: panel };
  };
  P.lower.dur = 5;
  /*@end*/

  /*@piece callout*/
  /** Señalador: un anillo se traza sobre un punto del video, late una vez y una línea en codo lo une con su etiqueta. */
  P.callout = function (tl, at, o) {
    o = o || {};
    var L = P.layer(o), dur = o.dur || P.callout.dur, end = at + dur;
    var x = o.x != null ? o.x : 1150, y = o.y != null ? o.y : 430, r = o.r || 70, right = o.side ? o.side === 'right' : x < 1250;
    var sv = K.svgLayer(L);
    var ring = K.svg('circle', { cx: x, cy: y, r: r, fill: 'none', stroke: 'var(--accent)', 'stroke-width': 5, transform: 'rotate(-90 ' + x + ' ' + y + ')' }, sv);
    var dot = K.svg('circle', { cx: x, cy: y, r: 7, fill: 'var(--accent)' }, sv);
    var sx = x + (right ? 1 : -1) * r * 0.72, sy = y - r * 0.72, ex = sx + (right ? 1 : -1) * 110, ey = Math.max(150, sy - 110), hx = ex + (right ? 1 : -1) * 170;
    var lead = K.svg('polyline', { points: [sx, sy, ex, ey, hx, ey].join(' '), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 3 }, sv);
    var chip = K.el('div', { cls: 'p-chip' }, L);
    chip.innerHTML = '<b style="font:700 44px/1 var(--font-title)">' + esc(o.label || 'Etiqueta') + '</b>';
    chip.style.left = (right ? hx + 12 : hx - 12 - chip.offsetWidth) + 'px'; chip.style.top = (ey - chip.offsetHeight / 2) + 'px';
    tl.from(dot, { attr: { r: 0 }, duration: 0.3, ease: E.out }, at);
    tl.from(ring, { drawSVG: '0%', duration: 0.6, ease: E.inOut }, at + 0.1);
    P.pulse(tl, L, at + 0.6, { x: x, y: y, r: r, to: 1.6, n: 1, sw: 3, dur: 0.8 });
    tl.from(lead, { drawSVG: '0%', duration: 0.5, ease: E.inOut }, at + 0.55);
    tl.from(chip, { opacity: 0, x: right ? -16 : 16, duration: 0.5, ease: E.out }, at + 0.95);
    if (o.exit !== false) tl.to([ring, lead, dot, chip], { opacity: 0, duration: 0.3, ease: E.in }, end - 0.35);
    return { layer: L, end: end, ring: ring, label: chip };
  };
  P.callout.dur = 4;
  /*@end*/

  /*@piece source*/
  /** Fuente: una etiqueta discreta arriba a la izquierda que se escribe sola (para citar de dónde sale un dato o una imagen). */
  P.source = function (tl, at, o) {
    o = o || {};
    var L = P.layer(o), dur = o.dur || P.source.dur, end = at + dur;
    var chip = K.el('div', { cls: 'p-chip', css: { left: '96px', top: '64px', padding: '14px 22px', gap: '14px' } }, L);
    chip.innerHTML = '<i style="width:12px;height:12px;background:var(--accent);display:block"></i><span class="p-label" style="position:static;color:var(--fg);font-size:24px;letter-spacing:.08em;text-transform:none"></span>';
    var sp = chip.querySelector('span'), full = String(o.text || 'Fuente: archivo');
    sp.textContent = full; var wFull = chip.offsetWidth; sp.textContent = '';
    chip.style.width = wFull + 'px';
    tl.fromTo(chip, { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.5, ease: E.inOut }, at);
    tl.to(sp, { text: full, duration: Math.min(1.2, full.length * 0.03), ease: 'none' }, at + 0.3);
    if (o.exit !== false) tl.to(chip, { opacity: 0, duration: 0.3, ease: E.in }, end - 0.35);
    return { layer: L, end: end, chip: chip };
  };
  P.source.dur = 4;
  /*@end*/

  /*@piece stamp*/
  /** Sello: una palabra en un recuadro cae girando sobre el video, golpea y sacude el cuadro (CONFIRMADO, FALSO, CLASIFICADO…). */
  P.stamp = function (tl, at, o) {
    o = o || {};
    var L = P.layer(o), dur = o.dur || P.stamp.dur, end = at + dur, color = o.color || 'var(--accent)';
    var st = K.el('div', { cls: 'k-abs', css: { padding: '16px 40px', border: '9px solid ' + color, borderRadius: '16px', color: color, font: '700 116px/1 var(--font-title)', letterSpacing: '.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      WebkitMaskImage: 'url("data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 2.1"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>') + '")', WebkitMaskSize: '300px 300px' }, text: o.text || 'Confirmado' }, L);
    P.place(st, { x: o.x != null ? o.x : 1380, y: o.y != null ? o.y : 300 });
    K.slam(tl, st, at, { rot: o.rot != null ? o.rot : -8, from: 2.3, shakeEl: L, amp: 10 });
    if (o.exit !== false) tl.to(st, { opacity: 0, scale: 0.96, duration: 0.3, ease: E.in }, end - 0.35);
    return { layer: L, end: end, stamp: st };
  };
  P.stamp.dur = 3;
  /*@end*/

  /*@piece where*/
  /** Lugar y fecha sobre el video: un pin cae, el nombre del lugar sube y la línea inferior (coordenadas o fecha) se descifra. */
  P.where = function (tl, at, o) {
    o = o || {};
    var L = P.layer(o), dur = o.dur || P.where.dur, end = at + dur;
    var chip = K.el('div', { cls: 'p-chip', css: { left: '96px', top: '64px', padding: '20px 32px 20px 24px', gap: '20px' } }, L);
    chip.innerHTML = '<svg viewBox="0 0 68 92" width="44" height="60"><path d="M34 90C34 90 4 54 4 33a30 30 0 0 1 60 0c0 21-30 57-30 57z" fill="var(--accent)"/><circle cx="34" cy="33" r="11" fill="var(--bg)"/></svg><div style="display:flex;flex-direction:column;gap:10px"><b style="font:700 52px/1 var(--font-title);white-space:nowrap"></b><span class="p-label" style="position:static;color:var(--accent)"></span></div>';
    var pin = chip.querySelector('svg'), nm = chip.querySelector('b'), sub = chip.querySelector('span');
    nm.textContent = o.place || 'Lugar'; sub.textContent = o.sub || '';
    tl.from(chip, { opacity: 0, y: -12, filter: 'blur(8px)', duration: 0.5, ease: E.out }, at);
    tl.from(pin, { y: -40, opacity: 0, duration: 0.45, ease: E.arrive }, at + 0.15);
    P.rise(tl, nm, at + 0.3, { stagger: 0.05 });
    if (o.sub) tl.fromTo(sub, { opacity: 1 }, { duration: 0.9, scrambleText: { text: sub.textContent, chars: '0123456789°.NSEWO', speed: 0.7 }, ease: 'none', immediateRender: false }, at + 0.55);
    if (o.exit !== false) tl.to(chip, { opacity: 0, y: -10, duration: 0.3, ease: E.in }, end - 0.35);
    return { layer: L, end: end, chip: chip };
  };
  P.where.dur = 4;
  /*@end*/

  /*@piece figure*/
  /** Cifra sobre el video: una ficha arriba a la derecha con un mini anillo que se traza y un número que cuenta, con su etiqueta. */
  P.figure = function (tl, at, o) {
    o = o || {};
    var L = P.layer(o), dur = o.dur || P.figure.dur, end = at + dur;
    var chip = K.el('div', { cls: 'p-chip', css: { right: '96px', top: '64px', padding: '22px 34px 22px 26px', gap: '24px' } }, L);
    chip.innerHTML = '<svg viewBox="0 0 80 80" width="76" height="76"><circle cx="40" cy="40" r="32" fill="none" stroke="' + mix(18) + '" stroke-width="7"/><circle class="arc" cx="40" cy="40" r="32" fill="none" stroke="var(--accent)" stroke-width="7" stroke-linecap="round" transform="rotate(-90 40 40)"/></svg><div style="display:flex;flex-direction:column;gap:8px"><b class="p-num" style="font:700 66px/1 var(--font-title)">0</b><span class="p-label" style="position:static"></span></div>';
    var arc = chip.querySelector('.arc'), nb = chip.querySelector('b'), lb = chip.querySelector('span');
    lb.textContent = o.label || '';
    var to = Number(o.value != null ? o.value : 100), pct = o.pct != null ? K.clamp(o.pct, 0, 100) : 100;
    nb.textContent = (o.prefix || '') + num(to, o.decimals != null ? o.decimals : decOf(o.value)) + (o.suffix || ''); chip.style.minWidth = chip.offsetWidth + 'px';
    tl.from(chip, { opacity: 0, x: 20, filter: 'blur(8px)', duration: 0.5, ease: E.out }, at);
    tl.fromTo(arc, { drawSVG: '0%' }, { drawSVG: pct + '%', duration: 1.2, ease: E.inOut }, at + 0.2);
    P.count(tl, nb, at + 0.2, { to: to, decimals: o.decimals, prefix: o.prefix, suffix: o.suffix, dur: 1.2 });
    P.fadeUp(tl, lb, at + 0.5, { y: 8 });
    if (o.exit !== false) tl.to(chip, { opacity: 0, x: 16, duration: 0.3, ease: E.in }, end - 0.35);
    return { layer: L, end: end, chip: chip, number: nb };
  };
  P.figure.dur = 4;
  /*@end*/
})();
