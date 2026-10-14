/**
 * suppliersTab.test.jsx — Part B acceptance tests:
 * 1. add dedupes: same businessName and address never creates a second GlobalSupplier.
 * 2. edit persists: in-app edits update the database record.
 * 3. delete blocked when linked: cannot delete if linked to a project ("used in N projects"),
 *    can delete once unlinked.
 * 4. exact wa.me and tel: link shapes.
 * 5. malformed number blocks WhatsApp with the fix prompt ("Fix number").
 * 6. null contact renders no buttons and no "NULL".
 * 7. verified date per supplier (B3): badge "Verified 14 Oct".
 */
/** @vitest-environment jsdom */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { clearAllTables } from '../src/data/db.js';
import {
  createSupplier,
  listSuppliers,
  getSupplier,
  updateSupplier,
  deleteSupplier,
  countSupplierProjectLinks,
  linkSupplierToProject,
  unlinkSupplier,
} from '../src/data/supplierRepo.js';
import { createProject } from '../src/data/projectRepo.js';
import { linkSupplierEntry } from '../src/logic/supplierLinking.js';
import { normalizePhoneForWhatsApp } from '../src/logic/quickOrder.js';
import SuppliersScreen from '../src/screens/SuppliersScreen.jsx';

afterEach(() => cleanup());

beforeEach(async () => {
  await clearAllTables();
});

describe('Part B: Suppliers tab and actions', () => {
  it('add dedupes: same name and address reuses existing record and links it', async () => {
    const proj = await createProject({ name: 'Project A' });
    const s1 = await createSupplier({
      businessName: 'Lian Phong Hardware',
      address: 'Betong, Sarawak',
      contact: '014-679 0770',
    });

    const linkDeps = { listSuppliers, createSupplier, linkSupplierToProject };

    // Attempt to add a supplier with identical normalized name + address
    const linked = await linkSupplierEntry(
      proj.id,
      {
        businessName: 'lian phong hardware',
        address: 'betong, sarawak',
        contact: '014-679 0770',
      },
      linkDeps
    );

    expect(linked.id).toBe(s1.id);
    const all = await listSuppliers();
    expect(all).toHaveLength(1); // did not create a duplicate
  });

  it('edit persists: updateSupplier updates record in Dexie', async () => {
    const s = await createSupplier({
      businessName: 'Original Name',
      contact: '012-345 6789',
      address: 'Kuching',
    });

    await updateSupplier(s.id, {
      businessName: 'Updated Name',
      contact: '019-888 7777',
      note: 'Preferred timber supplier',
    });

    const refreshed = await getSupplier(s.id);
    expect(refreshed.businessName).toBe('Updated Name');
    expect(refreshed.contact).toBe('019-888 7777');
    expect(refreshed.note).toBe('Preferred timber supplier');
    expect(refreshed.logisticsNote).toBe('Preferred timber supplier');
  });

  it('delete blocked when linked: blocked with count, succeeds after unlinking', async () => {
    const proj = await createProject({ name: 'Project Link Test' });
    const s = await createSupplier({
      businessName: 'Locked Supplier',
      contact: '011-222 3333',
    });

    await linkSupplierToProject({ projectId: proj.id, globalSupplierId: s.id });

    // Link exists -> count is 1
    const count = await countSupplierProjectLinks(s.id);
    expect(count).toBe(1);

    // deleteSupplier throws an error with the used-in count
    await expect(deleteSupplier(s.id)).rejects.toThrow(/used in 1 project/);

    // Unlink from project
    await unlinkSupplier(proj.id, s.id);
    expect(await countSupplierProjectLinks(s.id)).toBe(0);

    // Now delete succeeds
    await deleteSupplier(s.id);
    expect(await getSupplier(s.id)).toBeUndefined();
  });

  it('exact wa.me and tel: link shapes in phone normalisation and rendering', async () => {
    const rawNumber = '014-679 0770';
    const digits = normalizePhoneForWhatsApp(rawNumber);
    expect(digits).toBe('60146790770');

    const proj = await createProject({ name: 'Phone Link Proj' });
    const s = await createSupplier({
      businessName: 'Wa Call Supplier',
      contact: rawNumber,
    });
    await linkSupplierToProject({ projectId: proj.id, globalSupplierId: s.id });

    const ui = render(<SuppliersScreen projectId={proj.id} />);
    await waitFor(() => expect(ui.getByText('Wa Call Supplier')).toBeTruthy());

    const waLink = ui.container.querySelector('a[href^="https://wa.me/"]');
    expect(waLink).toBeTruthy();
    expect(waLink.getAttribute('href')).toBe('https://wa.me/60146790770');

    // Copy check
    expect(ui.getByText(/Opens WhatsApp\. Nothing is sent\./)).toBeTruthy();

    const telLink = ui.container.querySelector('a[href^="tel:"]');
    expect(telLink).toBeTruthy();
    expect(telLink.getAttribute('href')).toBe('tel:014-679 0770');
    ui.unmount();
  });

  it('malformed number blocks WhatsApp with the fix prompt ("Fix number")', async () => {
    const proj = await createProject({ name: 'Malformed Phone Proj' });
    const s = await createSupplier({
      businessName: 'Bad Number Shop',
      contact: '12345', // malformed / not a plausible Malaysia number
    });
    await linkSupplierToProject({ projectId: proj.id, globalSupplierId: s.id });

    const ui = render(<SuppliersScreen projectId={proj.id} />);
    await waitFor(() => expect(ui.getByText('Bad Number Shop')).toBeTruthy());

    // Should NOT have a wa.me link
    const waLink = ui.container.querySelector('a[href^="https://wa.me/"]');
    expect(waLink).toBeNull();

    // Should render "Fix number" button
    const fixBtn = ui.getByRole('button', { name: /Fix number/i });
    expect(fixBtn).toBeTruthy();
    ui.unmount();
  });

  it('null contact renders no buttons and no "NULL"', async () => {
    const proj = await createProject({ name: 'Null Contact Proj' });
    const s = await createSupplier({
      businessName: 'No Contact Supplier',
      contact: null,
    });
    await linkSupplierToProject({ projectId: proj.id, globalSupplierId: s.id });

    const ui = render(<SuppliersScreen projectId={proj.id} />);
    await waitFor(() => expect(ui.getByText('No Contact Supplier')).toBeTruthy());

    // Shows contact not listed
    expect(ui.getByText('Contact not listed')).toBeTruthy();

    // No WhatsApp or Call buttons
    expect(ui.container.querySelector('a[href^="https://wa.me/"]')).toBeNull();
    expect(ui.container.querySelector('a[href^="tel:"]')).toBeNull();

    // Never renders the text "NULL"
    expect(ui.container.textContent).not.toMatch(/\bNULL\b/);
    ui.unmount();
  });

  it('verified date per supplier shows "Verified <date>" badge', async () => {
    const proj = await createProject({ name: 'Verified Supplier Proj' });
    const s = await createSupplier({
      businessName: 'Verified Supplier',
      contact: '014-679 0770',
      verifiedDate: '2026-10-14T08:00:00.000Z',
    });
    await linkSupplierToProject({ projectId: proj.id, globalSupplierId: s.id });

    const ui = render(<SuppliersScreen projectId={proj.id} />);
    await waitFor(() => expect(ui.getByText('Verified Supplier')).toBeTruthy());

    // Word badge present
    expect(ui.getByText(/Verified 14 Oct 2026/)).toBeTruthy();
    ui.unmount();
  });
});
