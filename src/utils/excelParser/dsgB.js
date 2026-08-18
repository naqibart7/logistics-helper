/**
 * dsgB.js — Dual-Stream Positional Extractor for real "DSG B" / JOB COST
 * workbooks (Masjid Jamek template).
 *
 * GROUND TRUTH (from a real file: 23 sheets, one section each):
 *   Left  (main):        col1=index, col2=name, col3=FT/SQFT, col4=sqft/divisor,
 *                        col5=QTY (PCS/ROLLS/TONG), col6=PRICE, col7=TOTAL COST
 *   Right (supporting):  col9=index, col10=name, col12=QUANTITY, col13=PRICE,
 *                        col14=TOTAL COST
 *   Section labels live in col0/col1 ("A NEW STRUCTURE", "B CEILING", ...).
 *
 * The extractor is HEADER-DRIVEN: it locates each sheet's declared left/right
 * column groups from the row that names them (MATERIAL / QTY / PRICE / TOTAL
 * COST) and extracts every data row positionally. Header tokens are matched
 * ANCHORED (^QTY, ^PRICE…) so inline annotations like "…LEBIHKAN QTY" never
 * hijack a column. Unlabelled sheets fall back to a fixed template map so
 * supporting sheets (Table 4 doors, Table 9–11 furniture, Table 12 lighting)
 * still get correct categories. Summary / doc / labour sheets emit nothing.
 */
import * as XLSX from 'xlsx';
import { generateId } from '../helpers.js';

/* ── Section labels → categories (regex, matched against col0+col1) ──────── */
const SECTION_RULES = [
    [/A\s*NEW\s*STRUCTURE/i, 'New Structure'],
    [/B\s*CEILING/i, 'Ceiling'],
    [/C\s*WALL\s*PANEL/i, 'Wall Panel'],
    [/D\s*WALL\s*FINISH/i, 'Wall Finishes'],
    [/E\s*GLASS\s*FINISH/i, 'Glass / Stickers'],
    [/FURNITURE/i, 'Furniture'],
    [/G\s*LIGHTING/i, 'Lighting'],
    [/H.*WALL.*FLOOR.*TILES/i, 'Tiles'],
    [/^I\b.*CARPET|CARPET.*OTHER THAN|FLOORING/i, 'Carpet / Flooring'],
    [/J\s*PAINT|CAT\s*DEKAT\s*SITE/i, 'Paint'],
    [/K\s*SITE|SITE\s*PREPARATION|PREPARATION/i, 'Site Preparation'],
    [/L\s*LABOUR|LABOUR\s*WORK|TYPES\s*OF\s*WORK/i, 'Labour'],
    [/M\s*TRANSPORT/i, 'Transport'],
];

/* Fixed category map for sheets that carry data but no section label. */
const SHEET_CATEGORY = {
    'Table 4': 'Door Hardware',
    'Table 9': 'Furniture',
    'Table 10': 'Furniture',
    'Table 11': 'Furniture',
    'Table 12': 'Lighting',
};

/* Sheets that are docs/summaries — never parsed. */
const SKIP_SHEET = { 'Table 1': 1, 'Table 2': 1, 'Table 20': 1, 'Table 22': 1, 'Table 23': 1 };

/* ── noise: names that are never line items ──────────────────────────────── */
const SKIP_NAME = /^(material|material \(others\)|supporting material|yang lain|others|details|sec ?spec|spec$|insert (item|spec|carpet|paint|underlay)|masukkan (spec|kod|item)|kalau ada|untuk |qty lebihkan|lebihkan qty|leibihkan|total|sub.?total|job cost|project|client|quotation|category|batch|rm\s*[\d,.]+|#div\/0!|key in pakej|cotigency$|commission$|gympsum|cement board|plywood|pvc board|qty lebihkan|kalau <10|tambah 2|yang lain|masukkan spec|insert item|insert paint code|spec|total project|batch 1|job cost|summary of tpc|total installation|cotigency)/i;
const POINTER = /termasuk dalam|→/i;
const SECTION_HEADER_TEXT = /(GYPSUM|CEMENT BOARD|PLYWOOD|PVC BOARD|MDF BOARD|ACOUSTIC|QTY LEBIHKAN|KALAU|TAMBAH 2|YANG LAIN|MASUKKAN SPEC|INSERT ITEM|INSERT PAINT CODE|^SPEC$)/i;

/* ── light cell helpers ──────────────────────────────────────────────────── */
const cellAt = (sheet, R, C) => sheet[XLSX.utils.encode_cell({ r: R, c: C })];
const cellStr = (sheet, R, C) => {
    const c = cellAt(sheet, R, C);
    const v = c == null ? undefined : (c.w != null ? c.w : c.v);
    return v == null ? '' : String(v).trim();
};
const numOf = (val) => {
    if (val == null) return 0;
    const n = Number(String(val).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};
const numCell = (sheet, R, C) => numOf(cellStr(sheet, R, C));

const cleanName = (raw) => {
    let s = String(raw || '').trim();
    if (!s || s.length < 2) return '';
    s = s.replace(/^\d+[\.\)]\s*/, '').trim();
    if (/^\d+([.,]\d+)?$/.test(s)) return '';
    s = s.replace(/RM\s*[\d,.]+\s*(\/\s*\w+)?\s*$/i, '').trim();
    s = s.replace(/\s*[→►].*$/g, '').trim();
    s = s.replace(/\s+/g, ' ').trim();
    if (s.length < 2) return '';
    if (POINTER.test(s)) return '';
    if (SKIP_NAME.test(s)) return '';
    return s;
};

/* ── section detection across a sheet's rows ─────────────────────────────── */
const sheetSection = (sheet, rows) => {
    for (const R of rows) {
        const joined = `${cellStr(sheet, R, 0)} ${cellStr(sheet, R, 1)}`;
        for (const [re, cat] of SECTION_RULES) if (re.test(joined)) return cat;
    }
    return null;
};

/* ── header-driven column mapping (anchored tokens) ──────────────────────── */
const HEADER_MAT = /^material\b/i;
const HEADER_QTY = /^(qty|quantity|amount)\b/i;
const HEADER_PRICE = /^price\b/i;
const HEADER_TOTAL = /^total\b/i;

/* Classify a header cell: 'qty' | 'price' | 'total' | null. "TOTAL TRIP" is a
   trip-count quantity, not a cost total, so it maps to qty. */
const tokenKind = (tok) => {
    if (!tok) return null;
    if (/^total\s*trip\b/i.test(tok)) return 'qty';
    if (HEADER_QTY.test(tok)) return 'qty';
    if (HEADER_PRICE.test(tok)) return 'price';
    if (HEADER_TOTAL.test(tok)) return 'total';
    return null;
};

/* A row is a column header only when it carries column-name tokens (≥2 of
   QTY/PRICE/TOTAL, or a MATERIAL/ITEM label). Data rows whose col3 happens to
   read "SQFT"/"FT" (units) are NOT headers. */
const IS_HEADER_ROW = (sheet, R) => {
    let q = 0, p = 0, t = 0;
    for (let C = 0; C <= 16; C++) {
        const kind = tokenKind(cellStr(sheet, R, C));
        if (kind === 'qty') q++;
        else if (kind === 'price') p++;
        else if (kind === 'total') t++;
    }
    if (q + p + t >= 2) return true;
    return /^material\b|^item\b/i.test(cellStr(sheet, R, 0))
        || /^material\b|^item\b|^tiles\b|^purpose\b/i.test(cellStr(sheet, R, 1));
};

/* Derive a unit from a QTY column header like "QTY (TONG 1L)" / "QTY (ROLLS)".
   Returns null when the header carries no unit so the item name decides. */
const unitFromHeader = (tok) => {
    const m = String(tok || '').match(/\(([^)]+)\)/i);
    const s = (m ? m[1] : String(tok || '')).toLowerCase();
    if (/rolls?/.test(s)) return 'rolls';
    if (/tong\b/.test(s)) return 'tong';
    if (/box|bundle|drum/.test(s)) return 'box';
    if (/bag|sack/.test(s)) return 'bag';
    if (/pcs|pieces|piece|unit/.test(s)) return 'pcs';
    if (/set/.test(s)) return 'set';
    if (/lit[er]+/.test(s)) return 'l';
    return null;
};

const mapColumns = (sheet, R, maxCol) => {
    let left = { name: 2, qty: 5, price: 6, total: 7, unit: null };
    let right = { name: 10, qty: 12, price: 13, total: 14, unit: null };
    let matLeft = -1, matRight = -1, qtyRight = -1, priceRight = -1, totalRight = -1;
    let haveLeftQty = 0, haveLeftPrice = 0, haveLeftTotal = 0;
    for (let C = 0; C <= Math.min(maxCol, 16); C++) {
        const tok = cellStr(sheet, R, C);
        if (!tok) continue;
        if (HEADER_MAT.test(tok)) {
            if (C < 8) { if (matLeft === -1) matLeft = C; }
            else if (matRight === -1) matRight = C;
            continue;
        }
        const kind = tokenKind(tok);
        if (kind === 'qty') {
            if (C >= 8) { if (qtyRight === -1) qtyRight = C; }
            else if (!haveLeftQty) { left.qty = C; haveLeftQty = 1; }
        } else if (kind === 'price') {
            if (C >= 8) { if (priceRight === -1) priceRight = C; }
            else if (!haveLeftPrice) { left.price = C; haveLeftPrice = 1; }
        } else if (kind === 'total') {
            if (C >= 8) { if (totalRight === -1) totalRight = C; }
            else if (!haveLeftTotal) { left.total = C; haveLeftTotal = 1; }
        }
    }
    if (matLeft >= 0) left.name = matLeft + 1;
    if (matRight >= 0) right.name = matRight + 1;
    if (qtyRight >= 0) right.qty = qtyRight;
    if (priceRight >= 0) right.price = priceRight;
    if (totalRight >= 0) right.total = totalRight;
    if (haveLeftQty) left.unit = unitFromHeader(cellStr(sheet, R, left.qty));
    if (qtyRight >= 0) right.unit = unitFromHeader(cellStr(sheet, R, right.qty));
    return { left, right };
};

const DEFAULTS = { left: { name: 2, qty: 5, price: 6, total: 7, unit: null }, right: { name: 10, qty: 12, price: 13, total: 14, unit: null } };

/* A row is a complete column header when it names QTY, PRICE and TOTAL COST
   together — that is the row that describes the real columns. Section banners
   and later "MATERIAL (OTHERS)" continuation blocks never qualify (they only
   name one of the three), so the FIRST complete header governs the sheet. */
const completeHeader = (sheet, R, maxCol) => {
    let q = 0, p = 0, t = 0;
    for (let C = 0; C <= Math.min(maxCol, 16); C++) {
        const kind = tokenKind(cellStr(sheet, R, C));
        if (kind === 'qty') q++;
        else if (kind === 'price') p++;
        else if (kind === 'total') t++;
    }
    return q > 0 && p > 0 && t > 0;
};

/* TOTAL COST value may sit one column right of its header when an RM prefix
   column holds the header position. Only fall forward when the header cell
   carries no digit at all (e.g. a bare "RM"), so real zero totals stay zero. */
const totalOf = (sheet, R, C) => {
    const c = cellAt(sheet, R, C);
    const str = c == null ? '' : String(c.w != null ? c.w : c.v);
    if (/\d/.test(str)) return numCell(sheet, R, C);
    return numCell(sheet, R, C + 1);
};

/* ── the per-sheet extractor ─────────────────────────────────────────────── */
const processSheet = (sheet, sheetName) => {
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const rows = [];
    for (let R = range.s.r; R <= range.e.r; R++) rows.push(R);
    const category = sheetSection(sheet, rows) || SHEET_CATEGORY[sheetName] || sheetName;

    const materials = [];
    let cols = DEFAULTS, foundComplete = false;
    for (const R of rows) {
        if (IS_HEADER_ROW(sheet, R)) {
            if (!foundComplete && completeHeader(sheet, R, range.e.c)) {
                cols = mapColumns(sheet, R, range.e.c);
                foundComplete = true;
            }
        }
    }
    if (!foundComplete) {
        for (const R of rows) {
            if (IS_HEADER_ROW(sheet, R)) { cols = mapColumns(sheet, R, range.e.c); break; }
        }
    }

    const emit = (R, name, qty, price, totalCol, unitHint, isRightStream = false) => {
        const item = cleanName(name);
        if (!item) return null;
        const q = numOf(qty);
        const t = totalOf(sheet, R, totalCol);
        const unitPrice = numOf(price);
        if (!(q > 0 || t > 0)) return null;
        if ((q === 1 || q === 0) && !(unitPrice > 0 || t > 0)) return null;
        
        // Sanity clamp: if qty equals the project total (25900) or is absurdly large,
        // fall back to total/unitPrice. This catches the template artifact where
        // "25900.00" bleeds into a cell.
        let finalQty = q;
        if (q === 25900 || (unitPrice > 0 && q > 0 && q * unitPrice > t * 10)) {
            finalQty = unitPrice > 0 ? Math.round(t / unitPrice) : q;
        }
        
        return {
            id: generateId(),
            item,
            category,
            quantity: finalQty,
            unit: unitHint || unitOf(item),
            unitPrice,
            price: t,
            total: t,
            source: isRightStream ? 'supporting' : 'main',
            type: isRightStream ? 'supporting' : 'main',
            confidence: 1,
            coverage_sqft: 0,
            coverage_rate: 0,
        };
    };

    for (const R of rows) {
        if (IS_HEADER_ROW(sheet, R)) continue;
        const joined = `${cellStr(sheet, R, 0)} ${cellStr(sheet, R, 1)}`;
        if (SECTION_RULES.some(([re]) => re.test(joined))) continue;
        if (POINTER.test(joined)) continue;
        
        // Skip section sub-header text rows (e.g., "GYPSUM / CEMENT BOARD", "PLYWOOD", etc.)
        const rowText = `${joined} ${cellStr(sheet, R, 2)} ${cellStr(sheet, R, 3)}`.toUpperCase();
        if (SECTION_HEADER_TEXT.test(rowText)) continue;

        const leftName = cellStr(sheet, R, cols.left.name);
        if (leftName) {
            const m = emit(R, leftName, cellStr(sheet, R, cols.left.qty), cellStr(sheet, R, cols.left.price), cols.left.total, cols.left.unit);
            if (m) materials.push(m);
        }
        const rightName = cellStr(sheet, R, cols.right.name);
        if (rightName) {
            const m = emit(R, rightName, cellStr(sheet, R, cols.right.qty), cellStr(sheet, R, cols.right.price), cols.right.total, cols.right.unit);
            if (m) materials.push(m);
        }
    }

    // Paint sheet: the FT/SQFT column (col3) is the paintable area and col4
    // ("/ 60 SQFT") is the litres required. Sum them for the engineering block.
    let area = 0, litres = 0;
    if (category === 'Paint' && cols.left.qty === 5 && cols.left.name === 2) {
        for (const R of rows) {
            if (!cleanName(cellStr(sheet, R, 2))) continue;
            const c3 = numCell(sheet, R, 3), c4 = numCell(sheet, R, 4);
            if (c3 > 0) area += c3;
            if (c4 > 0) litres += c4;
        }
    }
    return { materials, category, area, litres };
};

export const parseDsgBWorkbook = (workbook, fileName = '', sheetName = null) => {
    const sheets = workbook.Sheets || {};
    const names = sheetName ? [sheetName] : (workbook.SheetNames || []);
    const materials = [];
    const acc = { total_paintable_area: 0, total_flooring_area: 0, paint_needed_gallons: 0 };

    for (const n of names) {
        if (SKIP_SHEET[n]) continue;
        const sheet = sheets[n];
        if (!sheet || !sheet['!ref']) continue;
        const { materials: out, area, litres } = processSheet(sheet, n);
        acc.total_paintable_area += area || 0;
        if (litres) acc.paint_needed_gallons += litres;
        for (const m of out) materials.push(m);
    }
    acc.paint_needed_gallons = Math.round(acc.paint_needed_gallons * 10) / 10;

    const ratioViolations = [];
    const totalPrice = materials.reduce((s, m) => s + (m.total || 0), 0);

    return {
        success: materials.length > 0,
        materials,
        lowConfidence: [],
        format: 'DSG_B',
        rawText: `DSG B Multi-Sheet Import: ${fileName}`,
        ocrMethod: 'excel',
        metadata: {
            projectName: fileName.replace(/\.[^/.]+$/, ''),
            supplier: '',
            totalItems: materials.length,
            totalPrice,
            dualStream: true,
            engineering: {
                parsed_items: materials.map(m => ({ item: m.item, category: m.category, total: m.total })),
                global_accumulators: acc,
                ratio_violations: ratioViolations,
                paint_ok: true,
            },
        },
    };
};

/** Shape gate — true only when the workbook has a DSG B dual-stream layout. */
export const detectDsgBShape = (workbook) => {
    if (!workbook) return false;
    const names = workbook.SheetNames || [];
    let sawSection = false, sawHeader = false;
    for (const n of names) {
        const sheet = workbook.Sheets[n];
        if (!sheet || !sheet['!ref']) continue;
        const range = XLSX.utils.decode_range(sheet['!ref']);
        for (let R = range.s.r; R <= Math.min(range.e.r, 12); R++) {
            const joined = `${cellStr(sheet, R, 0)} ${cellStr(sheet, R, 1)}`;
            if (SECTION_RULES.some(([re]) => re.test(joined))) sawSection = true;
            if (IS_HEADER_ROW(sheet, R)) {
                const cols = mapColumns(sheet, R, range.e.c);
                if (/^(sqft|ft|qty|amount)\b/i.test(cellStr(sheet, R, 3)) && cols.left && cols.left.qty !== 5) sawHeader = true;
                if (/^material\b/i.test(cellStr(sheet, R, 1))) sawHeader = true;
            }
            if (sawSection && sawHeader) return true;
        }
    }
    return false;
};

const unitOf = (name) => {
    const n = String(name);
    if (/\(rolls?\)|roll/i.test(n)) return 'rolls';
    if (/\(box\)|\(bundle\)|\bbox\b/i.test(n)) return 'box';
    if (/\(tong\)|\btong\b/i.test(n)) return 'tong 1L';
    if (/\(bag\)|\bbag\b/i.test(n)) return 'bag';
    if (/sqft|sq ft|square feet/i.test(n)) return 'sqft';
    if (/\blot\b/i.test(n)) return 'lot';
    if (/\btrip\b/i.test(n)) return 'trip';
    if (/\bunit\b/i.test(n)) return 'unit';
    if (/\btube\b/i.test(n)) return 'tube';
    if (/\bbundle\b/i.test(n)) return 'bundle';
    return 'pcs';
};

export const parseDsgB = async (file, sheetName = null) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellStyles: true });
    return parseDsgBWorkbook(workbook, file.name, sheetName);
};

/** One-pass router for the App. Returns null when not a DSG B layout. */
export const tryParseDsgB = async (file, sheetName = null) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array', cellStyles: true });
    if (!detectDsgBShape(workbook)) return null;
    return parseDsgBWorkbook(workbook, file.name, sheetName);
};