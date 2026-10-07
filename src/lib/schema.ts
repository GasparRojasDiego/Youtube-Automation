// Esquema SQLite y migraciones. Cada migración se aplica una sola vez.
import { db } from "./ipc";
import { skillKindOf, KIND_SCOPES } from "./skills";

const MIGRATIONS: string[] = [
  // 1 — esquema inicial
  `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
    language TEXT DEFAULT 'en-US', settings TEXT DEFAULT '{}',
    created_at INTEGER, archived INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY, channel_id TEXT, name TEXT NOT NULL, description TEXT DEFAULT '',
    scopes TEXT DEFAULT '["all"]', content TEXT DEFAULT '', enabled INTEGER DEFAULT 1,
    version INTEGER DEFAULT 1, created_at INTEGER, updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS skill_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, skill_id TEXT, version INTEGER, content TEXT,
    note TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS creators (
    id TEXT PRIMARY KEY, channel_id TEXT, name TEXT, url TEXT, yt_channel_id TEXT,
    weight INTEGER DEFAULT 1, notes TEXT DEFAULT '', notebook_md TEXT DEFAULT '',
    profile_md TEXT DEFAULT '', profile_json TEXT, analyzed_at INTEGER, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS creator_videos (
    id TEXT PRIMARY KEY, creator_id TEXT, title TEXT, published_at TEXT, duration_s INTEGER,
    views INTEGER, likes INTEGER, comments INTEGER, thumb_url TEXT, fetched_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY, channel_id TEXT, title TEXT NOT NULL, angle TEXT DEFAULT '',
    notes TEXT DEFAULT '', potential TEXT DEFAULT '{}', risk TEXT DEFAULT '{}', score REAL DEFAULT 0,
    status TEXT DEFAULT 'candidate', origin TEXT DEFAULT 'user', position INTEGER DEFAULT 0,
    sources TEXT DEFAULT '[]', created_at INTEGER, used_video_id TEXT
  );
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY, channel_id TEXT, topic_id TEXT, title TEXT, mode TEXT DEFAULT 'standard',
    voice_mode TEXT DEFAULT 'ai', status TEXT DEFAULT 'active', stage TEXT, dir TEXT,
    created_at INTEGER, updated_at INTEGER, scheduled_at INTEGER, published_at INTEGER,
    youtube_id TEXT, upload_session TEXT, data TEXT DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS stages (
    video_id TEXT, stage TEXT, status TEXT DEFAULT 'pending', attempt INTEGER DEFAULT 0,
    output TEXT, error TEXT, started_at INTEGER, finished_at INTEGER, progress TEXT,
    PRIMARY KEY (video_id, stage)
  );
  CREATE TABLE IF NOT EXISTS artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT, kind TEXT, version INTEGER,
    json TEXT, note TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT, stage TEXT, decision TEXT,
    notes TEXT, seconds INTEGER DEFAULT 0, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT, channel_id TEXT, provider TEXT,
    item TEXT, units REAL DEFAULT 0, usd REAL DEFAULT 0, api_equiv_usd REAL DEFAULT 0, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, level TEXT, source TEXT,
    message TEXT, detail TEXT, video_id TEXT, read INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS vocab (
    id TEXT PRIMARY KEY, term TEXT UNIQUE, meaning_es TEXT, example_en TEXT, note TEXT,
    video_id TEXT, due INTEGER, interval_d REAL DEFAULT 0, ease REAL DEFAULT 2.5,
    reps INTEGER DEFAULT 0, lapses INTEGER DEFAULT 0, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS metrics (
    video_id TEXT, day TEXT, views INTEGER, minutes REAL, avg_view_s REAL, avg_pct REAL,
    impressions INTEGER, ctr REAL, subs INTEGER, PRIMARY KEY (video_id, day)
  );
  CREATE TABLE IF NOT EXISTS retention (video_id TEXT PRIMARY KEY, curve TEXT, fetched_at INTEGER);
  CREATE TABLE IF NOT EXISTS proposals (
    id TEXT PRIMARY KEY, channel_id TEXT, skill_id TEXT, skill_name TEXT, title TEXT,
    rationale TEXT, evidence TEXT, new_content TEXT, status TEXT DEFAULT 'pending', created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS music (
    id TEXT PRIMARY KEY, title TEXT, artist TEXT, path TEXT, license TEXT, attribution TEXT,
    duration_s REAL, mood TEXT DEFAULT '', enabled INTEGER DEFAULT 1, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_costs_created ON costs(created_at);
  CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
  CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos(channel_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_topics_channel ON topics(channel_id, status, position);
  `,
  // 2 — biblioteca de medios, uso de Claude y APIs, actividad en vivo
  `
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, source TEXT NOT NULL, source_id TEXT NOT NULL,
    url TEXT, page_url TEXT, title TEXT DEFAULT '', author TEXT DEFAULT '', license TEXT DEFAULT '',
    license_url TEXT DEFAULT '', attribution TEXT DEFAULT '', path TEXT, thumb TEXT,
    width INTEGER, height INTEGER, duration REAL, bytes INTEGER, sha TEXT, query TEXT DEFAULT '',
    description TEXT DEFAULT '', tags TEXT DEFAULT '', mood TEXT DEFAULT '', quality INTEGER DEFAULT 0,
    real_person INTEGER DEFAULT 0, usable INTEGER DEFAULT 1, issues TEXT DEFAULT '',
    described_at INTEGER, created_at INTEGER, used_count INTEGER DEFAULT 0, last_used INTEGER,
    favorite INTEGER DEFAULT 0, UNIQUE(source, source_id)
  );
  CREATE INDEX IF NOT EXISTS idx_assets_kind ON assets(kind, created_at);
  CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(asset_id UNINDEXED, title, description, tags, query, tokenize='unicode61 remove_diacritics 2');
  CREATE TABLE IF NOT EXISTS api_calls (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT, ts INTEGER, ok INTEGER, note TEXT);
  CREATE INDEX IF NOT EXISTS idx_api_calls ON api_calls(provider, ts);
  CREATE TABLE IF NOT EXISTS activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT, video_id TEXT, ts INTEGER, stage TEXT, kind TEXT,
    title TEXT, detail TEXT, thumb TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_activity ON activity(video_id, id);
  CREATE TABLE IF NOT EXISTS claude_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, video_id TEXT, stage TEXT, label TEXT, model TEXT,
    input_tokens INTEGER DEFAULT 0, cache_read INTEGER DEFAULT 0, cache_write INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0, web_searches INTEGER DEFAULT 0, api_equiv REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0, five_hour REAL, seven_day REAL, five_hour_before REAL, seven_day_before REAL, ok INTEGER DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_claude_runs ON claude_runs(ts);
  `,
  // 3 — se quitan inglés, métricas y lectura pública de YouTube; referentes con interruptor
  `
  DROP TABLE IF EXISTS vocab;
  DROP TABLE IF EXISTS metrics;
  DROP TABLE IF EXISTS retention;
  DROP TABLE IF EXISTS proposals;
  DROP TABLE IF EXISTS creator_videos;
  ALTER TABLE creators ADD COLUMN enabled INTEGER DEFAULT 1;
  `,
];

export async function migrate(): Promise<void> {
  await db.script("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);");
  const rows = await db.query<{ value: string }>("SELECT value FROM meta WHERE key='schema_version'");
  let v = rows.length ? Number(rows[0].value) : 0;
  while (v < MIGRATIONS.length) {
    await db.script(`BEGIN; ${MIGRATIONS[v]} INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version','${v + 1}'); COMMIT;`);
    v++;
    if (v === 3) await afterV3();
  }
}

/** Datos de la 2.0: referentes analizados → puntos fuertes; habilidades → dos tipos. */
async function afterV3() {
  const creators = await db.query<{ id: string; notes: string; profile_json: string | null }>("SELECT id, notes, profile_json FROM creators");
  for (const c of creators) {
    if (c.notes?.trim() || !c.profile_json) continue;
    try {
      const p = JSON.parse(c.profile_json);
      const pts: string[] = [...(p.principles_es ?? []), ...(p.hook_patterns_es ?? []).slice(0, 3)];
      if (pts.length) await db.execute("UPDATE creators SET notes=? WHERE id=?", [pts.map((x) => `- ${x}`).join("\n"), c.id]);
    } catch { /* perfil ilegible */ }
  }
  // La habilidad de ejemplo de la 1.0 (sin tocar) ya no sirve
  await db.execute("DELETE FROM skills WHERE name='Ejemplo de formato (desactivada)' AND enabled=0 AND version=1");
  const skills = await db.query<{ id: string; scopes: string }>("SELECT id, scopes FROM skills");
  for (const sk of skills) {
    let scopes: string[] = [];
    try { scopes = JSON.parse(sk.scopes); } catch { /* noop */ }
    const kind = skillKindOf(scopes);
    await db.execute("UPDATE skills SET scopes=? WHERE id=?", [JSON.stringify(KIND_SCOPES[kind]), sk.id]);
  }
}
