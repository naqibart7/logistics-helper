/**
 * parser.test.js — Agent 5: same-run fixture pair -> DEEP EQUAL ParsedImport.
 *
 * Ground truth: both fixtures are exports of ONE Agent 6/7 run (2026-09-10
 * ~14:00): the .md (15:01) and the .xlsx (14:08) carry identical data —
 * 52 bom lines, 6 shortage rows, 14 supplier entries, 5 change-log lines.
 * (The Sep-08 xlsx previously staged here was a different run and has been
 * replaced; see BUILD_PROGRESS.md Task A.)
 *
 * This test asserts FULL deep equality field-by-field. It fails loudly if the
 * two formats ever produce different data for the same run — not just on
 * shape changes. Deterministic parser rules that make this hold:
 *   - canonical projectTitle (location tail stripped),
 *   - numbers cleaned to 4dp (kills xlsx float dust like 28.000000000000004),
 *   - markdown-link URLs parsed greedily (paren-containing URLs survive).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseMarkdown } from '../src/utils/importParser/mdReader.js';
import { parseXlsx, parseWorkbook } from '../src/utils/importParser/xlsxReader.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const mdText = fs.readFileSync(path.join(dir, 'fixtures/Qwen_markdown_20260910_k171vvnlq.md'), 'utf8');
// Pandas-export variant (same project, earlier export, title/metadata rows above
// the true header row, Unnamed: columns, 6 sections, no supplier/change-log sheets).
const pandasText = fs.readFileSync(path.join(dir, 'fixtures/Surau_Darul_Dakwah_BOM.md'), 'utf8');
const xlsxBuf = fs.readFileSync(
  path.join(dir, 'fixtures/Surau_Darul_Dakwah_BOM_A7_Grounded_Sourcing.xlsx')
);
const xlsxAb = xlsxBuf.buffer.slice(xlsxBuf.byteOffset, xlsxBuf.byteOffset + xlsxBuf.byteLength);

const BOM_KEYS = ['item', 'spec', 'category', 'unit', 'netQty', 'wastagePct', 'purchaseQty', 'unitCost', 'estTotal', 'basis', 'confidence', 'pack', 'notes'];

describe('parser acceptance: same run, both formats, deep-equal ParsedImport', () => {
  it('produces deeply equal ParsedImport outputs (field by field)', async () => {
    const md = parseMarkdown(mdText);
    const xlsx = await parseXlsx(xlsxAb);
    expect(xlsx).toEqual(md);
  });

  it('documents the fixture: 52 / 6 / 14 / 5 (fails loudly on fixture drift)', async () => {
    const md = parseMarkdown(mdText);
    expect(md.projectTitle).toBe('SURAU DARUL DAKWAH');
    expect(md.bomItems).toHaveLength(52);
    expect(md.shortageConfirmItems).toHaveLength(6);
    expect(md.supplierEntries).toHaveLength(14);
    expect(md.changeLogFromAgent).toHaveLength(5);
  });

  it('agrees on anchor values incl. float-prone and paren-URL cases', async () => {
    const xlsx = await parseXlsx(xlsxAb);
    const g4516 = xlsx.bomItems.find((r) => r.item === 'PVC 45mm G4516 Wainscoting');
    expect(g4516.wastagePct).toBe(28); // xlsx stores 0.28 fraction, not float dust
    const skirting = xlsx.bomItems.find((r) => r.item === 'PVC 100mm Skirting');
    expect(skirting.wastagePct).toBe(29);
    const waze = xlsx.supplierEntries.find((s) => s.businessName.startsWith('Sin Teck Hung'));
    const md = parseMarkdown(mdText);
    const wazeMd = md.supplierEntries.find((s) => s.businessName.startsWith('Sin Teck Hung'));
    expect(waze.sourceUrl).toBe(wazeMd.sourceUrl);
    expect(waze.sourceUrl.endsWith('(jotun-studio-and-jotun-paints-dealer)')).toBe(true);
    for (const row of xlsx.bomItems) expect(Object.keys(row).sort()).toEqual([...BOM_KEYS].sort());
  });

  it('never guesses: absent sections are empty arrays, not errors', async () => {
    const xlsx = await parseXlsx(xlsxAb);
    expect(Array.isArray(xlsx.supplierEntries)).toBe(true);
    expect(Array.isArray(xlsx.changeLogFromAgent)).toBe(true);
  });
});

describe('parser acceptance: pandas-export md variant (title rows above header)', () => {
  it('extracts all 52 lines + 6 confirmations instead of nothing', () => {
    const p = parseMarkdown(pandasText);
    expect(p.projectTitle).toBe('SURAU DARUL DAKWAH');
    expect(p.bomItems).toHaveLength(52);
    expect(p.shortageConfirmItems).toHaveLength(6);
    // This variant genuinely has no supplier directory / change log sections.
    expect(p.supplierEntries).toEqual([]);
    expect(p.changeLogFromAgent).toEqual([]);
  });

  it('emits the contract shape with matching anchor values', () => {
    const p = parseMarkdown(pandasText);
    for (const row of p.bomItems) expect(Object.keys(row).sort()).toEqual([...BOM_KEYS].sort());
    const gypsum = p.bomItems.find((r) => r.item === 'Gypsum Board 9mm');
    expect(gypsum).toMatchObject({ netQty: 10, purchaseQty: 12, unitCost: 28, estTotal: 336 });
    expect(p.shortageConfirmItems[0]).toMatchObject({ severity: 'MEDIUM', owner: 'Purchasing' });
    // Note/total rows must not leak in as items.
    expect(p.bomItems.some((r) => /MATERIAL TOTAL|Labour, transport/i.test(r.item || ''))).toBe(false);
  });
});

describe('parser acceptance: canonical-name xlsx BOM header', () => {
  it('imports a valid Master Reconciliation BOM whose item column is named Item / Canonical Name', () => {
    const book = XLSX.utils.book_new();
    const dashboard = XLSX.utils.aoa_to_sheet([
      ['ORDER-READY DASHBOARD'],
      ['Project: KEDIAMAN PUAN HASHIMA, PUNCAK ALAM, SELANGOR | Q260163'],
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([
      ['MASTER / RECONCILIATION BOM — KEDIAMAN PUAN HASHIMA (Q260163)'],
      ['Geometry Source of Truth: Detail Drawing'],
      [],
      ['ID', 'System / Category', 'Item / Canonical Name', 'Spec / Colour Code', 'Unit', 'Net Qty', 'Wastage', 'Purchase Qty', 'Purchase Pack', 'Basis / Method', 'Confidence', 'Notes / Flags'],
      ['A1-01', 'Custom / CNC', 'PVC Decorative Panel', '10 mm THK PVC', 'pcs', 3, 0, 3, '3 panels', 'drawing count', 'High', 'Long lead'],
    ]);
    // The real export places its dashboard before the Master BOM. Sheet order
    // must not matter: both orders resolve the same bare project name
    // (quotation refs like Q260163 are not the name — see Task N).
    XLSX.utils.book_append_sheet(book, dashboard, 'H. Order-Ready Dashboard');
    XLSX.utils.book_append_sheet(book, sheet, 'A. Master Reconciliation BOM');

    expect(parseWorkbook(book)).toMatchObject({
      projectTitle: 'KEDIAMAN PUAN HASHIMA',
      bomItems: [{
        category: 'Custom / CNC',
        item: 'PVC Decorative Panel',
        spec: '10 mm THK PVC',
        unit: 'pcs',
        netQty: 3,
        purchaseQty: 3,
      }],
    });

    // Swapped sheet order (Master first) resolves identically.
    const swapped = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(swapped, sheet, 'A. Master Reconciliation BOM');
    XLSX.utils.book_append_sheet(swapped, dashboard, 'H. Order-Ready Dashboard');
    expect(parseWorkbook(swapped).projectTitle).toBe('KEDIAMAN PUAN HASHIMA');
  });
});

describe('Task N regression: real inverted-order file with comma-less Master title', () => {
  const hashimaPath = path.join(dir, 'fixtures/Artseven_BOM_Q260163_Kediaman_Puan_Hashima_v2.xlsx');

  it('resolves the project title (not a version suffix), with full body counts', async () => {
    const buf = fs.readFileSync(hashimaPath);
    const parsed = await parseXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(parsed.projectTitle).toBe('KEDIAMAN PUAN HASHIMA');
    expect(parsed.bomItems).toHaveLength(11);
    expect(parsed.shortageConfirmItems).toHaveLength(4);
    expect(parsed.supplierEntries).toHaveLength(7);
    expect(parsed.changeLogFromAgent).toHaveLength(7);
    const panel = parsed.bomItems.find((r) => r.item === 'PVC Decorative Panel (finished lattice)');
    expect(panel).toMatchObject({ purchaseQty: 3, confidence: 'High' });
  });

  it('keeps every real price and turns “—” (TBC / not-costed) into null, never 0', async () => {
    const buf = fs.readFileSync(hashimaPath);
    const parsed = await parseXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

    const byName = (name) => parsed.bomItems.filter((r) => r.item === name);
    // Real price table from the source (Unit Price (RM) / Est. Total (RM)).
    const priced = {
      'PVC Sheet 10 mm (raw for CNC)': { unitCost: 375, estTotal: 750 },
      'Jotun Majestic Paint (Panel + Site / Base)': { unitCost: 45, estTotal: 90 },
      'X-Bond Construction Adhesive 500 ml': { unitCost: 15, estTotal: 15 },
      'Silicon Sealant (Paintable)': { unitCost: 10, estTotal: 10 },
      'Masking Tape 2" (Bundle)': { unitCost: 10, estTotal: 10 },
      'Canvas Blue White': { unitCost: 60, estTotal: 60 },
    };
    for (const [name, want] of Object.entries(priced)) {
      const rows = byName(name);
      expect(rows.length, name).toBeGreaterThanOrEqual(1);
      for (const r of rows) expect(r).toMatchObject(want);
    }
    // Jotun appears twice (two colour codes), both priced identically.
    expect(byName('Jotun Majestic Paint (Panel + Site / Base)')).toHaveLength(2);
    // Real numeric zero stays zero (Super Glue: costed 90, ordered 0).
    expect(byName('Super Glue 10g (Box)')[0]).toMatchObject({ unitCost: 90, purchaseQty: 0, estTotal: 0 });
    expect(byName('Transportation')[0]).toMatchObject({ unitCost: 300, estTotal: 300 });

    // “—” (em-dash) in the price column means "not costed / TBC" -> null, not 0.
    const uncosted = [
      'PVC Decorative Panel (finished lattice)',
      'Access Equipment (ladder / light)',
    ];
    for (const name of uncosted) {
      const r = byName(name)[0];
      expect(r, name).toBeTruthy();
      expect(r.unitCost, name).toBeNull();
      expect(r.estTotal, name).toBeNull();
    }

    // Item-count guard: 11 source rows, 11 parsed — no phantom/dropped items.
    expect(parsed.bomItems).toHaveLength(11);
  });
});
