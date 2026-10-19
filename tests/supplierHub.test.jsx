/**
 * supplierHub.test.jsx — H1 acceptance: the Supplier Hub is a top-level screen
 * that reuses SuppliersScreen with no projectId.
 *
 * What must hold:
 *   1. Reachable from the Projects screen without opening a project, and it
 *      shows the real directory (not a copy: same component, same rows).
 *   2. Its nav is exactly Projects | Supplier Hub — never a sixth project tab,
 *      and no two visible tab buttons may share a label.
 *   3. Hub mode hides every "linked to THIS project" affordance while keeping
 *      add/edit/delete, and delete stays blocked by any project's link.
 *   4. Project mode is unchanged except for the "Open supplier directory" route.
 */
/** @vitest-environment jsdom */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { clearAllTables } from '../src/data/db.js';
import { createProject } from '../src/data/projectRepo.js';
import {
  createSupplier,
  listSuppliers,
  linkSupplierToProject,
} from '../src/data/supplierRepo.js';
import App from '../src/App.jsx';
import SuppliersScreen from '../src/screens/SuppliersScreen.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(async () => {
  await clearAllTables();
});

const tabButtons = (app) => [...app.container.querySelectorAll('.tab-bar button')];
const tabLabels = (app) => tabButtons(app).map((b) => b.textContent.trim());

const openHub = async (app) => {
  fireEvent.click(await app.findByText('Open supplier hub'));
};

describe('H1: Supplier Hub is reachable without a project', () => {
  it('opens from the Projects screen and lists suppliers seeded in the directory', async () => {
    // Seeding a row first also suppresses the app's first-run seed, so counts
    // asserted here are exactly the rows this test created.
    await createSupplier({
      businessName: 'Hub Reach Probe',
      address: 'Betong, Sarawak',
      contact: '014-679 0770',
    });

    const app = render(<App />);
    // The entry card exists before any project is open.
    expect(await app.findByText('Supplier Hub')).toBeTruthy();
    expect(app.getByText(/Not tied to a project/)).toBeTruthy();

    await openHub(app);
    expect(await app.findByText('Hub Reach Probe')).toBeTruthy();
    // Same directory data as the project tab would browse: one supplier, with
    // the full detail row (town + contact) and the one-tap actions.
    expect(app.getByRole('heading', { name: 'Supplier Hub (1)' })).toBeTruthy();
    expect(app.getByText('Betong, Sarawak')).toBeTruthy();
    expect(app.getByText('Contact: 014-679 0770')).toBeTruthy();
    expect(app.container.querySelector('a[href="https://wa.me/60146790770"]')).toBeTruthy();
    expect(app.container.querySelector('a[href="tel:014-679 0770"]')).toBeTruthy();
    app.unmount();
  });

  it('hub nav is exactly [Projects, Supplier Hub] and renders no project sections', async () => {
    await createSupplier({ businessName: 'Hub Nav Probe' });
    const app = render(<App />);
    await openHub(app);
    await app.findByText('Hub Nav Probe');

    expect(tabLabels(app)).toEqual(['Projects', 'Supplier Hub']);
    const [, hubTab] = tabButtons(app);
    expect(hubTab.className).toMatch(/active/);
    expect(hubTab.getAttribute('aria-current')).toBe('page');
    // No Dashboard/BOM/Confirm/PO project sections in this view.
    expect(app.container.querySelectorAll('.tab-label-full').length).toBe(0);
    expect(app.container.querySelectorAll('.tab-label-short').length).toBe(0);
    for (const section of ['Dashboard', 'BOM', 'Confirm', 'PO']) {
      expect(app.queryByText(section)).toBeNull();
    }
    app.unmount();
  });

  it('returning to Projects restores the project card list, and opening a project resets the home view', async () => {
    await createProject({ name: 'HUB RETURN PROBE' });
    await createSupplier({ businessName: 'Hub Return Supplier' }); // suppress first-run seed
    const app = render(<App />);
    expect(await app.findByText('HUB RETURN PROBE')).toBeTruthy();

    await openHub(app);
    await app.findByText('Hub Return Supplier');
    fireEvent.click(app.getByRole('button', { name: 'Projects' }));

    expect(await app.findByText('Your projects')).toBeTruthy();
    expect(await app.findByText('HUB RETURN PROBE')).toBeTruthy();
    expect(app.queryByText('Hub Return Supplier')).toBeNull();

    // Opening a project must land on the project shell, and its Projects back
    // button must return to the list — not back into the hub.
    fireEvent.click(app.getByText('Open'));
    await app.findByText('Dashboard');
    fireEvent.click(app.getByRole('button', { name: 'Projects' }));
    expect(await app.findByText('Your projects')).toBeTruthy();
    app.unmount();
  });
});

describe('H1: hub mode hides project-link affordances', () => {
  it('shows the full directory but no link/unlink controls or project split', async () => {
    const project = await createProject({ name: 'HUB SCOPE PROBE' });
    const linked = await createSupplier({ businessName: 'Hub Scope Linked' });
    await createSupplier({ businessName: 'Hub Scope Unlinked' });
    await linkSupplierToProject({ projectId: project.id, globalSupplierId: linked.id });

    const ui = render(<SuppliersScreen />);
    // Both read from the one directory: no linked/unlinked split in the hub.
    expect(await ui.findByText('Hub Scope Linked')).toBeTruthy();
    expect(await ui.findByText('Hub Scope Unlinked')).toBeTruthy();

    expect(ui.queryByText('Link to this project')).toBeNull();
    expect(ui.queryByText('Linked ✓')).toBeNull();
    expect(ui.queryByText('Browse All Suppliers')).toBeNull();
    expect(ui.queryByText('Back to project suppliers')).toBeNull();
    expect(ui.queryByText('No suppliers linked to this project.')).toBeNull();

    // Add/edit/delete remain available in the hub.
    expect(ui.getByText('+ Add supplier')).toBeTruthy();
    expect(ui.getAllByRole('button', { name: 'Edit' })).toHaveLength(2);
    expect(ui.getAllByRole('button', { name: 'Delete' })).toHaveLength(2);
    expect(ui.getAllByRole('button', { name: 'Verify' })).toHaveLength(2);
    ui.unmount();
  });
});

describe('H1: project mode keeps its link controls and gains the directory route', () => {
  it('Suppliers tab still links, and "Open supplier directory" switches to the hub', async () => {
    const project = await createProject({ name: 'HUB PROJ MODE' });
    const linked = await createSupplier({ businessName: 'Hub Mode Linked' });
    await createSupplier({ businessName: 'Hub Mode Unlinked' });
    await linkSupplierToProject({ projectId: project.id, globalSupplierId: linked.id });

    const app = render(<App />);
    fireEvent.click(await app.findByText('Open'));
    await app.findByText('Dashboard');
    fireEvent.click(app.getByRole('button', { name: /Suppliers/ }));

    // The project tab is unchanged: this project's links first.
    expect(await app.findByText('Hub Mode Linked')).toBeTruthy();
    expect(app.queryByText('Hub Mode Unlinked')).toBeNull();

    // Its browse mode still offers the project-link controls.
    fireEvent.click(app.getByText('Browse All Suppliers'));
    expect(await app.findByText(/Global Supplier Directory/)).toBeTruthy();
    expect(app.getAllByText('Linked ✓').length).toBeGreaterThan(0);
    expect(app.getByText('Link to this project')).toBeTruthy();

    // And the new route drops the project scope and shows the hub.
    fireEvent.click(app.getByText('Open supplier directory'));
    expect(await app.findByRole('heading', { name: 'Supplier Hub (2)' })).toBeTruthy();
    expect(app.getByText('Hub Mode Unlinked')).toBeTruthy();
    expect(tabLabels(app)).toEqual(['Projects', 'Supplier Hub']);
    app.unmount();
  });
});

describe('H1: no duplicate tab-bar labels on any rendered screen', () => {
  it('projects list / stock / hub / project shell each have unique tab labels', async () => {
    const project = await createProject({ name: 'HUB LABEL PROBE' });
    await createSupplier({ businessName: 'Hub Label Supplier' }); // suppress first-run seed
    const app = render(<App />);
    await app.findByText('HUB LABEL PROBE');

    const assertUnique = (screenName) => {
      const labels = tabLabels(app);
      expect(new Set(labels).size, `duplicate tab label on ${screenName}: ${labels.join(', ')}`)
        .toBe(labels.length);
    };

    // Projects list: no tab bar at all.
    expect(tabButtons(app)).toHaveLength(0);

    fireEvent.click(app.getByText('Open stock ledger'));
    await app.findByText('Stock Ledger');
    expect(tabLabels(app)).toEqual(['Projects', 'Stock']);
    assertUnique('stock ledger');

    fireEvent.click(app.getByRole('button', { name: 'Projects' }));
    await app.findByText('Your projects');
    await openHub(app);
    await app.findByText('Hub Label Supplier');
    expect(tabLabels(app)).toEqual(['Projects', 'Supplier Hub']);
    assertUnique('supplier hub');

    fireEvent.click(app.getByRole('button', { name: 'Projects' }));
    fireEvent.click(await app.findByText('Open'));
    await app.findByText('Dashboard');
    // Project bar keeps "Suppliers"; the hub's own label is "Supplier Hub".
    const full = [...app.container.querySelectorAll('.tab-bar .tab-label-full')]
      .map((e) => e.textContent);
    expect(full).toEqual(['Dashboard', 'BOM', 'Confirm', 'Suppliers', 'PO']);
    expect(full).not.toContain('Supplier Hub');
    expect(tabButtons(app)).toHaveLength(6);
    assertUnique('project shell');
    expect(project.id).toBeTruthy();
    app.unmount();
  });
});

describe('H1: delete rules in the hub', () => {
  it('deletes an unlinked supplier, but refuses one used by projects and names the count', async () => {
    const projectA = await createProject({ name: 'HUB DELETE A' });
    const projectB = await createProject({ name: 'HUB DELETE B' });
    const used = await createSupplier({ businessName: 'Hub Used Delete Probe' });
    await linkSupplierToProject({ projectId: projectA.id, globalSupplierId: used.id });
    await linkSupplierToProject({ projectId: projectB.id, globalSupplierId: used.id });
    await createSupplier({ businessName: 'Hub Free Delete Probe' });

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const app = render(<App />);
    await openHub(app);
    await app.findByText('Hub Free Delete Probe');
    const search = app.getByLabelText('Search suppliers');

    // Unlinked: delete succeeds and the row leaves the directory.
    fireEvent.change(search, { target: { value: 'Hub Free Delete Probe' } });
    fireEvent.click(app.getByRole('button', { name: 'Delete' }));
    expect(await app.findByText('Deleted "Hub Free Delete Probe".')).toBeTruthy();
    expect((await listSuppliers()).map((s) => s.businessName)).toEqual(['Hub Used Delete Probe']);

    // Used by two projects: refused, with the count in the message.
    fireEvent.change(search, { target: { value: 'Hub Used Delete Probe' } });
    fireEvent.click(app.getByRole('button', { name: 'Delete' }));
    expect(await app.findByText(/This supplier is currently used in 2 projects\./)).toBeTruthy();
    expect(app.getByText('Cannot delete "Hub Used Delete Probe"')).toBeTruthy();
    // The hub has no open project, so it cannot offer to unlink one.
    expect(app.queryByText('Remove link from this project instead')).toBeNull();
    // Nothing was deleted: still two links and the supplier itself.
    expect((await listSuppliers()).map((s) => s.businessName)).toEqual(['Hub Used Delete Probe']);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    app.unmount();
  });
});
