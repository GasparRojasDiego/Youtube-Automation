// Esquema SQLite y migraciones. Cada migración se aplica una sola vez.
import { db } from "./ipc";

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
];

export async function migrate(): Promise<void> {
  await db.script("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);");
  const rows = await db.query<{ value: string }>("SELECT value FROM meta WHERE key='schema_version'");
  let v = rows.length ? Number(rows[0].value) : 0;
  while (v < MIGRATIONS.length) {
    await db.script(`BEGIN; ${MIGRATIONS[v]} INSERT OR REPLACE INTO meta(key,value) VALUES('schema_version','${v + 1}'); COMMIT;`);
    v++;
  }
}
