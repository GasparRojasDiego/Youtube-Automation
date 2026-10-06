//! SQLite local (rusqlite). El esquema y las migraciones viven en TypeScript;
//! aquí solo se ejecutan sentencias con parámetros JSON.
use rusqlite::{types::ValueRef, Connection, ToSql};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(path: &std::path::Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;",
        )
        .map_err(|e| e.to_string())?;
        Ok(Db(Mutex::new(conn)))
    }
}

enum P {
    Null,
    Int(i64),
    Real(f64),
    Text(String),
}

impl ToSql for P {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        use rusqlite::types::ToSqlOutput as O;
        use rusqlite::types::Value as V;
        Ok(match self {
            P::Null => O::Owned(V::Null),
            P::Int(i) => O::Owned(V::Integer(*i)),
            P::Real(f) => O::Owned(V::Real(*f)),
            P::Text(s) => O::Borrowed(ValueRef::Text(s.as_bytes())),
        })
    }
}

fn to_params(params: &[Value]) -> Vec<P> {
    params
        .iter()
        .map(|v| match v {
            Value::Null => P::Null,
            Value::Bool(b) => P::Int(*b as i64),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    P::Int(i)
                } else {
                    P::Real(n.as_f64().unwrap_or(0.0))
                }
            }
            Value::String(s) => P::Text(s.clone()),
            other => P::Text(other.to_string()),
        })
        .collect()
}

#[derive(Serialize)]
pub struct ExecResult {
    changes: usize,
    last_id: i64,
}

#[derive(Deserialize)]
pub struct Stmt {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

fn exec(conn: &Connection, sql: &str, params: &[Value]) -> Result<ExecResult, String> {
    let ps = to_params(params);
    let refs: Vec<&dyn ToSql> = ps.iter().map(|p| p as &dyn ToSql).collect();
    let changes = conn
        .execute(sql, refs.as_slice())
        .map_err(|e| format!("{e} — SQL: {sql}"))?;
    Ok(ExecResult { changes, last_id: conn.last_insert_rowid() })
}

#[tauri::command]
pub fn db_execute(db: tauri::State<Db>, sql: String, params: Vec<Value>) -> Result<ExecResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    exec(&conn, &sql, &params)
}

#[tauri::command]
pub fn db_script(db: tauri::State<Db>, sql: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute_batch(&sql).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_batch(db: tauri::State<Db>, statements: Vec<Stmt>) -> Result<Vec<ExecResult>, String> {
    let mut conn = db.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(statements.len());
    for s in &statements {
        out.push(exec(&tx, &s.sql, &s.params)?);
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(out)
}

#[tauri::command]
pub fn db_query(db: tauri::State<Db>, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("{e} — SQL: {sql}"))?;
    let cols: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let ps = to_params(&params);
    let refs: Vec<&dyn ToSql> = ps.iter().map(|p| p as &dyn ToSql).collect();
    let mut rows = stmt.query(refs.as_slice()).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let mut m = Map::new();
        for (i, c) in cols.iter().enumerate() {
            let v = match row.get_ref(i).map_err(|e| e.to_string())? {
                ValueRef::Null => Value::Null,
                ValueRef::Integer(i) => Value::from(i),
                ValueRef::Real(f) => Value::from(f),
                ValueRef::Text(t) => Value::from(String::from_utf8_lossy(t).to_string()),
                ValueRef::Blob(b) => Value::from(format!("<blob {} bytes>", b.len())),
            };
            m.insert(c.clone(), v);
        }
        out.push(m);
    }
    Ok(out)
}
