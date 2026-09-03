/* Yerel SQLite: model gecmisi, olcumler ve kayitli gorunumler.
   Sunucu yok - her sey cihazda kalir. */
import * as SQLite from 'expo-sqlite';

let dbPromise = null;

async function openDatabase() {
  const db = await SQLite.openDatabaseAsync('siteofsight.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS models (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      file_uri       TEXT    NOT NULL,
      size_bytes     INTEGER NOT NULL DEFAULT 0,
      source         TEXT    NOT NULL DEFAULT 'device',  -- device | sample
      element_count  INTEGER,
      triangle_count INTEGER,
      created_at     INTEGER NOT NULL,
      opened_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS measurements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id    INTEGER NOT NULL,
      kind        TEXT    NOT NULL,          -- distance | angle
      value       REAL    NOT NULL,
      label       TEXT,
      points_json TEXT    NOT NULL,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      model_id    INTEGER NOT NULL,
      name        TEXT    NOT NULL,
      camera_json TEXT    NOT NULL,
      created_at  INTEGER NOT NULL,
      FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_models_opened ON models(opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_meas_model ON measurements(model_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_model ON bookmarks(model_id);
  `);
  return db;
}

export function getDb() {
  if (!dbPromise) dbPromise = openDatabase();
  return dbPromise;
}

/* ---------------- Modeller ---------------- */

export async function upsertModel({ name, fileUri, sizeBytes, source }) {
  const db = await getDb();
  const now = Date.now();
  const existing = await db.getFirstAsync('SELECT id FROM models WHERE file_uri = ?', [fileUri]);
  if (existing) {
    await db.runAsync('UPDATE models SET opened_at = ?, name = ?, size_bytes = ? WHERE id = ?', [
      now, name, sizeBytes || 0, existing.id,
    ]);
    return existing.id;
  }
  const res = await db.runAsync(
    `INSERT INTO models (name, file_uri, size_bytes, source, created_at, opened_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [name, fileUri, sizeBytes || 0, source || 'device', now, now]
  );
  return res.lastInsertRowId;
}

export async function touchModel(id) {
  const db = await getDb();
  await db.runAsync('UPDATE models SET opened_at = ? WHERE id = ?', [Date.now(), id]);
}

export async function setModelStats(id, elementCount, triangleCount) {
  const db = await getDb();
  await db.runAsync('UPDATE models SET element_count = ?, triangle_count = ? WHERE id = ?', [
    elementCount ?? null, Math.round(triangleCount || 0), id,
  ]);
}

export async function listModels(limit = 50) {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM models ORDER BY opened_at DESC LIMIT ?', [limit]);
}

export async function getModel(id) {
  const db = await getDb();
  return db.getFirstAsync('SELECT * FROM models WHERE id = ?', [id]);
}

export async function deleteModel(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM measurements WHERE model_id = ?', [id]);
  await db.runAsync('DELETE FROM bookmarks WHERE model_id = ?', [id]);
  await db.runAsync('DELETE FROM models WHERE id = ?', [id]);
}

/* ---------------- Olcumler ---------------- */

export async function addMeasurement(modelId, m) {
  const db = await getDb();
  const res = await db.runAsync(
    `INSERT INTO measurements (model_id, kind, value, label, points_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [modelId, m.kind, m.value, m.text || null, JSON.stringify(m.points || []), Date.now()]
  );
  return res.lastInsertRowId;
}

export async function listMeasurements(modelId) {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM measurements WHERE model_id = ? ORDER BY id DESC', [modelId]);
}

export async function clearMeasurements(modelId) {
  const db = await getDb();
  await db.runAsync('DELETE FROM measurements WHERE model_id = ?', [modelId]);
}

export async function deleteLastMeasurement(modelId) {
  const db = await getDb();
  await db.runAsync(
    'DELETE FROM measurements WHERE id = (SELECT id FROM measurements WHERE model_id = ? ORDER BY id DESC LIMIT 1)',
    [modelId]
  );
}

/* ---------------- Kayitli gorunumler ---------------- */

export async function addBookmark(modelId, name, camera) {
  const db = await getDb();
  const res = await db.runAsync(
    'INSERT INTO bookmarks (model_id, name, camera_json, created_at) VALUES (?, ?, ?, ?)',
    [modelId, name, JSON.stringify(camera), Date.now()]
  );
  return res.lastInsertRowId;
}

export async function listBookmarks(modelId) {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM bookmarks WHERE model_id = ? ORDER BY id DESC', [modelId]);
  return rows.map((r) => ({ ...r, camera: JSON.parse(r.camera_json) }));
}

export async function deleteBookmark(id) {
  const db = await getDb();
  await db.runAsync('DELETE FROM bookmarks WHERE id = ?', [id]);
}
