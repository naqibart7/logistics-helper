/**
 * Trace through the parser to find where it fails
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

const createTestWorkbook = () => {
    const wb = XLSX.utils.book_new();
    
    const ws_data = [
        ['A NEW STRUCTURE', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', 'MATERIAL', 'SPEC', 'SQFT', '/ 60 SQFT', 'QTY (PCS)', 'PRICE', 'TOTAL COST', '', 'MATERIAL (OTHERS)', '', 'QUANTITY', 'UNIT PRICE', 'TOTAL COST', '', '', ''],
        ['', '1. Gypsum Board 9mm', '', '480', '8', '8', '28.00', '224.00', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '2. Metal Stud', '', '32', '4.00', '128.00', '', '', ''],
        ['', '6. Screw (Box)', '', '25900.00', '', '1', '25.00', '25.00', '', '', '', '', '', '', '', '', ''],
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, 'Table 3');
    
    return wb;
};

// Copy the helper functions from dsgB.js for testing
const cellAt = (sheet, R, C) => sheet[XLSX.utils.encode_cell({ r: R, c: C })];
const cellStr = (sheet, R, C) => {
    const c = cellAt(sheet, R, C);
    const v = c == null ? undefined : (c.w != null ? c.w : c.v);
    return v == null ? '' : String(v).trim();
};

const HEADER_MAT = /^material\b/i;
const HEADER_QTY = /^(qty|quantity|amount)\b/i;
const HEADER_PRICE = /^price\b/i;
const HEADER_TOTAL = /^total\b/i;

const tokenKind = (tok) => {
    if (!tok) return null;
    if (/^total\s*trip\b/i.test(tok)) return 'qty';
    if (HEADER_QTY.test(tok)) return 'qty';
    if (HEADER_PRICE.test(tok)) return 'price';
    if (HEADER_TOTAL.test(tok)) return 'total';
    return null;
};

const IS_HEADER_ROW = (sheet, R) => {
    let q = 0, p = 0, t = 0;
    for (let C = 0; C <= 16; C++) {
        const kind = tokenKind(cellStr(sheet, R, C));
        if (kind === 'qty') q++;
        else if (kind === 'price') p++;
        else if (kind === 'total') t++;
    }
    console.log(`  Row ${R}: q=${q}, p=${p}, t=${t}, col0="${cellStr(sheet, R, 0)}", col1="${cellStr(sheet, R, 1)}"`);
    if (q + p + t >= 2) return true;
    return /^material\b|^item\b/i.test(cellStr(sheet, R, 0))
        || /^material\b|^item\b|^tiles\b|^purpose\b/i.test(cellStr(sheet, R, 1));
};

const completeHeader = (sheet, R, maxCol) => {
    let q = 0, p = 0, t = 0;
    for (let C = 0; C <= Math.min(maxCol, 16); C++) {
        const kind = tokenKind(cellStr(sheet, R, C));
        if (kind === 'qty') q++;
        else if (kind === 'price') p++;
        else if (kind === 'total') t++;
    }
    console.log(`  completeHeader Row ${R}: q=${q}, p=${p}, t=${t}`);
    return q > 0 && p > 0 && t > 0;
};

describe('Trace parser execution', () => {
    it('should trace header detection', () => {
        const wb = createTestWorkbook();
        const ws = wb.Sheets['Table 3'];
        const range = XLSX.utils.decode_range(ws['!ref']);
        
        console.log('\n=== Checking header rows ===');
        for (let R = 0; R <= Math.min(range.e.r, 5); R++) {
            console.log(`\nChecking row ${R}:`);
            const isHeader = IS_HEADER_ROW(ws, R);
            console.log(`  IS_HEADER_ROW result: ${isHeader}`);
            if (isHeader) {
                const isComplete = completeHeader(ws, R, range.e.c);
                console.log(`  completeHeader result: ${isComplete}`);
            }
        }
    });
});
