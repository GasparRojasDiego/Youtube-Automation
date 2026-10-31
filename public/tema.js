// Aplica el tema y el color de ATRIL antes de pintar la ventana (sin destello). Los guarda la app al cambiarlos
// (src/ui/theme.ts). Es un archivo aparte porque la política de seguridad no permite scripts en línea.
(function () {
  try {
    var a = JSON.parse(localStorage.getItem("atril.apariencia") || "{}");
    var t = a.theme || "system";
    var dark = t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    if (a.accent) document.documentElement.setAttribute("data-accent", a.accent);
  } catch (e) { /* sin almacenamiento: queda el tema por defecto hasta cargar los ajustes */ }
})();
