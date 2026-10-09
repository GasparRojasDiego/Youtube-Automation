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
  palette?: Record<string, string>; // colores y fuentes del canal (K.theme)
  icons?: Record<string, string>;   // clave → SVG del ícono (K.icon)
}

export const FONT_FILES: { family: string; file: string; weight?: string; style?: string }[] = [
  { family: "Anton", file: "Anton-Regular.ttf" },
  { family: "Archivo", file: "Archivo.ttf", weight: "100 900" },
  { family: "Archivo Black", file: "ArchivoBlack-Regular.ttf" },
  { family: "Bebas Neue", file: "BebasNeue-Regular.ttf" },
  { family: "Courier Prime", file: "CourierPrime-Regular.ttf", weight: "400" },
  { family: "Courier Prime", file: "CourierPrime-Bold.ttf", weight: "700" },
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

/** Archivos JS que necesita una composición (el kit siempre va). */
export function libFiles(libs: Composition["libs"] = []): string[] {
  const out = ["gsap.min.js", ...GSAP_PLUGINS.map((p) => `${p}.min.js`)];
  if (libs?.includes("d3") || libs?.includes("map")) out.push("d3.min.js", "topojson-client.min.js");
  if (libs?.includes("map")) out.push("world-50m.js");
  return out;
}

/** Quita el prefijo de ruta extendida de Windows (\\?\C:\… o \\?\UNC\…). */
export function plainPath(path: string): string {
  return path.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/, "").replace(/^\/\/\?\//, "");
}

/** Ruta local → URL file:// (Windows y POSIX, con espacios y acentos). */
export function fileUrlOf(path: string): string {
  const p = plainPath(path).replace(/\\/g, "/");
  const enc = p.split("/").map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join("/");
  return /^[A-Za-z]:/.test(p) ? `file:///${enc}` : `file://${enc.startsWith("/") ? "" : "/"}${enc}`;
}

/** Arnés: registro del timeline, búsqueda determinista de t y utilidades. */
export const HARNESS = String.raw`
(function(){
  var seed = 1234567;
  Math.random = function(){ seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  var A = window.ATRIL = window.ATRIL || {};
  A.errors = []; A.ready = false; A.tl = null; A.renderFn = null; A.renders = []; A.duration = A.duration || 0;
  window.addEventListener('error', function(e){ A.errors.push(String(e.message || e) + (e.lineno ? ' (línea ' + e.lineno + ')' : '')); });
  A.register = function(tl, duration){ if (tl && tl.pause) tl.pause(0); A.tl = tl; if (duration) A.duration = duration; else if (tl && tl.duration) A.duration = A.duration || tl.duration(); A.ready = true; };
  A.onRender = function(fn, duration){ A.renderFn = fn; if (duration) A.duration = duration; A.ready = true; };
  /** Función que se llama en cada cuadro con el tiempo t (después del timeline). */
  A.addRender = function(fn){ A.renders.push(fn); };
  A.seek = function(t){
    if (A.tl) A.tl.seek(t, false);
    if (A.renderFn) A.renderFn(t);
    for (var i = 0; i < A.renders.length; i++) { try { A.renders[i](t); } catch(e) { if (A.errors.length < 20) A.errors.push('render: ' + (e && e.message || e)); } }
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
    while ((el.scrollWidth > maxW + 1 || el.scrollHeight > maxH + 1 || el.offsetWidth > maxW + 1) && cs > minPx) { cs -= 2; el.style.fontSize = cs + 'px'; }
  };
  A.isReady = function(){
    if (!A.ready) return false;
    var imgs = document.images; for (var i = 0; i < imgs.length; i++) if (!imgs[i].complete) return false;
    return document.fonts ? document.fonts.status === 'loaded' : true;
  };
})();
`;

/** Expresión que comprueba que las bibliotecas cargaron (si no, el fallo es del motor, no del código de Opus). */
export const LIBS_CHECK = "JSON.stringify({gsap: typeof gsap !== 'undefined', split: typeof SplitText !== 'undefined', kit: !!(window.K && window.ATRIL && ATRIL.kit)})";

export interface PageOpts {
  width: number; height: number;
  /** Código de cada biblioteca (nombre de archivo → contenido); se inserta en la página. */
  code: Record<string, string>;
  /** Carpeta de fuentes como URL (relativa a la página, p. ej. "../_kit/fonts/", o file:///…). */
  fontBase: string;
}

const scriptTag = (code: string) => `<script>${code.replace(/<\/script/gi, "<\\/script")}</script>`;

/** Página completa lista para abrir en el navegador sin ventana. */
export function buildPage(c: Composition, o: PageOpts): string {
  const base = o.fontBase.endsWith("/") ? o.fontBase : o.fontBase + "/";
  const fonts = FONT_FILES.map((f) =>
    `@font-face{font-family:"${f.family}";src:url("${base}${encodeURIComponent(f.file)}") format("truetype");font-weight:${f.weight ?? "400"};font-style:${f.style ?? "normal"};font-display:block}`).join("\n");
  const assets = Object.fromEntries(Object.entries(c.assets ?? {}).map(([k, p]) => [k, /^(https?|file|data):/.test(p) ? p : fileUrlOf(p)]));
  const need = (f: string) => { const x = o.code[f]; if (x == null) throw new Error(`Falta la biblioteca ${f}`); return x; };
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${(c.title ?? c.id).replace(/</g, "")}</title>
<style>
${fonts}
html,body{margin:0;padding:0;width:${o.width}px;height:${o.height}px;overflow:hidden;background:${c.transparent ? "transparent" : "#000"};}
*{box-sizing:border-box;-webkit-font-smoothing:antialiased;}
#stage{position:relative;width:${o.width}px;height:${o.height}px;overflow:hidden;}
</style>
<style>${o.code["kit.css"] ?? ""}</style>
<style>
${c.css}
</style>
${libFiles(c.libs).map((f) => scriptTag(need(f))).join("\n")}
<script>window.ATRIL={duration:${Number(c.duration) || 5},transparent:${c.transparent ? "true" : "false"},assets:${JSON.stringify(assets)},palette:${JSON.stringify(c.palette ?? {})},icons:${JSON.stringify(c.icons ?? {}).replace(/<\//g, "<\\/")}};</script>
${scriptTag(HARNESS)}
<script>try{gsap.registerPlugin(${GSAP_PLUGINS.filter((p) => p !== "EasePack").map((p) => `window.${p}`).join(",")});}catch(e){ATRIL.errors.push("Plugins: "+e.message);}</script>
${o.code["kit.js"] ? scriptTag(o.code["kit.js"]) : ""}
</head><body><div id="stage">
${c.html}
</div>
<script>
var __fl = ${JSON.stringify(FONT_FILES.map((f) => `${f.style === "italic" ? "italic " : ""}${(f.weight ?? "400").split(" ").pop()} 40px "${f.family}"`))};
Promise.all(__fl.map(function(f){ return document.fonts.load(f).catch(function(){}); })).then(function(){ return document.fonts.ready; }).then(function(){
try {
if (window.K) K.theme(ATRIL.palette || {});
${c.js}
} catch (e) { ATRIL.errors.push(String(e && e.message || e) + (e && e.stack ? ' :: ' + String(e.stack).split('\\n')[1] : '')); }
});
</script>
</body></html>`;
}
