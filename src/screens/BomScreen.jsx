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

export default function BomScreen({ projectId, onGoSuppliers, onAddItem }) {
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
  const [orderCtx, setOrderCtx] = useState(null); // { supplier, eligible, excluded }
  const [noteDraft, setNoteDraft] = useState('');
  const [orderError, setOrderError] = useState(null);

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
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));

  // Grouping: Unassigned first (null assignment OR dangling supplier id),
  // then suppliers alphabetically. Display-only; storage untouched.
  const buildGroups = () => {
    const unassigned = [];
    const bySup = new Map();
    for (const item of ordered) {
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
      const data = buildBomExportData({
        project,
        quotationDate: lastImport ? formatShortDate(lastImport.timestamp) : '—',
        source: 'Agent 6/7 Reconciliation Pipeline',
        generatedAt: new Date().toISOString(),
        lines,
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
    return (
      <div
        key={item.id}
        className="row"
        draggable
        onDragStart={() => setDragId(item.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDropOn(item.id)}
      >
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="badge" aria-label={`Position ${no}`}>{no}</span>
                <strong>{item.item}</strong>{' '}
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
        <SupplierPicker
          suppliers={suppliers}
          value={item.assignedSupplierId}
          itemName={item.item}
          onAssign={(supplierId, remember) => assignSupplier(item, supplierId, remember)}
        />
      </div>
    );
  };

  // Category grouping is a pure view transform over displayOrder: it never writes
  // storage, never touches bomRepo/mergeEngine, and toggling away reproduces the
  // flat list exactly (Ticket 5 invariant review).
  const buildCategoryGroups = () => {
    const byCat = new Map();
    for (const item of ordered) {
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
      : [{ id: '__all__', kind: 'flat', items: ordered }];

  return (
    <div className="container">
      <h1>BOM ({items.length})</h1>
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
