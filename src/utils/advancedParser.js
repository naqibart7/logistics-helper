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
// OCR NOISE PRE-CLEANING & CONFIDENCE
// ============================================================================
/**
 * OCR-tolerant substring match.
 * Normalises the line (and keyword) by removing whitespace/separators and
 * substituting the most common OCR confusions found in Malaysian
 * construction documents, so section detector keywords survive noise.
 */
const softHas = (line, lower, keyword) => {
    if (lower.includes(keyword)) return true;

    const compact = (line || '').toLowerCase().replace(/[\s\-_.:/()]/g, '');
    const k = keyword.replace(/[\s\-_.:/()]/g, '');
    if (compact.includes(k)) return true;

    // OCR confusions: 1↔l, 0↔o, q↔g, v↔y, rn↔m (heuristically)
    const confused = (s) => s
        .replace(/1/g, 'l')
        .replace(/0/g, 'o')
        .replace(/q/g, 'g')
        .replace(/v/g, 'y')
        .replace(/rn/g, 'n');
    return confused(compact).includes(confused(k));
};

/**
 * Compute a 0-1 confidence score for a parsed material line.
 * Higher when the line is complete (item + qty + price/total) and when a
 * fuzzy match against the standard catalog succeeded.
 * @returns {number} confidence in [0, 1]
 */
const computeConfidence = ({ item, quantity, price, total, matchScore }) => {
    let score = 0.2; // base: line was recognised as a plausible material

    if (item && String(item).trim().length >= 3) score += 0.15;
    if (quantity && Number(quantity) > 0) score += 0.2;
    if (Number(price) > 0) score += 0.15;
    if (Number(total) > 0) score += 0.15;
    if (matchScore !== undefined && matchScore !== null && matchScore < 0.4) {
        score += 0.15; // matched a known catalog item
    }

    return Math.min(1, Number(score.toFixed(2)));
};

/**
 * Re-join lines that OCR split mid-item.
 * Conservative: only merges when the first line has no numbers and is not an
 * all-caps header, and the next line carries the numeric data (the item tail).
 */
const joinSplitLines = (lines) => {
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const cur = lines[i];
        const next = lines[i + 1];

        const curIsOpen =
            cur && !/\d/.test(cur) &&             // no numbers yet
            !/^[A-Z0-9][A-Z\s/()]+$/.test(cur) && // not an all-caps header
            !/:$/.test(cur) &&                    // not a label
            cur.length >= 8;

        const nextIsContinuation =
            next && /\d/.test(next) &&            // carries the quantities/prices
            !/^RM\s*[\d,.]+/i.test(next) &&
            !/^[A-Z][A-Z\s/()]+$/.test(next) &&
            /^[a-z0-9&]/.test(next);

        if (curIsOpen && nextIsContinuation) {
            out.push(`${cur} ${next}`);
            i += 1;
            continue;
        }
        out.push(cur);
    }
    return out;
};

/**
 * Pre-clean OCR-extracted text before parsing.
 * - collapses multiple spaces and blank runs
 * - fixes the most common OCR character confusions
 * - re-joins lines that were split mid-item
 */
const preCleanText = (text) => {
    if (!text) return '';

    let cleaned = String(text)
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+/g, ' ')          // runs of spaces/tabs -> single space
        .replace(/ *\n */g, '\n')         // trim padding around newlines
        .replace(/\u00a0/g, ' ')          // non-breaking spaces
        .replace(/\n{3,}/g, '\n\n');      // collapse blank runs

    // Common OCR character fixes (safe: only when surrounded by letters).
    const fixTable = [
        // RM currency: "R.M 100", "R M 100", "RM100" -> "RM 100"
        { re: /\bR\.?\s*M\b\.?/gi, to: 'RM' },
        // letter 0 letter -> O (e.g. "C0NCRETE" -> "CONCRETE")
        { re: /([A-Za-z])0([A-Za-z])/g, to: '$1O$2' },
        // letter 1 letter -> l (e.g. "downl1ght" -> "downlight")
        { re: /([A-Za-z])1([A-Za-z])/g, to: '$1l$2' },
        // stray bullet/glyph artifacts
        { re: /[•·●▶►]/g, to: ' ' },
        // collapse any runs of spaces created above
        { re: / {2,}/g, to: ' ' },
    ];
    for (const { re, to } of fixTable) {
        cleaned = cleaned.replace(re, to);
    }

    const lines = cleaned.split('\n').map(l => l.trim()).filter(Boolean);
    return joinSplitLines(lines).join('\n');
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
        // OCR-tolerant matcher for section detection
        const has = (kw) => softHas(line, lower, kw);

        // DETECT MATERIALS CONTEXT
        if (
            has('gypsum') ||
            has('cement board') ||
            has('plywood') ||
            has('plaster') ||
            has('pvc') ||
            has('hpl') ||
            has('laminate') ||
            has('acrylic') ||
            has('wpc') ||
            has('fluted') ||
            has('skirting') ||
            has('glass') ||
            has('sticker') ||
            has('mirror') ||
            has('blockboard') ||
            has('furniture') ||
            has('lighting') ||
            has('lamp') ||
            has('led') ||
            has('downlight') ||
            has('eyeball') ||
            has('fan') ||
            has('tiles') ||
            has('flooring') ||
            has('carpet') ||
            has('underlay') ||
            has('canvas') ||
            has('scaffolding') ||
            has('roro') ||
            has('bin')
        ) {
            currentCategory = 'MATERIALS';
            insideValidMaterialSection = true;
            insideValidSupportingSection = false;
        }

        // DETECT SUPPORTING MATERIAL CONTEXT
        if (
            has('supporting material') ||
            has('metal stud') ||
            has('corner bead') ||
            has('joint tape') ||
            has('flaxi') ||
            has('drywall screw') ||
            has('x-bond') ||
            has('super glue') ||
            has('silicon') ||
            has('masking') ||
            has('wire') ||
            has('cable') ||
            has('suis') ||
            has('socket') ||
            has('switch') ||
            has('bulb') ||
            has('hinge') ||
            has('door closer') ||
            has('door stopper') ||
            has('door knob') ||
            has('lock') ||
            has('screw') ||
            has('nail') ||
            has('l-profile') ||
            has('besi') ||
            has('kayu kocai') ||
            has('thinner') ||
            has('roller') ||
            has('brush') ||
            has('undercoat') ||
            has('primer')
        ) {
            currentCategory = 'SUPPORTING MATERIAL';
            insideValidSupportingSection = true;
            insideValidMaterialSection = false;
        }

        // HARD STOPS
        if (
            has('labour work') ||
            has('transport') ||
            has('free gift') ||
            has('pakej') ||
            has('summary of tpc') ||
            has('method c') ||
            has('total (cogs)') ||
            has('total installation') ||
            has('total transport') ||
            has('total sub paint') ||
            has('commission') ||
            has('contigency') ||
            has('contingency') ||
            has('opex') ||
            has('cat dekat site') ||
            has('jotun') ||
            has('suzuka') ||
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
        // Pre-clean OCR noise (collapse spaces, fix confusions, re-join split lines)
        const cleanText = preCleanText(text);
        const ocrCleaned = cleanText !== text;

        // Detect format
        const format = detectFormat(cleanText);

        // Extract metadata
        const metadata = extractMetadata(cleanText);

        // Parse materials based on format
        let materials = [];
        if (format === 'MATERIAL_COST') {
            materials = parseMaterialCost(cleanText);
        } else {
            materials = parseJobCost(cleanText);
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
                // Confidence: OCR-noise aware trust estimate for this line
                material.confidence = computeConfidence(material);
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
            categoryList: categories,
            lowConfidence: materials.filter(m => (m.confidence || 1) < 0.6).length
        };

        return {
            format,
            metadata: { ...metadata, ...stats },
            materials,
            success: materials.length > 0,
            ocrCleaned,
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
        const cleanText = preCleanText(rawText);
        const metadata = extractMetadata(cleanText);
        const format = detectFormat(cleanText);
        let materials = [];

        for (const page of tabularData) {
            for (const tableGrid of page.tables) {
                let colMap = { item: -1, qty: -1, unitPrice: -1, total: -1 };
                let hasHeaders = false;
                let currentCategory = 'MATERIALS';
                let pendingDescription = '';

                for (const row of tableGrid) {
                    const rowCells = row.filter(Boolean);
                    if (rowCells.length === 0) continue;

                    const textRow = row.join(' ').toLowerCase();

                    // 1. Skip obvious headers/summary lines globally
                    if (textRow.includes('summary of tpc') ||
                        textRow.includes('total product cost') ||
                        textRow.includes('batch 1') ||
                        textRow.includes('batch 2') ||
                        textRow.includes('cogs') ||
                        textRow.includes('total ( cogs )') ||
                        textRow.includes('summary of') ||
                        textRow.includes('total estimated value')) {
                        hasHeaders = false; // Reset headers for summary section
                        continue;
                    }

                    // 2. Detect Category Context (Single column rows)
                    if (rowCells.length === 1 && !hasHeaders) {
                        const onlyText = rowCells[0];
                        // If it looks like a section header (e.g., "A MATERIAL", "WALL PANEL")
                        if (onlyText.length > 3 && !onlyText.includes('RM') && !onlyText.match(/^\d+$/)) {
                            currentCategory = onlyText.toUpperCase().replace(/^[A-Z]\s+/, '');
                            continue;
                        }
                    }

                    // 3. Discover Headers Dynamically
                    if (!hasHeaders) {
                        if (textRow.includes('qty') || textRow.includes('quantity') ||
                            textRow.includes('amount') || textRow.includes('total')) {

                            row.forEach((cell, idx) => {
                                const c = cell.toLowerCase();
                                if (c.includes('item') || c.includes('description') || c.includes('particulars') || c.includes('material')) colMap.item = idx;
                                if (c === 'qty' || c.includes('quantity')) colMap.qty = idx;
                                if (c.includes('unit price') || c.includes('rate') || c.includes('u/price') || c.includes('price/unit')) colMap.unitPrice = idx;
                                if (c.includes('total cost') || c.includes('total') || c.includes('amount')) colMap.total = idx;
                            });

                            if (colMap.item !== -1 && (colMap.qty !== -1 || colMap.total !== -1)) {
                                hasHeaders = true;
                            }
                            continue;
                        }
                    }

                    // 4. Process Data Row
                    if (hasHeaders) {
                        const itemStr = colMap.item !== -1 ? row[colMap.item].trim() : '';
                        const qtyStr = colMap.qty !== -1 ? row[colMap.qty] : '';
                        const priceStr = colMap.unitPrice !== -1 ? row[colMap.unitPrice] : '';
                        const totalStr = colMap.total !== -1 ? row[colMap.total] : '';

                        const total = cleanCurrency(totalStr);
                        const price = cleanCurrency(priceStr);

                        // Handle "Termasuk" or non-numeric Qty
                        let qty = parseFloat(qtyStr.replace(/[^\d.-]/g, ''));
                        if (isNaN(qty) && (qtyStr.includes('Termasuk') || textRow.includes('termasuk'))) {
                            qty = 1; // It exists, just included
                        }

                        // Skip repeated headers or purely empty rows
                        if (textRow.includes('qty') || textRow.includes('total cost')) continue;

                        // Skip summary category lines (e.g. "A MATERIAL" appearing in a row)
                        if (itemStr.length < 2 || itemStr.match(/^[A-Z]\s+/) || itemStr.includes('TOTAL') || itemStr.includes('BATCH')) continue;

                        // MULTI-LINE SUPPORT: If row has item text but no numeric data, store description
                        if (itemStr && isNaN(qty) && total === 0 && price === 0) {
                            pendingDescription += (pendingDescription ? ' ' : '') + itemStr;
                            continue;
                        }

                        // DATA DETECTED: We have numeric values, so create material
                        if (total > 0 || qty > 0 || price > 0 || qtyStr.includes('Termasuk')) {
                            let finalItemName = (pendingDescription ? pendingDescription + ' ' : '') + itemStr;
                            finalItemName = finalItemName.replace(/^\d{1,3}\s+/, '').replace(/^→/, '').trim();
                            pendingDescription = '';

                            // Filter out garbage matches from summary section
                            if (finalItemName.length > 3 && !finalItemName.match(/^[A-Z]\s+MATERIAL/)) {
                                materials.push({
                                    id: generateId(),
                                    category: currentCategory,
                                    item: finalItemName,
                                    quantity: isNaN(qty) ? 1 : qty,
                                    unit: 'pcs',
                                    unitPrice: price || (qty > 0 ? total / qty : 0),
                                    price: total,
                                    total: total
                                });
                            }
                        }
                    }
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
                material.confidence = computeConfidence(material);
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
            categoryList: categories,
            lowConfidence: materials.filter(m => (m.confidence || 1) < 0.6).length
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
