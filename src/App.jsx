/**
 * App.jsx — Logistics Helper v3 (multi-agent pipeline shell).
 *
 * Entry screen (outside any project): Projects list.
 * Inside an open project, bottom tab bar: Dashboard | BOM | Confirm | Suppliers | PO.
 * Text labels (no emoji); Confirm carries a live open-count badge.
 *
 * Lane 1B: BOM tab also exposes a "+ Add item" route → AddItemScreen. It's a
 * project-level sub-screen (keeps projectId context). Back returns to BOM.
 * No business logic here — only navigation + wiring.
 */
import React, { useEffect, useState } from 'react';
import ProjectsScreen from './screens/ProjectsScreen.jsx';
import DashboardScreen from './screens/DashboardScreen.jsx';
import BomScreen from './screens/BomScreen.jsx';
import ConfirmScreen from './screens/ConfirmScreen.jsx';
import SuppliersScreen from './screens/SuppliersScreen.jsx';
import PoScreen from './screens/PoScreen.jsx';
import AddItemScreen from './screens/AddItemScreen.jsx';
import { resolveTabRequest } from './screens/poGate.js';
import { countUnresolved } from './data/shortageRepo.js';
import { seedInitialSuppliers } from './data/db.js';
import { isSyncEnabled, getSyncInfo, subscribeSyncStatus, syncStatusLabel } from './data/syncStatus.js';
import * as bomRepo from './data/bomRepo.js';
import { appendChangeLog } from './data/changeLogRepo.js';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Dash' },
  { id: 'bom', label: 'BOM', short: 'BOM' },
  { id: 'confirm', label: 'Confirm', short: 'Cfm' },
  { id: 'suppliers', label: 'Suppliers', short: 'Supp' },
  { id: 'po', label: 'PO', short: 'PO' },
  { id: 'stock', label: 'Stock', short: 'Stock' },
];

const manualAddDeps = {
  createBomItem: bomRepo.createBomItem,
  maxDisplayOrder: bomRepo.maxDisplayOrder,
  updateBomItem: bomRepo.updateBomItem,
  appendChangeLog,
};

export default function App() {
  const [projectId, setProjectId] = useState(null);
  const [tab, setTab] = useState('dashboard');
  // Lane 1B: subScreen = null | 'addItem'. Stacks on top of BOM so we can
  // "return" to BOM after adding without losing project/tab state.
  const [subScreen, setSubScreen] = useState(null);
  const [gateNotice, setGateNotice] = useState(null);
  const [openCount, setOpenCount] = useState(0);
  const [bomReviewFilter, setBomReviewFilter] = useState(false);
  // Lane 2: visible sync state ("Local only" until a cloud DB is configured).
  const [syncInfo, setSyncInfo] = useState(isSyncEnabled() ? getSyncInfo() : null);

  // Seed the global supplier directory on first load (no-op if already populated).
  useEffect(() => { seedInitialSuppliers(); }, []);

  // Lane 2: subscribe to cloud status changes (no-op when sync isn't configured).
  useEffect(() => {
    if (!isSyncEnabled()) return undefined;
    setSyncInfo(getSyncInfo());
    const unsub = subscribeSyncStatus(() => setSyncInfo(getSyncInfo()));
    return () => { if (unsub) unsub(); };
  }, []);

  // Live badge count: re-read on project/tab change and after Confirm actions.
  const refreshGate = async (id) => {
    if (!id) return;
    setOpenCount(await countUnresolved(id));
  };

  useEffect(() => {
    refreshGate(projectId);
  }, [projectId, tab]);

  const requestTab = async (wanted) => {
    setGateNotice(null);
    // Any tab transition closes the sub-screen. Add item → submit → auto back.
    setSubScreen(null);
    if (wanted === 'po' && projectId) {
      const open = await countUnresolved(projectId);
      const actual = resolveTabRequest(wanted, open);
      if (actual !== wanted) {
        setGateNotice(`PO blocked — ${open} open. Resolve them on Confirm.`);
      }
      setTab(actual);
      return;
    }
    setTab(wanted);
  };

  if (!projectId) {
    return <ProjectsScreen onOpenProject={(id) => { setProjectId(id); setTab('dashboard'); }} />;
  }

  // Lane 1B: AddItem sub-screen. Stays inside project shell, renders above tabs.
  if (subScreen === 'addItem') {
    return (
      <div className="app-shell">
        <AddItemScreen
          projectId={projectId}
          onBack={() => setSubScreen(null)}
          onAdded={() => {
            // next render: BOM reloads naturally via useEffect([projectId, tab])
            // because onAdded fires → subScreen null → tab keeps 'bom' → no-op;
            // so bump tab to trigger the reload.
            setTab('bom');
          }}
        />
        <nav className="tab-bar" aria-label="Project sections">
          <button onClick={() => { setProjectId(null); setTab('dashboard'); setSubScreen(null); }}>
            Projects
          </button>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={t.id === 'bom' ? 'active' : ''}
              aria-current={t.id === 'bom' ? 'page' : undefined}
              onClick={() => requestTab(t.id)}
            >
              <span className="tab-label-full">{t.label}</span>
              <span className="tab-label-short">{t.short}</span>
              {t.id === 'confirm' && openCount > 0 && (
                <span className="tab-badge" aria-label={`${openCount} open confirmations`}>{openCount}</span>
              )}
            </button>
          ))}
        </nav>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {gateNotice && (
        <div className="container" style={{ paddingBottom: 0 }}>
          <div className="banner blocked" role="alert">
            {gateNotice}
          </div>
        </div>
      )}

      {tab === 'dashboard' && (
        <DashboardScreen
          projectId={projectId}
          onGoConfirm={() => setTab('confirm')}
          onGoBom={() => { setBomReviewFilter(true); setTab('bom'); }}
        />
      )}
      {tab === 'bom' && (
        <BomScreen
          projectId={projectId}
          onGoSuppliers={() => setTab('suppliers')}
          onAddItem={() => setSubScreen('addItem')}
          initialReviewFilter={bomReviewFilter}
        />
      )}
      {tab === 'confirm' && <ConfirmScreen projectId={projectId} onChanged={() => refreshGate(projectId)} />}
      {tab === 'suppliers' && <SuppliersScreen projectId={projectId} />}
      {tab === 'po' && <PoScreen projectId={projectId} onGoConfirm={() => setTab('confirm')} />}
      {tab === 'stock' && <StockScreen projectId={projectId} />}

      {/* Lane 2: visible sync state — reports, never blocks. Fixed above the tab bar. */}
      <div
        role="status"
        aria-label={`Sync status: ${syncStatusLabel(syncInfo)}`}
        style={{
          position: 'fixed', right: '0.5rem', bottom: '5.5rem', zIndex: 90,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '999px', padding: '0.25rem 0.6rem',
          fontSize: '0.75rem', color: 'var(--text-muted)',
          boxShadow: 'var(--shadow)', pointerEvents: 'none',
        }}
      >
        {syncStatusLabel(syncInfo)}
      </div>

      <nav className="tab-bar" aria-label="Project sections">
        <button onClick={() => { setProjectId(null); setTab('dashboard'); }}>
          Projects
        </button>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => requestTab(t.id)}
          >
            <span className="tab-label-full">{t.label}</span>
            <span className="tab-label-short">{t.short}</span>
            {t.id === 'confirm' && openCount > 0 && (
              <span className="tab-badge" aria-label={`${openCount} open confirmations`}>{openCount}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
