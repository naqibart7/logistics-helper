/**
 * Trace column mapping to find where the wrong column is read for quantity
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
    
    console.log('  Scanning header row for columns:');
    for (let C = 0; C <= Math.min(maxCol, 16); C++) {
        const tok = cellStr(sheet, R, C);
        if (!tok) continue;
        console.log(`    Col ${C}: "${tok}"`);
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
    
    console.log('  Mapped columns:', JSON.stringify({ left, right }, null, 2));
    return { left, right };
};

describe('Trace column mapping', () => {
    it('should show mapped columns', () => {
        const wb = createTestWorkbook();
        const ws = wb.Sheets['Table 3'];
        const range = XLSX.utils.decode_range(ws['!ref']);
        
        console.log('\n=== Column Mapping ===');
        const cols = mapColumns(ws, 1, range.e.c);
        
        // Now trace what values would be read for the Screw (Box) row (row 4)
        console.log('\n=== Values for Screw (Box) row (row 4) ===');
        const R = 4;
        console.log(`  Left stream:`);
        console.log(`    name (col ${cols.left.name}): "${cellStr(ws, R, cols.left.name)}"`);
        console.log(`    qty (col ${cols.left.qty}): "${cellStr(ws, R, cols.left.qty)}"`);
        console.log(`    price (col ${cols.left.price}): "${cellStr(ws, R, cols.left.price)}"`);
        console.log(`    total (col ${cols.left.total}): "${cellStr(ws, R, cols.left.total)}"`);
        
        console.log(`  Right stream:`);
        console.log(`    name (col ${cols.right.name}): "${cellStr(ws, R, cols.right.name)}"`);
        console.log(`    qty (col ${cols.right.qty}): "${cellStr(ws, R, cols.right.qty)}"`);
        console.log(`    price (col ${cols.right.price}): "${cellStr(ws, R, cols.right.price)}"`);
        console.log(`    total (col ${cols.right.total}): "${cellStr(ws, R, cols.right.total)}"`);
    });
});
