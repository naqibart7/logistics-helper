/**
 * stockSeparation.test.jsx — Stock is a live inventory record, not a project
 * section (user request 15 Oct 2026).
 *
 * The stock ledger must be reachable outside any project, must not add a button
 * to the project tab bar, and must be escapable back to the projects list.
 * The project tab bar's own 6-button / 5-label shape is asserted in
 * touchTargets.test.jsx.
 */
/** @vitest-environment jsdom */
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { clearAllTables } from '../src/data/db.js';
import { createProject } from '../src/data/projectRepo.js';
import App from '../src/App.jsx';

afterEach(() => cleanup());
beforeEach(async () => {
  await clearAllTables();
});

describe('Stock lives outside the project shell', () => {
  it('offers the ledger from the projects screen, before any project is open', async () => {
    const app = render(<App />);
    expect(await app.findByText('Stock & Inventory')).toBeTruthy();
    expect(app.getByText('Open stock ledger')).toBeTruthy();
    // No project sections rendered while no project is open.
    expect(app.container.querySelectorAll('.tab-label-full').length).toBe(0);
  });

  it('opens the ledger with its own nav and returns to the projects list', async () => {
    const app = render(<App />);
    fireEvent.click(await app.findByText('Open stock ledger'));

    expect(await app.findByText('Stock Ledger')).toBeTruthy();
    const navButtons = [...app.container.querySelectorAll('.tab-bar button')];
    expect(navButtons.map((b) => b.textContent.trim())).toEqual(['Projects', 'Stock']);
    expect(navButtons[1].getAttribute('aria-current')).toBe('page');
    // Project sections are nowhere in this view.
    expect(app.container.querySelectorAll('.tab-label-full').length).toBe(0);
    expect(app.queryByText('Dashboard')).toBeNull();

    fireEvent.click(app.getByText('Projects'));
    expect(await app.findByText('Stock & Inventory')).toBeTruthy();
  });

  it('does not put Stock in the project tab bar', async () => {
    const project = await createProject({ name: 'TAB PROBE' });
    const app = render(<App />);
    fireEvent.click(await app.findByText('Open'));

    const labels = [...app.container.querySelectorAll('.tab-bar .tab-label-full')].map((e) => e.textContent);
    expect(labels).toEqual(['Dashboard', 'BOM', 'Confirm', 'Suppliers', 'PO']);
    expect(labels).not.toContain('Stock');
    // Projects + the five project sections.
    expect(app.container.querySelectorAll('.tab-bar button').length).toBe(6);
    expect(project.id).toBeTruthy();
  });

  it('keeps the stock threshold classes on the app stylesheet (no Tailwind)', async () => {
    const app = render(<App />);
    fireEvent.click(await app.findByText('Open stock ledger'));
    await app.findByText('Stock Ledger');

    const badge = app.container.querySelector('.low-stock-badge');
    expect(badge).toBeTruthy();
    expect(badge.className).toMatch(/stock-status-(ok|warning|critical)/);
    expect(app.container.innerHTML).not.toMatch(/bg-red-100|bg-yellow-100|bg-green-100/);
  });
});
