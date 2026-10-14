/**
 * stockRepo.js — Agent 3: Stock Materials Module ledger.
 * Append-only stock ledger: predicted balance = starting count + received − used.
 * Never directly edits stored count — only appends movements.
 *
 * Two automatic touchpoints:
 * 1. Arrivals-tap: when a supplier order is marked received, any item on that
 *    order that's a tracked StockItem gets a `received` movement written automatically.
 * 2. Using — BOM checklist toggle: when marking an item "prepared, from workshop stock?",
 *    it writes a `used` movement against that project automatically.
 *
 * The ledger is honesty-bound via lastVerifiedAt + periodic physical recount (adjustment
 * movement). All history is preserved; balance is computed on read.
 *
 * Movement types: 'starting' | 'received' | 'used' | 'adjustment' | 'reversal'.
 * - 'adjustment' may be written ONLY by recordRecount (physical recount reconciliation).
 * - 'reversal' is written by any undo (e.g. unticking fromStock). It carries reversesId
 *   (the movement it undoes) and reversesType ('used' or 'received').
 * - The future weekly accuracy digest reads ONLY 'adjustment' rows and ignores 'reversal'.
 */
import db from './db.js';
import { itemKey } from '../logic/itemMatcher.js';

const genId = () =>
  (crypto && typeof crypto.randomUUID === 'function')
    ? crypto.randomUUID()
    : `stock-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** StockItem fields (persisted in Dexie). */
export const StockItem = {
  id: genId,
  itemKey: '',
  description: '',
  unit: '',
  startingCount: null, // null = unset. UNSET IS NOT ZERO.
  minThreshold: null,   // null = unset (no low-stock flag). 0 is a real value.
  lastVerifiedAt: null,
  location: null,
  isKeyItem: false,
  workersOftenTake: false,
};

/** StockMovement fields (persisted in Dexie). */
export const StockMovement = {
  id: genId,
  itemKey: '',
  type: 'starting', // 'starting' | 'received' | 'used' | 'adjustment' | 'reversal'
  quantity: 0,
  linkedProjectId: null, // set when type is 'used'
  linkedSupplierId: null, // set when type is 'received'
  reversesId: null, // set when type is 'reversal' — id of the undone movement
  reversesType: null, // set when type is 'reversal' — 'used' or 'received'
  actor: 'supervisor',
  note: '',
  timestamp: new Date().toISOString(),
};

/** Default empty StockItem — used when first adding a new tracked item. */
export const newStockItem = () => ({
  id: genId(),
  itemKey: '',
  description: '',
  unit: '',
  startingCount: null,
  minThreshold: null,
  lastVerifiedAt: null,
  location: null,
  isKeyItem: false,
  workersOftenTake: false,
});

/** Default empty StockMovement row. */
export const newStockMovement = () => ({
  id: genId(),
  itemKey: '',
  type: 'starting',
  quantity: 0,
  linkedProjectId: null,
  linkedSupplierId: null,
  reversesId: null,
  reversesType: null,
  actor: 'supervisor',
  note: '',
  timestamp: new Date().toISOString(),
});

/**
 * Compute predicted balance for a StockItem.
 *
 * RULE: UNSET IS NOT ZERO.
 * - If startingCount is null/undefined, the balance is null. The UI shows
 *   "Needs starting count" and the item never counts toward the low-stock badge.
 * - If minThreshold is null/undefined, no low-stock flag is ever raised.
 *   A minThreshold of 0 is a real value and IS compared against.
 * - Coalescing (treating null as 0) is allowed for summing movements only, never
 *   for the baseline startingCount.
 *
 * Adjustment (from physical recount) is added. Reversal undoes the movement it
 * points at: a reversal of a 'used' movement adds the quantity back; a reversal
 * of a 'received' movement removes it.
 *
 * @param {StockItem} item
 * @param {StockMovement[]} movements
 * @returns {number|null} predicted balance, or null when startingCount is unset
 */
export const computePredictedBalance = (item, movements) => {
  const starting = item?.startingCount;
  if (starting === null || starting === undefined) {
    return null;
  }
  const received = movements
    .filter((m) => m.type === 'received')
    .reduce((sum, m) => sum + Number(m.quantity ?? 0), 0);
  const used = movements
    .filter((m) => m.type === 'used')
    .reduce((sum, m) => sum + Number(m.quantity ?? 0), 0);
  const adjustment = movements
    .filter((m) => m.type === 'adjustment')
    .reduce((sum, m) => sum + Number(m.quantity ?? 0), 0);
  const reversalOfUsed = movements
    .filter((m) => m.type === 'reversal' && m.reversesType === 'used')
    .reduce((sum, m) => sum + Number(m.quantity ?? 0), 0);
  const reversalOfReceived = movements
    .filter((m) => m.type === 'reversal' && m.reversesType === 'received')
    .reduce((sum, m) => sum + Number(m.quantity ?? 0), 0);
  return Number(starting) + received - used + adjustment + reversalOfUsed - reversalOfReceived;
};

const getItemByKey = async (itemKeyVal) => {
  const rows = await db.stockItems.where('itemKey').equals(itemKeyVal).toArray();
  return rows.length > 0 ? rows[0] : null;
};

/**
 * Get the predicted balance from the Dexie store for a given itemKey.
 *
 * @param {string} itemKeyVal
 * @returns {Promise<number|null>} predicted balance, or null if unset
 */
export const getPredictedBalance = async (itemKeyVal) => {
  const [item, movements] = await Promise.all([
    getItemByKey(itemKeyVal),
    db.stockMovements.where('itemKey').equals(itemKeyVal).toArray(),
  ]);
  if (!item) return null;
  return computePredictedBalance(item, movements);
};

/** Append a new movement to the ledger. Returns the stored row. */
export const addMovement = async (movement) => {
  const row = {
    ...movement,
    id: movement.id || genId(),
    timestamp: movement.timestamp || new Date().toISOString(),
  };
  await db.stockMovements.add(row);
  return row;
};

/** Set the starting count for a new StockItem and write it. */
export const setStartingCount = async (itemKeyVal, startingCount) => {
  const existing = await getItemByKey(itemKeyVal);
  if (existing) {
    await db.stockItems.update(existing.id, {
      startingCount: Number(startingCount),
      lastVerifiedAt: new Date().toISOString(),
    });
    return existing.id;
  }
  const id = genId();
  await db.stockItems.add({
    id,
    itemKey: itemKeyVal,
    description: '',
    unit: '',
    startingCount: Number(startingCount),
    minThreshold: null,
    lastVerifiedAt: new Date().toISOString(),
    location: null,
    isKeyItem: false,
    workersOftenTake: false,
  });
  return id;
};

/** Update the minThreshold for a StockItem. */
export const updateMinThreshold = async (itemKeyVal, minThreshold) => {
  const row = await getItemByKey(itemKeyVal);
  if (!row) return null;
  await db.stockItems.update(row.id, { minThreshold: Number(minThreshold) });
  return db.stockItems.get(row.id);
};

/** Set the storage location (rack/zone) for a StockItem. */
export const setItemLocation = async (itemKeyVal, location) => {
  const row = await getItemByKey(itemKeyVal);
  if (!row) return null;
  await db.stockItems.update(row.id, { location });
  return db.stockItems.get(row.id);
};

/** Set the key-item flag for a StockItem. */
export const setItemKeyItem = async (itemKeyVal, isKeyItem) => {
  const row = await getItemByKey(itemKeyVal);
  if (!row) return null;
  await db.stockItems.update(row.id, { isKeyItem: !!isKeyItem });
  return db.stockItems.get(row.id);
};

/** Set the workers-often-take flag for a StockItem. */
export const setWorkersOftenTake = async (itemKeyVal, workersOftenTake) => {
  const row = await getItemByKey(itemKeyVal);
  if (!row) return null;
  await db.stockItems.update(row.id, { workersOftenTake: !!workersOftenTake });
  return db.stockItems.get(row.id);
};

/**
 * Record a physical recount — writes an 'adjustment' movement (the ONLY place
 * 'adjustment' is written) and updates lastVerifiedAt.
 */
export const recordRecount = async (itemKeyVal, realCount, notedBy = 'supervisor') => {
  const item = await getItemByKey(itemKeyVal);
  if (!item) return null;

  const predicted = await getPredictedBalance(itemKeyVal);
  const real = Number(realCount);
  const baseline = predicted === null ? 0 : predicted;
  const delta = real - baseline;

  await db.stockItems.update(item.id, {
    lastVerifiedAt: new Date().toISOString(),
  });

  if (delta !== 0) {
    const unit = item.unit || '';
    const direction = delta > 0 ? 'added' : 'removed';
    await addMovement({
      itemKey: itemKeyVal,
      type: 'adjustment',
      quantity: Math.abs(delta),
      linkedProjectId: null,
      linkedSupplierId: null,
      actor: notedBy,
      note: `Recount adjustment: ${direction} ${Math.abs(delta)} ${unit}. Real: ${real}, Predicted: ${predicted}. Noted by: ${notedBy}`,
      timestamp: new Date().toISOString(),
    });
  }
  return db.stockItems.get(item.id);
};

/** Write a `received` movement for a StockItem. Returns the stored movement row. */
export const writeReceivedMovement = async (itemKeyVal, quantity, supplierId) => {
  return addMovement({
    itemKey: itemKeyVal,
    type: 'received',
    quantity: Number(quantity),
    linkedSupplierId: supplierId || null,
    actor: 'supervisor',
    timestamp: new Date().toISOString(),
  });
};

/** Write a `used` movement for a StockItem linked to a project. Returns the stored movement row. */
export const writeUsedMovement = async (itemKeyVal, quantity, projectId) => {
  return addMovement({
    itemKey: itemKeyVal,
    type: 'used',
    quantity: Number(quantity),
    linkedProjectId: projectId || null,
    actor: 'supervisor',
    timestamp: new Date().toISOString(),
  });
};

/**
 * Write a `reversal` movement that undoes the movement identified by reversesId.
 * The reversal carries reversesType ('used' or 'received') so computePredictedBalance
 * knows which bucket to apply it to. quantity is the amount to reverse (must match
 * the reversed movement's quantity for a full undo).
 */
export const writeReversalMovement = async ({ itemKeyVal, reversesId, reversesType, quantity, actor = 'supervisor', note = '' }) => {
  if (!['used', 'received'].includes(reversesType)) {
    throw new Error(`writeReversalMovement: reversesType must be 'used' or 'received', got ${reversesType}`);
  }
  return addMovement({
    itemKey: itemKeyVal,
    type: 'reversal',
    quantity: Number(quantity),
    linkedProjectId: null,
    linkedSupplierId: null,
    reversesId,
    reversesType,
    actor,
    note: note || `Reversed ${reversesType} movement ${reversesId}.`,
    timestamp: new Date().toISOString(),
  });
};

/** Get all StockItems. */
export const listStockItems = () => db.stockItems.toArray();

/** Get all StockMovements. */
export const listStockMovements = () => db.stockMovements.toArray();

/** Filter stock items currently below minThreshold. */
export const listLowStockItems = async () => {
  const items = await listStockItems();
  const result = [];
  for (const item of items) {
    // UNSET minThreshold (null) → never low-stock.
    if (item.minThreshold === null || item.minThreshold === undefined) continue;
    const balance = await getPredictedBalance(item.itemKey);
    // UNSET startingCount (balance null) → never low-stock.
    if (balance === null) continue;
    if (balance < Number(item.minThreshold)) {
      result.push(item);
    }
  }
  return result;
};

/** Get the in-app low-stock badge count. */
export const getLowStockBadgeCount = async () => {
  const low = await listLowStockItems();
  return low.length;
};

export default {
  StockItem,
  StockMovement,
  newStockItem,
  newStockMovement,
  computePredictedBalance,
  getPredictedBalance,
  addMovement,
  setStartingCount,
  updateMinThreshold,
  setItemLocation,
  setItemKeyItem,
  setWorkersOftenTake,
  recordRecount,
  writeReceivedMovement,
  writeUsedMovement,
  writeReversalMovement,
  listStockItems,
  listStockMovements,
  listLowStockItems,
  getLowStockBadgeCount,
};
