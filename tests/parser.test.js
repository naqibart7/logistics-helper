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

describe('parser acceptance: combined "Canonical Name / Spec" header (synthetic)', () => {
  it('imports a Master BOM whose only item column is Canonical Name / Spec', () => {
    // The shape that produced an empty BOM tab: no column contains the word
    // "Item", name and spec share one column, and the price columns are absent.
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ['MASTER / RECONCILIATION BOM — MASJID ASY SYAKIRIN, PUCHONG (REV 2 DSG B)'],
      [],
      ['ID', 'System / Area', 'Canonical Name / Spec', 'Unit', 'Net Qty', 'Wastage %',
        'Wastage Applied', 'Purchase Qty', 'Purchase Pack', 'Basis / Method', 'Confidence', 'Notes / Flags'],
      ['A1-01', 'Mihrab (A1)', 'PVC 10mm Panel – JOTUN Matt 0001 White', 'sqft', 61.02, 0.12, 7.32, 68.34,
        '14 sheets', 'Area + 12% wastage', 'High', 'From quotation'],
      ['', '', '', '', '', '', '', '', '', '', '', ''],
      ['S-10', 'Scaffolding & Access', 'Temporary Scaffolding', 'set', 1, 0, 0, 1,
        '1 rental set', 'Site measure', 'High', ''],
    ]);
    XLSX.utils.book_append_sheet(book, sheet, 'A. Master Reconciliation BOM');

    const parsed = parseWorkbook(book);
    expect(parsed.projectTitle).toBe('MASJID ASY SYAKIRIN');
    // The blank row is not an item; the row below the "Notes:" position still is.
    expect(parsed.bomItems).toHaveLength(2);
    expect(parsed.bomItems[0]).toMatchObject({
      category: 'Mihrab (A1)',
      item: 'PVC 10mm Panel – JOTUN Matt 0001 White',
      // One combined column feeds item only; spec must not duplicate the name.
      spec: null,
      unit: 'sqft',
      netQty: 61.02,
      wastagePct: 12,
      purchaseQty: 68.34,
      confidence: 'High',
      basis: 'Area + 12% wastage',
      pack: '14 sheets',
      notes: 'From quotation',
    });
    expect(parsed.bomItems.every((r) => r.spec === null)).toBe(true);
  });
});

// The real workbook for this export is kept beside the other fixtures when the
// working copy has it (it is Naqib's live project data, so it is deliberately
// not committed). The synthetic test above always runs and covers the same
// parser path; these tests add the file's exact counts and anchors locally.
const masjidPath = path.join(dir, 'fixtures/Masjid_Asy_Syakirin_Puchong_BOM_151026.xlsx');
const describeWithMasjid = fs.existsSync(masjidPath) ? describe : describe.skip;

describeWithMasjid('Masjid Asy-Syakirin export (real workbook, local fixture)', () => {
  // Real export (15 Oct 2026) from the v3.1 pipeline. Its Master BOM has no
  // column containing the word "Item" — the name column is "Canonical Name /
  // Spec" — so header detection that insisted on "item" produced ZERO BOM rows
  // and an empty BOM tab for this project. 57 data rows: one blank row and one
  // "Notes: …" row are not items, so 55.
  const parseMasjid = async () => {
    const buf = fs.readFileSync(masjidPath);
    return parseXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  };

  it('imports all 55 BOM lines instead of nothing', async () => {
    const parsed = await parseMasjid();
    expect(parsed.bomItems).toHaveLength(55);
    expect(parsed.shortageConfirmItems).toHaveLength(8);
    expect(parsed.supplierEntries).toHaveLength(13);
    expect(parsed.changeLogFromAgent).toHaveLength(8);
  });

  it('keeps the project name and leaves location null (no explicit Project: line)', async () => {
    const parsed = await parseMasjid();
    // Title row: "MASTER / RECONCILIATION BOM — Masjid Asy Syakirin, Puchong (REV 2 DSG B)".
    // The comma tail ("Puchong …") is a location, not part of the name.
    expect(parsed.projectTitle).toBe('MASJID ASY SYAKIRIN');
    expect(parsed.location).toBeNull();
  });

  it('maps the combined name column to item only — spec stays null, never duplicated', async () => {
    const parsed = await parseMasjid();
    expect(parsed.bomItems.every((r) => r.spec === null)).toBe(true);

    const panel = parsed.bomItems.find((r) => r.item.startsWith('PVC 10mm Panel'));
    expect(panel).toMatchObject({
      category: 'Mihrab (A1)',
      unit: 'sqft',
      netQty: 61.02,
      purchaseQty: 68.34,
      wastagePct: 12, // stored as the 0.12 fraction in the sheet
      confidence: 'High',
      basis: 'Area + 12% wastage (nesting preferred)',
      pack: '14 sheets (approx 32 sqft std)',
      notes: 'From quotation measurement; split by colour',
    });
  });

  it('reads every real column, including the trailing row after the Notes row', async () => {
    const parsed = await parseMasjid();
    // Sheet order ends: r58 blank, r59 "Notes: …", r60 the S-10 scaffolding row.
    const scaffolding = parsed.bomItems.find((r) => /Temporary Scaffolding/i.test(r.item));
    expect(scaffolding).toBeTruthy();
    expect(scaffolding.category).toBe('Scaffolding & Access');
    expect(scaffolding.purchaseQty).toBe(1);
    // Non-item rows must not leak in as products.
    expect(parsed.bomItems.some((r) => /^notes?:/i.test(r.item || ''))).toBe(false);
    expect(parsed.bomItems.some((r) => /material\s*total/i.test(r.item || ''))).toBe(false);
    expect(parsed.bomItems.every((r) => r.item && r.item.length > 1)).toBe(true);
  });

  it('documents that this export carries no price columns (pricing lives in sheet B)', async () => {
    const parsed = await parseMasjid();
    // Not a parser defect: the Master BOM has 12 columns and none is a price.
    // Un-costed rows are null, never 0 — so the BOM tab shows TBD, not RM 0.00.
    expect(parsed.bomItems.every((r) => r.unitCost === null && r.estTotal === null)).toBe(true);
    expect(parsed.bomItems.every((r) => r.purchaseQty !== null || r.netQty !== null)).toBe(true);
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

describe('Priority 2 regression: Project.location from explicit Project: line only', () => {
  it('extracts the comma-tail from the dashboard Project: line (Hashima fixture)', async () => {
    const buf = fs.readFileSync(path.join(dir, 'fixtures/Artseven_BOM_Q260163_Kediaman_Puan_Hashima_v2.xlsx'));
    const parsed = await parseXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(parsed.location).toBe('LORONG CAKERA PURNAMA, PUNCAK ALAM');
  });

  it('extracts the comma-tail from a synthetic dashboard Project: line', () => {
    const book = XLSX.utils.book_new();
    const dashboard = XLSX.utils.aoa_to_sheet([
      ['ORDER-READY DASHBOARD'],
      ['Project: KEDIAMAN PUAN HASHIMA, PUNCAK ALAM, SELANGOR | Q260163'],
    ]);
    const sheet = XLSX.utils.aoa_to_sheet([
      ['MASTER / RECONCILIATION BOM — KEDIAMAN PUAN HASHIMA (Q260163)'],
      ['Geometry Source of Truth: Detail Drawing'],
      [],
      ['ID', 'Item / Canonical Name', 'Unit', 'Net Qty'],
      ['A1-01', 'PVC Decorative Panel', 'pcs', 3],
    ]);
    XLSX.utils.book_append_sheet(book, dashboard, 'H. Order-Ready Dashboard');
    XLSX.utils.book_append_sheet(book, sheet, 'A. Master Reconciliation BOM');
    expect(parseWorkbook(book).location).toBe('PUNCAK ALAM, SELANGOR');
  });

  it('leaves location null when no explicit Project: line exists (all Surau formats)', async () => {
    const md = parseMarkdown(mdText);
    const xlsx = await parseXlsx(xlsxAb);
    const pandas = parseMarkdown(pandasText);
    // Surau dashboard r0 carries a comma ("..., BETONG, SARAWAK") but no
    // "Project:" prefix, so it must NOT become a location — xlsx === md.
    expect(md.location).toBeNull();
    expect(xlsx.location).toBeNull();
    expect(pandas.location).toBeNull();
  });
});
