/**
 * e2eFreshImport.test.jsx — Agent 5 (Task J).
 * The exact scenario that hid H2/H3: a brand-new project, first-ever import,
 * through the actual import UI, using the real production .md — not a pre-seeded
 * repo call. Asserts BOM/Confirm/supplier counts match the source file exactly,
 * then edits through the UI and asserts the value persists and locks.
 */
/** @vitest-environment jsdom */
import 'fake-indexeddb/auto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { clearAllTables } from '../src/data/db.js';
import { listBomItems } from '../src/data/bomRepo.js';
import { listShortageItems } from '../src/data/shortageRepo.js';
import { listProjectSuppliers } from '../src/data/supplierRepo.js';
import ProjectsScreen from '../src/screens/ProjectsScreen.jsx';
import BomScreen from '../src/screens/BomScreen.jsx';

afterEach(() => cleanup());

const dir = path.dirname(fileURLToPath(import.meta.url));
const mdText = fs.readFileSync(path.join(dir, 'fixtures/Qwen_markdown_20260910_k171vvnlq.md'), 'utf8');

beforeEach(async () => {
  await clearAllTables();
});

describe('Task J: fresh project, first import, exact counts, edit locks', () => {
  it('52 BOM / 6 confirm (all agent questions) / 14 suppliers, then edit persists + locks', async () => {
    // Brand-new project, first-ever import, through the real import UI.
    const opened = vi.fn();
    const ui = render(<ProjectsScreen onOpenProject={opened} />);
    const input = ui.container.querySelector('input[type="file"]');
    fireEvent.change(input, {
      target: { files: [new File([mdText], 'Qwen_markdown_20260910_k171vvnlq.md', { type: 'text/markdown' })] },
    });
    await waitFor(() => expect(opened).toHaveBeenCalledTimes(1), { timeout: 20000 });
    const projectId = opened.mock.calls[0][0];
    ui.unmount();
    cleanup();

    // Counts match the source file exactly — zero spurious pendings.
    expect((await listBomItems(projectId))).toHaveLength(52);
    const confirm = await listShortageItems(projectId, { resolved: false });
    expect(confirm).toHaveLength(6);
    expect(confirm.every((c) => c.kind === 'agent_question')).toBe(true);
    expect((await listProjectSuppliers(projectId))).toHaveLength(14);

    // Edit afterward through the UI value cell: persists and locks.
    const bom = render(<BomScreen projectId={projectId} />);
    const row = (await screen.findByText('Gypsum Board 9mm')).closest('.row');
    const qtyCell = within(row).getByRole('button', { name: /Edit purchase quantity/ });
    fireEvent.click(qtyCell);
    const panel = screen.getByText('Edit purchaseQty (will lock the field)').closest('.card');
    fireEvent.change(panel.querySelector('input'), { target: { value: '77' } });
    fireEvent.click(screen.getByText('Save + lock'));
    // 52-row re-render + supplier joins can exceed the 1s default; generous tolerance.
    await screen.findByText(/🔒 purchaseQty/, {}, { timeout: 10000 });
    const gypsum = (await listBomItems(projectId)).find((b) => b.item === 'Gypsum Board 9mm');
    expect({ purchaseQty: gypsum.purchaseQty, locked: gypsum.lockedFields }).toEqual({
      purchaseQty: 77,
      locked: ['purchaseQty'],
    });
    bom.unmount();
  }, 45000); // 45s — UI-driven e2e through fake-indexeddb is slow under parallel load
});
