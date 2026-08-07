/**
 * classify.js — Row Classification (stage 5).
 *
 * Separates noise (TOTAL/SUBTOTAL, signature, terms, bank details, section
 * headings, blank rows) from genuine material rows using heuristics, never rigid
 * rules. A material row must contain an item-ish cell (text) AND either a
 * quantity or a price — single lonely numbers and pure boilerplate are noise.
 */
import { parseNumber, isNumeric } from './normalize.js';

const NOISE_PATTERNS = [
    /^\s*TOTAL\b/, /^\s*GRAND\s+TOTAL/, /^\s*SUBTOTAL\b/, /SUB\s*TOTAL/,
    /PREPARED\s+BY/, /APPROVED\s+BY/, /SIGNATURE/, /SIGNED\b/, /THANK\s+YOU/,
    /COMPANY\s+PROFILE/, /TERMS\s*(&|AND)\s*CONDITIONS/, /BANK\s+DETAILS/,
    /BANK\s+NAME/, /ACCOUNT\s+NO/, /PAYMENT\s+TERMS/, /VALIDITY\s+OF/, /QUOTATION\s+VALID/,
    /DELIVERY\s+TERMS/, /WARRANTY\s+PERIOD/, /INQUIRIES/, /REGARDS\b/, /BEST\s+REGARDS/,
    /SALES\s+REPRESENTATIVE/, /FOR\s+(AND\s+ON\s+BEHALF)/, /P\.?O\.?/,
    /^\s*(RM|MYR|USD)?\s*[\d,]+\.?\d*\s*(RM|MYR|USD)?\s*$/,          // lone currency number
    /^\s*(TOTAL|AMOUNT|PAYABLE)\s*:?/,
];

// Headers of the matched table are excluded from data rows.
const HEADER_CELL_WORDS = [
    'quantity', 'description', 'item', 'material', 'uom', 'unit price', 'remarks',
    'qty', 'size', 'amount', 'total', 'colour', 'code', 'price',
];

const hasHeaderSignature = (rowText) => {
    const lower = rowText.toLowerCase();
    return HEADER_CELL_WORDS.filter(w => lower.includes(w)).length >= 2;
};

/** Cell-level feature extraction for one data row. */
export const classifyRow = (sheet, r) => {
    const cells = [];
    let numericCount = 0;
    let wordCount = 0;
    for (let c = 0; c < sheet.colCount; c++) {
        const cell = sheet.cells.get(`${r},${c}`);
        if (!cell) continue;
        const t = cell.text.trim();
        if (t === '') continue;
        if (cell.isCoveredCell) continue; // merged body — count via master row
        cells.push({ col: c, text: t, kind: cell.kind, value: cell.value });
        if (isNumeric(t)) numericCount++;
        if (/[A-Za-z]/.test(t)) wordCount++;
    }

    if (cells.length === 0) return { type: 'blank', cells };

    const rowTextUpper = cells.map(c => c.text).join(' ').toUpperCase();

    // Hard noise: boilerplate / summary lines.
    if (NOISE_PATTERNS.some(p => p.test(rowTextUpper))) return { type: 'noise', cells };
    if (hasHeaderSignature(rowTextUpper)) return { type: 'header', cells };

    // A section heading (handled by sections.js) should not become a material.
    if (wordCount > 0 && numericCount === 0 && cells.length <= 3 && rowTextUpper.length <= 42) {
        const nextNonEmpty = lookahead(sheet, r);
        if (nextNonEmpty && !isNumeric(nextNonEmpty)) {
            const first = cells[0].text;
            if (!/^[+-]?[\d,]*\.?\d+/.test(first)) return { type: 'section', cells };
        }
    }

    // Must have a text-ish cell AND a number (qty or price), else it's noise.
    const hasText = cells.some(c => /[A-Za-z]{2,}/.test(c.text));
    if (!hasText) return { type: 'noise', cells };
    if (numericCount === 0) return { type: 'noise', cells };

    return { type: 'material', cells };
};

/** Find the next non-empty row's first-cell text, for heading disambiguation. */
const lookahead = (sheet, r) => {
    for (let rr = r + 1; rr < sheet.rowCount && rr <= r + 3; rr++) {
        for (let c = 0; c < sheet.colCount; c++) {
            const cell = sheet.cells.get(`${rr},${c}`);
            if (cell && cell.text.trim()) return cell.text.trim();
        }
    }
    return '';
};

/** True when a row is a repeated table header (common after page breaks). */
export const isRepeatedHeader = (cells) => hasHeaderSignature(cells.map(c => c.text).join(' '));