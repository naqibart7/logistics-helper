/**
 * bomMigration.test.js — Task L: v2 backfill for legacy BomItem rows.
 * Builds a genuine v1 database (no displayOrder anywhere), then opens the app
 * DB (v2) so the real upgrade runs. Unnumbered rows take the next free positions;
 * rows that already have numbers keep them.
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { describe, it, expect } from 'vitest';
import { DB_NAME, STORES } from '../src/data/schema.js';

const rowsOf = async (db) => {
  const rows = await db.table('bomItems').toArray();
  return rows.sort((a, b) => a.displayOrder - b.displayOrder);
};

describe('Task L: displayOrder backfill on legacy databases', () => {
  it('assigns 0..n to unnumbered rows, preserves existing numbers', async () => {
    // Genuine v1 state: same stores, version 1, rows without displayOrder.
    await Dexie.delete(DB_NAME);
    const legacy = new Dexie(DB_NAME);
    legacy.version(1).stores(STORES);
    await legacy.open();
    await legacy.table('bomItems').bulkAdd([
      { id: 'm-b', projectId: 'p', item: 'B' },
      { id: 'm-a', projectId: 'p', item: 'A' },
      { id: 'm-c', projectId: 'p', item: 'C', displayOrder: 5 },
    ]);
    await legacy.close();

    // App open runs the v2 upgrade exactly once.
    const { db } = await import('../src/data/db.js');
    await db.open();
    const rows = await rowsOf(db);
    expect(rows.map((r) => [r.item, r.displayOrder])).toEqual([
      ['C', 5], // pre-existing number untouched
      ['A', 6], // primary-key order among the unnumbered, continuing past the max
      ['B', 7],
    ]);
    await db.close();
  }, 30000); // 30s — DB delete + version upgrade cycle is slow with fake-indexeddb
});
