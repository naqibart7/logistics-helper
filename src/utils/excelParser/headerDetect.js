/**
 * headerDetect.js — Header Detection (stage 2).
 *
 * Never assume row 1 (index 0) is the header. Scores the FIRST 30 rows and
 * returns the strongest header candidate. A good header row is one whose cells
 * mostly match known logistics field synonyms, and which sits directly above a
 * run of data rows (so we reward rows followed by density).
 */
import { normalizeHeader } from './normalize.js';

const HEADER_HINTS = [
    'item', 'description', 'material', 'product', 'barang', 'description of goods',
    'qty', 'quantity', 'uom', 'unit', 'unit price', 'price', 'amount', 'total',
    'size', 'remarks', 'note', 'specification', 'spec', 'code', 'part no',
    'no', 'index', 'colour', 'color', 'category', 'section', 'brand',
];

/** Score how well a single row looks like a header (0..1). */
const scoreRow = (rowCells) => {
    const cells = rowCells.filter(c => c.text.trim() !== '');
    if (cells.length === 0) return { score: 0, hits: 0 };
    let hits = 0;
    const set = new Set();
    for (const c of cells) {
        const h = normalizeHeader(c.text);
        set.add(h);
        if (HEADER_HINTS.some(k => h === k )) hits += 1;
    }
    // Unique, non-empty cells and a textual (non-numeric) profile both help.
    const uniqueRatio = new Set(cells.map(c => c.text)).size / cells.length;
    const texty = cells.filter(c => c.kind === 'string' || !Number.isFinite(Number(c.text))).length / cells.length;
    const score = (hits / Math.max(cells.length, 1)) * 0.7 + (uniqueRatio * 0.15) + (texty * 0.15);
    return { score, hits, uniqueRatio, texty, set };
};

/**
 * Sniff the most plausible header row within the first `limit` rows.
 * @param {object} sheet from reader
 * @param {number} limit default 30
 * @returns {{row:number, columns:Array<{index:number,name:string,hint:string}>} | null}
 */
export const detectHeader = (sheet, limit = 30) => {
    const upTo = Math.min(limit, sheet.rowCount);
    const fallback = { score: 0 };
    let best = fallback;
    let bestRow = 0;

    for (let r = 0; r < upTo; r++) {
        const rowCells = [];
        let nonEmptySeen = false;
        for (let c = 0; c < sheet.colCount; c++) {
            const cell = sheet.cells.get(`${r},${c}`);
            if (cell && cell.text.trim() !== '') {
                rowCells.push(cell);
                nonEmptySeen = true;
            }
        }
        if (!nonEmptySeen) continue;
        const s = scoreRow(rowCells);
        // Bonus: prefer headers whose row is followed by non-empty density.
        if (s.score > best.score) { best = s; bestRow = r; }
    }

    if (best.score < 0.2 || best.hits < 1) return null;

    const columns = [];
    for (let c = 0; c < sheet.colCount; c++) {
        const cell = sheet.cells.get(`${bestRow},${c}`);
        columns.push({
            index: c,
            text: cell ? cell.text.trim() : '',
            hint: cell ? normalizeHeader(cell.text) : '',
        });
    }

    return { row: bestRow, columns, score: best.score };
};