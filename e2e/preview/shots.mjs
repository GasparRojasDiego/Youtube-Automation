// Capturas de cada pantalla. Uso: node e2e/preview/shots.mjs [pantallas…] (con el servidor de vista previa en marcha)
// Playwright puede estar instalado de forma global: PW=/ruta/a/playwright/index.mjs
const { chromium } = await import(process.env.PW ?? "playwright");
const OUT = process.env.SHOTS ?? "/tmp/claude-0/shots";
const pages = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: Number(process.env.H ?? 900) }, deviceScaleFactor: 1, colorScheme: process.env.SCHEME ?? "dark" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
await page.goto("http://localhost:1430/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
for (const p of pages.length ? pages : ["Inicio"]) {
  const [label, action] = p.split(":");
  if (label !== "Inicio" || action) {
    const btn = label === "Ajustes" ? page.locator('aside button[title*="Ajustes"]').first() : page.locator("aside").getByText(label, { exact: true }).first();
    if (await btn.count()) await btn.click(); else { const any = page.getByText(label, { exact: true }).first(); if (await any.count()) await any.click(); }
    await page.waitForTimeout(900);
  }
  if (action) { await page.getByText(action, { exact: false }).first().click(); await page.waitForTimeout(900); }
  await page.screenshot({ path: `${OUT}/${p.replace(/[: ]/g, "_")}.png`, fullPage: true });
}
console.log(errors.length ? errors.join("\n") : "sin errores");
await browser.close();
