/**
 * bomRepo.js — Agent 2: CRUD for BomItem, including lockedFields handling.
 * No business logic: locking a field is a plain write; the merge engine
 * decides what locks mean.
 */
import db from './db.js';
import { defaultBomItem } from './schema.js';
import { generateId } from '../utils/helpers.js';

export const createBomItem = async (partial) => {
  const row = defaultBomItem({ ...partial, id: partial.id ?? generateId() });
  await db.bomItems.add(row);
  return row;
};

export const bulkCreateBomItems = async (partials) => {
  const rows = partials.map((p) => defaultBomItem({ ...p, id: p.id ?? generateId() }));
  await db.bomItems.bulkAdd(rows);
  return rows;
};

export const getBomItem = (id) => db.bomItems.get(id);

export const listBomItems = (projectId) =>
  db.bomItems.where('projectId').equals(projectId).toArray();

export const updateBomItem = async (id, patch) => {
  const { lockedFields, ...rest } = patch;
  const safe = { ...rest };
  if (lockedFields !== undefined) {
    safe.lockedFields = Array.isArray(lockedFields) ? [...lockedFields] : [];
  }
  await db.bomItems.update(id, safe);
  return db.bomItems.get(id);
};

/** Add a field name to lockedFields (idempotent). Returns updated row. */
export const lockField = async (id, field) => {
  const row = await db.bomItems.get(id);
  if (!row) throw new Error(`BomItem not found: ${id}`);
  const locked = Array.isArray(row.lockedFields) ? [...row.lockedFields] : [];
  if (!locked.includes(field)) locked.push(field);
  await db.bomItems.update(id, { lockedFields: locked });
  return db.bomItems.get(id);
};

/** Remove a field name from lockedFields (idempotent). Returns updated row. */
export const unlockField = async (id, field) => {
  const row = await db.bomItems.get(id);
  if (!row) throw new Error(`BomItem not found: ${id}`);
  const locked = (Array.isArray(row.lockedFields) ? row.lockedFields : []).filter((f) => f !== field);
  await db.bomItems.update(id, { lockedFields: locked });
  return db.bomItems.get(id);
};

export const deleteBomItem = (id) => db.bomItems.delete(id);

/**
 * Persist a full presentation order: orderedIds[0] becomes displayOrder 0, etc.
 * Cosmetic only — never consulted by merge/itemMatcher. Caller contract: ids are
 * this project's rows in the desired top-to-bottom order. Unknown ids throw.
 */
export const reorderBomItems = async (projectId, orderedIds) => {
  await db.transaction('rw', db.bomItems, async () => {
    let i = 0;
    for (const id of orderedIds) {
      const row = await db.bomItems.get(id);
      if (!row || row.projectId !== projectId) {
        throw new Error(`reorderBomItems: unknown item ${id} for project ${projectId}`);
      }
      await db.bomItems.update(id, { displayOrder: i++ });
    }
  });
  return listBomItems(projectId);
};

/** Highest displayOrder in a project (-1 when empty/all-legacy). */
export const maxDisplayOrder = async (projectId) => {
  const rows = await listBomItems(projectId);
  return rows.reduce(
    (m, r) => Math.max(m, typeof r.displayOrder === 'number' ? r.displayOrder : -1),
    -1
  );
};

/**
 * Lane 1B — Manual add-item.
 *
 * Writes a single BomItem row with provenance fields set:
 *   isManual=true, source="manual", reasonTag (site|missing|correction|null),
 *   addedAt=now-ISO. Cosmetic fields are filled too: displayOrder=max+1 so the
 *   new row appears at the bottom of BOM.
 *
 * Confirmed immediately — no pending/confirm queue. The Option A reimport wrapper
 * in reimportProject.js quarantines rows with isManual=true so they never turn
 * into removed_item_pending on a subsequent re-import.
 *
 * reasonTag "site" feeds the late-request count used by Lane 6 drafters.
 *
 * @param {object} params
 * @param {string} params.projectId
 * @param {string} params.item       — item name (required)
 * @param {string} params.spec       — spec/description (required)
 * @param {number} params.purchaseQty
 * @param {string} params.unit
 * @param {"site"|"missing"|"correction"} [params.reasonTag]
 * @param {string} [params.category]
 * @param {string} [params.notes]
 * @param {object} deps — { createBomItem, maxDisplayOrder, updateBomItem, appendChangeLog }
 */
export const addManualItem = async (params, deps) => {
  const { projectId, item, spec, purchaseQty, unit, reasonTag, category, notes } = params;
  const { createBomItem, maxDisplayOrder, updateBomItem, appendChangeLog } = deps;
  if (!item || String(item).trim() === '') throw new Error('addManualItem: item name required');
  if (!spec || String(spec).trim() === '') throw new Error('addManualItem: spec required');
  if (purchaseQty === undefined || purchaseQty === null || Number.isNaN(Number(purchaseQty))) {
    throw new Error('addManualItem: purchaseQty required');
  }
  if (!unit || String(unit).trim() === '') throw new Error('addManualItem: unit required');

  const addedAt = new Date().toISOString();
  const base = await createBomItem({
    projectId,
    item: String(item).trim(),
    spec: String(spec).trim(),
    category: category || null,
    unit: String(unit).trim(),
    purchaseQty: Number(purchaseQty),
    netQty: Number(purchaseQty),
    notes: notes || null,
    // Lane 1B provenance
    isManual: true,
    source: 'manual',
    reasonTag: ['site', 'missing', 'correction'].includes(reasonTag) ? reasonTag : null,
    addedAt,
  });

  // Put new row at the end of the on-screen order.
  const nextOrder = (await maxDisplayOrder(projectId)) + 1;
  const row = await updateBomItem(base.id, { displayOrder: nextOrder });

  // Append-only "prove it" entry: who added what, when, why.
  await appendChangeLog({
    projectId,
    actor: 'supervisor',
    field: `${row.item} :: manual_add${reasonTag ? ` (${reasonTag})` : ''}`,
    oldValue: null,
    newValue: `added qty ${row.purchaseQty} ${row.unit || ''}${row.spec ? ` — ${row.spec}` : ''}`,
  });

  return row;
};

export default {
  createBomItem,
  bulkCreateBomItems,
  getBomItem,
  listBomItems,
  updateBomItem,
  lockField,
  unlockField,
  deleteBomItem,
  reorderBomItems,
  maxDisplayOrder,
  addManualItem,
};
