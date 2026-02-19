import * as XLSX from 'xlsx';
import { generateId } from './helpers';

/**
 * Extract data from Excel specifically targeting red highlighted rows
 * as provided in the user's logic.
 */
export const parseExcelCostFile = async (file) => {
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array', cellStyles: true });

        const allMaterials = [];
        const sheetNames = workbook.SheetNames;

        // Process all sheets or just specific ones? 
        // User's code processes one sheet at a time, but for auto-import 
        // we might want to check all sheets or at least the first few.
        for (const sheetName of sheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet['!ref']) continue;

            const extractedItems = processExcelSheet(sheet, sheetName);
            allMaterials.push(...extractedItems);
        }

        return {
            success: allMaterials.length > 0,
            materials: allMaterials,
            format: 'EXCEL_COST',
            metadata: {
                projectName: file.name.replace(/\.[^/.]+$/, ""),
                totalItems: allMaterials.length,
                totalPrice: allMaterials.reduce((sum, m) => sum + (m.total || 0), 0)
            }
        };
    } catch (error) {
        console.error('Excel Parsing Error:', error);
        throw error;
    }
};

/**
 * Core processing logic adapted from user's provided component
 */
const processExcelSheet = (sheet, sheetName) => {
    const extractedItems = [];
    const ref = XLSX.utils.decode_range(sheet['!ref']);

    // Keywords to exclude (footer/summary rows)
    const excludeKeywords = [
        'STAFF SALARY', 'FIXED EXPANSES', 'PROFIT', 'SAVING', 'HUTANG',
        'UNTUK RANGE', 'JUMLAH PROJEK', 'EXPANSES', 'BATCH 2'
    ];

    // Process all rows
    for (let R = ref.s.r; R <= ref.e.r; R++) {
        // Check LEFT section (main materials) - typically columns A to J (0 to 10)
        let leftHighlightedCost = null;
        let leftCostColumn = -1;

        for (let C = 0; C <= 10; C++) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = sheet[cellAddress];
            if (!cell) continue;

            // Check for fill/highlighting
            const hasFill = (cell.s && cell.s.fill && cell.s.fill.fgColor) ||
                (cell.s && cell.s.fgColor) || (cell.s && cell.s.bgColor);

            const cellValue = String(cell.v || cell.w || '');
            const isRM = cellValue.includes('RM');

            if (hasFill && isRM) {
                const match = cellValue.match(/RM\s*([\d,]+\.?\d*)/);
                if (match) {
                    const amount = parseFloat(match[1].replace(/,/g, ''));
                    if (amount > 0) {
                        leftHighlightedCost = cellValue;
                        leftCostColumn = C;
                        break;
                    }
                }
            }
        }

        // Check RIGHT section (supporting materials) - columns M onwards (starting from column 12)
        let rightHighlightedCost = null;
        let rightCostColumn = -1;
        let rightStartColumn = -1;

        for (let C = 12; C <= ref.e.c; C++) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = sheet[cellAddress];
            if (!cell) continue;

            const hasFill = (cell.s && cell.s.fill && cell.s.fill.fgColor) ||
                (cell.s && cell.s.fgColor) || (cell.s && cell.s.bgColor);
            const cellValue = String(cell.v || cell.w || '');
            const isRM = cellValue.includes('RM');

            if (hasFill && isRM) {
                const match = cellValue.match(/RM\s*([\d,]+\.?\d*)/);
                if (match) {
                    const amount = parseFloat(match[1].replace(/,/g, ''));
                    if (amount > 0) {
                        rightHighlightedCost = cellValue;
                        rightCostColumn = C;
                        // Find where the right section data actually starts (first non-empty cell before cost)
                        for (let startC = 12; startC < C; startC++) {
                            const startAddr = XLSX.utils.encode_cell({ r: R, c: startC });
                            const startCell = sheet[startAddr];
                            if (startCell && startCell.v !== undefined && startCell.v !== null && startCell.v !== '') {
                                rightStartColumn = startC;
                                break;
                            }
                        }
                        break;
                    }
                }
            }
        }

        // Extract LEFT section if highlighted
        if (leftHighlightedCost) {
            const rowData = [];
            let rowText = '';

            for (let col = 0; col <= leftCostColumn; col++) {
                const addr = XLSX.utils.encode_cell({ r: R, c: col });
                const c = sheet[addr];
                if (c && c.v !== undefined && c.v !== null && c.v !== '') {
                    const val = c.v;
                    const strVal = typeof val === 'number' ? val.toString() : String(val);
                    rowData.push(strVal);
                    rowText += ' ' + strVal;
                }
            }

            const shouldExclude = excludeKeywords.some(keyword =>
                rowText.toUpperCase().includes(keyword.toUpperCase())
            );

            if (!shouldExclude && rowData.length >= 2) {
                // Try to parse structured data if it's the itemized format
                // Row format usually: [Index, Item Name, ..., Qty, Unit Price, Total RM]
                const itemData = interpretRowData(rowData, leftHighlightedCost, 'MAIN');
                if (itemData) extractedItems.push(itemData);
            }
        }

        // Extract RIGHT section if highlighted
        if (rightHighlightedCost && rightStartColumn !== -1) {
            const rowData = [];
            let rowText = '';

            for (let col = rightStartColumn; col <= rightCostColumn; col++) {
                const addr = XLSX.utils.encode_cell({ r: R, c: col });
                const c = sheet[addr];
                if (c && c.v !== undefined && c.v !== null && c.v !== '') {
                    const val = c.v;
                    const strVal = typeof val === 'number' ? val.toString() : String(val);
                    rowData.push(strVal);
                    rowText += ' ' + strVal;
                }
            }

            const shouldExclude = excludeKeywords.some(keyword =>
                rowText.toUpperCase().includes(keyword.toUpperCase())
            );

            if (!shouldExclude && rowData.length >= 2) {
                const itemData = interpretRowData(rowData, rightHighlightedCost, 'SUPPORTING');
                if (itemData) extractedItems.push(itemData);
            }
        }
    }

    return extractedItems;
};

/**
 * Interpret row data into structured Material object
 */
const interpretRowData = (rowData, costString, section) => {
    // Clean cost
    const total = parseFloat(costString.replace(/RM\s*/i, '').replace(/,/g, '')) || 0;
    if (total <= 0) return null;

    // Row format typically: [Index, Item Name, Specs..., Qty, Unit Price, Total RM]
    // Or just [Item Name, Qty, Unit Price, Total RM]

    let item = '';
    let quantity = 1;
    let unitPrice = total;
    let unit = 'pcs';

    // Filter out obvious noise and RM values
    const cleanRows = rowData.map(r => r.trim()).filter(r => r && !r.includes('RM'));

    if (cleanRows.length === 0) return null;

    // Extract all numbers that could be Qty or Unit Price
    const numericValues = cleanRows
        .filter(val => !isNaN(parseFloat(val.replace(/,/g, ''))))
        .map(val => parseFloat(val.replace(/,/g, '')));

    if (numericValues.length >= 2) {
        // Assume the last numeric value is unit price and the one before it is quantity
        unitPrice = numericValues[numericValues.length - 1];
        quantity = numericValues[numericValues.length - 2];

        // Item is everything before the numbers
        const lastNumStr = String(numericValues[numericValues.length - 2]);
        const firstNumIdx = cleanRows.indexOf(lastNumStr);
        if (firstNumIdx > 0) {
            item = cleanRows.slice(0, firstNumIdx).join(' ');
        } else {
            item = cleanRows[0];
        }
    } else if (numericValues.length === 1) {
        quantity = numericValues[0];
        unitPrice = total / quantity;

        const firstNumIdx = cleanRows.indexOf(String(numericValues[0]));
        if (firstNumIdx > 0) {
            item = cleanRows.slice(0, firstNumIdx).join(' ');
        } else {
            item = cleanRows[0];
        }
    } else {
        item = cleanRows.join(' ');
    }

    // Basic cleaning of item name (remove leading index numbers like "1.")
    item = item.replace(/^\d+[\.\)]\s*/, '').trim();

    // Heuristic for units
    const unitKeywords = ['m', 'meter', 'pcs', 'roll', 'bag', 'kg', 'set', 'sqf', 'unit', 'nos'];
    cleanRows.forEach(val => {
        const lowerVal = String(val).toLowerCase();
        if (unitKeywords.includes(lowerVal)) unit = lowerVal;
    });

    return {
        id: generateId(),
        category: section === 'MAIN' ? 'MATERIALS' : 'SUPPORTING MATERIAL',
        item: item || 'Unknown Item',
        quantity: quantity || 1,
        unit: unit,
        unitPrice: unitPrice || total,
        price: total,
        total: total
    };
};
