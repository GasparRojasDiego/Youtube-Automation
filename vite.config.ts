import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Fuentes: solo alfabetos latinos y solo woff2 (WebView2 siempre lo admite); el resto pesaba sin usarse
const latinFonts: Plugin = {
  name: "latin-fonts",
  enforce: "pre",
  transform(code, id) {
    if (!/@fontsource[\\/].+\.css$/.test(id)) return;
    return code.replace(/\/\* ([\w-]+) \*\/\s*@font-face\s*{[^}]*}\s*/g, (b, name) => (/-latin(-ext)?-\d+-(normal|italic)$/.test(name) ? b : ""))
      .replace(/,\s*url\([^)]+\.woff\) format\('woff'\)/g, "");
  },
};

export default defineConfig({
  plugins: [react(), latinFonts],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 2000 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
} as any);
