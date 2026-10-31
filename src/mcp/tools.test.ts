import { describe, it, expect, vi, beforeAll } from "vitest";
import * as nfs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

vi.mock("../lib/ipc", () => import("../../e2e/node-ipc"));
// La producción no arranca en la prueba: solo se comprueba que se pidió
const started: string[] = [];
vi.mock("../pipeline/runner", async (orig) => ({ ...(await orig<typeof import("../pipeline/runner")>()), runVideo: (id: string) => { started.push(id); },
  rerenderFrom: async (id: string, stage: string) => { started.push(`${id}:${stage}`); }, redoVoiceSegment: async (id: string, seg: string) => { started.push(`${id}:${seg}`); } }));
const ipc = await import("../../e2e/node-ipc");
const { SPEC } = await import("./host");
const { handleRpc } = await import("./protocol");

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });
const dir = nfs.mkdtempSync(path.join(os.tmpdir(), "atril-mcp-"));
const ff = (...a: string[]) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
let n = 0;
async function tool(name: string, args: Record<string, unknown> = {}) {
  const r = await handleRpc(SPEC, JSON.stringify({ jsonrpc: "2.0", id: ++n, method: "tools/call", params: { name, arguments: args } }));
  const res = JSON.parse(r.body).result;
  const text = res.content[0].text as string;
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* texto */ }
  return { error: !!res.isError, data, text };
}

beforeAll(async () => {
  ipc.openDb(path.join(dir, "atril.db"));
  ipc.setPaths({ data: path.join(dir, "data"), exe_dir: dir, resources: path.resolve(__dirname, "../../src-tauri"), home: dir, documents: dir, downloads: path.join(dir, "descargas") });
  await (await import("../lib/schema")).migrate();
  const { loadSettings, saveSettings } = await import("../lib/settings");
  await loadSettings();
  await saveSettings((s) => ({ ...s, media: { ...s.media, libraryDir: path.join(dir, "Biblioteca") } }));
  await (await import("../lib/repo")).createChannel("Canal de prueba");
});

describe("herramientas MCP de ATRIL (contra la app real, sin ventana)", () => {
  it("lista de herramientas estable, con esquemas y anotaciones", async () => {
    const r = JSON.parse((await handleRpc(SPEC, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }))).body).result.tools;
    expect(r.map((t: any) => t.name)).toEqual(["atril_status", "atril_guide", "atril_show", "atril_appearance", "video_create", "video_list", "video_get", "video_action", "queue_list", "queue_add", "queue_action",
      "campaign", "library_overview", "library_list", "library_update", "library_delete", "library_search_web", "library_import", "library_organize", "topics", "instructions"]);
    expect(r.find((t: any) => t.name === "library_delete").annotations.destructiveHint).toBe(true);
    expect(JSON.stringify(r).length).toBeLessThan(26_000);   // lo que cuesta en el contexto de cada chat
  });

  it("estado y guía", async () => {
    const st = await tool("atril_status");
    expect(st.error).toBe(false);
    expect(st.data).toMatchObject({ channel: "Canal de prueba", queue: { running: false } });
    expect(st.data.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect((await tool("atril_guide", { topic: "aesthetics" })).text).toMatch(/estética/i);
    expect((await tool("atril_guide", { topic: "pieces" })).text).toMatch(/\*\*title\*\*/);
    expect((await tool("atril_guide", { topic: "effects" })).text.length).toBeGreaterThan(500);
    expect((await tool("atril_guide", { topic: "voices" })).text).toMatch(/Kore/);
    expect((await tool("atril_guide", { topic: "nada" })).error).toBe(true);
  });

  it("crea un video personal directo (y arranca su producción) y otro en la cola", async () => {
    const bad = await tool("video_create", { mode: "personal", platform: "youtube", show: false });
    expect(bad.error).toBe(true);
    expect(bad.text).toMatch(/Describe el video/);
    const v = await tool("video_create", { mode: "personal", platform: "youtube", title: "La fotosíntesis", about: "Cómo las plantas fabrican su alimento.", script: "La luz se vuelve azúcar.",
      aesthetic: "Fondo blanco, acento verde, cortes suaves.", colors: { accent: "#22AA55" }, font: "Inter", duration_s: [60, 75], language: "es", voice: "Kore", show: false });
    expect(v.error).toBe(false);
    expect(v.data).toMatchObject({ title: "La fotosíntesis", platform: "youtube", mode: "personal", target_s: [60, 75] });
    expect(started).toContain(v.data.video_id);
    const { activity } = await import("../lib/activity");
    await activity(v.data.video_id, "script", "decision", "Guion propio recibido");
    const g = await tool("video_get", { id: v.data.video_id, include: ["stages", "files", "plan", "activity"] });
    expect(g.data.activity.at(-1)).toMatchObject({ stage: "script", title: "Guion propio recibido" });
    expect(g.data.activity.at(-1).at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(g.data.stages.length).toBeGreaterThan(5);
    expect(g.data.state).toBe("paused");
    const { getVideo } = await import("../lib/repo");
    const saved = (await getVideo(v.data.video_id))!;
    expect(saved.data).toMatchObject({ origin: "mcp", voice: "es-US-Chirp3-HD-Kore" });
    expect(saved.data.personal).toMatchObject({ aesthetic: "Fondo blanco, acento verde, cortes suaves.", font: "Inter", minutesRange: [1, 1.25], palette: { accent: "#22aa55" } });
    // En la lista y por número
    const list = await tool("video_list", { platform: "youtube" });
    expect(list.data.videos[0]).toMatchObject({ id: v.data.video_id, n: 1, mode: "personal" });
    expect((await tool("video_get", { id: "#1" })).data.id).toBe(v.data.video_id);
    // Acciones con guardas
    expect((await tool("video_action", { id: v.data.video_id, action: "accept" })).text).toMatch(/revisión final/);
    expect((await tool("video_action", { id: v.data.video_id, action: "delete" })).text).toMatch(/confirm:true/);
    // En la cola, vertical, con duración en segundos exacta
    const q = await tool("video_create", { mode: "personal", platform: "tiktok", title: "Nueve megas", script: "Nueve megas.", duration_s: [20, 30], queue: true });
    expect(q.data).toMatchObject({ queued: true, problems: [] });
    const ql = await tool("queue_list", { platform: "tiktok" });
    expect(ql.data.items[0]).toMatchObject({ id: q.data.item_id, title: "Nueve megas", platform: "tiktok", status: "pending" });
    expect((await tool("video_action", { id: v.data.video_id, action: "delete", confirm: true })).data).toEqual({ deleted: v.data.video_id });
  });

  it("campañas: plantilla una vez y tarjetas que solo traen lo propio", async () => {
    const c = await tool("campaign", { action: "create", name: "Frame", mode: "personal", platform: "tiktok", template: { duration_s: [30, 45], tone: "llamativo", voice: "Puck", aesthetic: "Negro y azul" } });
    expect(c.error).toBe(false);
    const add = await tool("queue_add", { mode: "personal", platform: "tiktok", campaign: "Frame", cards: [{ title: "Uno", script: "Hola." }, { title: "Dos", script: "Chao.", duration_s: 20 }] });
    expect(add.data.created).toBe(2);
    const { getItem } = await import("../pipeline/queue");
    const one = (await getItem(add.data.item_ids[0]))!;
    expect(one.cfg).toMatchObject({ title: "Uno", tone: "llamativo", voice: "es-US-Chirp3-HD-Puck", aesthetic: "Negro y azul", minutes: [0.5, 0.75], format: "9:16" });
    expect(one.overrides.sort()).toEqual(["script", "title"]);
    expect((await getItem(add.data.item_ids[1]))!.overrides).toContain("minutes");
    const up = await tool("campaign", { action: "update", id: c.data.created, template: { aesthetic: "Blanco" } });
    expect(up.data.changed).toEqual(["aesthetic"]);
    expect((await getItem(add.data.item_ids[0]))!.cfg).toMatchObject({ aesthetic: "Blanco" });
    expect((await tool("queue_add", { campaign: "No existe", cards: [{ title: "x" }] })).error).toBe(true);
    // Control de la cola
    expect((await tool("queue_action", { action: "skip", item_id: add.data.item_ids[1] })).error).toBe(false);
    expect((await tool("queue_action", { action: "remove" })).text).toMatch(/item_id/);
  });

  it("biblioteca: importa carpetas (efecto o música según duración y nombre), evita duplicados por contenido, edita y ordena", async () => {
    const src = path.join(dir, "descargas-de-claude");
    nfs.mkdirSync(path.join(src, "sub"), { recursive: true });
    ff("-f", "lavfi", "-i", "color=c=red:s=640x360", "-frames:v", "1", path.join(src, "rojo.png"));
    ff("-f", "lavfi", "-i", "sine=f=900:d=1.5", path.join(src, "sub", "pop.wav"));
    ff("-f", "lavfi", "-i", "sine=f=300:d=24", path.join(src, "fondo-lofi.wav"));
    nfs.copyFileSync(path.join(src, "rojo.png"), path.join(src, "sub", "rojo copia.png"));   // mismo contenido, otro nombre
    expect((await tool("library_import", { paths: [src] })).text).toMatch(/license/);
    const imp = await tool("library_import", { paths: [src], license: "Material de prueba (propio)", describe: false });
    expect(imp.error).toBe(false);
    expect(imp.data).toMatchObject({ imported: 3, duplicates: 1 });
    const sfx = await tool("library_list", { kind: "sfx" });
    expect(sfx.data.assets.map((x: any) => x.title)).toEqual(["pop"]);
    const music = await tool("library_list", { kind: "music" });
    expect(music.data.assets.map((x: any) => x.title)).toEqual(["fondo-lofi"]);
    const img = (await tool("library_list", { kind: "image", detail: "full" })).data.assets[0];
    expect(img).toMatchObject({ scope: "auto", dims: "640x360", license: "Material de prueba (propio)" });
    const up = await tool("library_update", { items: [{ id: img.id, tags: ["Rojo", "rojo ", "fondo"], favorite: true, scope: "personal" }] });
    expect(up.data.updated).toBe(1);
    expect((await tool("library_list", { ids: [img.id] })).data[0]).toMatchObject({ fav: true, scope: "personal" });
    // Un duplicado viejo (huella antigua por ruta): ordenar calcula la huella y lo encuentra
    const { db } = ipc;
    const pop = sfx.data.assets[0];
    const row = (await db.query("SELECT * FROM assets WHERE id=?", [pop.id]))[0];
    const copy = path.join(dir, "Biblioteca", "Efectos", "pop-duplicado.wav");
    nfs.copyFileSync(row.path, copy);
    await db.execute("INSERT INTO assets(id,kind,source,source_id,title,author,license,path,sha,created_at,usable,used_count) VALUES('as_dup','sfx','user','viejo','pop (2)','Propio','x',?,'abc',?,1,0)", [copy, Date.now()]);
    await db.execute("INSERT INTO assets(id,kind,source,source_id,title,author,license,path,created_at,usable) VALUES('as_gone','image','user','g','perdido','Propio','x',?,?,1)", [path.join(dir, "no-existe.png"), Date.now()]);
    const ov = await tool("library_overview");
    expect(ov.data).toMatchObject({ missing_files: 1 });
    const plan = await tool("library_organize", { describe: false });
    expect(plan.data).toMatchObject({ dry_run: true, duplicates: { removable: 1, ids: ["as_dup"] }, missing_files: { count: 1, ids: ["as_gone"] } });
    expect((await db.query("SELECT COUNT(*) n FROM assets"))[0].n).toBe(5);
    const done = await tool("library_organize", { apply: true, describe: false });
    expect(done.data.dry_run).toBe(false);
    expect((await db.query("SELECT id FROM assets ORDER BY id")).map((r: any) => r.id)).not.toContain("as_dup");
    expect(nfs.existsSync(copy)).toBe(false);
    // Borrar exige confirmación y protege lo ya usado
    expect((await tool("library_delete", { ids: [img.id], confirm: false })).error).toBe(true);
    await db.execute("UPDATE assets SET used_count=2 WHERE id=?", [img.id]);
    expect((await tool("library_delete", { ids: [img.id], confirm: true })).data).toMatchObject({ deleted: 0, kept_used: [img.id] });
  });

  it("apariencia: consulta y cambia el tema y el color de la app", async () => {
    expect((await tool("atril_appearance")).data).toMatchObject({ theme: "system", accent: "blue", accent_name: "Azul" });
    const r = await tool("atril_appearance", { theme: "light", accent: "teal" });
    expect(r.data).toMatchObject({ theme: "light", accent: "teal", accent_name: "Turquesa" });
    expect(r.data.accents).toHaveLength(6);
    expect((await tool("atril_appearance", { accent: "rojo" })).error).toBe(true);   // solo los colores de la app
    const { getSettings } = await import("../lib/settings");
    expect(getSettings()).toMatchObject({ theme: "light", accent: "teal" });
    await tool("atril_appearance", { theme: "system", accent: "blue" });
  });

  it("instrucciones y temas", async () => {
    const c = await tool("instructions", { action: "create", name: "Estilo de prueba", content: "# Estilo\nFrases cortas." });
    expect(c.error).toBe(false);
    const list = await tool("instructions", { action: "list" });
    expect(list.data.map((x: any) => x.name)).toContain("Estilo de prueba");
    const u = await tool("instructions", { action: "update", id: c.data.created, content: "# Estilo\nFrases muy cortas." });
    expect(u.data.version).toBeGreaterThan(1);
    expect((await tool("topics", { action: "list" })).data).toEqual([]);
    expect((await tool("topics", { action: "approve" })).text).toMatch(/id/);
  });

  it("el resto de acciones responde con datos o con un aviso claro, nunca con un error interno", async () => {
    const v = await tool("video_create", { mode: "personal", platform: "youtube", title: "Acciones", script: "Hola.", show: false });
    const id = v.data.video_id as string;
    const all = await tool("video_get", { id, include: ["stages", "files", "package", "plan", "script", "activity", "revisions"] });
    expect(all.error).toBe(false);
    expect(all.data).toMatchObject({ package: null, plan: null, script: null, revisions: [] });
    started.length = 0;
    expect((await tool("video_action", { id, action: "continue" })).data).toEqual({ continued: id });
    expect((await tool("video_action", { id, action: "redo_from", stage: "voice" })).data).toEqual({ redoing_from: "voice" });
    expect((await tool("video_action", { id, action: "redo_voice_segment", segment_id: "s1" })).data).toEqual({ redoing_voice: "s1" });
    expect(started).toEqual([id, `${id}:voice`, `${id}:s1`]);
    for (const [args, msg] of [[{ action: "redo_from" }, /necesita stage/], [{ action: "redo_voice_segment" }, /segment_id/], [{ action: "cancel" }, /no está en producción/],
      [{ action: "request_changes", text: "Más corto" }, /revisión final/], [{ action: "download" }, /video final/]] as const) {
      const r = await tool("video_action", { id, ...args });
      expect(r.error).toBe(true);
      expect(r.text).toMatch(msg);
    }
    // Recortar corre en segundo plano: su fallo aparece en el estado con el mismo aviso
    const job = (await tool("video_action", { id, action: "cut_tiktok" })).data.job;
    const jobOf = async () => (await tool("atril_status")).data.jobs.find((j: any) => j.id === job);
    await vi.waitFor(async () => expect((await jobOf()).status).toBe("error"));
    expect((await jobOf()).error).toMatch(/video final/);
    expect((await tool("atril_show", { page: "video", video_id: id })).error).toBe(false);
    expect((await tool("atril_show", { page: "biblioteca" })).error).toBe(false);
    expect((await tool("video_action", { id, action: "reject", reason: "Prueba" })).data).toEqual({ rejected: id });
    expect((await (await import("../lib/repo")).getVideo(id))!.status).toBe("rejected");
    // Cola: mover, reintentar, pausar, detener y limpiar por plataforma
    const items = (await tool("queue_list", { platform: "tiktok" })).data.items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (const action of ["move_down", "move_up", "retry"]) expect((await tool("queue_action", { action, item_id: items[0].id })).error).toBe(false);
    for (const action of ["pause", "stop", "clear_finished"]) expect((await tool("queue_action", { action, platform: "tiktok" })).data).toMatchObject({ done: action, running: false });
    expect((await tool("queue_action", { action: "retry", item_id: "q_nada" })).text).toMatch(/No existe la tarjeta/);
    // Campañas: listar y borrar (sus tarjetas quedan sueltas)
    const frame = (await tool("campaign", { action: "list" })).data.find((c: any) => c.name === "Frame");
    expect(frame).toBeTruthy();
    expect((await tool("campaign", { action: "delete", id: frame.id })).data).toEqual({ deleted: frame.id });
    const loose = (await tool("queue_list", { platform: "tiktok" })).data.items.find((i: any) => i.title === "Uno");
    expect(loose).toBeTruthy();
    expect(loose.campaign).toBeUndefined();
    // Biblioteca: todos los filtros, búsqueda por significado con páginas y catálogo
    for (const args of [{ status: "unused" }, { orientation: "landscape" }, { min_quality: 3 }, { source: "user" }, { favorites: true }, { sort: "size" }, { sort: "used", scope: "personal" }, { q: "pop" }])
      expect((await tool("library_list", args)).error).toBe(false);
    const p1 = (await tool("library_list", { q: "pop fondo lofi", limit: 1 })).data.assets;
    const p2 = (await tool("library_list", { q: "pop fondo lofi", limit: 1, offset: 1 })).data.assets;
    expect(p1.length).toBe(1);
    expect(p2.length).toBe(1);
    expect(p2[0].id).not.toBe(p1[0].id);
    const cat = await tool("library_organize", { dedupe: false, missing: false, tags: false, describe: false, catalog: true });
    expect(nfs.existsSync(cat.data.catalog)).toBe(true);
    expect((await tool("library_delete", { ids: ["as_nada"], confirm: true })).data).toMatchObject({ deleted: 0, not_found: ["as_nada"] });
    // Temas e instrucciones: con id real y con uno que no existe
    const { addTopic, activeChannel } = await import("../lib/repo");
    const tp = await addTopic({ channel_id: (await activeChannel())!.id, title: "La Luna", status: "candidate" });
    expect((await tool("topics", { action: "approve", id: tp })).data).toEqual({ done: "approve", id: tp });
    expect((await tool("topics", { action: "list", status: "approved" })).data.map((t: any) => t.id)).toEqual([tp]);
    expect((await tool("topics", { action: "delete", id: tp })).error).toBe(false);
    expect((await tool("topics", { action: "reject", id: tp })).text).toMatch(/No existe el tema/);
    const skill = (await tool("instructions", { action: "list" })).data[0];
    expect((await tool("instructions", { action: "get", id: skill.id })).data.content.length).toBeGreaterThan(0);
    expect((await tool("instructions", { action: "get", id: "sk_nada" })).text).toMatch(/No existe la instrucción/);
    expect((await tool("video_action", { id, action: "delete", confirm: true })).data).toEqual({ deleted: id });
  });

  it("paquete de Claude Desktop (.mcpb): zip válido con manifiesto 0.3 y el puente", async () => {
    const { buildMcpb } = await import("./host");
    const file = await buildMcpb();
    expect(path.basename(file)).toBe("ATRIL.mcpb");
    const listing = execFileSync("python3", ["-c", "import zipfile,sys,json; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({'n': z.namelist(), 'm': json.loads(z.read('manifest.json')), 'b': z.read('server/index.js').decode()[:400], 'ok': z.testzip() is None}))", file]).toString();
    const info = JSON.parse(listing);
    expect(info.ok).toBe(true);
    expect(info.n).toEqual(["manifest.json", "server/index.js", "icon.png"]);
    expect(info.m).toMatchObject({ manifest_version: "0.3", name: "atril", server: { type: "node", entry_point: "server/index.js", mcp_config: { command: "node", args: ["${__dirname}/server/index.js"] } } });
    expect(info.m.server.mcp_config.env.ATRIL_MCP_FILE).toBe(path.join(dir, "data", "mcp.json"));
    expect(info.m.tools.length).toBe(21);
    expect(info.b).not.toContain("__ATRIL_VERSION__");
  });
});
