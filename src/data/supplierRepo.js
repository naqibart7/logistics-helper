/**
 * supplierRepo.js — Agent 2: CRUD for GlobalSupplier + ProjectSupplierLink.
 *
 * Supplier Hub (H2): the row carries additive phone/location/status fields.
 * `contact` is untouched — Quick Order keeps reading it, and now also has
 * `phones[]` to prefer the first mobile once the supervisor has filled it.
 */
import db from './db.js';
import { generateId } from '../utils/helpers.js';

/** Normalise the additive hub fields so a stored row is always the same shape. */
const hubFields = (p) => ({
  phones: Array.isArray(p.phones)
    ? p.phones
        .filter((phone) => phone && (phone.number !== null && phone.number !== undefined))
        .map((phone) => ({ number: phone.number ?? null, kind: phone.kind ?? null, label: phone.label ?? null }))
    : [],
  contactPerson: p.contactPerson ?? null,
  email: p.email ?? null,
  area: p.area ?? null,
  status: p.status === 'archived' ? 'archived' : 'active',
  mergedInto: p.mergedInto ?? null,
});

export const createSupplier = async (partial) => {
  const row = {
    id: partial.id ?? generateId(),
    businessName: partial.businessName ?? null,
    contact: partial.contact ?? null,
    address: partial.address ?? null,
    specialty: partial.specialty ?? null,
    sourceUrl: partial.sourceUrl ?? null,
    tags: Array.isArray(partial.tags) ? [...partial.tags] : [],
    note: partial.note ?? partial.logisticsNote ?? null,
    logisticsNote: partial.logisticsNote ?? partial.note ?? null,
    verifiedDate: partial.verifiedDate ?? null,
    ...hubFields(partial),
  };
  await db.globalSuppliers.add(row);
  return row;
};

export const bulkCreateSuppliers = async (partials) => {
  const rows = partials.map((p) => ({
    id: p.id ?? generateId(),
    businessName: p.businessName ?? null,
    contact: p.contact ?? null,
    address: p.address ?? null,
    specialty: p.specialty ?? null,
    sourceUrl: p.sourceUrl ?? null,
    tags: Array.isArray(p.tags) ? [...p.tags] : [],
    note: p.note ?? p.logisticsNote ?? null,
    logisticsNote: p.logisticsNote ?? p.note ?? null,
    verifiedDate: p.verifiedDate ?? null,
    ...hubFields(p),
  }));
  await db.globalSuppliers.bulkAdd(rows);
  return rows;
};

export const listSuppliers = () => db.globalSuppliers.toArray();

/**
 * One supplier. Follows `mergedInto` (H4): a duplicate that lost a merge stays
 * in the table as an archived row, and any read — including
 * supplierLinking.applyPresetToItem — must resolve to the survivor instead of
 * the tombstone.
 */
export const getSupplier = async (id) => {
  const row = await db.globalSuppliers.get(id);
  if (!row || !row.mergedInto) return row;
  const survivor = await db.globalSuppliers.get(row.mergedInto);
  return survivor ?? row;
};

/**
 * Plain full-directory read for CSV export. No filtering, no pagination —
 * deterministic businessName order so exports (and round-trips) are stable.
 */
export const getAllSuppliersForExport = () =>
  db.globalSuppliers.orderBy('businessName').toArray();

export const updateSupplier = async (id, patch) => {
  const safe = { ...patch };
  if (safe.note !== undefined && safe.logisticsNote === undefined) {
    safe.logisticsNote = safe.note;
  } else if (safe.logisticsNote !== undefined && safe.note === undefined) {
    safe.note = safe.logisticsNote;
  }
  await db.globalSuppliers.update(id, safe);
  return db.globalSuppliers.get(id);
};

export const linkSupplierToProject = async ({ projectId, globalSupplierId, assignedToItemId = null }) => {
  const link = { projectId, globalSupplierId, assignedToItemId };
  await db.supplierLinks.put(link);
  return link;
};

export const listProjectSuppliers = (projectId) =>
  db.supplierLinks.where('projectId').equals(projectId).toArray();

export const unlinkSupplier = (projectId, globalSupplierId) =>
  db.supplierLinks.delete([projectId, globalSupplierId]);

export const countSupplierProjectLinks = (globalSupplierId) =>
  db.supplierLinks.where('globalSupplierId').equals(globalSupplierId).count();

export const listSupplierLinks = (globalSupplierId) =>
  db.supplierLinks.where('globalSupplierId').equals(globalSupplierId).toArray();

export const deleteSupplier = async (id) => {
  const count = await countSupplierProjectLinks(id);
  if (count > 0) {
    throw new Error(`Cannot delete supplier: used in ${count} project${count === 1 ? '' : 's'}`);
  }
  await db.globalSuppliers.delete(id);
  return true;
};

export const removeSupplierAllLinks = (globalSupplierId) =>
  db.supplierLinks.where('globalSupplierId').equals(globalSupplierId).delete();

export default {
  createSupplier,
  bulkCreateSuppliers,
  getSupplier,
  listSuppliers,
  getAllSuppliersForExport,
  updateSupplier,
  linkSupplierToProject,
  listProjectSuppliers,
  unlinkSupplier,
  countSupplierProjectLinks,
  listSupplierLinks,
  deleteSupplier,
  removeSupplierAllLinks,
};
