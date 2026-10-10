// La política de contenido y los permisos de la ventana no deben bloquear lo que la app usa.
import { describe, it, expect } from "vitest";
import * as nfs from "node:fs";
import * as path from "node:path";

const conf = JSON.parse(nfs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
const caps = JSON.parse(nfs.readFileSync("src-tauri/capabilities/default.json", "utf8"));
const csp = conf.app.security.csp as Record<string, string>;

describe("configuración de la ventana", () => {
  it("permite conectar con el navegador de animaciones (DevTools por WebSocket local)", () => {
    expect(csp["connect-src"]).toContain("ws://127.0.0.1:*");
  });
  it("muestra las vistas previas remotas de la biblioteca", () => {
    expect(csp["img-src"]).toContain("https:");
    expect(csp["media-src"]).toContain("https:");
  });
  it("sigue sin permitir scripts externos", () => {
    expect(csp["script-src"]).toBe("'self'");
  });
  it("permite las confirmaciones (window.confirm pasa por el plugin de diálogos)", () => {
    expect(caps.permissions).toContain("dialog:allow-confirm");
  });
  it("no usa window.confirm/prompt/alert: en Tauri el plugin de diálogos los rompe (y un «sí» asíncrono se cumplía siempre)", () => {
    const files: string[] = [];
    const walk = (d: string) => { for (const f of nfs.readdirSync(d)) { const p = path.join(d, f); if (nfs.statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !/\.test\.ts$/.test(f)) files.push(p); } };
    walk("src");
    const bad = files.filter((f) => /(^|[^.\w])(window\.)?(confirm|prompt|alert)\(/m.test(nfs.readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
