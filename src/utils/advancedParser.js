// ============================================================================
// ADVANCED PARSER FOR CONSTRUCTION MATERIAL COST & JOB COST DOCUMENTS
// ============================================================================
// ============================================================================
// Supports: Material Cost format (multiple variations) & Job Cost format
// Auto-detects format and column structure
// ============================================================================
import Fuse from 'fuse.js';
import { standardCatalog } from '../data/standardCatalog';


/**
 * Generate unique ID for materials
 */
const generateId = () => {
    return Date.now() + Math.random().toString(36).substr(2, 9);
};

/**
 * Clean currency string to number
 */
const cleanCurrency = (str) => {
    if (!str) return 0;
    return parseFloat(str.replace(/[^\d.-]/g, '')) || 0;
};

// ============================================================================
// MATERIAL COST PARSER (ENHANCED - HANDLES MULTIPLE COLUMN VARIATIONS)
// ============================================================================
/**
 * Parse Material Cost format with flexible column detection
 * Handles variations:
 * - Format A: > ITEM QTY UNIT_PRICE RM TOTAL
 * - Format B: > ITEM UNIT/SQF QTY UNIT_PRICE RM TOTAL
 * - Format C: > ITEM - QTY UNIT - RM TOTAL
 */
const parseMaterialCost = (text) => {
    const lines = text.split('\n');
    const materials = [];
    let currentCategory = 'MATERIALS';
    let currentSectionTotal = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lower = line.toLowerCase();

        // Skip empty lines
        if (!line) continue;

        // Detect category/section headers (NOT starting with '>')
        // Look for all-caps sections or specific keywords
        if (
            !line.startsWith('>') &&
            (
                line.match(/^[A-Z\s/,()]+$/) || // All caps line
                lower.includes('pvc foam board') ||
                lower.includes('lighting') ||
                lower.includes('acrylic') ||
                lower.includes('paint') ||
                lower.includes('plaster') ||
                lower.includes('skirting') ||
                lower.includes('wct') ||
                lower.includes('cornice') ||
                lower.includes('others') ||
                lower.includes('new wall') ||
                lower.includes('gypsum')
            ) &&
            !lower.includes('total') &&
            !lower.includes('material cost') &&
            !lower.includes('service') &&
            !lower.includes('installation')
        ) {
            currentCategory = line;
            continue;
        }

        // Detect section totals (for validation/debugging)
        if (line.match(/^RM\s*[\d,]+\.?\d*/)) {
            currentSectionTotal = line;
            continue;
        }

        // Parse material lines starting with '>'
        if (line.startsWith('>')) {
            const cleaned = line.substring(1).trim();

            // Skip if this is a service/labor line (not material)
            if (
                lower.includes('sub paint') ||
                lower.includes('installation') ||
                lower.includes('transport') ||
                lower.includes('wiring') ||
                lower.includes('hacking') ||
                lower.includes('contingency') ||
                lower.includes('commission')
            ) {
                continue;
            }

            // Find the RM TOTAL at the end
            const totalMatch = cleaned.match(/(RM\s*[\d,]+\.?\d*)$/i);

            if (!totalMatch) continue;

            const totalPart = totalMatch[0];
            const total = parseFloat(totalPart.replace(/RM\s*/i, '').replace(/,/g, ''));

            // Skip zero-value items
            if (total <= 0) continue;

            // Remove the RM TOTAL from the line
            let remainder = cleaned.replace(totalMatch[0], '').trim();

            // Extract numeric values (these could be UNIT/SQF, QTY, UNIT_PRICE)
            const numbers = [];
            const numberPattern = /\d+\.?\d*/g;
            let match;

            // Extract all numbers from the remainder
            const numberMatches = remainder.match(numberPattern);

            if (!numberMatches || numberMatches.length === 0) {
                // No numbers found - might be a malformed line
                continue;
            }

            // Strategy: The last 1-3 numbers before RM TOTAL are the quantity/price values
            // Work backwards from the end
            let parts = remainder.split(/\s+/).filter(Boolean);
            let extractedNumbers = [];

            // Extract last 1-3 numeric values
            while (parts.length > 0 && extractedNumbers.length < 3) {
                const lastPart = parts.pop();
                if (lastPart.match(/^\d+\.?\d*$/)) {
                    extractedNumbers.unshift(parseFloat(lastPart));
                } else {
                    // Put it back - this is part of the item name
                    parts.push(lastPart);
                    break;
                }
            }

            // Reconstruct item name from remaining parts
            let item = parts.join(' ').trim();

            // Determine QTY and UNIT_PRICE based on how many numbers we found
            let qty = 1;
            let unitPrice = 0;

            if (extractedNumbers.length === 3) {
                // Format: ITEM UNIT/SQF QTY UNIT_PRICE RM TOTAL
                // extractedNumbers = [UNIT/SQF, QTY, UNIT_PRICE]
                qty = extractedNumbers[1];
                unitPrice = extractedNumbers[2];
            } else if (extractedNumbers.length === 2) {
                // Format: ITEM QTY UNIT_PRICE RM TOTAL
                // extractedNumbers = [QTY, UNIT_PRICE]
                qty = extractedNumbers[0];
                unitPrice = extractedNumbers[1];
            } else if (extractedNumbers.length === 1) {
                // Format: ITEM QTY RM TOTAL (calculate unit price)
                qty = extractedNumbers[0];
                unitPrice = qty > 0 ? total / qty : 0;
            }

            // Validate
            if (!item || item.length < 2) continue;

            materials.push({
                id: generateId(),
                category: currentCategory,
                item: item,
                quantity: qty,
                unit: 'pcs',
                unitPrice: unitPrice,
                price: total,
                total: total
            });
        }
    }

    return materials;
};

// ============================================================================
// JOB COST PARSER (STRICT IMPLEMENTATION)
// ============================================================================
/**
 * Parse Job Cost format with strict context management
 */
const parseJobCost = (text) => {
    const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 12);

    const materials = [];
    let currentCategory = null;
    let insideValidMaterialSection = false;
    let insideValidSupportingSection = false;

    for (const line of lines) {
        const lower = line.toLowerCase();

        // DETECT MATERIALS CONTEXT
        if (
            lower.includes('gypsum') ||
            lower.includes('cement board') ||
            lower.includes('plywood') ||
            lower.includes('plaster') ||
            lower.includes('pvc') ||
            lower.includes('hpl') ||
            lower.includes('laminate') ||
            lower.includes('acrylic') ||
            lower.includes('wpc') ||
            lower.includes('fluted') ||
            lower.includes('skirting') ||
            lower.includes('glass') ||
            lower.includes('sticker') ||
            lower.includes('mirror') ||
            lower.includes('blockboard') ||
            lower.includes('furniture') ||
            lower.includes('lighting') ||
            lower.includes('lamp') ||
            lower.includes('led') ||
            lower.includes('downlight') ||
            lower.includes('eyeball') ||
            lower.includes('fan') ||
            lower.includes('tiles') ||
            lower.includes('flooring') ||
            lower.includes('carpet') ||
            lower.includes('underlay') ||
            lower.includes('canvas') ||
            lower.includes('scaffolding') ||
            lower.includes('roro') ||
            lower.includes('bin')
        ) {
            currentCategory = 'MATERIALS';
            insideValidMaterialSection = true;
            insideValidSupportingSection = false;
        }

        // DETECT SUPPORTING MATERIAL CONTEXT
        if (
            lower.includes('supporting material') ||
            lower.includes('metal stud') ||
            lower.includes('corner bead') ||
            lower.includes('joint tape') ||
            lower.includes('flaxi') ||
            lower.includes('drywall screw') ||
            lower.includes('x-bond') ||
            lower.includes('super glue') ||
            lower.includes('silicon') ||
            lower.includes('masking') ||
            lower.includes('wire') ||
            lower.includes('cable') ||
            lower.includes('suis') ||
            lower.includes('socket') ||
            lower.includes('switch') ||
            lower.includes('bulb') ||
            lower.includes('hinge') ||
            lower.includes('door closer') ||
            lower.includes('door stopper') ||
            lower.includes('door knob') ||
            lower.includes('lock') ||
            lower.includes('screw') ||
            lower.includes('nail') ||
            lower.includes('l-profile') ||
            lower.includes('besi') ||
            lower.includes('kayu kocai') ||
            lower.includes('thinner') ||
            lower.includes('roller') ||
            lower.includes('brush') ||
            lower.includes('undercoat') ||
            lower.includes('primer')
        ) {
            currentCategory = 'SUPPORTING MATERIAL';
            insideValidSupportingSection = true;
            insideValidMaterialSection = false;
        }

        // HARD STOPS
        if (
            lower.includes('labour work') ||
            lower.includes('transport') ||
            lower.includes('free gift') ||
            lower.includes('pakej') ||
            lower.includes('summary of tpc') ||
            lower.includes('method c') ||
            lower.includes('total (cogs)') ||
            lower.includes('total installation') ||
            lower.includes('total transport') ||
            lower.includes('total sub paint') ||
            lower.includes('commission') ||
            lower.includes('contigency') ||
            lower.includes('contingency') ||
            lower.includes('opex') ||
            lower.includes('cat dekat site') ||
            lower.includes('jotun') ||
            lower.includes('suzuka') ||
            line.includes('--- PAGE BREAK ---')
        ) {
            insideValidMaterialSection = false;
            insideValidSupportingSection = false;
            continue;
        }

        // JUNK FILTER
        if (
            line.includes('SQFT /') ||
            line.includes('QTY (PCS)') ||
            line.includes('QTY LEBIHKAN') ||
            line.includes('KALAU') ||
            line.includes('TERMASUK') ||
            line.match(/^\d+\s*$/) ||
            line.endsWith('RM 0.00') ||
            line.includes('RM       0.00') ||
            line.includes('RM 0.00') ||
            lower.includes('spec') ||
            lower.includes('insert') ||
            lower.includes('masukkan') ||
            line.includes('→')
        ) continue;

        // PARSE ITEM
        let cleaned = line.replace(/\s{2,}/g, '  ').trim();
        const totalMatch = cleaned.match(/(RM\s*[\d,]+\.?\d*)$/i);

        if (!totalMatch) continue;
        if (!insideValidMaterialSection && !insideValidSupportingSection) continue;

        const totalPart = totalMatch[0];
        if (totalPart.includes('0.00')) continue;

        const total = parseFloat(totalPart.replace(/RM\s*/i, '').replace(/,/g, ''));
        if (total <= 0) continue;

        cleaned = cleaned.replace(totalMatch[0], '').trim();

        let parts = cleaned.split(/\s{2,}/).filter(Boolean);
        if (parts.length < 2) {
            parts = cleaned.split(/\s+/).filter(Boolean);
        }
        if (parts.length < 2) continue;

        let price = null;
        let qty = null;

        let candidate = parts.pop();
        if (candidate.match(/^\d+\.?\d{0,2}$/)) {
            price = parseFloat(candidate);
        } else {
            parts.push(candidate);
        }

        if (parts.length > 0) {
            candidate = parts.pop();
            if (candidate.match(/^\d+\.?\d*$/)) {
                qty = parseFloat(candidate);
            } else {
                parts.push(candidate);
            }
        }

        let item = parts.join(' ').trim();
        item = item.replace(/^\d{1,3}\s+/, '');
        item = item.replace(/^(NEW STRUCTURE|CEILING|WALL PANEL|WALL FINISHES|GLASS FINISHES|FURNITURE|LIGHTING|TILES|FLOORING|PAINT|SITE PREPARATION)\s*/i, '');

        if (item.length < 2 || !qty || item.includes('TOTAL')) continue;

        materials.push({
            id: generateId(),
            category: currentCategory,
            item,
            quantity: qty,
            unit: 'pcs',
            unitPrice: price || (qty ? total / qty : 0),
            price: total,
            total
        });
    }

    return materials;
};

// ============================================================================
// METADATA EXTRACTOR
// ============================================================================
/**
 * Extract project metadata from document
 */
const extractMetadata = (text) => {
    const metadata = {
        projectName: '',
        client: '',
        projectNumber: '',
        quotationNumber: '',
        invoiceNumber: '',
        date: '',
        totalProject: ''
    };

    const lines = text.split('\n');

    lines.forEach(line => {
        const lower = line.toLowerCase();
        // Project Name
        if (line.includes('PROJECT NAME')) {
            const match = line.match(/:\s*(.+?)(?:CLIENT|INDOOR|OUTDOOR|\(|$)/i);
            if (match) metadata.projectName = match[1].trim();
        }

        // Client Name
        if (line.includes('CLIENT NAME')) {
            const match = line.match(/:\s*(.+?)(?:\d{10,}|TOTAL|NPM|GPM|$)/i);
            if (match) metadata.client = match[1].trim();
        }

        // Project Number
        if (lower.includes('project no') || lower.includes('project #') || lower.includes('project number')) {
            const match = line.match(/(?:no|#|number)[:\s]*([A-Z0-9-/]+)/i);
            if (match) metadata.projectNumber = match[1];
        }

        // Invoice Number
        if (lower.includes('invoice no') || lower.includes('invoice #') || lower.includes('invoice number')) {
            const match = line.match(/(?:no|#|number)[:\s]*([A-Z0-9-/]+)/i);
            if (match) metadata.invoiceNumber = match[1];
        }

        // Quotation Number
        if (lower.includes('quotation no') || lower.includes('quotation #') || lower.includes('quotation number')) {
            const match = line.match(/(?:no|#|number)[:\s]*([A-Z0-9-/]+)/i);
            if (match) metadata.quotationNumber = match[1];
        }

        // Date (multiple formats)
        if (lower.includes('date') || lower.includes('qoutation date') || lower.includes('quotation date')) {
            const dateMatch = line.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/);
            if (dateMatch) {
                metadata.date = dateMatch[1];
            } else {
                const parts = line.split(':');
                if (parts.length > 1) metadata.date = parts[1].trim();
            }
        }

        // Total Project
        if (lower.includes('total project') || lower.includes('grand total')) {
            const match = line.match(/RM\s*([\d,]+\.?\d*)/i);
            if (match) metadata.totalProject = match[1].replace(/,/g, '');
        }
    });

    return metadata;
};

// ============================================================================
// AUTO FORMAT DETECTOR
// ============================================================================
/**
 * Detect document format
 */
const detectFormat = (text) => {
    const lowerText = text.toLowerCase();

    // Material Cost format indicators
    if (
        lowerText.includes('material cost') &&
        lowerText.includes('quotation') &&
        !lowerText.includes('job cost')
    ) {
        return 'MATERIAL_COST';
    }

    // Job Cost format indicators
    if (lowerText.includes('job cost') || lowerText.includes('batch')) {
        return 'JOB_COST';
    }

    // Fallback: Check for '>' prefix (Material Cost indicator)
    if (text.includes('\n>') || text.includes('> ')) {
        return 'MATERIAL_COST';
    }

    // Default to Job Cost
    return 'JOB_COST';
};

// ============================================================================
// MAIN SMART PARSER
// ============================================================================
/**
 * Smart parser with auto format detection
 * @param {string} text - Raw text from PDF
 * @returns {object} - Parsed result with format, metadata, and materials
 */
export const smartParse = (text) => {
    if (!text || !text.trim()) {
        return {
            format: 'UNKNOWN',
            metadata: {},
            materials: [],
            success: false,
            errors: ['Empty text provided']
        };
    }

    try {
        // Detect format
        const format = detectFormat(text);

        // Extract metadata
        const metadata = extractMetadata(text);

        // Parse materials based on format
        let materials = [];
        if (format === 'MATERIAL_COST') {
            materials = parseMaterialCost(text);
        } else {
            materials = parseJobCost(text);
        }

        // Calculate total if not found in metadata
        if (!metadata.totalProject && materials.length > 0) {
            const calculatedTotal = materials.reduce((sum, m) => sum + (m.total || 0), 0);
            metadata.totalProject = calculatedTotal.toFixed(2);
        }

        // Fuzzy match materials with standard catalog
        if (materials.length > 0) {
            const fuse = new Fuse(standardCatalog, {
                keys: ['name'],
                threshold: 0.4,
                includeScore: true
            });

            materials.forEach(material => {
                const results = fuse.search(material.item);
                if (results.length > 0 && results[0].score < 0.4) {
                    const match = results[0].item;
                    material.standardItem = match.name;
                    material.standardPrice = match.price;
                    material.standardCategory = match.category;
                    material.matchScore = results[0].score;
                }
            });
        }

        // Add statistics
        const totalQuantity = materials.reduce((sum, m) => sum + (m.quantity || 0), 0);
        const totalPrice = materials.reduce((sum, m) => sum + (m.total || 0), 0);
        const categories = [...new Set(materials.map(m => m.category || 'MATERIALS'))];

        const stats = {
            totalItems: materials.length,
            totalQuantity: totalQuantity,
            totalPrice: totalPrice,
            categories: categories.length,
            categoryList: categories
        };

        return {
            format,
            metadata: { ...metadata, ...stats },
            materials,
            success: materials.length > 0,
            errors: materials.length === 0 ? ['No materials found in document'] : []
        };
    } catch (error) {
        console.error('Parser error:', error);
        return {
            format: 'ERROR',
            metadata: {},
            materials: [],
            success: false,
            errors: [error.message]
        };
    }
};

// ============================================================================
// TABULAR PARSER (USES ADVANCED GRID EXTRACTION)
// ============================================================================
/**
 * Smart parser for structured 2D Grids
 * @param {Array} tabularData - 2D Array per page from pdfExtractor
 * @param {string} rawText - Raw text for metadata extraction
 */
export const smartParseTabular = (tabularData, rawText) => {
    try {
        const metadata = extractMetadata(rawText);
        const format = detectFormat(rawText);
        let materials = [];

        for (const page of tabularData) {
            let colMap = { item: -1, qty: -1, unitPrice: -1, total: -1 };
            let hasHeaders = false;
            let currentCategory = 'MATERIALS';

            for (const row of page.table) {
                const textRow = row.join(' ').toLowerCase();

                // 1. Detect Category Context (Single column rows)
                if (row.filter(Boolean).length === 1 && !hasHeaders) {
                    const onlyText = row.find(Boolean).toLowerCase();
                    if (!onlyText.match(/\d/)) {
                        currentCategory = row.find(Boolean).toUpperCase();
                        continue;
                    }
                }

                // 2. Discover Headers Dynamically
                if (!hasHeaders) {
                    if (textRow.includes('qty') || textRow.includes('quantity') ||
                        textRow.includes('amount') || textRow.includes('total')) {

                        row.forEach((cell, idx) => {
                            const c = cell.toLowerCase();
                            if (c.includes('item') || c.includes('description') || c.includes('particulars')) colMap.item = idx;
                            if (c === 'qty' || c.includes('quantity')) colMap.qty = idx;
                            if (c.includes('unit price') || c.includes('rate') || c.includes('u/price') || c.includes('rm')) colMap.unitPrice = idx;
                            if (c.includes('amount') || c.includes('total') || (c.includes('rm') && colMap.unitPrice !== idx)) colMap.total = idx;
                        });

                        // Fallback item column
                        if (colMap.item === -1) {
                            for (let i = 0; i < (colMap.qty !== -1 ? colMap.qty : row.length); i++) {
                                if (row[i].length > 2) colMap.item = i;
                            }
                        }

                        if (colMap.item !== -1 && (colMap.qty !== -1 || colMap.total !== -1)) {
                            hasHeaders = true;
                        }
                        continue;
                    }
                }

                // 3. Process Data Row using exact Grid Indices
                if (hasHeaders) {
                    const itemStr = colMap.item !== -1 ? row[colMap.item] : '';
                    if (!itemStr || itemStr.trim().length === 0) continue;

                    const qtyStr = colMap.qty !== -1 ? row[colMap.qty] : '';
                    const totalStr = colMap.total !== -1 ? row[colMap.total] : '';
                    const priceStr = colMap.unitPrice !== -1 ? row[colMap.unitPrice] : '';

                    let total = cleanCurrency(totalStr);
                    let qty = parseFloat(qtyStr.replace(/[^\d.-]/g, ''));
                    let price = cleanCurrency(priceStr);

                    // Skip headers repeated, or sub-totals
                    if (itemStr.toLowerCase().includes('total') || itemStr.toLowerCase().includes('carried forward') || total === 0) continue;

                    // Reconstruct missing numeric data logically
                    if (isNaN(qty) || qty === 0) qty = (total > 0 && price > 0) ? (total / price) : 1;
                    if (total > 0 && price === 0) price = total / qty;

                    materials.push({
                        id: generateId(),
                        category: currentCategory,
                        item: itemStr.replace(/^>/, '').trim(),
                        quantity: qty,
                        unit: 'pcs',
                        unitPrice: price,
                        price: total,
                        total: total
                    });
                }
            }
        }

        // Fuzzy Match Catalog
        if (materials.length > 0) {
            const fuse = new Fuse(standardCatalog, { keys: ['name'], threshold: 0.4, includeScore: true });
            materials.forEach(material => {
                const results = fuse.search(material.item);
                if (results.length > 0 && results[0].score < 0.4) {
                    material.standardItem = results[0].item.name;
                    material.standardPrice = results[0].item.price;
                    material.standardCategory = results[0].item.category;
                    material.matchScore = results[0].score;
                }
            });
        }

        const totalQuantity = materials.reduce((sum, m) => sum + (m.quantity || 0), 0);
        const totalPrice = materials.reduce((sum, m) => sum + (m.total || 0), 0);
        const categories = [...new Set(materials.map(m => m.category || 'MATERIALS'))];

        const stats = {
            totalItems: materials.length,
            totalQuantity: totalQuantity,
            totalPrice: totalPrice,
            categories: categories.length,
            categoryList: categories
        };

        if (!metadata.totalProject && materials.length > 0) metadata.totalProject = totalPrice.toFixed(2);

        return {
            format,
            metadata: { ...metadata, ...stats },
            materials,
            success: materials.length > 0,
            errors: materials.length === 0 ? ['No materials found (Tabular Parsing)'] : []
        };
    } catch (error) {
        console.error('Tabular Parser error:', error);
        return { format: 'ERROR', metadata: {}, materials: [], success: false, errors: [error.message] };
    }
};

// ============================================================================
// EXPORT MAIN FUNCTION
// ============================================================================
export default smartParse;
