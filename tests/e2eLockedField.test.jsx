/**
 * e2eLockedField.test.js — Agent 5 (Task G3).
 * Same guarantee as the merge unit tests, but driven through the actual screens:
 *   1. Seed via the real import flow (fixture file dropped through ProjectsScreen).
 *   2. Edit a field through the real BomScreen UI -> lock indicator appears.
 *   3. Re-import (with one other-field price change) through the UI again.
 *   4. Edited value still on screen, unchanged; Change Log shows the supervisor
 *      edit plus the agent overwrite on the other field — and no agent entry
 *      claiming the locked write happened.
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
import { listChangeLog } from '../src/data/changeLogRepo.js';
import ProjectsScreen from '../src/screens/ProjectsScreen.jsx';
import BomScreen from '../src/screens/BomScreen.jsx';

afterEach(() => cleanup());

const dir = path.dirname(fileURLToPath(import.meta.url));
const mdText = fs.readFileSync(path.join(dir, 'fixtures/Qwen_markdown_20260910_k171vvnlq.md'), 'utf8');

const dropFileThroughUi = async (text, filename) => {
  const opened = vi.fn();
  const ui = render(<ProjectsScreen onOpenProject={opened} />);
  const input = ui.container.querySelector('input[type="file"]');
  const file = new File([text], filename, { type: 'text/markdown' });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(opened).toHaveBeenCalledTimes(1), { timeout: 20000 });
  const projectId = opened.mock.calls[0][0];
  ui.unmount();
  return projectId;
};

const gypsumRow = async () => {
  const nameCell = await screen.findByText('Gypsum Board 9mm');
  return nameCell.closest('.row');
};

beforeEach(async () => {
  await clearAllTables();
});

describe('G3: locked field survives a UI re-import', () => {
  it('import -> UI edit + lock -> re-import -> value holds, log is exact', async () => {
    // 1. Seed through the real import flow.
    const projectId = await dropFileThroughUi(mdText, 'Qwen_markdown_20260910_k171vvnlq.md');

    // 2. Edit through the real BOM UI.
    const bom = render(<BomScreen projectId={projectId} />);
    const row = await gypsumRow();
    // Edit entry is the tappable value cell (single edit contract).
    fireEvent.click(within(row).getByRole('button', { name: /Edit purchase quantity/ }));
    const panel = screen.getByText('Edit purchaseQty (will lock the field)').closest('.card');
    fireEvent.change(panel.querySelector('input'), { target: { value: '99' } });
    fireEvent.click(screen.getByText('Save + lock'));
    await screen.findByText(/🔒 purchaseQty/, {}, { timeout: 10000 }); // lock indicator on screen
    const items = await listBomItems(projectId);
    const gypsum = items.find((b) => b.item === 'Gypsum Board 9mm');
    expect({ purchaseQty: gypsum.purchaseQty, locked: gypsum.lockedFields }).toEqual({
      purchaseQty: 99,
      locked: ['purchaseQty'],
    });
    bom.unmount();
    cleanup();

    // 3. Re-import through the UI (same run, one other-field change: unitCost 28 -> 30).
    const parts = mdText.split('| 12 | 28 | 336 |');
    expect(parts.length).toBe(2); // fail loudly if the anchor row ever moves
    const altered = parts.join('| 12 | 30 | 360 |');
    const projectId2 = await dropFileThroughUi(altered, 'Qwen_markdown_20260910_k171vvnlq.md');
    expect(projectId2).toBe(projectId); // matched back into the same project

    // 4. Locked value holds on screen and in storage; log is exact.
    const bom2 = render(<BomScreen projectId={projectId} />);
    const row2 = await gypsumRow();
    expect(within(row2).getByText(/99/)).toBeDefined(); // qty cell now reads "99 🔒"
    expect(within(row2).getByText('RM 30.00')).toBeDefined(); // unlocked field merged
    const after = (await listBomItems(projectId)).find((b) => b.item === 'Gypsum Board 9mm');
    expect({ purchaseQty: after.purchaseQty, unitCost: after.unitCost }).toEqual({
      purchaseQty: 99, // unchanged
      unitCost: 30, // merged
    });
    const log = await listChangeLog(projectId);
    const supervisor = log.filter(
      (e) => e.actor === 'supervisor' && e.field === 'Gypsum Board 9mm :: purchaseQty'
    );
    expect(supervisor.length).toBe(1);
    expect({ old: supervisor[0].oldValue, new: supervisor[0].newValue }).toEqual({ old: 12, new: 99 });
    const agentCost = log.filter(
      (e) => e.actor === 'agent' && e.field === 'Gypsum Board 9mm :: unitCost'
    );
    expect(agentCost.length).toBe(1);
    const agentQty = log.filter((e) => e.actor === 'agent' && e.field === 'Gypsum Board 9mm :: purchaseQty');
    expect(agentQty).toEqual([]); // no entry may claim the locked write happened
    bom2.unmount();
  }, 60000); // 60s — two UI imports plus fake-indexeddb is slow under parallel test load
});
