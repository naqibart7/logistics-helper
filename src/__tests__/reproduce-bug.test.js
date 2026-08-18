/**
 * STEP 1 — Reproduce first, fix second.
 * 
 * This test constructs a minimal workbook that reproduces the quantity 
 * misparsing bug where 25900 (project total) leaks into qty column.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import { parseDsgBWorkbook } from '../utils/excelParser/dsgB.js';

// Construct a minimal reproduction workbook based on the Masjid Jamek fixture
const createTestWorkbook = () => {
    const wb = XLSX.utils.book_new();
    
    // Create a sheet with the problematic "Screw (Box)" row where 25900 bleeds in
    const ws_data = [
        // Row 0: Section header
        ['A NEW STRUCTURE', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        // Row 1: Column headers - note the dual-stream layout
        ['', 'MATERIAL', 'SPEC', 'SQFT', '/ 60', 'QTY (PCS)', 'PRICE', 'TOTAL COST', '', 'MATERIAL (OTHERS)', '', 'QUANTITY', 'UNIT PRICE', 'TOTAL COST', '', '', ''],
        // Row 2: Main item (Gypsum Board)
        ['', 'Gypsum Board 9mm', '', '', '', '8', '28.00', '224.00', '', '', '', '', '', '', '', '', ''],
        // Row 3: Supporting item (Metal Stud) - right stream
        ['', '', '', '', '', '', '', '', '', 'Metal Stud', '', '32', '4.00', '128.00', '', '', ''],
        // Row 4: THE BUG ROW - Screw (Box) where 25900 leaks into SQFT column (col 3)
        // In the real file, col 3 (SQFT/divisor) contains "25900.00" as a template artifact
        ['', 'Screw (Box)', '', '25900.00', '', '1', '25.00', '25.00', '', '', '', '', '', '', '', '', ''],
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    XLSX.utils.book_append_sheet(wb, ws, 'Table 3');
    
    return wb;
};

describe('STEP 1: Reproduce quantity parsing bug', () => {
    it('should NOT parse 25900 as quantity when it appears in SQFT column', () => {
        const wb = createTestWorkbook();
        const result = parseDsgBWorkbook(wb, 'test.xlsx');
        
        console.log('=== RAW OUTPUT ===');
        console.log(JSON.stringify(result.materials, null, 2));
        
        // Find the Screw (Box) item
        const screwItem = result.materials.find(m => m.item.includes('Screw'));
        
        expect(screwItem).toBeDefined();
        console.log('\n=== SCREW ITEM ===');
        console.log(JSON.stringify(screwItem, null, 2));
        
        // The bug: qty is parsed as 25900 instead of 1
        // This happens because the parser reads from wrong column
        expect(screwItem.quantity).not.toBe(25900);
        expect(screwItem.quantity).toBe(1);
    });
    
    it('should correctly identify which column contains the quantity', () => {
        const wb = createTestWorkbook();
        const result = parseDsgBWorkbook(wb, 'test.xlsx');
        
        // All items should have reasonable quantities
        for (const item of result.materials) {
            console.log(`Item: ${item.item}, Qty: ${item.quantity}, UnitPrice: ${item.unitPrice}, Total: ${item.total}`);
            
            // Quantity should never equal the project total (25900)
            expect(item.quantity).not.toBe(25900);
            
            // If we have unitPrice and total, quantity should be derivable
            if (item.unitPrice > 0 && item.total > 0) {
                const expectedQty = Math.round(item.total / item.unitPrice);
                // Allow small tolerance for rounding
                expect(Math.abs(item.quantity - expectedQty)).toBeLessThan(2);
            }
        }
    });
});
