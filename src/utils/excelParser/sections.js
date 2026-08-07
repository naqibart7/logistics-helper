/**
 * sections.js — Section Detection (stage 4).
 *
 * Many quotations group items under headings ("Furniture", "Electrical", ...).
 * We walk rows from the top and track a rolling "current section" label. A row
 * becomes a section header when it is short, strongly textual, contains no
 * numbers, and is followed by at least one non-empty data row. Material rows
 * after it inherit the section until another heading appears.
 */
import { cleanText } from './normalize.js';

const SECTION_BLOCK_WORDS = [
    'total', 'subtotal', 'grand total', 'amount', 'balance', 'sum', 'carried',
    'brought', 'forward', 'tremie', 'balance due',
];

const rowText = (sheet, r) => {
    const parts = [];
    for (let c = 0; c < sheet.colCount; c++) {
        const cell = sheet.cells.get(`${r},${c}`);
        if (cell && cell.text.trim()) parts.push(cell.text.trim());
    }
    return parts.join(' ');
};

const isNumericCell = (text) => /^[+-]?[\d,.]+%?$/.test(text.trim());

const looksLikeSectionHeading = (sheet, r) => {
    const cells = [];
    for (let c = 0; c < sheet.colCount; c++) {
        const cell = sheet.cells.get(`${r},${c}`);
        if (cell && cell.text.trim()) cells.push(cell.text.trim());
    }
    if (cells.length === 0 || cells.length > 3) return false;
    const joined = cells.join(' ').toUpperCase();
    const lower = joined.toLowerCase();
    // A heading has NO numeric cells and no numeric words.
    if (cells.some(isNumericCell)) return false;
    if (/^[A-Z0-9.]{1,4}$/.test(cleanText(cells[0]))) return false; // row index
    if (SECTION_BLOCK_WORDS.some(w => lower.includes(w))) return false;
    // Must be short-ish, all-words (allow '/' and '-').
    if (joined.length > 42) return false;
    if (!/[A-Za-z]/.test(joined)) return false;
    // Must be followed by a non-empty row (so stray footer text doesn't stick).
    const next = rowText(sheet, r + 1);
    if (next.trim() === '') return false;
    return true;
};

/**
 * Assign a section label to every row.
 * @returns {Array<string>} section per row index ('' when no section active).
 */
export const detectSections = (sheet) => {
    const sections = new Array(sheet.rowCount).fill('');
    let current = '';

    for (let r = 0; r < sheet.rowCount; r++) {
        if (looksLikeSectionHeading(sheet, r)) {
            const t = rowText(sheet, r);
            current = cleanText(t, { keepCase: true });
            sections[r] = current;
            continue;
        }
        sections[r] = current;
    }
    return sections;
};