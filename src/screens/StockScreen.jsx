/**
 * StockScreen.jsx — Agent 3: Stock Materials Module ledger screen.
 * Shows the stock ledger, predicted balances, and low-stock badge.
 * Two automatic touchpoints are wired in:
 *   1. Arrivals-tap: marked on supplier order → automatic `received` movement
 *   2. Prepared-from-stock toggle: in BOM checklist → automatic `used` movement
 * The ledger is honesty-bound via lastVerifiedAt + periodic physical recount.
 *
 * No window.prompt is used anywhere — all entry is inline with name-based
 * pickers for suppliers and projects (never typed IDs).
 *
 * The Telegram low-stock ping (A) is present but inert — gated by Lane 2 sync
 * (VITE_DEXIE_CLOUD_URL). Present in code but disabled until the dependency exists.
 */
import React, { useEffect, useState } from 'react';
import {
  listStockItems,
  getPredictedBalance,
  setItemLocation,
  setItemKeyItem,
  setWorkersOftenTake,
  recordRecount,
  writeReceivedMovement,
  writeUsedMovement,
  getLowStockBadgeCount,
  listLowStockItems,
} from '../data/stockRepo.js';
import { formatCurrency, formatNumber } from '../utils/helpers.js';
import { useSyncStatus } from '../data/syncStatus.js';
import { listSuppliers } from '../data/supplierRepo.js';
import { listProjects } from '../data/projectRepo.js';

// App stylesheet classes (index.css) — this screen has no Tailwind dependency.
const STOCK_THRESHOLD_CLASSES = {
  critical: 'stock-status-critical',
  warning: 'stock-status-warning',
  OK: 'stock-status-ok',
};

const StockScreen = () => {
  const [items, setItems] = useState([]);
  const [stockItemsWithBalance, setStockItemsWithBalance] = useState([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [projects, setProjects] = useState([]);
  // Local form state per itemKey: { receivedQty, receivedSupplier, usedQty, usedProject, recountQty }
  const [formState, setFormState] = useState({});
  // Notice banner
  const [notice, setNotice] = useState(null);
  const { canSync } = useSyncStatus();

  const refreshStock = async () => {
    setRefreshing(true);
    try {
      const [allItems, allSuppliers, allProjects, badgeCount] = await Promise.all([
        listStockItems(),
        listSuppliers().catch(() => []),
        listProjects().catch(() => []),
        getLowStockBadgeCount(),
      ]);
      setItems(allItems);
      setSuppliers(allSuppliers);
      setProjects(allProjects);
      setLowStockCount(badgeCount);

      const withBalances = [];
      for (const item of allItems) {
        const balance = await getPredictedBalance(item.itemKey);
        // UNSET startingCount → balance is null → never low-stock.
        // UNSET minThreshold → never low-stock.
        const minThreshold = item.minThreshold;
        const isLowStock = balance !== null
          && minThreshold !== null && minThreshold !== undefined
          && balance < Number(minThreshold);
        const thresholdColor = isLowStock
          ? 'critical'
          : badgeCount > 5
            ? 'warning'
            : 'OK';
        withBalances.push({
          item,
          balance,
          isLowStock,
          thresholdColor,
        });
      }
      setStockItemsWithBalance(withBalances);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refreshStock();
  }, []);

  const setForm = (itemKeyVal, patch) => {
    setFormState((prev) => ({ ...prev, [itemKeyVal]: { ...prev[itemKeyVal], ...patch } }));
  };
  const formFor = (itemKeyVal) => formState[itemKeyVal] || {};

  const handleReceive = async (si) => {
    const f = formFor(si.item.itemKey);
    const qty = Number(f.receivedQty);
    if (!qty || qty <= 0 || Number.isNaN(qty)) {
      setNotice('Please enter a valid positive received quantity.');
      return;
    }
    try {
      await writeReceivedMovement(si.item.itemKey, qty, f.receivedSupplier || null);
      setNotice(`${qty} ${si.item.unit || 'unit(s)'} received recorded.`);
      setForm(si.item.itemKey, { receivedQty: '' });
      await refreshStock();
    } catch (e) {
      setNotice('Error recording received movement: ' + e.message);
    }
  };

  const handleUse = async (si) => {
    const f = formFor(si.item.itemKey);
    const qty = Number(f.usedQty);
    if (!qty || qty <= 0 || Number.isNaN(qty)) {
      setNotice('Please enter a valid positive used quantity.');
      return;
    }
    try {
      await writeUsedMovement(si.item.itemKey, qty, f.usedProject || null);
      setNotice(`${qty} ${si.item.unit || 'unit(s)'} used recorded.`);
      setForm(si.item.itemKey, { usedQty: '' });
      await refreshStock();
    } catch (e) {
      setNotice('Error recording used movement: ' + e.message);
    }
  };

  const handleRecount = async (si) => {
    const f = formFor(si.item.itemKey);
    const realCount = Number(f.recountQty);
    if (realCount === '' || realCount === null || Number.isNaN(realCount) || realCount < 0) {
      setNotice('Please enter a valid non-negative count.');
      return;
    }
    try {
      await recordRecount(si.item.itemKey, realCount, 'supervisor');
      setNotice('Recount recorded successfully. Balance updated.');
      setForm(si.item.itemKey, { recountQty: '' });
      await refreshStock();
    } catch (e) {
      setNotice('Error recording recount: ' + e.message);
    }
  };

  const telegramPingEnabled = canSync;

  return (
    <div className="stock-screen">
      <header className="stock-screen-header">
        <h2>Stock Ledger</h2>
        <div className={`low-stock-badge ${STOCK_THRESHOLD_CLASSES[
          lowStockCount === 0 ? 'OK' : lowStockCount > 5 ? 'critical' : 'warning'
        ]}`}>
          {lowStockCount} item{lowStockCount !== 1 ? 's' : ''} below threshold
        </div>
      </header>

      {notice && <div className="card" role="status" style={{ margin: '0.5rem 0' }}>{notice}</div>}

      <section className="stock-items">
        {items.length === 0 ? (
          <p>No stock items tracked yet. Add your first stock item via the setup flow. Each
            tracked item needs: itemKey, description, unit, startingCount, and minThreshold.</p>
        ) : (
          <ul className="stock-items-list">
            {stockItemsWithBalance.map((si) => {
              const f = formFor(si.item.itemKey);
              const balanceLabel = si.balance === null
                ? 'Needs starting count'
                : `${formatNumber(si.balance)} ${si.item.unit || ''}`;
              return (
                <li key={si.item.itemKey || si.item.id} className="stock-item">
                  <div className="stock-item-info">
                    <span className="stock-item-name">
                      <strong>{si.item.description || si.item.itemKey}</strong>
                      <span className="stock-unit">({si.item.unit || ''})</span>
                    </span>
                    <div className="stock-balance-row">
                      <span>Predicted: {balanceLabel}</span>
                      <span>
                        Min threshold: {si.item.minThreshold === null || si.item.minThreshold === undefined
                          ? 'unset'
                          : `${formatNumber(si.item.minThreshold)} ${si.item.unit || ''}`}
                      </span>
                    </div>
                    {si.item.location && (
                      <div className="small" style={{ color: 'var(--text-muted)' }}>
                        Location: {si.item.location}
                      </div>
                    )}
                    {(si.item.isKeyItem || si.item.workersOftenTake) && (
                      <div className="small" style={{ color: 'var(--text-muted)' }}>
                        {si.item.isKeyItem && '⭐ Key item'}
                        {si.item.isKeyItem && si.item.workersOftenTake && ' · '}
                        {si.item.workersOftenTake && '👷 Workers often take'}
                      </div>
                    )}
                  </div>
                  <div className="stock-item-actions">
                    <div
                      className={`stock-balance-indicator ${STOCK_THRESHOLD_CLASSES[si.thresholdColor]}`}
                    >
                      {si.balance === null ? 'NEEDS STARTING COUNT' : si.isLowStock ? 'LOW-STOCK' : 'IN-STOCK'}
                    </div>

                    {/* Inline Receive control (no prompt, supplier by name) */}
                    <div className="stock-inline-control" style={{ marginTop: '0.5rem' }}>
                      <div className="small" style={{ color: 'var(--text-muted)' }}>Record arrival</div>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          min={0}
                          placeholder="Qty"
                          value={f.receivedQty ?? ''}
                          onChange={(e) => setForm(si.item.itemKey, { receivedQty: e.target.value })}
                          style={{ width: '80px' }}
                          aria-label={`Received quantity for ${si.item.description || si.item.itemKey}`}
                        />
                        <select
                          value={f.receivedSupplier || ''}
                          onChange={(e) => setForm(si.item.itemKey, { receivedSupplier: e.target.value || null })}
                          aria-label={`Supplier for ${si.item.description || si.item.itemKey}`}
                        >
                          <option value="">(no supplier)</option>
                          {suppliers.map((s) => (
                            <option key={s.id} value={s.id}>{s.businessName}</option>
                          ))}
                        </select>
                        <button
                          className="small"
                          style={{ minWidth: '48px' }}
                          onClick={() => handleReceive(si)}
                        >
                          Receive
                        </button>
                      </div>
                    </div>

                    {/* Inline Use control (no prompt, project by name) */}
                    <div className="stock-inline-control" style={{ marginTop: '0.5rem' }}>
                      <div className="small" style={{ color: 'var(--text-muted)' }}>Use from stock</div>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          min={0}
                          placeholder="Qty"
                          value={f.usedQty ?? ''}
                          onChange={(e) => setForm(si.item.itemKey, { usedQty: e.target.value })}
                          style={{ width: '80px' }}
                          aria-label={`Used quantity for ${si.item.description || si.item.itemKey}`}
                        />
                        <select
                          value={f.usedProject || ''}
                          onChange={(e) => setForm(si.item.itemKey, { usedProject: e.target.value || null })}
                          aria-label={`Project for ${si.item.description || si.item.itemKey}`}
                        >
                          <option value="">(no project)</option>
                          {projects.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <button
                          className="small"
                          style={{ minWidth: '48px' }}
                          onClick={() => handleUse(si)}
                        >
                          Use
                        </button>
                      </div>
                    </div>

                    {/* Inline Recount control */}
                    <div className="stock-inline-control" style={{ marginTop: '0.5rem' }}>
                      <div className="small" style={{ color: 'var(--text-muted)' }}>Physical recount</div>
                      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          min={0}
                          placeholder="Real count"
                          value={f.recountQty ?? ''}
                          onChange={(e) => setForm(si.item.itemKey, { recountQty: e.target.value })}
                          style={{ width: '100px' }}
                          aria-label={`Recount quantity for ${si.item.description || si.item.itemKey}`}
                        />
                        <button
                          className="small"
                          style={{ minWidth: '48px' }}
                          onClick={() => handleRecount(si)}
                        >
                          Record recount
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="stock-screen-footer">
        <p>
          <strong>Last updated:</strong> {new Date().toLocaleDateString()}
        </p>
        <p>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              refreshStock();
            }}
            style={{ color: 'var(--text-muted)' }}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </a>
        </p>
        <p>
          <small>
            Telegram low-stock ping (A): gated until Lane 2 sync (VITE_DEXIE_CLOUD_URL) exists.
            In-app badge (B) works immediately. The ping would poll the cloud data store
            and send a Telegram message when any item crosses minThreshold.
          </small>
        </p>
      </footer>
    </div>
  );
};

export default StockScreen;

export const formatBalance = (balance, unit) =>
  `${balance} ${unit || ''}`.trim();
