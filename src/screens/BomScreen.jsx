/**
 * BomScreen.jsx — Agent 4: BOM as a one-handed row list, ordered by displayOrder.
 * Supervisor edits go through mergeEngine.supervisorEdit (locks + supervisor log).
 * Value cells are real controls: role="button", keyboard-operable, 48px targets.
 * Fast Ordering: per-row supplier picker (+preset checkbox), grouping by supplier
 * (Unassigned first), per-group Order-via-WhatsApp with preview modal. Assignment
 * is relational (plain update, never locked, never merged); eligibility/message/
 * phone rules live in logic/quickOrder.js.
 */
import React, { useEffect, useState } from 'react';
import { listBomItems, reorderBomItems } from '../data/bomRepo.js';
import * as bomRepo from '../data/bomRepo.js';
import { getProject } from '../data/projectRepo.js';
import { listChangeLog, appendChangeLog } from '../data/changeLogRepo.js';
import { listProjectSuppliers, getSupplier } from '../data/supplierRepo.js';
import { listShortageItems } from '../data/shortageRepo.js';
import { getPreset, setPreset } from '../data/presetRepo.js';
import { supervisorEdit } from '../logic/mergeEngine.js';
import { itemKey } from '../logic/itemMatcher.js';
import {
  eligibleOrderItems,
  buildQuickOrderMessage,
  buildQuickOrderLink,
} from '../logic/quickOrder.js';
import {
  buildBomExportLines,
  buildBomExportData,
  renderBomExportPdf,
} from '../logic/bomExportDocument.js';
import { formatCurrency, formatNumber, formatShortDate, byDisplayOrder } from '../utils/helpers.js';
import { checkBomRows } from '../logic/importCheck.js';
import {
  writeUsedMovement,
  writeReversalMovement,
  listStockItems,
  getPredictedBalance,
} from '../data/stockRepo.js';
import { getMovement as getStockMovement } from '../data/stockMovementRepo.js';

const editDeps = {
  getBomItem: bomRepo.getBomItem,
  lockField: bomRepo.lockField,
  updateBomItem: bomRepo.updateBomItem,
  appendChangeLog,
};

const activate = (fn) => (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
};

/** Inline supplier picker with the explicit preset checkbox. Shared by manual
 *  assignment and the Unassigned-group flow (same control, same rule). */
const SupplierPicker = ({ suppliers, value, itemName, onAssign }) => {
  const [remember, setRemember] = useState(false);
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <label className="small" style={{ color: 'var(--text-muted)' }}>
        Supplier for {itemName}
        <select
          value={value || ''}
          onChange={(e) => onAssign(e.target.value || null, remember)}
          style={{ width: '100%', marginTop: '0.25rem' }}
        >
          <option value="">Unassigned</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.businessName}</option>
          ))}
        </select>
      </label>
      <label className="small" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        Always use this supplier for {itemName}?
      </label>
    </div>
  );
};

export default function BomScreen({ projectId, onGoSuppliers, onAddItem, initialReviewFilter = false }) {
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [projectName, setProjectName] = useState('');
  const [openConfirms, setOpenConfirms] = useState([]);
  const [editing, setEditing] = useState(null); // { id, field, value, type }
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [exporting, setExporting] = useState(false);
  // View is display-only: 'supplier' (default, preserves the fast-order flow),
  // 'category' (review grouping), 'flat' (raw displayOrder). Stored order,
  // merge matching, and reorder semantics never see this state.
  const [view, setView] = useState('supplier');
  const [preparedFilter, setPreparedFilter] = useState('all'); // 'all' | 'not' | 'prepared'
  const [orderCtx, setOrderCtx] = useState(null); // { supplier, eligible, excluded }
  const [noteDraft, setNoteDraft] = useState('');
  const [orderError, setOrderError] = useState(null);
  // Import check state: findings from checkBomRows(), and supervisor-verified row ids.
  // Verified ids are ephemeral UI state — not persisted; they move a row out of "To review"
  // until the next page reload (the ChangeLogEntry + lock are the durable record).
  const [importCheckFilter, setImportCheckFilter] = useState(initialReviewFilter);
  const [verifiedIds, setVerifiedIds] = useState(new Set());

  useEffect(() => {
    if (initialReviewFilter) setImportCheckFilter(true);
  }, [initialReviewFilter]);

  const reload = async () => {
    const [rows, project, links, confirms] = await Promise.all([
      listBomItems(projectId),
      getProject(projectId),
      listProjectSuppliers(projectId),
      listShortageItems(projectId, { resolved: false }),
    ]);
    setItems(rows);
    setProjectName(project ? project.name : 'UNKNOWN PROJECT');
    setOpenConfirms(confirms);
    const joined = (
      await Promise.all(links.map((l) => getSupplier(l.globalSupplierId)))
    ).filter(Boolean);
    joined.sort((a, b) => String(a.businessName).localeCompare(String(b.businessName)));
    setSuppliers(joined);
  };
  useEffect(() => {
    reload();
  }, [projectId]);

  const ordered = byDisplayOrder(items);

  // BOM checklist header: N of M prepared. Plain count, no percentage, no progress bar.
  const preparedCount = ordered.filter((it) => !!it.prepared).length;
  const totalCount = ordered.length;

  // Filter by preparation state. Composes with the Suppliers/Category/All grouping —
  // grouping counts still sum to the header total because the header counts ALL items.
  const preparedFiltered = ordered.filter((it) => {
    if (preparedFilter === 'prepared') return !!it.prepared;
    if (preparedFilter === 'not') return !it.prepared;
    return true;
  });

  // A3: Import check findings — computed on every render, never stored.
  // findingsByRowId: Map<id, Finding[]> — used for per-row badges and the "To review" filter.
  const allFindings = checkBomRows(items);
  const findingsByRowId = new Map();
  for (const f of allFindings) {
    if (!findingsByRowId.has(f.rowId)) findingsByRowId.set(f.rowId, []);
    findingsByRowId.get(f.rowId).push(f);
  }
  // "To review": flagged rows that are not yet verified this session.
  // A row leaves "To review" once purchaseQty is locked AND R1 passes (or it's verified).
  const isToReview = (item) => {
    if (verifiedIds.has(item.id)) return false;
    const rowFindings = findingsByRowId.get(item.id);
    if (!rowFindings || rowFindings.length === 0) return false;
    // If purchaseQty is locked and R1 is no longer triggered, it's cleared.
    const locked = Array.isArray(item.lockedFields) ? item.lockedFields : [];
    if (locked.includes('purchaseQty')) {
      const r1 = rowFindings.some((f) => f.rule === 'R1');
      if (!r1) return false;
    }
    return true;
  };
  const reviewCount = items.filter(isToReview).length;

  // Apply importCheckFilter on top of preparedFiltered (composable).
  const checkFiltered = importCheckFilter
    ? preparedFiltered.filter((it) => isToReview(it))
    : preparedFiltered;
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  // Grouping: Unassigned first (null assignment OR dangling supplier id),
  // then suppliers alphabetically. Display-only; storage untouched.
  const buildGroups = () => {
    const unassigned = [];
    const bySup = new Map();
    for (const item of checkFiltered) {
      const s = item.assignedSupplierId ? supplierById.get(item.assignedSupplierId) : null;
      if (!s) unassigned.push(item);
      else {
        if (!bySup.has(s.id)) bySup.set(s.id, { supplier: s, items: [] });
        bySup.get(s.id).items.push(item);
      }
    }
    const groups = [];
    if (unassigned.length > 0) groups.push({ id: null, supplier: null, items: unassigned });
    for (const g of [...bySup.values()].sort((a, b) =>
      String(a.supplier.businessName).localeCompare(String(b.supplier.businessName)))) {
      groups.push(g);
    }
    return groups;
  };

  const openEditor = (item, field, type) =>
    setEditing({ id: item.id, field, value: item[field] ?? '', type });

  const saveEdit = async () => {
    if (!editing || saving) return;
    setSaving(true);
    const num = editing.type === 'number' ? Number(editing.value) : editing.value;
    try {
      await supervisorEdit(editing.id, editing.field, num, editDeps);
      setNotice(`Saved. ${editing.field} locked — future imports won't overwrite it.`);
      setEditing(null);
      await reload();
    } catch (err) {
      setNotice(`Couldn't save — still draft. ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const persistOrder = async (orderedIds, movedName, toPosition) => {
    await reorderBomItems(projectId, orderedIds);
    setNotice(`Moved "${movedName}" to position ${toPosition}. Order saved.`);
    await reload();
  };

  const move = async (id, dir) => {
    const ids = ordered.map((r) => r.id);
    const from = ids.indexOf(id);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const row = ordered.find((r) => r.id === id);
    await persistOrder(next, row ? row.item : id, to + 1);
  };

  const onDropOn = async (targetId) => {
    if (!dragId || dragId === targetId) return;
    const ids = ordered.map((r) => r.id).filter((id) => id !== dragId);
    const to = ids.indexOf(targetId);
    ids.splice(to < 0 ? ids.length : to, 0, dragId);
    const row = ordered.find((r) => r.id === dragId);
    setDragId(null);
    await persistOrder(ids, row ? row.item : dragId, (to < 0 ? ids.length : to) + 1);
  };

  const assignSupplier = async (item, supplierId, remember) => {
    await bomRepo.updateBomItem(item.id, { assignedSupplierId: supplierId });
    if (supplierId && remember) {
      await setPreset(itemKey(item.item, item.spec), supplierId);
      setNotice(`Assigned "${item.item}" and remembered for future imports.`);
    } else if (supplierId) {
      const s = supplierById.get(supplierId);
      setNotice(`Assigned "${item.item}" to ${s ? s.businessName : 'supplier'}.`);
    } else {
      setNotice(`"${item.item}" is now unassigned.`);
    }
    await reload();
  };

  const toggleFromStock = async (item) => {
    const currentFromStock = !!item.fromStock;
    const k = itemKey(item.item, item.spec);
    const qty = Number(item.purchaseQty ?? 0);

    if (!currentFromStock) {
      if (!qty || qty <= 0) {
        setNotice(`Can't mark "${item.item}" from stock — purchaseQty is empty.`);
        return;
      }
      const balance = await getPredictedBalance(k);
      // null balance means startingCount unset — still allow, but warn.
      if (balance !== null && balance < qty) {
        const goAhead = window.confirm(
          `Stock balance for "${item.item}" is ${balance} but you need ${qty}. Mark anyway?`
        );
        if (!goAhead) return;
      }
      // Write the used movement and capture its id + qty so untick can reverse EXACTLY that.
      const movement = await writeUsedMovement(k, qty, projectId);
      const stockItems = await listStockItems();
      const tracked = stockItems.find((s) => s.itemKey === k);
      const movementNote = tracked
        ? `Used ${qty} ${item.unit || ''} from stock. Balance was: ${balance}`
        : `Used ${qty} ${item.unit || ''} from stock (item not yet tracked — add it to Stock for accurate balances).`;
      await bomRepo.updateBomItem(item.id, { fromStock: true, stockMovementId: movement.id });
      await appendChangeLog({
        projectId,
        actor: 'supervisor',
        field: `${item.item} :: from_stock`,
        oldValue: null,
        newValue: movementNote,
      });
      setNotice(`Marked "${item.item}" as prepared from workshop stock.`);
    } else {
      // Reverse the EXACT quantity written, by looking up the original movement.
      // This is not the current purchaseQty — it's what was actually deducted.
      let reversedQty = qty;
      if (item.stockMovementId) {
        const original = await getStockMovement(item.stockMovementId);
        if (original) reversedQty = Number(original.quantity ?? 0);
      }
      await writeReversalMovement({
        itemKeyVal: k,
        reversesId: item.stockMovementId || `untick-${Date.now()}`,
        reversesType: 'used',
        quantity: reversedQty,
        actor: 'supervisor',
        note: `Reversed stock usage: un-ticked "from stock" on BOM. Project: ${projectId}. Quantity: ${reversedQty}.`,
      });
      await bomRepo.updateBomItem(item.id, { fromStock: false, stockMovementId: null });
      await appendChangeLog({
        projectId,
        actor: 'supervisor',
        field: `${item.item} :: from_stock_reversed`,
        oldValue: null,
        newValue: `Reversed ${reversedQty} ${item.unit || ''} back to stock.`,
      });
      setNotice(`Removed "${item.item}" from stock use — balance restored.`);
    }
    await reload();
  };

  const toggleDoubtful = async (item) => {
    const next = !item.doubtful;
    await bomRepo.updateBomItem(item.id, { doubtful: next });
    await appendChangeLog({
      projectId,
      actor: 'supervisor',
      field: `${item.item} :: doubtful`,
      oldValue: String(!!item.doubtful),
      newValue: String(next),
    });
    setNotice(next
      ? `"${item.item}" marked doubtful — visually flagged.`
      : `"${item.item}" cleared of doubtful flag.`);
    await reload();
  };

  // BOM checklist (BOM_CHECKLIST_MODE_SPEC): preparation tracking, separate from fromStock.
  // Prepared = delivery readiness only; does NOT touch stock (that's fromStock's job).
  const togglePrepared = async (item) => {
    const next = !item.prepared;
    await bomRepo.updateBomItem(item.id, { prepared: next });
    await appendChangeLog({
      projectId,
      actor: 'supervisor',
      field: `${item.item} :: prepared`,
      oldValue: String(!!item.prepared),
      newValue: String(next),
    });
    setNotice(next ? `"${item.item}" marked prepared.` : `"${item.item}" unmarked prepared.`);
    await reload();
  };

  const updatePreparedNote = async (item, note) => {
    await bomRepo.updateBomItem(item.id, { preparedNote: note });
    await reload();
  };

  /**
   * A4 — "Verified" tap on a flagged import-check row.
   * Locks purchaseQty through the standard supervisor-edit path (same as manual
   * edits: lock + ChangeLogEntry). Also locks unitCost if it is numeric.
   * Writes a human diary sentence — no raw field names leak to the screen.
   * Removes the row from "To review" in the local UI state immediately.
   */
  const verifyRow = async (item) => {
    try {
      await bomRepo.lockField(item.id, 'purchaseQty');
      if (typeof item.unitCost === 'number' && Number.isFinite(item.unitCost)) {
        await bomRepo.lockField(item.id, 'unitCost');
      }
      const qty = item.purchaseQty;
      await appendChangeLog({
        projectId,
        actor: 'supervisor',
        field: 'verified:purchaseQty',
        oldValue: qty,
        newValue: qty,
        itemName: item.item,
      });
      setVerifiedIds((prev) => new Set([...prev, item.id]));
      setNotice(`Verified quantity ${qty ?? '(unset)'} for "${item.item}".`);
      await reload();
    } catch (err) {
      setNotice(`Verify failed: ${err.message}`);
    }
  };

  // Received control (Task 2): delivery tracking only, does NOT touch stock yet.
  // receivedQty is cumulative, never below 0.
  const handleReceivedQty = async (item, nextQty) => {
    const clamped = Math.max(0, Number(nextQty) || 0);
    const old = typeof item.receivedQty === 'number' ? item.receivedQty : 0;
    if (clamped === old) return;
    await bomRepo.updateBomItem(item.id, { receivedQty: clamped });
    await appendChangeLog({
      projectId,
      actor: 'supervisor',
      field: `${item.item} :: received_qty`,
      oldValue: String(old),
      newValue: String(clamped),
    });
    setNotice(`"${item.item}" received qty: ${clamped} ${item.unit || ''}.`);
    await reload();
  };

  const markReceivedInFull = async (item) => {
    const full = Number(item.purchaseQty ?? 0);
    if (!full) {
      setNotice(`Can't mark "${item.item}" received in full — purchaseQty is empty.`);
      return;
    }
    await handleReceivedQty(item, full);
  };

  const exportBom = async () => {
    if (exporting) return;
    setExporting(true);
    setNotice(null);
    try {
      const [project, rows, log] = await Promise.all([
        getProject(projectId),
        listBomItems(projectId),
        listChangeLog(projectId),
      ]);
      const lines = buildBomExportLines(rows);
      const importNotes = log.filter((c) => c.field === 'import_note');
      const lastImport = importNotes.length > 0 ? importNotes[importNotes.length - 1] : null;
      const openConfirmCount = Array.isArray(openConfirms) ? openConfirms.length : 0;
      const data = buildBomExportData({
        project,
        quotationDate: lastImport ? formatShortDate(lastImport.timestamp) : '—',
        source: 'Agent 6/7 Reconciliation Pipeline',
        generatedAt: new Date().toISOString(),
        lines,
        openConfirmCount,
      });
      const bytes = renderBomExportPdf(data);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const name = `BOM_${(project ? project.name : 'export').replace(/[^A-Za-z0-9]+/g, '_')}.pdf`;
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setNotice(`BOM export generated (${data.itemCount} lines). Not sent.`);
    } catch (err) {
      setNotice(`BOM export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  // Quick Order flow -------------------------------------------------------
  const openOrder = (group) => {
    setOrderError(null);
    setNoteDraft('');
    if (!group.supplier) {
      setNotice('Pick a supplier on each row above first — nothing to order yet.');
      const first = document.querySelector('.rowlist select');
      if (first) first.focus();
      return;
    }
    const { eligible, excluded } = eligibleOrderItems(items, group.supplier.id, openConfirms);
    setOrderCtx({ supplier: group.supplier, eligible, excluded });
  };

  const closeOrder = () => {
    setOrderCtx(null);
    setNoteDraft('');
    setOrderError(null);
  };

  const orderMessage = () => {
    if (!orderCtx) return '';
    return buildQuickOrderMessage({
      projectName,
      supplierName: orderCtx.supplier.businessName,
      lines: orderCtx.eligible,
      note: noteDraft,
    });
  };

  const sendQuickOrder = async () => {
    if (!orderCtx) return;
    const message = orderMessage();
    const link = buildQuickOrderLink(orderCtx.supplier.contact, message);
    if (!link) {
      setOrderError(
        `Fix ${orderCtx.supplier.businessName}'s phone number before ordering.`
      );
      return;
    }
    await appendChangeLog({
      projectId,
      actor: 'supervisor',
      field: 'quick_order_sent',
      oldValue: null,
      newValue: `${orderCtx.supplier.businessName} · ${orderCtx.eligible.length} items` +
        (noteDraft.trim() ? ` · Note: ${noteDraft.trim()}` : ''),
    });
    closeOrder();
    window.location.href = link;
  };

  const renderRow = (item, no) => {
    const locked = Array.isArray(item.lockedFields) ? item.lockedFields : [];
    const rowTintClass = item.doubtful ? 'doubtful-row' : '';
    const fromStockBadge = item.fromStock ? (
      <span className="badge" style={{ background: '#dcfce7', color: '#166534', marginLeft: '0.5rem' }}>
        📦 From stock
      </span>
    ) : null;
    const doubtfulBadge = item.doubtful ? (
      <span className="badge" style={{ background: '#fee2e2', color: '#991b1b', marginLeft: '0.5rem' }}>
        ⚠️ Doubtful
      </span>
    ) : null;
    // A3: Import check badge — "Check" word + reason text; colour is never the only signal.
    const rowFindings = findingsByRowId.get(item.id) || [];
    const needsReview = isToReview(item);
    const checkBadge = needsReview ? (
      <span
        className="badge"
        style={{ background: '#fef9c3', color: '#713f12', marginLeft: '0.5rem' }}
        aria-label="Import check flag"
      >
        Check
      </span>
    ) : null;
    return (
      <div
        key={item.id}
        className={`row ${rowTintClass}`}
        draggable
        onDragStart={() => setDragId(item.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDropOn(item.id)}
        style={item.doubtful ? { borderLeft: '4px solid #ef4444', paddingLeft: '0.5rem' } : {}}
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="badge" aria-label={`Position ${no}`}>{no}</span>
                <strong>{item.item}</strong>{' '}
                {fromStockBadge}
                {doubtfulBadge}
                {checkBadge}
                {locked.length > 0 && (
                  <span className="badge locked">🔒 {locked.join(', ')}</span>
                )}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
            <button
              className="secondary"
              style={{ minWidth: '48px', padding: '0.25rem 0.5rem' }}
              aria-label={`Move ${item.item} up`}
              onClick={() => move(item.id, -1)}
            >
              ▲
            </button>
            <button
              className="secondary"
              style={{ minWidth: '48px', padding: '0.25rem 0.5rem' }}
              aria-label={`Move ${item.item} down`}
              onClick={() => move(item.id, 1)}
            >
              ▼
            </button>
          </span>
        </div>
        <div className="small" style={{ color: 'var(--text-muted)' }}>
          {[item.spec, item.category].filter(Boolean).join(' · ')}
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', alignItems: 'baseline' }}>
          <div
            className="cell"
            role="button"
            tabIndex={0}
            aria-label={`Edit purchase quantity, currently ${item.purchaseQty ?? 'empty'} ${item.unit || ''}`}
            title="Tap to edit purchase quantity"
            onClick={() => openEditor(item, 'purchaseQty', 'number')}
            onKeyDown={activate(() => openEditor(item, 'purchaseQty', 'number'))}
          >
            <div className="small" style={{ color: 'var(--text-muted)' }}>Qty</div>
            <div className="money">
              {formatNumber(item.purchaseQty)}{locked.includes('purchaseQty') ? ' 🔒' : ''}
            </div>
          </div>
          <div
            className="cell"
            role="button"
            tabIndex={0}
            aria-label={`Edit unit cost, currently ${item.unitCost ?? 'empty'}`}
            title="Tap to edit unit cost"
            onClick={() => openEditor(item, 'unitCost', 'number')}
            onKeyDown={activate(() => openEditor(item, 'unitCost', 'number'))}
          >
            <div className="small" style={{ color: 'var(--text-muted)' }}>Price</div>
            <div className="money">
              {formatCurrency(item.unitCost)}{locked.includes('unitCost') ? ' 🔒' : ''}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div className="small" style={{ color: 'var(--text-muted)' }}>Total</div>
            <div className="money"><strong>{formatCurrency(item.estTotal)}</strong></div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <label
            className="small"
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.375rem',
              background: item.fromStock ? '#f0fdf4' : 'transparent',
            }}
            title="Check this if item was drawn from workshop stock instead of being purchased"
          >
            <input
              type="checkbox"
              checked={!!item.fromStock}
              onChange={() => toggleFromStock(item)}
            />
            Prepared from workshop stock
          </label>
          <label
            className="small"
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.375rem',
              background: item.doubtful ? '#fef2f2' : 'transparent',
            }}
            title="Flag this row's imported value as suspect / needing review"
          >
            <input
              type="checkbox"
              checked={!!item.doubtful}
              onChange={() => toggleDoubtful(item)}
            />
            Doubtful (needs review)
          </label>
          <label
            className="small"
            style={{
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'center',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
              borderRadius: '0.375rem',
              background: item.prepared ? 'var(--saved, #f0fdf4)' : 'transparent',
              minHeight: '48px',
            }}
            title="Mark this item as prepared (delivery readiness; does not touch stock)"
          >
            <input
              type="checkbox"
              checked={!!item.prepared}
              onChange={() => togglePrepared(item)}
              style={{ width: '20px', height: '20px' }}
            />
            Prepared
          </label>
        </div>
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem',
            background: item.prepared ? 'var(--saved, #f0fdf4)' : 'transparent',
            borderRadius: '0.375rem',
          }}
        >
          <label className="small" style={{ color: 'var(--text-muted)' }}>
            Preparation note
            <input
              type="text"
              value={item.preparedNote || ''}
              onChange={(e) => updatePreparedNote(item, e.target.value)}
              style={{ width: '100%', marginTop: '0.25rem' }}
              placeholder="e.g. Picked, packed, delivered to site"
            />
          </label>
        </div>
        <div
          style={{
            marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}
        >
          <span className="small" style={{ color: 'var(--text-muted)' }}>
          Received: {typeof item.receivedQty === 'number' ? item.receivedQty : 0} {item.unit || ''}
          {item.purchaseQty && (typeof item.receivedQty === 'number') && item.receivedQty < item.purchaseQty
            ? ` (${item.purchaseQty - item.receivedQty} pending)`
            : ''}
          {item.purchaseQty && (typeof item.receivedQty === 'number') && item.receivedQty > item.purchaseQty
            ? ' (over-received — check!)'
            : ''}
          </span>
          <button
            className="secondary"
            style={{ minWidth: '48px', padding: '0.25rem 0.5rem' }}
            onClick={() => markReceivedInFull(item)}
          >
            Received in full
          </button>
          <input
            type="number"
            min={0}
            style={{ width: '80px' }}
            placeholder="Qty"
            defaultValue={typeof item.receivedQty === 'number' ? item.receivedQty : 0}
            onBlur={(e) => handleReceivedQty(item, e.target.value)}
            aria-label={`Set received quantity for ${item.item}`}
          />
        </div>
        <SupplierPicker
          suppliers={suppliers}
          value={item.assignedSupplierId}
          itemName={item.item}
          onAssign={(supplierId, remember) => assignSupplier(item, supplierId, remember)}
        />
        {/* A3: Import check detail — reason text for each flag + one-tap Verify (A4). */}
        {needsReview && (
          <div
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem',
              background: '#fefce8',
              borderRadius: '0.375rem',
              borderLeft: '3px solid #ca8a04',
            }}
            role="status"
            aria-label="Import check flags"
          >
            <div className="small" style={{ color: '#92400e', fontWeight: 600, marginBottom: '0.25rem' }}>
              Check — import flags:
            </div>
            {rowFindings.map((f, i) => (
              <div key={i} className="small" style={{ color: '#78350f', marginBottom: '0.125rem' }}>
                {f.message}
              </div>
            ))}
            <button
              onClick={() => verifyRow(item)}
              style={{ marginTop: '0.5rem', minHeight: '48px', padding: '0.25rem 0.75rem' }}
              aria-label={`Verify quantity for ${item.item} and clear import check flag`}
            >
              Verified — looks correct
            </button>
          </div>
        )}
      </div>
    );
  };

  // Category grouping is a pure view transform over displayOrder: it never writes
  // storage, never touches bomRepo/mergeEngine, and toggling away reproduces the
  // flat list exactly (Ticket 5 invariant review).
  const buildCategoryGroups = () => {
    const byCat = new Map();
    for (const item of checkFiltered) {
      const cat = item.category || 'Uncategorised';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(item);
    }
    return [...byCat.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([category, catItems]) => ({ id: `cat-${category}`, kind: 'category', name: category, items: catItems }));
  };

  const groups = view === 'supplier'
    ? buildGroups().map((g) => ({ ...g, kind: g.supplier ? 'supplier' : 'unassigned' }))
    : view === 'category'
      ? buildCategoryGroups()
      : [{ id: '__all__', kind: 'flat', items: checkFiltered }];

  return (
    <div className="container">
      <h1>BOM ({items.length})</h1>
      <div className="small" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
        {preparedCount} of {totalCount} prepared
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', margin: '0.5rem 0', flexWrap: 'wrap' }}>
        <button onClick={exportBom} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export BOM'}
        </button>
        <button onClick={onAddItem} aria-label="Add item manually">
          + Add item
        </button>
        <button className="secondary" onClick={() => setView('supplier')} aria-pressed={view === 'supplier'}>
          Suppliers
        </button>
        <button className="secondary" onClick={() => setView('category')} aria-pressed={view === 'category'}>
          Category
        </button>
        <button
          className="secondary"
          onClick={() => setView('flat')}
          aria-pressed={view === 'flat'}
          aria-label="All items flat view"
        >
          All
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', margin: '0.25rem 0 0.5rem', flexWrap: 'wrap' }}>
        <span className="small" style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>Prepared:</span>
        <button
          className="secondary"
          onClick={() => setPreparedFilter('all')}
          aria-pressed={preparedFilter === 'all'}
        >
          All status
        </button>
        <button
          className="secondary"
          onClick={() => setPreparedFilter('not')}
          aria-pressed={preparedFilter === 'not'}
        >
          Not yet prepared
        </button>
        <button
          className="secondary"
          onClick={() => setPreparedFilter('prepared')}
          aria-pressed={preparedFilter === 'prepared'}
        >
          Prepared
        </button>
      </div>
      {/* A3: Import check banner — non-blocking, links to "To review" filter. */}
      {allFindings.length === 0 && items.length > 0 && (
        <div className="small" style={{ color: 'var(--text-muted)', margin: '0.25rem 0 0.5rem' }}>
          Import check: No automatic flags. This does not check your drawings.
        </div>
      )}
      {reviewCount > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.25rem 0 0.5rem', flexWrap: 'wrap' }}>
          <span className="small" style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>
            Import check: {reviewCount} {reviewCount === 1 ? 'line' : 'lines'} to review
          </span>
          <button
            className={importCheckFilter ? '' : 'secondary'}
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', minHeight: '48px' }}
            aria-pressed={importCheckFilter}
            onClick={() => setImportCheckFilter((v) => !v)}
          >
            {importCheckFilter ? `To review (${reviewCount}) ✓` : `To review (${reviewCount})`}
          </button>
          {importCheckFilter && (
            <button
              className="secondary"
              style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', minHeight: '48px' }}
              onClick={() => setImportCheckFilter(false)}
            >
              Show all
            </button>
          )}
        </div>
      )}
      {notice && <div className="card" role="status" style={{ margin: '0.5rem 0' }}>{notice}</div>}
      {items.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No items yet.</p>}

      <div className="rowlist">
        {groups.map((g, i) => (
          <section
            key={g.id || `unassigned-${i}`}
            aria-label={g.kind === 'flat' ? 'All items' : (g.kind === 'category' ? g.name : (g.supplier ? g.supplier.businessName : 'Unassigned'))}
          >
            {(g.kind === 'supplier' || g.kind === 'unassigned') && (
              <div style={{ margin: '0.75rem 0 0.25rem' }}>
                <h2>{g.supplier ? g.supplier.businessName : 'Unassigned'} ({g.items.length})</h2>
                <button
                  className={g.supplier ? '' : 'secondary'}
                  onClick={() => openOrder(g)}
                  style={{ marginTop: '0.25rem' }}
                >
                  Order via WhatsApp
                </button>
              </div>
            )}
            {g.kind === 'category' && (
              <h2 style={{ margin: '0.75rem 0 0.25rem' }}>{g.name} ({g.items.length})</h2>
            )}
            {g.items.map((item) => renderRow(item, ordered.indexOf(item) + 1))}
          </section>
        ))}
      </div>

      {editing && (
        <div className="card anim-panel" style={{ marginTop: '1rem' }}>
          <h3>Edit {editing.field} (will lock the field)</h3>
          <label className="small" htmlFor="bom-edit-input">New value</label>
          <input
            id="bom-edit-input"
            autoFocus
            type={editing.type}
            value={editing.value}
            onChange={(e) => setEditing({ ...editing, value: e.target.value })}
          />
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save + lock'}</button>
            <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </div>
      )}

      {orderCtx && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Quick order to ${orderCtx.supplier.businessName}`}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(15, 23, 42, 0.5)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          }}
          onClick={closeOrder}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: '600px', maxHeight: '85vh', overflowY: 'auto', borderRadius: '1rem 1rem 0 0' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Order via WhatsApp</h2>
            <p className="small" style={{ color: 'var(--text-muted)' }}>
              To: {orderCtx.supplier.businessName} · {orderCtx.eligible.length} items
              {orderCtx.excluded.length > 0 &&
                ` · ${orderCtx.excluded.length} items pending confirmation — excluded from this order.`}
            </p>
            {!orderCtx.supplier.verifiedDate && (
              <div className="small" style={{ color: '#b45309', background: '#fef3c7', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', marginBottom: '0.5rem' }}>
                ⚠️ Number not verified
              </div>
            )}
            <pre style={{ whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.875rem' }}>
              {orderMessage()}
            </pre>
            <label className="small" htmlFor="quick-order-note">Note (optional, this send only)</label>
            <input
              id="quick-order-note"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="e.g. need by Friday"
              style={{ width: '100%', marginTop: '0.25rem' }}
            />
            {orderError && (
              <div className="banner blocked" role="alert" style={{ marginTop: '0.5rem' }}>
                {orderError}{' '}
                {onGoSuppliers && (
                  <button className="secondary" onClick={onGoSuppliers} style={{ marginTop: '0.5rem' }}>
                    Fix in Suppliers
                  </button>
                )}
              </div>
            )}
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              <button onClick={sendQuickOrder}>Send via WhatsApp</button>
              <button className="secondary" onClick={closeOrder}>Cancel</button>
            </div>
            <p className="small" style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Opens WhatsApp with the message pre-filled. You send it there — the app sends nothing itself.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
