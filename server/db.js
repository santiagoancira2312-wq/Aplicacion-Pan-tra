import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { DB_FILE, DATA_DIR, ROOT, DEFAULT_SETTINGS } from './config.js';

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

export function migrate() {
  const schema = fs.readFileSync(path.join(ROOT, 'server', 'schema.sql'), 'utf8');
  db.exec(schema);
  const ins = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) ins.run(k, v);
}

export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

/** Ejecuta fn dentro de una transaccion. Toda escritura critica pasa por aqui. */
export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* ya revertida */ }
    throw err;
  }
}

export function setting(key, fallback = null) {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : (DEFAULT_SETTINGS[key] ?? fallback);
}

export function setSetting(key, value, userId = null) {
  run(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now'), updated_by = excluded.updated_by`,
    key, String(value), userId
  );
}
