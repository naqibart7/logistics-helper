/**
 * DashboardScreen.jsx — Agent 4: project overview.
 * Ready/Blocked badge reads the live Confirm count; change log renders as
 * plain sentences (never storage field names). Wiring only.
 */
import React, { useEffect, useState } from 'react';
import { getProject, updateProject } from '../data/projectRepo.js';
import { listBomItems } from '../data/bomRepo.js';
import { countUnresolved } from '../data/shortageRepo.js';
import { listProjectSuppliers } from '../data/supplierRepo.js';
import { listChangeLog } from '../data/changeLogRepo.js';
import { latestBomImportRun } from '../data/importRunRepo.js';
import { formatCurrency, formatShortDate } from '../utils/helpers.js';
import { checkBomRows } from '../logic/importCheck.js';

/** Storage row -> plain site-diary sentence. No field names leak to the screen. */
export const changeSentence = (c) => {
  const when = formatShortDate(c.timestamp);
  const who = c.actor === 'supervisor' ? 'Supervisor' : 'Agent';
  if (c.field === 'import_note') return `${who} note · ${when}: ${c.newValue}`;
  if (c.field === 'verified:purchaseQty' || c.field === 'verified') {
    const item = c.itemName || c.item || '';
    return `You verified quantity ${c.newValue}${item ? ` for ${item}` : ''}`;
  }
  return `${who} · ${when}: ${c.field}: ${String(c.oldValue)} → ${String(c.newValue)}`;
};

export default function DashboardScreen({ projectId, onGoConfirm, onGoBom }) {
  const [project, setProject] = useState(null);
  const [stats, setStats] = useState({ lines: 0, total: 0, open: 0, suppliers: 0 });
  const [reviewCount, setReviewCount] = useState(0);
  const [recent, setRecent] = useState([]);
  const [lastImportRun, setLastImportRun] = useState(null);
  const [clientDraft, setClientDraft] = useState('');
  const [clientSaved, setClientSaved] = useState(false);

  const reload = async () => {
    const [p, items, open, links, log, lastRun] = await Promise.all([
      getProject(projectId),
      listBomItems(projectId),
      countUnresolved(projectId),
      listProjectSuppliers(projectId),
      listChangeLog(projectId),
      latestBomImportRun(projectId),
    ]);
    setProject(p);
    if (p) setClientDraft(p.client || '');
    setStats({
      lines: items.length,
      total: items.reduce((s, i) => s + Number(i.estTotal || 0), 0),
      open,
      suppliers: links.length,
    });
    const findings = checkBomRows(items);
    const findingsByRow = new Map();
    for (const f of findings) {
      if (!findingsByRow.has(f.rowId)) findingsByRow.set(f.rowId, []);
      findingsByRow.get(f.rowId).push(f);
    }
    const unverified = items.filter((it) => {
      const rowFindings = findingsByRow.get(it.id);
      if (!rowFindings || rowFindings.length === 0) return false;
      const locked = Array.isArray(it.lockedFields) ? it.lockedFields : [];
      if (locked.includes('purchaseQty') && !rowFindings.some((f) => f.rule === 'R1')) return false;
      return true;
    }).length;
    setReviewCount(unverified);
    setRecent(log.slice(-5).reverse());
    setLastImportRun(lastRun);
  };

  useEffect(() => { reload(); }, [projectId]);

  const saveClient = async () => {
    await updateProject(projectId, { client: clientDraft.trim() ? clientDraft.trim() : null });
    setClientSaved(true);
    await reload();
  };

  if (!project) return <div className="container"><p>Loading project…</p></div>;

  return (
    <div className="container">
      <header className="page-header compact">
        <p className="eyebrow">Project overview</p>
        <h1>{project.name}</h1>
      </header>
      {stats.open > 0 ? (
        <div className="banner blocked" role="alert" style={{ marginTop: '1rem' }}>
          <strong>Blocked — {stats.open} open.</strong> PO stays locked until Confirm is clear.
          <div style={{ marginTop: '0.5rem' }}>
            <button onClick={onGoConfirm}>Go to Confirm</button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: '1rem' }}>
          <span className="badge status-ready">Ready — PO unlocked</span>
        </div>
      )}
      {stats.lines > 0 && (
        <div style={{ marginTop: '0.75rem' }} role="status">
          {reviewCount > 0 ? (
            <div className="banner notice" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span><strong>Import check:</strong> {reviewCount} {reviewCount === 1 ? 'line' : 'lines'} to review</span>
              {onGoBom && (
                <button className="secondary" onClick={onGoBom} style={{ minHeight: '48px', padding: '0.25rem 0.75rem' }}>
                  To review ({reviewCount})
                </button>
              )}
            </div>
          ) : (
            <p className="small" style={{ color: 'var(--text-muted)', margin: '0.5rem 0' }}>
              No automatic flags. This does not check your drawings.
            </p>
          )}
        </div>
      )}
      {lastImportRun && (
        <div
          className={`banner ${lastImportRun.passed ? 'notice' : 'blocked'}`}
          role="status"
          style={{ marginTop: '0.75rem' }}
        >
          <strong>Import check: {lastImportRun.passed ? 'PASSED' : 'FAILED'}</strong>
          {' — '}{lastImportRun.lineCount}/{lastImportRun.sourceLineCount} lines, {lastImportRun.errors.length} error{lastImportRun.errors.length === 1 ? '' : 's'}
          {lastImportRun.warnings.length > 0 ? `, ${lastImportRun.warnings.length} warning${lastImportRun.warnings.length === 1 ? '' : 's'}` : ''}
          {' · '}{formatShortDate(lastImportRun.timestamp)}
          {!lastImportRun.passed && lastImportRun.errors.slice(0, 3).map((m, i) => (
            <div key={i} className="small" style={{ marginTop: '0.25rem' }}>
              {m.field}{m.ref ? ` (${m.ref})` : ''}{m.line ? ` · line ${m.line}` : ''}: expected {String(m.expected)}, shown {String(m.shown)}
            </div>
          ))}
        </div>
      )}
      <div className="card dashboard-card">
        <div className="stat-grid">
          <div className="stat"><span>Material lines</span><strong>{stats.lines}</strong></div>
          <div className="stat"><span>Est. total</span><strong className="money">{formatCurrency(stats.total)}</strong></div>
          <div className="stat"><span>To confirm</span><strong>{stats.open}</strong></div>
          <div className="stat"><span>Suppliers</span><strong>{stats.suppliers}</strong></div>
        </div>
        <div className="project-detail"><strong>Client:</strong> {project.client || '—'}</div>
        <div style={{ marginTop: '0.5rem' }}>
          <label className="small" htmlFor="client-input">Client (optional, manual entry)</label>
          <input
            id="client-input"
            value={clientDraft}
            onChange={(e) => { setClientDraft(e.target.value); setClientSaved(false); }}
            placeholder="e.g. TUAN DIN"
            style={{ width: '100%', marginTop: '0.25rem' }}
          />
          <button onClick={saveClient} style={{ marginTop: '0.5rem' }}>Save client</button>
          {clientSaved && <span role="status" style={{ marginLeft: '0.5rem' }}>Saved.</span>}
        </div>
      </div>
      <h2>Recent changes</h2>
      {recent.length === 0 && <p style={{ color: 'var(--text-muted)' }}>No changes logged yet.</p>}
      {recent.map((c) => (
        <div key={c.id} className="card" style={{ marginBottom: '0.5rem', fontSize: '0.875rem' }}>
          {changeSentence(c)}
        </div>
      ))}
    </div>
  );
}
