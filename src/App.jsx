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
import * as bomRepo from './data/bomRepo.js';
import { appendChangeLog } from './data/changeLogRepo.js';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Dash' },
  { id: 'bom', label: 'BOM', short: 'BOM' },
  { id: 'confirm', label: 'Confirm', short: 'Cfm' },
  { id: 'suppliers', label: 'Suppliers', short: 'Supp' },
  { id: 'po', label: 'PO', short: 'PO' },
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

  // Seed the global supplier directory on first load (no-op if already populated).
  useEffect(() => { seedInitialSuppliers(); }, []);

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

      {tab === 'dashboard' && <DashboardScreen projectId={projectId} onGoConfirm={() => setTab('confirm')} />}
      {tab === 'bom' && (
        <BomScreen
          projectId={projectId}
          onGoSuppliers={() => setTab('suppliers')}
          onAddItem={() => setSubScreen('addItem')}
        />
      )}
      {tab === 'confirm' && <ConfirmScreen projectId={projectId} onChanged={() => refreshGate(projectId)} />}
      {tab === 'suppliers' && <SuppliersScreen projectId={projectId} />}
      {tab === 'po' && <PoScreen projectId={projectId} onGoConfirm={() => setTab('confirm')} />}

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
