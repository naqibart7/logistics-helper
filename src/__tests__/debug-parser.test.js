/**
 * Debug: print exactly what the parser sees
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseDsgBWorkbook, detectDsgBShape } from '../utils/excelParser/dsgB.js';

const createTestWorkbook = () => {
    const wb = XLSX.utils.book_new();
    
    // Match the real DSG B template structure more closely
    const ws_data = [
        // Row 0: Section header in col A
        ['A NEW STRUCTURE', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        // Row 1: Left stream headers (cols 1-7), Right stream headers (cols 9+)
        ['', 'MATERIAL', 'SPEC', 'SQFT', '/ 60 SQFT', 'QTY (PCS)', 'PRICE', 'TOTAL COST', '', 'MATERIAL (OTHERS)', '', 'QUANTITY', 'UNIT PRICE', 'TOTAL COST', '', '', ''],
        // Row 2: Gypsum Board - main item
        ['', '1. Gypsum Board 9mm', '', '480', '8', '8', '28.00', '224.00', '', '', '', '', '', '', '', '', ''],
        // Row 3: Metal Stud - supporting item (right stream)
        ['', '', '', '', '', '', '', '', '', '2. Metal Stud', '', '32', '4.00', '128.00', '', '', ''],
        // Row 4: Screw (Box) - THE BUG: 25900 appears in col 3 (SQFT column) as template artifact
        ['', '6. Screw (Box)', '', '25900.00', '', '1', '25.00', '25.00', '', '', '', '', '', '', '', '', ''],
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, 'Table 3');
    
    return wb;
};

describe('Debug parser behavior', () => {
    it('should detect the DSG B shape', () => {
        const wb = createTestWorkbook();
        const isDsgB = detectDsgBShape(wb);
        console.log('detectDsgBShape result:', isDsgB);
        expect(isDsgB).toBe(true);
    });
    
    it('should print raw cell values for debugging', () => {
        const wb = createTestWorkbook();
        const ws = wb.Sheets['Table 3'];
        const range = XLSX.utils.decode_range(ws['!ref']);
        
        console.log('\n=== RAW CELL VALUES ===');
        for (let R = 0; R <= Math.min(range.e.r, 5); R++) {
            let rowStr = `Row ${R}: `;
            for (let C = 0; C <= 14; C++) {
                const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
                const val = cell ? (cell.w != null ? cell.w : cell.v) : '';
                if (val !== '') {
                    rowStr += `[${C}:"${val}"] `;
                }
            }
            console.log(rowStr);
        }
        
        const result = parseDsgBWorkbook(wb, 'test.xlsx');
        console.log('\n=== PARSED MATERIALS ===');
        console.log(JSON.stringify(result.materials, null, 2));
    });
});
