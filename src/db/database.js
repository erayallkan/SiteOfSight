/* Yerel SQLite: model gecmisi ve olcumler.
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
      folder_id      INTEGER,                            -- NULL = kok dizin
      thumbnail_data TEXT,                                -- onizleme goruntusu, ham base64 JPEG
      created_at     INTEGER NOT NULL,
      opened_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS folders (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      created_at  INTEGER NOT NULL
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

    CREATE INDEX IF NOT EXISTS idx_models_opened ON models(opened_at DESC);
    CREATE INDEX IF NOT EXISTS idx_meas_model ON measurements(model_id);
  `);
  // Eski kurulumlarda 'models' tablosu folder_id sutunu olmadan olusmus olabilir;
  // CREATE TABLE IF NOT EXISTS yeni sutunu eklemez. Sutun zaten varsa hata
  // sessizce yutulur (SQLite "duplicate column name"). Index, sutun kesin
  // var oldugundan sonra olusturulur - aksi halde eski kurulumlarda
  // "no such column: folder_id" ile execAsync bloğu patlar.
  try { await db.execAsync('ALTER TABLE models ADD COLUMN folder_id INTEGER;'); } catch {}
  try { await db.execAsync('ALTER TABLE models ADD COLUMN thumbnail_data TEXT;'); } catch {}
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_models_folder ON models(folder_id);');
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

/** thumbnailData: ham base64 JPEG (data: on-eki OLMADAN). Dosya olarak degil
 *  dogrudan DB'de saklanir - Expo Go'nun deneyim klasoru adi cift kodlanmis
 *  ozel karakterler icerdigi icin (ör. %2540, %252F) o file:// URI'si
 *  RN Image tarafindan sessizce cozulemiyordu (hatasiz ama bombos gorunuyordu). */
export async function setModelThumbnail(id, thumbnailData) {
  const db = await getDb();
  await db.runAsync('UPDATE models SET thumbnail_data = ? WHERE id = ?', [thumbnailData, id]);
}

export async function listModels(limit = 500) {
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
  await db.runAsync('DELETE FROM models WHERE id = ?', [id]);
}

/** Birden fazla model id'sini tek seferde siler (toplu silme). */
export async function deleteModels(ids) {
  if (!ids || !ids.length) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`DELETE FROM measurements WHERE model_id IN (${placeholders})`, ids);
  await db.runAsync(`DELETE FROM models WHERE id IN (${placeholders})`, ids);
}

/* ---------------- Klasorler ---------------- */

export async function listFolders() {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC');
}

export async function createFolder(name) {
  const db = await getDb();
  const res = await db.runAsync('INSERT INTO folders (name, created_at) VALUES (?, ?)', [name, Date.now()]);
  return res.lastInsertRowId;
}

export async function deleteFolder(id) {
  const db = await getDb();
  // Klasordeki modeller silinmez, sadece kok dizine geri tasinir.
  await db.runAsync('UPDATE models SET folder_id = NULL WHERE folder_id = ?', [id]);
  await db.runAsync('DELETE FROM folders WHERE id = ?', [id]);
}

/** Bir grup modeli belirtilen klasore tasir (folderId = null -> kok dizin). */
export async function moveModelsToFolder(ids, folderId) {
  if (!ids || !ids.length) return;
  const db = await getDb();
  const placeholders = ids.map(() => '?').join(',');
  await db.runAsync(`UPDATE models SET folder_id = ? WHERE id IN (${placeholders})`, [folderId ?? null, ...ids]);
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
