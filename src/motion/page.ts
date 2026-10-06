// Construcción de la página HTML de una composición de motion (función pura).
// Opus escribe css/html/js; ATRIL añade fuentes, bibliotecas y el arnés que
// permite fijar cualquier instante t (render determinista cuadro a cuadro).

export interface Composition {
  id: string;
  title?: string;
  duration: number;              // segundos
  transparent: boolean;          // true = capa superpuesta con alfa; false = plano completo
  css: string;
  html: string;
  js: string;
  libs?: ("map" | "d3")[];       // bibliotecas opcionales
  assets?: Record<string, string>; // clave -> ruta absoluta de imagen/video de la biblioteca
}

export const FONT_FILES: { family: string; file: string; weight?: string; style?: string }[] = [
  { family: "Anton", file: "Anton-Regular.ttf" },
  { family: "Archivo Black", file: "ArchivoBlack-Regular.ttf" },
  { family: "Bebas Neue", file: "BebasNeue-Regular.ttf" },
  { family: "DM Serif Display", file: "DMSerifDisplay-Regular.ttf" },
  { family: "DM Serif Display", file: "DMSerifDisplay-Italic.ttf", style: "italic" },
  { family: "Inter", file: "Inter.ttf", weight: "100 900" },
  { family: "JetBrains Mono", file: "JetBrainsMono.ttf", weight: "100 800" },
  { family: "Oswald", file: "Oswald.ttf", weight: "200 700" },
  { family: "Playfair Display", file: "PlayfairDisplay.ttf", weight: "400 900" },
  { family: "Poppins", file: "Poppins-Regular.ttf", weight: "400" },
  { family: "Poppins", file: "Poppins-SemiBold.ttf", weight: "600" },
  { family: "Poppins", file: "Poppins-Bold.ttf", weight: "700" },
  { family: "Poppins", file: "Poppins-ExtraBold.ttf", weight: "800" },
  { family: "Poppins", file: "Poppins-Black.ttf", weight: "900" },
  { family: "Source Serif 4", file: "SourceSerif4.ttf", weight: "200 900" },
  { family: "Source Serif 4", file: "SourceSerif4-Italic.ttf", weight: "200 900", style: "italic" },
];

export const FONT_FAMILIES = [...new Set(FONT_FILES.map((f) => f.family))];

export const GSAP_PLUGINS = ["SplitText", "DrawSVGPlugin", "MorphSVGPlugin", "MotionPathPlugin", "CustomEase", "ScrambleTextPlugin", "TextPlugin", "Physics2DPlugin", "EasePack"];

/** Ruta local → URL file:// (Windows y POSIX, con espacios y acentos). */
export function fileUrlOf(path: string): string {
  const p = path.replace(/\\/g, "/");
  const enc = p.split("/").map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join("/");
  return /^[A-Za-z]:/.test(p) ? `file:///${enc}` : `file://${enc.startsWith("/") ? "" : "/"}${enc}`;
}

/** Arnés: registro del timeline, búsqueda determinista de t y utilidades. */
export const HARNESS = String.raw`
(function(){
  var seed = 1234567;
  Math.random = function(){ seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  var A = window.ATRIL = window.ATRIL || {};
  A.errors = []; A.ready = false; A.tl = null; A.renderFn = null; A.duration = A.duration || 0;
  window.addEventListener('error', function(e){ A.errors.push(String(e.message || e) + (e.lineno ? ' (línea ' + e.lineno + ')' : '')); });
  A.register = function(tl, duration){ if (tl && tl.pause) tl.pause(0); A.tl = tl; if (duration) A.duration = duration; else if (tl && tl.duration) A.duration = A.duration || tl.duration(); A.ready = true; };
  A.onRender = function(fn, duration){ A.renderFn = fn; if (duration) A.duration = duration; A.ready = true; };
  A.seek = function(t){
    if (A.tl) A.tl.seek(t, false);
    if (A.renderFn) A.renderFn(t);
    if (document.getAnimations) document.getAnimations().forEach(function(a){ try { a.pause(); a.currentTime = t * 1000; } catch(e){} });
    return true;
  };
  A.asset = function(key){ var u = (A.assets || {})[key]; if (!u) A.errors.push('Recurso inexistente: ' + key); return u || ''; };
  /** Reduce el tamaño de fuente hasta que el elemento quepa en su caja. */
  A.fit = function(el, maxW, maxH, minPx){
    if (typeof el === 'string') el = document.querySelector(el);
    if (!el) return;
    var cs = parseFloat(getComputedStyle(el).fontSize) || 48; minPx = minPx || 18;
    maxW = maxW || el.clientWidth; maxH = maxH || 1e9;
    while ((el.scrollWidth > maxW + 1 || el.scrollHeight > maxH + 1) && cs > minPx) { cs -= 2; el.style.fontSize = cs + 'px'; }
  };
  A.isReady = function(){
    if (!A.ready) return false;
    var imgs = document.images; for (var i = 0; i < imgs.length; i++) if (!imgs[i].complete) return false;
    return document.fonts ? document.fonts.status === 'loaded' : true;
  };
})();
`;

export interface PageOpts { width: number; height: number; resources: string; fontsDir: string }

/** Página completa lista para abrir en el navegador sin ventana. */
export function buildPage(c: Composition, o: PageOpts): string {
  const res = (f: string) => fileUrlOf(`${o.resources.replace(/[\\/]+$/, "")}/${f}`);
  const fonts = FONT_FILES.map((f) =>
    `@font-face{font-family:"${f.family}";src:url("${fileUrlOf(`${o.fontsDir.replace(/[\\/]+$/, "")}/${f.file}`)}") format("truetype");font-weight:${f.weight ?? "400"};font-style:${f.style ?? "normal"};font-display:block}`).join("\n");
  const assets = Object.fromEntries(Object.entries(c.assets ?? {}).map(([k, p]) => [k, /^(https?|file|data):/.test(p) ? p : fileUrlOf(p)]));
  const libs = [`gsap.min.js`, ...GSAP_PLUGINS.map((p) => `${p}.min.js`)];
  if (c.libs?.includes("d3") || c.libs?.includes("map")) libs.push("d3.min.js", "topojson-client.min.js");
  if (c.libs?.includes("map")) libs.push("world-50m.js");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${(c.title ?? c.id).replace(/</g, "")}</title>
<style>
${fonts}
html,body{margin:0;padding:0;width:${o.width}px;height:${o.height}px;overflow:hidden;background:${c.transparent ? "transparent" : "#000"};}
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}
#stage{position:relative;width:${o.width}px;height:${o.height}px;overflow:hidden;}
</style>
<style>
${c.css}
</style>
${libs.map((l) => `<script src="${res(l)}"></script>`).join("\n")}
<script>window.ATRIL={duration:${Number(c.duration) || 5},transparent:${c.transparent ? "true" : "false"},assets:${JSON.stringify(assets)}};</script>
<script>${HARNESS}</script>
<script>try{gsap.registerPlugin(${GSAP_PLUGINS.filter((p) => p !== "EasePack").map((p) => `window.${p}`).join(",")});}catch(e){ATRIL.errors.push("Plugins: "+e.message);}</script>
</head><body><div id="stage">
${c.html}
</div>
<script>
var __fl = ${JSON.stringify(FONT_FILES.map((f) => `${f.style === "italic" ? "italic " : ""}${(f.weight ?? "400").split(" ").pop()} 40px "${f.family}"`))};
Promise.all(__fl.map(function(f){ return document.fonts.load(f).catch(function(){}); })).then(function(){ return document.fonts.ready; }).then(function(){
try {
${c.js}
} catch (e) { ATRIL.errors.push(String(e && e.message || e) + (e && e.stack ? ' :: ' + String(e.stack).split('\\n')[1] : '')); }
});
</script>
</body></html>`;
}
