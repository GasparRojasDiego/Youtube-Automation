import React from "react";
import ReactDOM from "react-dom/client";
// Fuentes para las tarjetas y miniaturas que se dibujan en la app (la interfaz usa la tipografía del sistema)
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import "@fontsource/anton/400.css";
import "@fontsource/archivo/500.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
import "@fontsource/archivo/900.css";
import "@fontsource/courier-prime/400.css";
import "@fontsource/courier-prime/700.css";
import "@fontsource/oswald/400.css";
import "@fontsource/oswald/600.css";
import "@fontsource/oswald/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/400-italic.css";
import "@fontsource/source-serif-4/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import "./styles/index.css";
import App from "./App";
import { migrate } from "./lib/schema";
import { loadSettings, saveSettings, isDark } from "./lib/settings";
import { appPaths } from "./lib/ipc";
import { recoverOnStartup } from "./pipeline/runner";
import { logError } from "./lib/events";

async function boot() {
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  try {
    await migrate();
    const s = await loadSettings();
    document.documentElement.classList.toggle("dark", isDark(s.theme));
    // Nombre de usuario por defecto: el de la cuenta de Windows (editable en Ajustes)
    if (!s.profile.name) { const n = (await appPaths()).home.split(/[\\/]/).filter(Boolean).pop(); if (n) await saveSettings((x) => ({ ...x, profile: { ...x.profile, name: n } })); }
    root.render(<React.StrictMode><App /></React.StrictMode>);
    await recoverOnStartup();
  } catch (e) {
    console.error(e);
    root.render(
      <div style={{ padding: 32, fontFamily: "Poppins, sans-serif" }}>
        <h1 style={{ color: "#7591FF" }}>ATRIL no pudo iniciar</h1>
        <pre style={{ whiteSpace: "pre-wrap" }}>{String((e as Error)?.message ?? e)}</pre>
      </div>,
    );
    void logError(e).catch(() => null);
  }
}

window.addEventListener("unhandledrejection", (ev) => { void logError(ev.reason, null, "Error no controlado"); });
void boot();
