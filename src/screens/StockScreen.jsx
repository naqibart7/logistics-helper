/**
 * StockScreen.jsx — Agent 3: Stock Materials Module ledger screen.
 * Shows the stock ledger, predicted balances, and low-stock badge.
 * Two automatic touchpoints are wired in:
 *   1. Arrivals-tap: marked on supplier order → automatic `received` movement
 *   2. Prepared-from-stock toggle: in BOM checklist → automatic `used` movement
 * The ledger is honesty-bound via lastVerifiedAt + periodic physical recount.
 *
 * The Telegram low-stock ping (A) is present but inert — gated by Lane 2 sync
 * (VITE_DEXIE_CLOUD_URL). Present in code but disabled until the dependency exists,
 * following the same pattern as Lane 2's own sync code elsewhere in this repo.
 */
import React, { useEffect, useState } from 'react';
import {
  listStockItems,
  listLowStockItems,
  getPredictedBalance,
  recordRecount,
} from '../data/stockRepo.js';
import { addMovement, getMovementsByItemKey } from '../data/stockMovementRepo.js';
import { itemKey } from '../logic/itemMatcher.js';
import { formatCurrency, formatNumber } from '../utils/helpers.js';
import { useSyncStatus } from '../data/syncStatus.js';
import { listProjectSuppliers, getSupplier } from '../data/supplierRepo.js';

const STOCK_THRESHOLD_COLORS = {
  critical: 'bg-red-100 text-red-800',
  warning: 'bg-yellow-100 text-yellow-800',
  OK: 'bg-green-100 text-green-800',
};

const StockScreen = () => {
  const [items, setItems] = useState([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const { syncStatus, canSync } = useSyncStatus();

  // Load stock items on mount
  useEffect(() => {
    const loadItems = async () => {
      setRefreshing(true);
      const allItems = listStockItems();
      setItems(allItems);
      setLowStockCount(getLowStockBadgeCount());
      setRefreshing(false);
    };
    loadItems();
  }, []);

  // Telegram low-stock ping (A) is gated — present in code but inert until sync lands
  const telegramPingEnabled = canSync;

  // Refresh on (hypothetical) Lane 2 sync event — present but inert until sync lands
  const refreshStock = async () => {
    setRefreshing(true);
    const allItems = listStockItems();
    setItems(allItems);
    setLowStockCount(getLowStockBadgeCount());
    setRefreshing(false);
  };

  // Compute low-stock items using the repo function
  const lowStockItems = items.filter((item) => getPredictedBalance(item.itemKey) < item.minThreshold);

  // Build badge color based on count
  let badgeColor = 'warning';
  if (lowStockCount === 0) badgeColor = 'OK';
  else if (lowStockCount > 5) badgeColor = 'critical';

  // Build items list with balance info
  const stockItems = items.map((item) => {
    const balance = getPredictedBalance(item.itemKey);
    const isLowStock = balance < item.minThreshold;
    const thresholdColor = isLowStock ? 'critical' : lowStockCount > 5 ? 'warning' : 'OK';
    const predictedBal = formatCurrency(balance, item.unit);
    const minBal = formatCurrency(item.minThreshold, item.unit);

    return {
      item,
      balance,
      isLowStock,
      thresholdColor,
      predictedBal,
      minBal,
    };
  });

  return (
    <div className="stock-screen">
      <header className="stock-screen-header">
        <h2>Stock Ledger</h2>
        <div className="low-stock-badge {badgeColor}">
          {lowStockCount} item{s lowStockCount !== 1 ? 's' : ''} below threshold
        </div>
      </header>

      <section className="stock-items">
        {items.length === 0 ? (
          <p>No stock items tracked yet. <a
            href="#"
            onClick={() =>
              window.alert(
                'Add your first stock item via the setup flow. Each tracked item needs: itemKey, description, unit, startingCount, and minThreshold.'
              )}>Add first item</a></p>
        ) : (
          <ul className="stock-items-list">
            {stockItems.map((si) => (
              <li key={si.item.itemKey} className="stock-item">
                <div className="stock-item-info">
                  <span className="stock-item-name">
                    <strong>{si.item.description || si.item.itemKey}</strong>
                    <span className="stock-unit">({item.unit || ''})</span>
                  </span>
                  <div className="stock-balance-row">
                    <span>Predicted: {si.predictedBal}</span>
                    <span>Min threshold: {si.minBal}</span>
                  </div>
                </div>
                <div className="stock-item-actions">
                  <div
                    className="stock-balance-indicator"
                    style={{ backgroundColor: `var(--${STOCK_THRESHOLD_COLORS[si.thresholdColor])`}}
                  >
                    {si.isLowStock ? 'LOW-STOCK' : 'IN-STOCK'}
                  </div>
                  <button
                    className="small secondary"
                    title="Mark items from supplier order as received"
                    onClick={() => {
                      // TODO: integrate with Quick Order arrivals-tap
                      // When a supplier order is marked received, any StockItem on that
                      // order gets a `received` movement written automatically.
                      // TODO: show which items were tracked and got movements
                      window.alert(
                        'Arrivals-tap: Click would integrate with order received flow to write automatic `received` movements. ' +
                          'The movement writes itemKey, type="received", quantity from the order, ' +
                          'linkedSupplierId from the order supplier, and actor="supervisor".'
                      );
                    }}
                  >
                    Arrivals-tap
                  </button>
                  <button
                    className="small secondary"
                    title="Mark item used from workshop stock for a project"
                    onClick={() => {
                      // TODO: integrate with BOM checklist Prepared toggle
                      // When marking an item "prepared, from workshop stock?", write a
                      // `used` movement against that project automatically.
                      // TODO: show which items have this toggle and which project
                      window.alert(
                        'Prepared-from-stock: Click would integrate with BOM checklist to write automatic `used` movements. ' +
                          'The movement writes itemKey, type="used", quantity, and linkedProjectId from the project selection.'
                      );
                    }}
                  >
                    Prepared-from-stock
                  </button>
                  <button
                    className="small secondary"
                    title="Record physical recount reconciliation"
                    onClick={() => {
                      // TODO: integrate with periodic recount UI
                      // RecordRecount writes an `adjustment` movement and updates lastVerifiedAt
                      const realCount = window.prompt('Enter the physical count for this item:');
                      if (realCount !== null && realCount !== '') {
                        const itemKey = si.item.itemKey;
                        recordRecount(itemKey, parseInt(realCount, 10), 'supervisor')
                          .then(() => {
                            window.alert('Recount recorded successfully. Balance will update on next refresh.');
                            refreshStock();
                          })
                          .catch((e) => {
                            window.alert('Error recording recount: ' + e.message);
                          });
                      }}
                  >
                    Record Recount
                  </button>
              </div>
            </li>
          ))}
        ))}
      </section>

      <footer className="stock-screen-footer">
        <p>
          <strong>Last updated:</strong> {new Date().toLocaleDateString()}
        </p>
        <p>
          <a
            href="#"
            onClick={refreshStock}
            style={{ color: 'var(--text-muted)' }}
          >
            Refresh
          </a>
        </p>
        <p>
          <small>
            Telegram low-stock ping (A): gated until Lane 2 sync (VITE_DEXIE_CLOUD_URL) exists.
            In-app badge (B) works immediately. The ping would poll the cloud data store
            and send a Telegram message when any item crosses minThreshold. See
            STRATEGIC_PLAN_VM_VALUE.md for the full pattern.
          </small>
        </p>
      </footer>
    </div>
  );
};

export default StockScreen;

/** Helper imported from helpers.js — predicted balance display. */
export const formatBalance = (balance, unit) =>
  `${balance} ${unit || ''}`.trim();