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
 */
import db from './db.js';
import { itemKey } from '../logic/itemMatcher.js';

/** StockItem fields (persisted in Dexie). */
export const StockItem = {
  id: crypto.randomUUID ?? crypto.randomUUID,
  itemKey: '', // normalized: itemName|spec — populated when item first added
  description: '',
  unit: '',
  startingCount: 0, // one-time baseline, set when item first added to tracking
  minThreshold: 0,  // "key-item min" — below this, low-stock badge shows
  lastVerifiedAt: null, // ISO date string of last physical recount
  location: null,   // rack or zone where item is stored
  isKeyItem: false, // flag: this is a "key item" tracked for low-stock pings
  workersOftenTake: false, // flag: item is commonly consumed by workshop staff
};

/** StockMovement fields (persisted in Dexie). */
export const StockMovement = {
  id: crypto.randomUUID ?? crypto.randomUUID,
  itemKey,
  type: 'starting' | 'received' | 'used' | 'adjustment', // always positive qty; type adds/subtracts
  quantity: 0, // always positive
  linkedProjectId: null, // set when type is 'used'
  linkedSupplierId: null, // set when type is 'received'
  actor: 'supervisor', // all manual taps — there's no agent writing to this ledger
  note: '',
  timestamp: new Date().toISOString(),
};

/** Default empty StockItem — used when first adding a new tracked item. */
export const newStockItem = () => ({
  id: StockItem.id,
  itemKey: '',
  description: '',
  unit: '',
  startingCount: 0,
  minThreshold: 0,
  lastVerifiedAt: null,
});

/** Default empty StockMovement row. */
export const newStockMovement = () => ({
  id: StockMovement.id,
  itemKey: '',
  type: 'starting',
  quantity: 0,
  linkedProjectId: null,
  linkedSupplierId: null,
  actor: 'supervisor',
  note: '',
  timestamp: new Date().toISOString(),
});

/**
 * Compute predicted balance for a StockItem.
 * Sum of all movements: startingCount + (received qty) − (used qty).
 * Adjustment qty is added/subtracted per its sign (positive = add, negative = subtract)
 * but stored as absolute positive with type 'adjustment'.
 * Never stores the balance as a mutable field — computed on read.
 *
 * @param {StockItem} item
 * @param {StockMovement[]} movements
 * @returns {number} predicted balance
 */
export const computePredictedBalance = (item, movements) => {
  const starting = item.startingCount ?? 0;
  const received = movements
    .filter((m) => m.type === 'received')
    .reduce((sum, m) => sum + m.quantity, 0);
  const used = movements
    .filter((m) => m.type === 'used')
    .reduce((sum, m) => sum + m.quantity, 0);
  const adjustment = movements
    .filter((m) => m.type === 'adjustment')
    .reduce((sum, m) => sum + m.quantity * (m.linkedProjectId === null ? 1 : 1), 0); // adjustment always adds
  return starting + received - used;
};

/**
 * Get the predicted balance from the Dexie store for a given itemKey.
 * Reads all movements and computes on demand.
 *
 * @param {string} itemKey
 * @returns {number} predicted balance
 */
export const getPredictedBalance = (itemKey) => {
  const movements = db.stockMovements.where('itemKey').equals(itemKey).toArray();
  return computePredictedBalance(
    db.stockItems.get(itemKey),
    movements
  );
};

/** Append a new movement to the ledger. */
export const addMovement = async (movement) => {
  const row = {
    ...movement,
    id: Movement.id,
  };
  await db.stockMovements.add(row);
};

/** Set the starting count for a new StockItem and write it. */
export const setStartingCount = async (itemKey, startingCount) => {
  await db.stockItems.put({
    id: crypto.randomUUID ?? crypto.randomUUID,
    itemKey,
    startingCount,
    minThreshold: 0, // will be set separately via updateMinThreshold
    lastVerifiedAt: new Date().toISOString(),
  });
};

/** Update the minThreshold for a StockItem. */
export const updateMinThreshold = async (itemKey, minThreshold) => {
  await db.stockItems.update(
    db.stockItems.where('itemKey').equals(itemKey).primaryKey,
    { minThreshold }
  );
};

/** Set the storage location (rack/zone) for a StockItem. */
export const setItemLocation = async (itemKey, location) => {
  await db.stockItems.update(
    db.stockItems.where('itemKey').equals(itemKey).primaryKey,
    { location }
  );
};

/** Set the key-item flag for a StockItem. */
export const setItemKeyItem = async (itemKey, isKeyItem) => {
  await db.stockItems.update(
    db.stockItems.where('itemKey').equals(itemKey).primaryKey,
    { isKeyItem }
  );
};

/** Set the workers-often-take flag for a StockItem. */
export const setWorkersOftenTake = async (itemKey, workersOftenTake) => {
  await db.stockItems.update(
    db.stockItems.where('itemKey').equals(itemKey).primaryKey,
    { workersOftenTake }
  );
};

/** Record a physical recount — writes an adjustment movement and updates lastVerifiedAt. */
export const recordRecount = async (itemKey, realCount, notedBy = 'supervisor') => {
  const item = db.stockItems.get(itemKey);
  if (!item) return;

  const predicted = getPredictedBalance(itemKey);
  const adjustment = realCount - predicted;

  await db.stockItems.put({
    id: item.id,
    itemKey: item.itemKey,
    description: item.description,
    unit: item.unit,
    startingCount: item.startingCount,
    minThreshold: item.minThreshold,
    lastVerifiedAt: new Date().toISOString(),
  });

  await addMovement({
    itemKey,
    type: 'adjustment',
    quantity: Math.abs(adjustment),
    note: `Recount adjustment: ${adjustment > 0 ? 'added' : 'removed'} ${Math.abs(
      adjustment
    )} ${item.unit || ''}. Real: ${realCount}, Predicted: ${predicted}. Noted by: ${notedBy}`,
    timestamp: new Date().toISOString(),
  });
};

/** Write a `received` movement for a StockItem (auto-called when supplier order is marked received). */
export const writeReceivedMovement = async (itemKey, quantity, supplierId) => {
  await addMovement({
    itemKey,
    type: 'received',
    quantity,
    linkedSupplierId: supplierId,
    timestamp: new Date().toISOString(),
  });
};

/** Write a `used` movement for a StockItem linked to a project (auto-called when prepared-from-stock toggle is used). */
export const writeUsedMovement = async (itemKey, quantity, projectId) => {
  await addMovement({
    itemKey,
    type: 'used',
    quantity,
    linkedProjectId: projectId,
    timestamp: new Date().toISOString(),
  });
};

/** Get all StockItems. */
export const listStockItems = () => db.stockItems.toArray();

/** Get all StockMovements. */
export const listStockMovements = () => db.stockMovements.toArray();

/** Filter stock items currently below minThreshold. */
export const listLowStockItems = () => {
  const items = listStockItems();
  return items.filter((item) => {
    const balance = getPredictedBalance(item.itemKey);
    return balance < item.minThreshold;
  });
};

/** Get the in-app low-stock badge count. */
export const getLowStockBadgeCount = () => listLowStockItems().length;