/**
 * importCheck.test.js — Part A acceptance tests.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { checkBomRows } from '../src/logic/importCheck.js';

// ─── helpers ────────────────────────────────────────────────────────────────

let idSeq = 0;
const mkRow = (overrides = {}) => ({
  id: `row-${++idSeq}`,
  item: 'Gypsum Board 9mm',
  spec: '1200×2400mm',
  category: 'Ceiling',
  unit: 'pcs',
  netQty: 10,
  wastagePct: 10,          // 10% → purchaseQty should be ≥ 11
  purchaseQty: 11,
  unitCost: 5.50,
  estTotal: 60.50,         // 11 × 5.50 = 60.50 — correct
  basis: 'M',              // measured — strong
  confidence: 'high',
  ...overrides,
});

// ─── basic ───────────────────────────────────────────────────────────────────

describe('checkBomRows: basic', () => {
  it('returns [] for empty / null input', () => {
    expect(checkBomRows([])).toEqual([]);
    expect(checkBomRows(null)).toEqual([]);
    expect(checkBomRows(undefined)).toEqual([]);
  });

  it('a clean row produces no findings', () => {
    const row = mkRow();
    expect(checkBomRows([row])).toEqual([]);
  });
});

// ─── R1 line total ───────────────────────────────────────────────────────────

describe('R1 line total', () => {
  it('fires when total is wrong beyond tolerance', () => {
    const row = mkRow({ purchaseQty: 10, unitCost: 100, estTotal: 1010 }); // expected 1000
    const findings = checkBomRows([row]);
    const r1 = findings.filter((f) => f.rule === 'R1');
    expect(r1).toHaveLength(1);
    expect(r1[0].message).toMatch(/mismatch/i);
    expect(r1[0].message).toMatch(/1000/); // expected value mentioned
    expect(r1[0].message).toMatch(/1010/); // actual value mentioned
  });

  it('does NOT fire when within 0.5% tolerance', () => {
    // 10 × 100 = 1000; 1001 is 0.1% off — within tolerance
    const row = mkRow({ purchaseQty: 10, unitCost: 100, estTotal: 1001 });
    expect(checkBomRows([row]).filter((f) => f.rule === 'R1')).toHaveLength(0);
  });

  it('does NOT fire when unitCost is null (TBD price)', () => {
    const row = mkRow({ unitCost: null, estTotal: null });
    expect(checkBomRows([row]).filter((f) => f.rule === 'R1')).toHaveLength(0);
  });

  it('does NOT fire when unitCost is "TBD" string', () => {
    const row = mkRow({ unitCost: 'TBD', estTotal: null });
    expect(checkBomRows([row]).filter((f) => f.rule === 'R1')).toHaveLength(0);
  });

  it('does NOT fire when estTotal is null', () => {
    const row = mkRow({ estTotal: null });
    expect(checkBomRows([row]).filter((f) => f.rule === 'R1')).toHaveLength(0);
  });

  it('does NOT fire when purchaseQty is null', () => {
    const row = mkRow({ purchaseQty: null, estTotal: null });
    expect(checkBomRows([row]).filter((f) => f.rule === 'R1')).toHaveLength(0);
  });
});

// ─── R2 under-buy ────────────────────────────────────────────────────────────

describe('R2 under-buy', () => {
  it('fires when purchaseQty < netQty', () => {
    const row = mkRow({ netQty: 10, wastagePct: null, purchaseQty: 8 });
    const findings = checkBomRows([row]);
    const r2 = findings.filter((f) => f.rule === 'R2');
    expect(r2).toHaveLength(1);
    expect(r2[0].message).toMatch(/under-buying/i);
    expect(r2[0].message).toMatch(/8/);
    expect(r2[0].message).toMatch(/10/);
  });

  it('fires when purchaseQty < netQty × (1 + wastage)', () => {
    // netQty=10, wastage=20% → need 12; only 11 bought
    const row = mkRow({ netQty: 10, wastagePct: 20, purchaseQty: 11 });
    const findings = checkBomRows([row]);
    const r2 = findings.filter((f) => f.rule === 'R2');
    expect(r2).toHaveLength(1);
    expect(r2[0].message).toMatch(/wastage/i);
  });

  it('does NOT fire when purchaseQty exactly meets netQty × (1 + wastage)', () => {
    const row = mkRow({ netQty: 10, wastagePct: 10, purchaseQty: 11 });
    expect(checkBomRows([row]).filter((f) => f.rule === 'R2')).toHaveLength(0);
  });

  it('does NOT fire when purchaseQty or netQty is null/TBD', () => {
    const row = mkRow({ purchaseQty: null, netQty: null });
    expect(checkBomRows([row]).filter((f) => f.rule === 'R2')).toHaveLength(0);
  });
});

// ─── R3 provenance ───────────────────────────────────────────────────────────

describe('R3 provenance', () => {
  it('fires for basis = "A" (assumption)', () => {
    const row = mkRow({ basis: 'A' });
    const r3 = checkBomRows([row]).filter((f) => f.rule === 'R3');
    expect(r3.length).toBeGreaterThan(0);
    expect(r3[0].message).toMatch(/assumption/i);
  });

  it('fires for basis = "NS" (not specified)', () => {
    const row = mkRow({ basis: 'NS' });
    const r3 = checkBomRows([row]).filter((f) => f.rule === 'R3');
    expect(r3.length).toBeGreaterThan(0);
  });

  it('fires for confidence = "low"', () => {
    const row = mkRow({ confidence: 'low' });
    const r3 = checkBomRows([row]).filter((f) => f.rule === 'R3');
    expect(r3.length).toBeGreaterThan(0);
    expect(r3[0].message).toMatch(/uncertain|low/i);
  });

  it('does NOT fire for basis = "M" (measured)', () => {
    const row = mkRow({ basis: 'M', confidence: 'high' });
    expect(checkBomRows([row]).filter((f) => f.rule === 'R3')).toHaveLength(0);
  });

  it('does NOT fire for null basis/confidence (not enough info to flag)', () => {
    const row = mkRow({ basis: null, confidence: null });
    expect(checkBomRows([row]).filter((f) => f.rule === 'R3')).toHaveLength(0);
  });
});

// ─── R4 missing essentials ───────────────────────────────────────────────────

describe('R4 missing essentials', () => {
  it('fires when purchaseQty is null', () => {
    const row = mkRow({ purchaseQty: null });
    const r4 = checkBomRows([row]).filter((f) => f.rule === 'R4');
    expect(r4.length).toBeGreaterThan(0);
    expect(r4[0].message).toMatch(/missing/i);
  });

  it('fires when purchaseQty is 0', () => {
    const row = mkRow({ purchaseQty: 0 });
    const r4 = checkBomRows([row]).filter((f) => f.rule === 'R4');
    expect(r4.length).toBeGreaterThan(0);
  });

  it('fires when unit is empty', () => {
    const row = mkRow({ unit: '' });
    const r4 = checkBomRows([row]).filter((f) => f.rule === 'R4');
    expect(r4.length).toBeGreaterThan(0);
    expect(r4[0].message).toMatch(/unit/i);
  });

  it('fires when unit is null', () => {
    const row = mkRow({ unit: null });
    const r4 = checkBomRows([row]).filter((f) => f.rule === 'R4');
    expect(r4.length).toBeGreaterThan(0);
  });

  it('fires when unitCost is a nonsense string like "TBC"', () => {
    const row = mkRow({ unitCost: 'TBC' });
    const r4 = checkBomRows([row]).filter((f) => f.rule === 'R4');
    expect(r4.length).toBeGreaterThan(0);
    expect(r4[0].message).toMatch(/TBC/);
  });

  it('fires when unitCost is "pending"', () => {
    const row = mkRow({ unitCost: 'pending' });
    const r4 = checkBomRows([row]).filter((f) => f.rule === 'R4');
    expect(r4.length).toBeGreaterThan(0);
  });

  it('does NOT fire when unitCost is null (legitimate TBD)', () => {
    const row = mkRow({ unitCost: null });
    expect(checkBomRows([row]).filter((f) => f.rule === 'R4')).toHaveLength(0);
  });

  it('does NOT fire on a normal clean row', () => {
    const row = mkRow();
    expect(checkBomRows([row]).filter((f) => f.rule === 'R4')).toHaveLength(0);
  });
});

// ─── R5 duplicates ───────────────────────────────────────────────────────────

describe('R5 duplicates', () => {
  it('fires for two rows with same item+spec', () => {
    const r1 = mkRow({ item: 'Cement', spec: 'Portland 42.5' });
    const r2 = mkRow({ item: 'Cement', spec: 'Portland 42.5' });
    const findings = checkBomRows([r1, r2]);
    const r5 = findings.filter((f) => f.rule === 'R5');
    // Both copies must be flagged
    expect(r5.length).toBeGreaterThanOrEqual(2);
    expect(r5[0].message).toMatch(/duplicate/i);
  });

  it('does NOT fire when item+spec are different', () => {
    const r1 = mkRow({ item: 'Cement', spec: 'Portland 42.5' });
    const r2 = mkRow({ item: 'Cement', spec: 'Portland 32.5' }); // different spec
    expect(checkBomRows([r1, r2]).filter((f) => f.rule === 'R5')).toHaveLength(0);
  });

  it('is case-insensitive for duplicates', () => {
    const r1 = mkRow({ item: 'GYPSUM BOARD 9MM', spec: null });
    const r2 = mkRow({ item: 'gypsum board 9mm', spec: null });
    const findings = checkBomRows([r1, r2]).filter((f) => f.rule === 'R5');
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── ordering ────────────────────────────────────────────────────────────────

describe('ordering: R3 and R1 first, then by estTotal descending', () => {
  it('R3 findings appear before R2 findings in output', () => {
    const row = mkRow({
      basis: 'A',          // R3
      netQty: 10, wastagePct: null, purchaseQty: 5,   // R2
    });
    const findings = checkBomRows([row]);
    const rules = findings.map((f) => f.rule);
    const r3Idx = rules.findIndex((r) => r === 'R3');
    const r2Idx = rules.findIndex((r) => r === 'R2');
    expect(r3Idx).toBeLessThan(r2Idx);
  });

  it('among R1 findings, higher estTotal rows come first', () => {
    const cheap = mkRow({ id: 'cheap', purchaseQty: 1, unitCost: 10, estTotal: 999, item: 'Cheap Item' });
    const pricey = mkRow({ id: 'pricey', purchaseQty: 1, unitCost: 100, estTotal: 9999, item: 'Pricey Item' });
    // Both have R1 errors (expected 10 / 100 but estTotal is much higher)
    const findings = checkBomRows([cheap, pricey]).filter((f) => f.rule === 'R1');
    // pricey item (estTotal 9999) should come first
    expect(findings[0].rowId).toBe('pricey');
    expect(findings[1].rowId).toBe('cheap');
  });
});

// ─── TBD / null price never raises R1 ─────────────────────────────────────────

describe('TBD price never raises R1', () => {
  const tbdVariants = [null, undefined, 'TBD', '—', '-', ''];

  tbdVariants.forEach((v) => {
    it(`unitCost = ${JSON.stringify(v)} does not raise R1`, () => {
      const row = mkRow({ unitCost: v, estTotal: null });
      expect(checkBomRows([row]).filter((f) => f.rule === 'R1')).toHaveLength(0);
    });
  });

  it('estTotal = null with a numeric unitCost does not raise R1', () => {
    const row = mkRow({ estTotal: null });
    expect(checkBomRows([row]).filter((f) => f.rule === 'R1')).toHaveLength(0);
  });
});

// ─── Golden fixture list (A2) ────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMarkdown } from '../src/utils/importParser/mdReader.js';
import { parseXlsx } from '../src/utils/importParser/xlsxReader.js';
import { changeSentence } from '../src/screens/DashboardScreen.jsx';
import { clearAllTables } from '../src/data/db.js';
import { createProject } from '../src/data/projectRepo.js';
import { createBomItem, lockField, listBomItems } from '../src/data/bomRepo.js';
import { appendChangeLog, listChangeLog } from '../src/data/changeLogRepo.js';
import { reimportProject } from '../src/logic/reimportProject.js';
import { buildParsedImport } from '../src/utils/importParser/normalize.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));

describe('A2: Golden fixture list', () => {
  it('Surau MD fixture produces 0 findings (no false positives after tolerance tuning)', () => {
    const text = fs.readFileSync(path.join(testDir, 'fixtures/Surau_Darul_Dakwah_BOM.md'), 'utf8');
    const parsed = parseMarkdown(text);
    const findings = checkBomRows(parsed.bomItems);
    expect(findings).toEqual([]);
  });

  it('Surau XLSX fixture produces 0 findings (clean baseline)', async () => {
    const buf = fs.readFileSync(path.join(testDir, 'fixtures/Surau_Darul_Dakwah_BOM_A7_Grounded_Sourcing.xlsx'));
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    const parsed = await parseXlsx(ab);
    const findings = checkBomRows(parsed.bomItems);
    expect(findings).toEqual([]);
  });

  it('Kediaman v2 XLSX fixture produces exactly 2 real findings (Access Equipment & Super Glue)', async () => {
    const buf = fs.readFileSync(path.join(testDir, 'fixtures/Artseven_BOM_Q260163_Kediaman_Puan_Hashima_v2.xlsx'));
    const ab = new ArrayBuffer(buf.byteLength);
    new Uint8Array(ab).set(buf);
    const parsed = await parseXlsx(ab);
    const findings = checkBomRows(parsed.bomItems);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.rule)).toEqual(['R3', 'R4']);
    expect(findings[0].message).toMatch(/Access Equipment/i);
    expect(findings[0].message).toMatch(/Low/i);
    expect(findings[1].message).toMatch(/Super Glue/i);
    expect(findings[1].message).toMatch(/0/);
  });
});

// ─── A4: Verified locks, logs, diary sentence, and non-persistence ───────────

describe('A4: Verified workflow and diary sentence', () => {
  it('diary sentence contains NO raw field name like "verified:purchaseQty"', () => {
    const sentence = changeSentence({
      field: 'verified:purchaseQty',
      oldValue: 12,
      newValue: 12,
      itemName: 'Gypsum Board 9mm',
      actor: 'supervisor',
      timestamp: '2026-10-14T08:00:00.000Z',
    });
    expect(sentence).toBe('You verified quantity 12 for Gypsum Board 9mm');
    expect(sentence).not.toMatch(/verified:purchaseQty/);
    expect(sentence).not.toMatch(/::/);
  });

  it('Verified locks purchaseQty in Dexie and logs a supervisor changeLog entry', async () => {
    await clearAllTables();
    const proj = await createProject({ name: 'Test Verified Proj' });
    const row = await createBomItem({
      projectId: proj.id,
      item: 'Gypsum Board 9mm',
      purchaseQty: 12,
      unitCost: 10,
    });

    // Supervisor verifies the row
    await lockField(row.id, 'purchaseQty');
    await appendChangeLog({
      projectId: proj.id,
      actor: 'supervisor',
      field: 'verified:purchaseQty',
      oldValue: 12,
      newValue: 12,
      itemName: 'Gypsum Board 9mm',
    });

    const items = await listBomItems(proj.id);
    expect(items[0].lockedFields).toContain('purchaseQty');

    const logs = await listChangeLog(proj.id);
    expect(logs).toHaveLength(1);
    expect(logs[0].actor).toBe('supervisor');
    expect(logs[0].field).toBe('verified:purchaseQty');
    expect(changeSentence(logs[0])).toBe('You verified quantity 12 for Gypsum Board 9mm');
  });

  it('findings are computed on read and never persisted: re-import creates no stored findings', async () => {
    await clearAllTables();
    const proj = await createProject({ name: 'Reimport Clean Proj' });
    const initial = buildParsedImport({
      projectTitle: 'Reimport Clean Proj',
      bomItems: [{ item: 'Timber', purchaseQty: 5, unit: 'pcs' }],
    });
    const parsedReimport = buildParsedImport({
      projectTitle: 'Reimport Clean Proj',
      bomItems: [{ item: 'Timber', purchaseQty: 6, unit: 'pcs' }],
    });

    await reimportProject(
      proj.id,
      parsedReimport,
      {
        listBomItems: () => listBomItems(proj.id),
        createBomItem: (p) => createBomItem({ ...p, projectId: proj.id }),
        updateBomItem: () => {},
        appendChangeLog: (p) => appendChangeLog({ ...p, projectId: proj.id }),
        createShortageItem: async () => ({ id: 'short-1' }),
        listShortageItems: async () => [],
      }
    );

    // Check that no database table stores findings
    const storedItems = await listBomItems(proj.id);
    for (const item of storedItems) {
      expect(item).not.toHaveProperty('findings');
      expect(item).not.toHaveProperty('rule');
    }
  });
});
