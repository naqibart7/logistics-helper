/**
 * stockMovementRepo.js — Agent 3: Stock Movement CRUD.
 * Reads/writes StockMovement rows from Dexie.
 * No business logic — pure data access, same pattern as supplierRepo.js.
 */
import db from './db.js';

/** Append a single StockMovement row. */
export const addMovement = async (movement) => {
  await db.stockMovements.add(movement);
};

/** Bulk append multiple movements. */
export const addMovements = async (movements) => {
  await db.stockMovements.bulkAdd(movements);
};

/** Get all movements for a specific itemKey. */
export const getMovementsByItemKey = (itemKey) =>
  db.stockMovements.where('itemKey').equals(itemKey).toArray();

/** Get all movements. */
export const listAllMovements = () => db.stockMovements.toArray();

/** Filter movements by type. */
export const filterMovementsByType = (type) =>
  db.stockMovements.where('type').equals(type).toArray();

/** Get the most recent movement timestamp for an itemKey. */
export const getLastMovementTimestamp = (itemKey) => {
  return db
    .stockMovements
    .where('itemKey')
    .equals(itemKey)
    .orderBy('timestamp')
    .last();
};

/** Delete a movement by id. */
export const deleteMovement = (id) => db.stockMovements.delete(id);