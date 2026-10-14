/**
 * db.js — Agent 2: IndexedDB setup (Dexie). Local, on-device, survives app close.
 * No server for this version.
 *
 * Lane 2 (Dexie Cloud, picked 2026-09-25): sync is OPT-IN and fully inert until
 * VITE_DEXIE_CLOUD_URL is set at build time. Without it, this is plain Dexie on
 * IndexedDB — exactly the pre-Lane-2 app, all tests included. With it, the
 * dexie-cloud-addon registers and db.cloud.configure() wires the free-tier
 * cloud copy (requireAuth so only the owner's email can sync; data stays in the
 * account's private realm). v3 stays first: the cloud is a copy, not the boss.
 */
import Dexie from 'dexie';
import dexieCloud from 'dexie-cloud-addon';
import { DB_NAME, STORES } from './schema.js';
import seedSuppliers from './seedSuppliers.json';

// Empty when unset (tests, local dev, unconfigured prod) — addon never registers.
const SYNC_DB_URL = (import.meta.env && import.meta.env.VITE_DEXIE_CLOUD_URL) || null;

export const db = new Dexie(DB_NAME, SYNC_DB_URL ? { addons: [dexieCloud] } : undefined);

if (SYNC_DB_URL) {
  db.cloud.configure({
    databaseUrl: SYNC_DB_URL,
    requireAuth: true, // only the owner's email OTP can sync; private realm by default
  });
}

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

// v4: BomItem provenance fields (Lane 1B) — no new tables, no data migration.
db.version(4).stores(STORES);

// v5: importRuns table (Lane 1A scorecard). New table only — no data migration.
db.version(5).stores(STORES);

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
    [db.projects, db.bomItems, db.shortageItems, db.stockItems, db.stockMovements, db.globalSuppliers, db.supplierLinks, db.changeLog, db.presets, db.importRuns],
    async () => {
      await Promise.all([
        db.projects.clear(),
        db.bomItems.clear(),
        db.shortageItems.clear(),
        db.stockItems.clear(),
        db.stockMovements.clear(),
        db.globalSuppliers.clear(),
        db.supplierLinks.clear(),
        db.changeLog.clear(),
        db.presets.clear(),
        db.importRuns.clear(),
      ]);
    }
  );
};

export default db;
