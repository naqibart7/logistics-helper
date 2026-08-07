/**
 * reader.js — Workbook Reader (stage 1 of the Excel interpreter).
 *
 * Reads Excel/CSV bytes into a light-weight in-memory model that PRESERVES
 * everything later stages need before any flattening:
 *   - every worksheet (skipping visually empty ones)
 *   - cell values AND formatted display strings, tagged by kind
 *   - merged-cell ranges (with master-value inheritance for covered cells)
 *   - sheet-level and row-level visibility
 *   - formula results (uses the cached value so computed totals are shown)
 *
 * Nothing here guesses a layout; it simply turns `.xlsx/.xls/.csv` into a
 * structured workbook we can reason about.
 */
import * as XLSX from 'xlsx';

/** Map SheetJS type chars to a readable kind. @private */
const kindOf = (t) => (t === 'n' ? 'number' : t === 's' ? 'string' : t === 'b' ? 'boolean' : t === 'd' ? 'date' : t === 'e' ? 'error' : 'unknown');

/** Render one cell to its display string (prefers the formatted string). */
const toDisplay = (cell) => {
    if (cell == null) return '';
    if (typeof cell.w === 'string') return cell.w.trim();
    const v = cell.v;
    if (v === undefined || v === null) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return '';
};

/**
 * Read one worksheet into a consumable grid object.
 * @param {XLSX.WorkSheet} sheet
 * @param {string} name
 * @param {{hidden:boolean}} meta sheet-level visibility
 */
const readSheet = (sheet, name, meta) => {
    const ref = sheet['!ref'];
    const range = ref ? XLSX.utils.decode_range(ref) : null;

    const merges = (sheet['!merges'] || [])
        .map(m => ({ r: Math.max(m.s.r, 0), c: Math.max(m.s.c, 0), r2: m.e.r, c2: m.e.c }))
        .filter(m => m.r2 >= m.r && m.c2 >= m.c);

    // Master cell for every merged position so covered cells inherit the value.
    const mergeMap = new Map();
    for (const m of merges) {
        const master = XLSX.utils.encode_cell({ r: m.r, c: m.c });
        for (let r = m.r; r <= m.r2; r++) {
            for (let c = m.c; c <= m.c2; c++) {
                mergeMap.set(XLSX.utils.encode_cell({ r, c }), master);
            }
        }
    }

    const hiddenRows = new Set();
    (sheet['!rows'] || []).forEach((row, idx) => { if (row && row.hidden) hiddenRows.add(idx); });
    const hiddenCols = new Set();
    (sheet['!cols'] || []).forEach((col, idx) => { if (col && col.hidden) hiddenCols.add(idx); });

    const rowCount = range ? range.e.r + 1 : 0;
    const colCount = range ? range.e.c + 1 : 0;

    const cells = new Map(); // "r,c" -> {text, kind, rowHidden, colHidden, isCovered}
    if (range) {
        for (let r = range.s.r; r <= range.e.r; r++) {
            for (let c = range.s.c; c <= range.e.c; c++) {
                const addr = XLSX.utils.encode_cell({ r, c });
                const master = mergeMap.get(addr) || addr;
                const cell = sheet[master];
                if (!cell) continue;
                const text = toDisplay(cell);
                if (text === '' && cell.v === undefined && cell.v === null) continue;
                cells.set(`${r},${c}`, {
                    text,
                    kind: kindOf(cell.t),
                    value: cell.v !== undefined && cell.v !== null ? cell.v : text,
                    rowHidden: hiddenRows.has(r),
                    colHidden: hiddenCols.has(c),
                    isCoveredCell: addr !== master,
                });
            }
        }
    }

    return { name, hidden: !!(meta && meta.hidden), merges, rowCount, colCount, cells, hiddenRows, hiddenCols };
};

/**
 * Read file bytes → workbook model.
 * @param {ArrayBuffer|File} data
 * @returns {Promise<{fileName:string, sheets:Array<object>, workbook:XLSX.WorkBook}>}
 */
export const readWorkbook = async (data) => {
    const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true, dense: false });

    const sheetMeta = (workbook.Workbook && workbook.Workbook.Sheets) || [];
    const metaByName = Object.fromEntries(sheetMeta.map(s => [s.name, s]));

    const sheets = workbook.SheetNames
        .map(name => readSheet(workbook.Sheets[name], name, metaByName[name]))
        .map(sheet => {
            // Empty sheet = no usable range OR every cell visually empty.
            const nonEmpty = (sheet.cells.size > 0) &&
                [...sheet.cells.values()].some(c => c.text.trim() !== '');
            return { ...sheet, empty: !nonEmpty };
        });

    return { fileName: '', sheets, workbook };
};