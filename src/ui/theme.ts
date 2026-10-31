// Apariencia de ATRIL, como en Frame y Wire: tema (claro «arena», oscuro grafito o el del equipo) y color de acento.
// Los colores viven en src/styles/index.css ([data-accent] en <html>); aquí solo se eligen, se nombran y se aplican.
export type Theme = "system" | "dark" | "light";

/** Acentos: los cinco de Wire y turquesa. `light` y `dark` son el color principal en cada tema (el de las muestras). */
export const ACCENTS = [
  { id: "blue", name: "Azul", light: "228 88% 59%", dark: "228 100% 73%" },
  { id: "violet", name: "Violeta", light: "258 78% 58%", dark: "258 100% 76%" },
  { id: "green", name: "Verde", light: "152 60% 30.5%", dark: "152 55% 52%" },
  { id: "orange", name: "Naranja", light: "20 88% 39.5%", dark: "26 95% 62%" },
  { id: "pink", name: "Rosa", light: "332 75% 47%", dark: "332 90% 72%" },
  { id: "teal", name: "Turquesa", light: "186 80% 29%", dark: "186 70% 55%" },
] as const;
export type AccentId = (typeof ACCENTS)[number]["id"];
export const ACCENT_IDS = ACCENTS.map((a) => a.id) as AccentId[];
export const isAccent = (x: unknown): x is AccentId => ACCENT_IDS.includes(x as AccentId);
export const accentName = (id: AccentId) => ACCENTS.find((a) => a.id === id)?.name ?? "Azul";

/** Lo lee public/tema.js antes de pintar la ventana: así no hay un destello del tema o el color por defecto. */
export const APPEARANCE_KEY = "atril.apariencia";

export const resolveDark = (theme: Theme) => theme === "dark" || (theme === "system" && typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);

export function applyAppearance(theme: Theme, accent: AccentId) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolveDark(theme));
  root.dataset.accent = isAccent(accent) ? accent : "blue";
  try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ theme, accent })); } catch { /* sin almacenamiento: solo se pierde el arranque sin destello */ }
}
