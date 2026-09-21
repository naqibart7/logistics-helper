/**
 * bomCountConsistency.test.jsx — Ticket 8: group counts must sum to header total
 * and not produce phantom items. Flat and grouped views must both sum to the
 * header total, and group counts must be accurate.
 */
/** @vitest-environment jsdom */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { clearAllTables } from '../src/data/db.js';
import { createProject } from '../src/data/projectRepo.js';
import * as supplierRepo from '../src/data/supplierRepo.js';
import * as bomRepo from '../src/data/bomRepo.js';
import BomScreen from '../src/screens/BomScreen.jsx';

afterEach(() => cleanup());

beforeEach(async () => {
  await clearAllTables();
});

const getHeaderCount = () => {
  const h1 = screen.getByRole('heading', { level: 1 });
  const match = h1.textContent.match(/BOM \((\d+)\)/);
  return match ? parseInt(match[1], 10) : -1;
};

const getGroupCounts = () => {
  const headings = screen.getAllByRole('heading', { level: 2 });
  return headings
    .map(h => {
      const m = h.textContent.match(/\((\d+)\)/);
      return m ? parseInt(m[1], 10) : 0;
    })
    .filter(n => !isNaN(n) && n > 0);
};

describe('Ticket 8: BOM header count equals sum of group counts', () => {
  it('flat view: header count matches item count', async () => {
    const project = await createProject({ name: 'COUNT PROBE' });
    const s1 = await supplierRepo.createSupplier({ businessName: 'Supplier A', address: 'Betong' });
    await supplierRepo.linkSupplierToProject({ projectId: project.id, globalSupplierId: s1.id });

    const items = [
      { projectId: project.id, item: 'Item 1', spec: 'S', purchaseQty: 1, unitCost: 10, displayOrder: 0, assignedSupplierId: null },
      { projectId: project.id, item: 'Item 2', spec: 'S', purchaseQty: 2, unitCost: 20, displayOrder: 1, assignedSupplierId: s1.id },
      { projectId: project.id, item: 'Item 3', spec: 'S', purchaseQty: 3, unitCost: 30, displayOrder: 2, assignedSupplierId: null },
      { projectId: project.id, item: 'Item 4', spec: 'S', purchaseQty: 1, unitCost: 10, displayOrder: 3, assignedSupplierId: null },
    ];
    await bomRepo.bulkCreateBomItems(items);

    render(<BomScreen projectId={project.id} onAddItem={() => {}} />);

    // Switch to flat view first
    fireEvent.click(screen.getByRole('button', { name: 'All items flat view' }));

    // Wait for rows to render (async data load)
    await screen.findAllByRole('button', { name: /Edit purchase quantity/i });

    const headerCount = getHeaderCount();
    expect(headerCount).toBe(4);

    // Flat view: all rows visible, no group headings
    const rows = document.querySelectorAll('.rowlist .row');
    expect(rows.length).toBe(headerCount);
  });

  it('grouped view: group counts sum to header total', async () => {
    const project = await createProject({ name: 'COUNT PROBE 2' });
    const s1 = await supplierRepo.createSupplier({ businessName: 'Supplier A', address: 'Betong' });
    const s2 = await supplierRepo.createSupplier({ businessName: 'Supplier B', address: 'Kuching' });
    await supplierRepo.linkSupplierToProject({ projectId: project.id, globalSupplierId: s1.id });
    await supplierRepo.linkSupplierToProject({ projectId: project.id, globalSupplierId: s2.id });

    const items = [
      { projectId: project.id, item: 'Item 1', spec: 'S', purchaseQty: 1, unitCost: 10, displayOrder: 0, assignedSupplierId: null },
      { projectId: project.id, item: 'Item 2', spec: 'S', purchaseQty: 2, unitCost: 20, displayOrder: 1, assignedSupplierId: s1.id },
      { projectId: project.id, item: 'Item 3', spec: 'S', purchaseQty: 3, unitCost: 30, displayOrder: 2, assignedSupplierId: s2.id },
      { projectId: project.id, item: 'Item 4', spec: 'S', purchaseQty: 1, unitCost: 10, displayOrder: 3, assignedSupplierId: null },
    ];
    await bomRepo.bulkCreateBomItems(items);

    render(<BomScreen projectId={project.id} onAddItem={() => {}} />);

    // Wait for items to load first
    await screen.findAllByRole('button', { name: /Edit purchase quantity/i });

    const headerCount = getHeaderCount();
    expect(headerCount).toBe(4);

    // Switch to supplier group view (default, but explicit)
    fireEvent.click(screen.getByRole('button', { name: /Suppliers/i }));

    // Wait for group headings
    await screen.findAllByRole('heading', { level: 2 });

    const groupCounts = getGroupCounts();
    const sum = groupCounts.reduce((a, b) => a + b, 0);
    expect(sum).toBe(headerCount);
  });

  it('category view: group counts sum to header total', async () => {
    const project = await createProject({ name: 'COUNT PROBE 3' });
    const items = [
      { projectId: project.id, item: 'Item 1', spec: 'S', category: 'Structure', purchaseQty: 1, unitCost: 10, displayOrder: 0, assignedSupplierId: null },
      { projectId: project.id, item: 'Item 2', spec: 'S', category: 'Structure', purchaseQty: 2, unitCost: 20, displayOrder: 1, assignedSupplierId: null },
      { projectId: project.id, item: 'Item 3', spec: 'S', category: 'Electrical', purchaseQty: 3, unitCost: 30, displayOrder: 2, assignedSupplierId: null },
    ];
    await bomRepo.bulkCreateBomItems(items);

    render(<BomScreen projectId={project.id} onAddItem={() => {}} />);

    await screen.findAllByRole('button', { name: /Edit purchase quantity/i });

    const headerCount = getHeaderCount();
    expect(headerCount).toBe(3);

    fireEvent.click(screen.getByRole('button', { name: /Category/i }));
    await screen.findAllByRole('heading', { level: 2 });

    const groupCounts = getGroupCounts();
    const sum = groupCounts.reduce((a, b) => a + b, 0);
    expect(sum).toBe(headerCount);
  });
});
