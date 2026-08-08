/**
 * index.js — Pipeline Orchestrator.
 *
 * Ties the interpreter stages together and returns the SAME contract the app
 * already expects from `parseExcelCostFile`:
 *   { success, materials, lowConfidence, format, metadata, rawText, ocrMethod }
 *
 * Pipeline: readWorkbook → per-sheet headerDetect → mapColumns → sections →
 * classifyRow → entity + specs + recognize → score → (optional) AI fallback for
 * low-confidence rows only → normalise/derive → validation → output.
 */
import { readWorkbook } from './reader.js';
import { detectHeader } from './headerDetect.js';
import { mapColumns } from './columns.js';
import { detectSections } from './sections.js';
import { classifyRow } from './classify.js';
import { extractEntity } from './entity.js';
import { extractSpecs } from './specs.js';
import { recognizeMaterial } from './recognize.js';
import { scoreCandidate, MIN_CONFIDENCE } from './confidence.js';
import { enrichWithAI } from './ai.js';
import { lookupCorrection, recordCorrection, recordSupplierProfile } from './learn.js';
import { generateId } from '../helpers.js';

/* ── tiny pure helpers ─────────────────────────────────────────── */
const plus = (n) => Math.round(n * 100) / 100;
const fin = (n) => (Number.isFinite(n) ? n : undefined);
const fileBaseName = (file) => {
    const n = typeof file === 'string' ? file : (file && file.name);
    return (n || 'Imported Materials').replace(/\.[^/.]+$/, '');
};
const sheetNames = (sheets) => sheets.filter(s => !s.empty).map(s => s.name);

/** Map a detected section heading onto the app's category vocabulary. */
const sectionCategory = (section) => {
    if (!section) return 'MATERIALS';
    const s = section.toUpperCase();
    if (/ELECTRI|LAMP|LED|POWER|SWITCH|SOCKET/.test(s)) return 'ELECTRICAL';
    if (/PAINT|CAT|EMULSION/.test(s)) return 'PAINT';
    if (/FURNITURE|DESK|CHAIR|TABLE/.test(s)) return 'FURNITURE';
    if (/CEILING|GYPSUM|DRYWALL/.test(s)) return 'CEILING';
    if (/FLOOR|TILE/.test(s)) return 'FLOORING';
    return 'MATERIALS';
};

const rowsText = (sheets) => sheets
    .filter(s => !s.empty)
    .map(s => {
        const rows = [];
        for (let r = 0; r < s.rowCount; r++) {
            const parts = [];
            for (let c = 0; c < s.colCount; c++) {
                const cell = s.cells.get(`${r},${c}`);
                if (cell && cell.text.trim()) parts.push(cell.text.trim());
            }
            if (parts.length) rows.push(`[${s.name}] ${parts.join('    ')}`);
        }
        return rows.join('\n');
    })
    .join('\n--- SHEET BREAK ---\n');

/* ── entry point ─────────────────────────────────────────────────── */
/**
 * Parse any Excel/CSV file into structured logistics materials.
 * @param {File|ArrayBuffer} file
 * @param {{catalog?:Array, supplier?:string, ai?:boolean}} opts
 */
export const parseExcelV2 = async (file, opts = {}) => {
    const { sheets } = await readWorkbook(file);
    const supplier = (opts.supplier || fileBaseName(file)).toUpperCase();
    const catalog = Array.isArray(opts.catalog) ? opts.catalog : [];

    const candidates = [];
    const headerLog = [];

    for (const sheet of sheets) {
        if (sheet.empty) continue;

        let header = null;
        try { header = detectHeader(sheet); } catch { header = null; }
        const mapping = mapColumns(header);
        const sections = detectSections(sheet);

        if (header) headerLog.push({ sheet: sheet.name, row: header.row, score: header.score, mapped: mapping.size });

        for (let r = 0; r < sheet.rowCount; r++) {
            if (sheet.hiddenRows.has(r)) continue;                 // hidden rows are not data
            const cls = classifyRow(sheet, r);
            if (cls.type !== 'material') continue;

            const ent = extractEntity(cls.cells, mapping, sheet.name);
            const itemText = (ent.item || ent.itemText || '').trim();
            if (!itemText) continue;

            ent.section = sections[r] || '';
            const specs = extractSpecs(itemText);

            // Precedence: learned correction > catalog fuzzy match > free text.
            const fix = lookupCorrection(supplier, itemText);
            const rec = fix && fix.corrected && fix.corrected.item
                ? { name: fix.corrected.item, confidence: 0.99, hit: 'knowledge' }
                : recognizeMaterial(itemText, catalog, { section: ent.section });

            ent.rec = rec || { confidence: 0, hit: 'none' };
            ent.specs = specs;

            candidates.push({ i: candidates.length, ent, sheet: sheet.name, row: r, original: itemText });
        }
    }

    recordSupplierProfile(supplier, { sheets: headerLog });

    // 1) travel deterministically
    const scored = candidates.map(c => ({ c, score: scoreCandidate({ ...c.ent }) }));

    // 1b) learn from reliable matches: a high-confidence catalog hit teaches
    //     the knowledge base (supplier + original → catalog item) so the next
    //     parse of the same supplier skips straight to the right item.
    for (const x of scored) {
        const rec = x.c.ent.rec;
        if (rec && rec.hit === 'catalog' && rec.confidence >= 0.6 && x.c.original) {
            recordCorrection({ supplier, original: x.c.original, corrected: { item: rec.name } });
        }
    }

    // 2) AI fallback — ONLY sub-threshold rows
    let byIndex = new Map();
    if (opts.ai !== false) {
        const low = scored.filter(x => x.score.overall < MIN_CONFIDENCE);
        if (low.length) {
            const payload = low.map(x => ({
                index: x.c.i,
                original: x.c.original,
                item: x.c.ent.item,
                quantity: x.c.ent.quantity,
                unit: x.c.ent.unit,
                price: x.c.ent.price,
                spec: x.c.ent.spec,
            }));
            const enrichments = await enrichWithAI(supplier, payload);
            if (enrichments) byIndex = new Map(enrichments.map(e => [e.index, e]));
        }
    }

    // 3) apply enrichments (guided by AI, still bound by deterministic structure)
    const final = scored.map((x) => {
        const e = byIndex.get(x.c.i);
        if (e) {
            if (e.item) x.c.ent.item = e.item;
            if (e.quantity !== undefined && [null, ''].includes(e.quantity) === false) x.c.ent.quantity = Number(e.quantity);
            if (e.unit) x.c.ent.unit = e.unit;
            if (e.unitPrice !== undefined && e.unitPrice !== null) x.c.ent.unitPrice = Number(e.unitPrice);
        }
        return x;
    });

    const materialRows = final.map(x => buildMaterialRow(x, byIndex.has(x.c.i)));
    const { confident, lowConfidence } = splitByConfidence(materialRows);

    const metadata = {
        projectName: fileBaseName(file),
        supplier,
        totalItems: confident.length,
        totalPrice: confident.reduce((s, m) => s + Number(m.total || 0), 0),
        sheetsProcessed: sheetNames(sheets),
        aiApplied: byIndex.size > 0,
    };

    return {
        success: confident.length > 0,
        materials: confident,
        lowConfidence,
        format: 'EXCEL_V2',
        metadata,
        rawText: rowsText(sheets),
        ocrMethod: 'excel',
    };
};

/* ── material construction ───────────────────────────────────────── */
export const buildMaterialRow = (x, reEnriched) => {
    const ent = x.c.ent;
    const qty = fin(Number(ent.quantity));          // raw quantity (undefined when unknown)
    let quantity = Number.isFinite(qty) && qty > 0 ? qty : undefined;
    const unit = ent.unit || 'pcs';
    const unitPrice = fin(Number(ent.unitPrice));
    const price = fin(Number(ent.price));

    // derive the missing figure deterministically
    let uP = unitPrice, p = price, q = quantity;
    if (Number.isFinite(q) && Number.isFinite(uP) && !Number.isFinite(p)) {
        p = plus(q * uP);
    } else if (Number.isFinite(q) && Number.isFinite(p) && !Number.isFinite(uP) && q !== 0) {
        uP = plus(p / q);
    } else if (!Number.isFinite(q) && Number.isFinite(uP) && Number.isFinite(p) && uP !== 0) {
        q = Math.round(p / uP);
    }

    return {
        id: generateId(),
        category: sectionCategory(ent.section),
        item: ent.item || (ent.specs && ent.specs.material) || 'Unknown Item',
        original: x.c.original,
        section: ent.section || '',
        sheet: ent.sheet,
        spec: ent.specs || undefined,
        quantity: q,
        unit,
        unitPrice: uP,
        price: p,
        total: Number.isFinite(p) ? p : (Number.isFinite(q) && Number.isFinite(uP) ? plus(q * uP) : 0),
        confidence: x.score.overall,
        fields: x.score.fields,
        warnings: x.score.warnings,
        reEnriched: Boolean(reEnriched),
    };
};

const splitByConfidence = (materials) => {
    const confident = [];
    const lowConfidence = [];
    for (const m of materials) {
        if (Number(m.confidence) >= MIN_CONFIDENCE) confident.push(m);
        else lowConfidence.push(m);
    }
    return { confident, lowConfidence };
};