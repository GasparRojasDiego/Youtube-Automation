import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
// Fuentes disponibles para las tarjetas y miniaturas de los canales
import "@fontsource/anton/400.css";
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
import { loadSettings } from "./lib/settings";
import { recoverOnStartup } from "./pipeline/runner";
import { purgeStaleCreatorData } from "./pipeline/extras";
import { logError } from "./lib/events";

async function boot() {
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  try {
    await migrate();
    const s = await loadSettings();
    document.documentElement.classList.toggle("dark", s.theme === "dark");
    root.render(<React.StrictMode><App /></React.StrictMode>);
    await purgeStaleCreatorData().catch(() => null);
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
