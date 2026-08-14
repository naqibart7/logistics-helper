/**
 * dsgB.js — Dual-Stream Positional Extractor for "DSG B" templates.
 *
 * The DSG B layout carries TWO parallel BOMs per row:
 *   Left  (Main):        A=Index, B=Name, C=SQFT, D=Coverage calc, E=QTY, F=Price, G=Total
 *   Right (Supporting):  I=Index, J=Name, K=blank, L=QTY,      M=Price, N=Total
 * Section headers ("A NEW STRUCTURE", "B CEILING", ...) set the category.
 *
 * This fixes the four catastrophic failure modes of the colour-scanning
 * legacy parser:
 *   1. Index hallucination — row numbers are never item names (positional cols).
 *   2. Number greed — "Gypsum Board 9mm" never leaks 9 into qty/price (cols B/E/F).
 *   3. Dual-stream blindness — left and right streams are separate items.
 *   4. "Termasuk dalam" pointers — not line items; their SQFT feeds the global
 *      paintable-area accumulator for the paint aggregator.
 *
 * After extraction it runs the coverage-math / ratio / paint-engine validation
 * and emits the structural JSON contract (engineering) on `result.metadata`.
 */
import * as XLSX from 'xlsx';
import { generateId } from '../helpers.js';

/* ── Section headers → categories ──────────────────────────────────────────── */
const SECTION_MAP = [
    ['A NEW STRUCTURE', 'Structure / Partition'],
    ['B CEILING', 'Ceiling'],
    ['C WALL PANEL', 'Wall Panel / Cladding'],
    ['D WALL FINISHES', 'Wall Finishes'],
    ['E GLASS FINISHES', 'Glass / Stickers'],
    ['FURNITURE', 'Furniture'],
    ['G LIGHTING', 'Lighting'],
    ['H WALL / FLOOR TILES', 'Tiles'],
    ['I CARPET', 'Carpet / Flooring'],
    ['J PAINT', 'Paint'],
    ['K SITE', 'Site Preparation'],
    ['L LABOUR', 'Labor'],
    ['M TRANSPORT', 'Transport'],
];

/* ── Consumable ratios (per square foot of primary material) ───────────────── */
const CONSUMABLE_RATIOS = [
    { parent: /(gypsum|plaster|drywall board)/i, accessory: 'Joint Tape', kw: /(joint tape|tape)/i, sqftPer: 300 },
    { parent: /(gypsum|plaster|drywall board)/i, accessory: 'Drywall Screws', kw: /(screw)/i, sqftPer: 400 },
    { parent: /(gypsum|plaster|drywall board)/i, accessory: 'Joint Compound', kw: /(compound|flaxi)/i, sqftPer: 250 },
    { parent: /(tile|ceramic)/i, accessory: 'Tile Adhesive', kw: /(tile adhesive|adhesive)/i, sqftPer: 60 },
    { parent: /(tile|ceramic)/i, accessory: 'Tile Grout', kw: /(grout)/i, sqftPer: 100 },
];

const PAINT_COVERAGE_SQFT_PER_GAL = 350;   // per-coat baseline (1 coat)
const PAINT_WASTE = 0.05;
const FLOORING_RATE_SQFT_PER_UNIT = 1;      // placeholder; rate parsed from item when available

/* ── Light cell helpers ────────────────────────────────────────────────────── */
const cellAt = (sheet, R, C) => sheet[XLSX.utils.encode_cell({ r: R, c: C })];
const cellStr = (sheet, R, C) => {
    const c = cellAt(sheet, R, C);
    const v = c ? (c.w != null ? c.w : c.v) : undefined;
    return v == null ? '' : String(v).trim();
};
const numOf = (val) => {
    if (val == null) return 0;
    const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
};
const numCell = (sheet, R, C) => numOf(cellAt(sheet, R, C)?.v);

/** Strip leading row-index artifacts ("1.", "2)", "13") and clamp noise. */
const cleanItem = (text) => {
    let s = String(text || '').trim();
    if (s.length < 2) return '';
    if (/termasuk dalam/i.test(s) || /→/.test(s)) return 'POINTER';
    s = s.replace(/^\d+[\.\)]\s*/, '').trim();
    if (/^\d+$/.test(s)) return ''; // bare index → never an item
    if (s.length < 2) return '';
    return s;
};

const isSectionHeader = (text) => {
    const up = text.toUpperCase();
    return SECTION_MAP.some(([key]) => up.includes(key));
};
const categoryOf = (text) => {
    const up = text.toUpperCase();
    for (const [key, cat] of SECTION_MAP) if (up.includes(key)) return cat;
    return null;
};

const coverageRateOf = (name, rateText) => {
    const m = String(name).match(/(\d+(?:\.\d+)?)\s*SQFT/i) ||
        String(rateText).match(/(\d+(?:\.\d+)?)\s*SQFT/i);
    return m ? parseFloat(m[1]) : 0;
};

const isValidItem = (name, qty, total) => {
    if (!name || name.length < 2 || name === 'POINTER') return false;
    if (/(^|\s)((material|category|sub.?total|total|qty|quantity|sum|rate|no|item)(s)?)\s*$/i.test(name)) return false;
    if (/^(sqft|sq\.ft|qty|price|desc|deskripsi|remark|uatik|warna)$/i.test(name)) return false;
    return qty > 0 || total > 0;
};

/* ── Shape detection ───────────────────────────────────────────────────────── */
export const detectDsgBShape = (workbook) => {
    if (!workbook) return false;
    const sheets = (workbook.Sheets || {});
    const sheet = sheets[workbook.SheetNames?.[0]];
    if (!sheet || !sheet['!ref']) return false;
    let sawSection = false;
    let sawLeftRight = false;
    let sawSQFT = false;
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const limit = Math.min(range.e.r, 120);
    for (let R = range.s.r; R <= limit; R++) {
        const a = cellStr(sheet, R, 0);
        const b = cellStr(sheet, R, 1);
        const j = cellStr(sheet, R, 9);
        if (isSectionHeader(`${a} ${b}`) && !sawSection) sawSection = true;
        if (/\bSQFT\b/i.test(`${a} ${b} ${cellStr(sheet, R, 2)}`)) sawSQFT = true;
        const nb = cleanItem(b);
        const nj = cleanItem(j);
        if (nj && nb && nb.length > 2 && nj.length > 2) sawLeftRight = true;
    }
    return sawSection && sawSQFT && sawLeftRight;
};

/* ── The dual-stream extractor ─────────────────────────────────────────────── */
export const parseDsgB = async (file, sheetName = null) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellStyles: true });
    return parseDsgBWorkbook(workbook, file.name, sheetName);
};

/**
 * One-pass router for the App: read once, run the DSG-B shape detector, and
 * only build the materials when the layout genuinely matches. Returns `null`
 * when the workbook is not a DSG-B dual-stream template so the caller can
 * fall through to the V2/legacy pipelines untouched.
 */
export const tryParseDsgB = async (file, sheetName = null) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellStyles: true });
    if (!detectDsgBShape(workbook)) return null;
    return parseDsgBWorkbook(workbook, file.name, sheetName);
};

export const parseDsgBWorkbook = (workbook, fileName = '', sheetName = null) => {
    const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
    const materials = [];
    const parsedItems = [];
    const accumulators = { total_paintable_area: 0, total_flooring_area: 0 };
    let currentCategory = 'Uncategorized';

    if (!sheet || !sheet['!ref']) {
        return { success: false, materials: [], format: 'DSG_B', metadata: {}, engineering: null };
    }
    const range = XLSX.utils.decode_range(sheet['!ref']);

    const push = ({ stream, category, item, quantity, unit, price, total, sqft, rate }) => {
        const material = {
            id: generateId(),
            category,
            item,
            quantity: quantity || 0,
            unit: unit || 'pcs',
            unitPrice: price,
            price: total,
            total,
            source: stream,
            confidence: 1,
            coverage_sqft: sqft || null,
            coverage_rate: rate || null,
        };
        materials.push(material);
        parsedItems.push({ category, item, qty: quantity || 0, coverage_sqft: sqft || null, rate: rate || null, source: stream });
    };

    for (let R = range.s.r; R <= range.e.r; R++) {
        const a = cellStr(sheet, R, 0);
        const b = cellStr(sheet, R, 1);
        const d = cellStr(sheet, R, 3);

        /* section headers — left or solo column sets the category */
        if (isSectionHeader(`${a} ${b}`)) {
            const cat = categoryOf(`${a} ${b}`);
            if (cat) currentCategory = cat;
            continue;
        }

        const sqftRaw = numCell(sheet, R, 2);
        const rateRaw = coverageRateOf(`${b} ${d}`, d);

        /* pointer trap: "Termasuk dalam …" → accumulate area, not a line item */
        if (/termasuk dalam/i.test(`${a} ${b}`)) {
            if (sqftRaw > 0) {
                if (/paint/i.test(`${a} ${b}`)) accumulators.total_paintable_area += sqftRaw;
                else if (/tile|floor|vinyl/i.test(`${a} ${b}`)) accumulators.total_flooring_area += sqftRaw;
            }
            continue;
        }

        /* ── Stream A (Left / Main) ── */
        const leftName = cleanItem(b);
        if (leftName && leftName !== 'POINTER' && isValidItem(leftName, 1, 1)) {
            const qty = numCell(sheet, R, 4);
            const price = numCell(sheet, R, 5);
            const total = numCell(sheet, R, 6) || qty * price;
            if (isValidItem(leftName, qty, total)) {
                push({ stream: 'main', category: currentCategory, item: leftName, quantity: qty, price, total, sqft: sqftRaw, rate: rateRaw });
            }
        }

        /* ── Stream B (Right / Supporting) ── */
        const rightName = cleanItem(cellStr(sheet, R, 9));
        if (rightName && rightName !== 'POINTER') {
            const rqty = numCell(sheet, R, 11);
            const rprice = numCell(sheet, R, 12);
            const rtotal = numCell(sheet, R, 13) || rqty * rprice;
            if (isValidItem(rightName, rqty, rtotal)) {
                push({ stream: 'supporting', category: `${currentCategory} (Supporting)`, item: rightName, quantity: rqty, price: rprice, total: rtotal });
            }
        }
    }

    /* ── Coverage & ratio validation, paint aggregator (the "physics") ──────── */
    const gypsumArea = parsedItems.filter(p => /(gypsum|plaster|drywall board)/i.test(p.item)).reduce((s, p) => s + (p.coverage_sqft || 0), 0);
    const ratioViolations = [];

    for (const rule of CONSUMABLE_RATIOS) {
        const parents = parsedItems.filter(p => rule.parent.test(p.item));
        if (!parents.length) continue;
        const area = parents.reduce((s, p) => s + (p.coverage_sqft || 0), 0);
        if (area <= 0) continue;
        const required = Math.max(0, Math.ceil(area / rule.sqftPer));
        if (required <= 0) continue;
        const have = materials.filter(m => rule.kw.test(m.item)).reduce((s, m) => s + (m.quantity || 0), 0);
        if (have < required) {
            ratioViolations.push({ parent: parents[0].item, missing_accessory: rule.accessory, required_qty: required, have_qty: have });
        }
    }

    /* paint gate: paintable area must be covered by an actual paint line */
    let paintHave = materials.filter(m => /(paint|emulsion|primer)/i.test(m.item)).reduce((s, m) => s + (m.quantity || 0), 0);
    if (accumulators.total_paintable_area > 0) {
        const needed = Math.ceil((accumulators.total_paintable_area / PAINT_COVERAGE_SQFT_PER_GAL) * (1 + PAINT_WASTE));
        if (paintHave < needed) {
            ratioViolations.push({ parent: '(Project Paint)', missing_accessory: 'Emulsion Paint', required_qty: needed, have_qty: paintHave });
        }
        accumulators.paint_needed_gallons = needed;
    }

    const totalPrice = materials.reduce((s, m) => s + (m.total || 0), 0);
    return {
        success: materials.length > 0,
        materials,
        lowConfidence: [],
        format: 'DSG_B',
        rawText: `DSG B Dual-Stream Import: ${fileName}`,
        ocrMethod: 'excel',
        metadata: {
            projectName: fileName.replace(/\.[^/.]+$/, ''),
            supplier: '',
            totalItems: materials.length,
            totalPrice,
            dualStream: true,
            engineering: {
                parsed_items: parsedItems,
                global_accumulators: accumulators,
                ratio_violations: ratioViolations,
                paint_ok: accumulators.total_paintable_area === 0 || paintHave >= (accumulators.paint_needed_gallons || 0),
            },
        },
    };
};