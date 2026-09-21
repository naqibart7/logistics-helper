/**
 * db.js — Agent 2: IndexedDB setup (Dexie). Local, on-device, survives app close.
 * No server for this version.
 */
import Dexie from 'dexie';
import { DB_NAME, STORES } from './schema.js';
import seedSuppliers from './seedSuppliers.json';

export const db = new Dexie(DB_NAME);

db.version(1).stores(STORES);

// v2: no store changes — backfills displayOrder on legacy BomItem rows.
// Existing numbered rows keep their values; unnumbered rows take the next
// free positions in primary-key order. Runs once per database, ever.
db.version(2).stores(STORES).upgrade(async (tx) => {
  const all = await tx.table('bomItems').toArray();
  let next = all.reduce(
    (m, r) => Math.max(m, typeof r.displayOrder === 'number' ? r.displayOrder : -1),
    -1
  ) + 1;
  const missing = all
    .filter((r) => typeof r.displayOrder !== 'number')
    .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
  for (const row of missing) {
    await tx.table('bomItems').update(row.id, { displayOrder: next++ });
  }
});

// v3: presets table (ItemSupplierPreset). New table only — no data migration.
// Fresh databases already carry it via STORES; upgraded ones gain it here.
db.version(3).stores(STORES);

// v4: Lane 1B BomItem provenance fields (isManual, source, reasonTag, addedAt).
// No index changes needed — fields are non-indexed, nullable, never merged.
// Dexie allows schema-consistent new fields on existing rows via plain writes,
// so the upgrade is a no-op on existing data (null fields read as null).
db.version(4).stores(STORES);

/** Close the DB (used by tests to simulate "close the app"). */
export const closeDb = () => db.close();

/** Re-open the DB (used by tests to simulate "reopen the app"). */
export const openDb = () => db.open();

/**
 * Seed the global supplier directory from the bundled CSV-derived seed file.
 * Runs at most once per database lifetime: skips if the table already has rows
 * (imported via SuppliersScreen or from a previous session). Deterministic —
 * the seed file is checked into the repo and never changes at runtime.
 */
export const seedInitialSuppliers = async () => {
  const count = await db.globalSuppliers.count();
  if (count > 0) return;
  const rows = seedSuppliers.map((s) => ({
    ...s,
    id: crypto.randomUUID ? crypto.randomUUID() : `seed-${Math.random().toString(36).slice(2)}`,
  }));
  await db.globalSuppliers.bulkAdd(rows);
};

/** Delete all rows in every table (test isolation only — never call in UI). */
export const clearAllTables = async () => {
  await db.transaction(
    'rw',
    [db.projects, db.bomItems, db.shortageItems, db.globalSuppliers, db.supplierLinks, db.changeLog, db.presets],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.bomItems.clear(),
        db.shortageItems.clear(),
        db.globalSuppliers.clear(),
        db.supplierLinks.clear(),
        db.changeLog.clear(),
        db.presets.clear(),
      ]);
    }
  );
};

export default db;
