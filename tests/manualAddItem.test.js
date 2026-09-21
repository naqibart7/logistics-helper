/**
 * manualAddItem.test.js — Lane 1B (Option A).
 *
 * Tests for:
 *   - addManualItem: writes provenance fields, displayOrder, writes changelog
 *   - Option A quarantine: isManual rows never become removed_item_pending
 *   - Idempotency: re-reimport with same import still yields 0 removed pendings
 *   - Non-manual rows STILL become removed_item_pending (merge semantics unchanged)
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllTables } from '../src/data/db.js';
import { createProject } from '../src/data/projectRepo.js';
import * as bomRepo from '../src/data/bomRepo.js';
import * as shortageRepo from '../src/data/shortageRepo.js';
import * as supplierRepo from '../src/data/supplierRepo.js';
import * as changeLogRepo from '../src/data/changeLogRepo.js';
import * as presetRepo from '../src/data/presetRepo.js';
import { seedProjectFromImport } from '../src/logic/seedProject.js';
import { reimportProject } from '../src/logic/reimportProject.js';
import { addManualItem } from '../src/data/bomRepo.js';

const seedDeps = {
  bulkCreateBomItems: bomRepo.bulkCreateBomItems,
  bulkCreateShortageItems: shortageRepo.bulkCreateShortageItems,
  createSupplier: supplierRepo.createSupplier,
  listSuppliers: supplierRepo.listSuppliers,
  linkSupplierToProject: supplierRepo.linkSupplierToProject,
  appendChangeLog: changeLogRepo.appendChangeLog,
  updateBomItem: bomRepo.updateBomItem,
  getPreset: presetRepo.getPreset,
  getSupplier: supplierRepo.getSupplier,
};

const reimportDeps = {
  listBomItems: bomRepo.listBomItems,
  getBomItem: bomRepo.getBomItem,
  updateBomItem: bomRepo.updateBomItem,
  lockField: bomRepo.lockField,
  appendChangeLog: changeLogRepo.appendChangeLog,
  createShortageItem: shortageRepo.createShortageItem,
  listShortageItems: shortageRepo.listShortageItems,
  listSuppliers: supplierRepo.listSuppliers,
  createSupplier: supplierRepo.createSupplier,
  linkSupplierToProject: supplierRepo.linkSupplierToProject,
  getPreset: presetRepo.getPreset,
  getSupplier: supplierRepo.getSupplier,
};

const manualAddDeps = {
  createBomItem: bomRepo.createBomItem,
  maxDisplayOrder: bomRepo.maxDisplayOrder,
  updateBomItem: bomRepo.updateBomItem,
  appendChangeLog: changeLogRepo.appendChangeLog,
};

const parsed = (bomItems, supplierEntries = []) => ({
  projectTitle: 'PROBE',
  bomItems,
  shortageConfirmItems: [],
  supplierEntries,
  changeLogFromAgent: [],
});

beforeEach(async () => {
  await clearAllTables();
  vi.useRealTimers();
});

describe('Lane 1B: addManualItem provenance', () => {
  it('writes isManual=true, source="manual", reasonTag, addedAt; appends changelog', async () => {
    const project = await createProject({ name: 'P1' });
    const before = new Date();
    const row = await addManualItem(
      {
        projectId: project.id,
        item: 'PVC Glue',
        spec: '50ml bottle',
        purchaseQty: 6,
        unit: 'bottle',
        reasonTag: 'site',
        category: 'Adhesives',
      },
      manualAddDeps,
    );
    const after = new Date();

    expect(row.isManual).toBe(true);
    expect(row.source).toBe('manual');
    expect(row.reasonTag).toBe('site');
    expect(row.item).toBe('PVC Glue');
    expect(row.spec).toBe('50ml bottle');
    expect(row.purchaseQty).toBe(6);
    expect(row.unit).toBe('bottle');
    expect(row.category).toBe('Adhesives');
    expect(row.netQty).toBe(6);
    expect(row.displayOrder).toBe(0);
    expect(typeof row.addedAt).toBe('string');
    expect(row.addedAt.length).toBeGreaterThan(10);
    expect(new Date(row.addedAt) >= before && new Date(row.addedAt) <= after).toBe(true);

    const log = await changeLogRepo.listChangeLog(project.id);
    expect(log).toHaveLength(1);
    expect(log[0].actor).toBe('supervisor');
    expect(log[0].field).toMatch(/PVC Glue :: manual_add \(site\)/);
    expect(log[0].newValue).toMatch(/added qty 6 bottle — 50ml bottle/);
    expect(log[0].oldValue).toBe(null);
  });

  it('requires item, spec, qty, unit', async () => {
    const project = await createProject({ name: 'P2' });
    const base = { projectId: project.id, item: 'a', spec: 'b', purchaseQty: 1, unit: 'pc' };
    await expect(addManualItem({ ...base, item: '   ' }, manualAddDeps)).rejects.toThrow(/item/);
    await expect(addManualItem({ ...base, spec: '' }, manualAddDeps)).rejects.toThrow(/spec/);
    await expect(addManualItem({ ...base, purchaseQty: NaN }, manualAddDeps)).rejects.toThrow(/purchaseQty/);
    await expect(addManualItem({ ...base, unit: ' ' }, manualAddDeps)).rejects.toThrow(/unit/);
  });

  it('invalid reasonTag falls back to null; addedAt not overridable', async () => {
    const project = await createProject({ name: 'P3' });
    const row = await addManualItem(
      {
        projectId: project.id,
        item: 'X',
        spec: 'Y',
        purchaseQty: 2,
        unit: 'pc',
        reasonTag: 'banana',
        addedAt: '1900-01-01T00:00:00Z',
      },
      manualAddDeps,
    );
    expect(row.reasonTag).toBe(null);
    expect(new Date(row.addedAt).getFullYear()).toBeGreaterThan(2023);
  });

  it('displayOrder increments per add; existing preserved', async () => {
    const project = await createProject({ name: 'P4' });
    // Seed some existing rows (non-manual, low display orders)
    await bomRepo.createBomItem({ projectId: project.id, item: 'E1', spec: 's', displayOrder: 0 });
    await bomRepo.createBomItem({ projectId: project.id, item: 'E2', spec: 's', displayOrder: 1 });
    const a = await addManualItem(
      { projectId: project.id, item: 'MA', spec: 'a', purchaseQty: 1, unit: 'pc' },
      manualAddDeps,
    );
    const b = await addManualItem(
      { projectId: project.id, item: 'MB', spec: 'b', purchaseQty: 1, unit: 'pc' },
      manualAddDeps,
    );
    expect(a.displayOrder).toBe(2);
    expect(b.displayOrder).toBe(3);
  });
});

describe('Lane 1B Option A: isManual quarantine on re-import', () => {
  it('manual-only project → 0 removed_pending; manualQuarantined = N', async () => {
    const project = await createProject({ name: 'Q1' });
    await addManualItem(
      { projectId: project.id, item: 'PVC Glue', spec: '50ml', purchaseQty: 6, unit: 'bottle', reasonTag: 'site' },
      manualAddDeps,
    );
    await addManualItem(
      { projectId: project.id, item: 'Sandpaper P180', spec: 'sheet', purchaseQty: 10, unit: 'sheet', reasonTag: 'missing' },
      manualAddDeps,
    );
    // Reimport with an EMPTY BOM import (no imported lines at all)
    // → if protection works, no removed_pending rows.
    const result = await reimportProject(project.id, parsed([]), reimportDeps);
    expect(result.removedPendingIds).toEqual([]);
    expect(result.manualQuarantined).toBe(2);
    // Manual items are still present
    const rows = await bomRepo.listBomItems(project.id);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.isManual === true)).toBe(true);
  });

  it('mixed project: non-manual absent from import → removed_pending; manual absent → protected', async () => {
    const project = await createProject({ name: 'Q2' });
    // Seed: imported row (Gypsum) + manual row (PVC Glue)
    await seedProjectFromImport(
      project.id,
      parsed([{ item: 'Gypsum Board 9mm', spec: '4x8 sheet', purchaseQty: 12, unitCost: 28 }]),
      seedDeps,
    );
    // Seeded rows carry isManual=null — confirm base state
    const seededBefore = await bomRepo.listBomItems(project.id);
    expect(seededBefore).toHaveLength(1);
    expect(seededBefore[0].isManual).toBe(null);
    // Add a manual row
    await addManualItem(
      { projectId: project.id, item: 'PVC Glue', spec: '50ml', purchaseQty: 3, unit: 'bottle', reasonTag: 'site' },
      manualAddDeps,
    );
    // Reimport with NEITHER row → expect only the imported row's absence to create a pending
    const result = await reimportProject(project.id, parsed([]), reimportDeps);
    expect(result.removedPendingIds).toHaveLength(1);
    expect(result.manualQuarantined).toBe(1);
    const pending = await shortageRepo.getShortageItem(result.removedPendingIds[0]);
    expect(pending.kind).toBe('removed_item_pending');
    expect(pending.refItem).toBe('Gypsum Board 9mm');
    // PVC Glue was NOT turned into a pending: it should still be in BOM
    const rows = await bomRepo.listBomItems(project.id);
    expect(rows.find((r) => r.item === 'PVC Glue')).toBeTruthy();
    expect(rows.find((r) => r.item === 'Gypsum Board 9mm')).toBeTruthy(); // still there, pending
  });

  it('idempotent: second reimport does not duplicate removed_pending for imported, none for manual', async () => {
    const project = await createProject({ name: 'Q3' });
    await seedProjectFromImport(
      project.id,
      parsed([{ item: 'Gypsum', spec: 'sheet', purchaseQty: 1, unitCost: 10 }]),
      seedDeps,
    );
    await addManualItem(
      { projectId: project.id, item: 'PVC', spec: 'bottle', purchaseQty: 1, unit: 'bottle' },
      manualAddDeps,
    );
    const r1 = await reimportProject(project.id, parsed([]), reimportDeps);
    const r2 = await reimportProject(project.id, parsed([]), reimportDeps);
    expect(r1.removedPendingIds).toHaveLength(1);
    // Idempotency: second run → no NEW removed pendings (merge engine dedupes)
    expect(r2.removedPendingIds).toEqual([]);
    expect(r2.manualQuarantined).toBe(1);
    const unresolved = await shortageRepo.listShortageItems(project.id, { resolved: false });
    expect(unresolved.filter((c) => c.kind === 'removed_item_pending')).toHaveLength(1);
  });

  it('merge semantics intact for imported rows: price update still applies', async () => {
    const project = await createProject({ name: 'Q4' });
    await seedProjectFromImport(
      project.id,
      parsed([{ item: 'Gypsum', spec: 'sheet', purchaseQty: 10, unitCost: 10 }]),
      seedDeps,
    );
    await addManualItem(
      { projectId: project.id, item: 'Manual', spec: 'x', purchaseQty: 1, unit: 'pc' },
      manualAddDeps,
    );
    const result = await reimportProject(
      project.id,
      parsed([{ item: 'Gypsum', spec: 'sheet', purchaseQty: 10, unitCost: 13 }]),
      reimportDeps,
    );
    expect(result.updatedCount).toBe(1);
    expect(result.manualQuarantined).toBe(1);
    expect(result.removedPendingIds).toEqual([]);
    const [gyp, man] = await bomRepo.listBomItems(project.id).then((rs) => rs.sort((a, b) => a.item.localeCompare(b.item)));
    expect(gyp.unitCost).toBe(13);
    expect(man.isManual).toBe(true);
  });
});
