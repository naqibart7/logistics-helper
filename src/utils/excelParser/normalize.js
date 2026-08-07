/**
 * normalize.js — value normalisation helpers (stage 1 utility).
 *
 * Everything here is a PURE function. No state. All downstream stages use these
 * so casing, spacing, number parsing and units are handled exactly once.
 */

/** Collapse whitespace, trim, normalise internal quotes/backslashes. @private */
export const cleanText = (v, { keepCase = false } = {}) => {
    if (v === undefined || v === null) return '';
    const s = String(v)
        .replace(/[\u00a0\u2007\u202f]/g, ' ')   // non-breaking spaces -> space
        .replace(/[“”„]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    return keepCase ? s : s.toUpperCase();
};

/** Lowercase collapse, used for fuzzy token matching. */
export const keyOf = (v) => cleanText(v).toLowerCase();

/**
 * Parse any numeric-looking string into a finite number, tolerating:
 *   "1,250.50", "RM 145.50", "145.50 RM", "5 PCS", "20%", "(12)". Negative
 * parenthesised totals are treated as positive magnitudes unless told otherwise.
 */
export const parseNumber = (v) => {
    if (typeof v === 'number') return v;
    if (v === undefined || v === null) return NaN;
    let s = String(v).replace(/[, ]/g, '').trim();
    const parenNeg = /^\((.*)\)$/.test(s);
    s = s.replace(/^\(/, '').replace(/\)$/, '');
    s = s.replace(/[^0-9.+\-eE%]/g, '');
    if (s === '') return NaN;
    if (s.endsWith('%')) s = s.slice(0, -1);
    if (s === '-' || s === '+' || s === '') return NaN;
    const n = Number(s);
    if (!Number.isFinite(n)) return NaN;
    return parenNeg ? -Math.abs(n) : n;
};

/** True when a value is a plausible numeric scalar (not empty/NaN). */
export const isNumeric = (v) => Number.isFinite(parseNumber(v));

/** Parse an integer safely (for quantities we prefer whole numbers). */
export const parseQuantity = (v) => {
    const n = parseNumber(v);
    if (!Number.isFinite(n) || n <= 0) return NaN;
    // Quantities like 12.0 stay 12; real fractions (0.25) are preserved.
    return Number.isFinite(n) && Number.isInteger(n) ? n : Math.round(n * 10000) / 10000;
};

// ─── Units ───────────────────────────────────────────────────────────────────
// Normalised unit → set of raw tokens/markers that map to it.
export const UNIT_SYNONYMS = {
    pcs: ['pcs', 'pc', 'piece', 'pieces', 'unit', 'units', 'nos', 'no', 'set', 'sets', 'each'],
    m: ['m', 'meter', 'metre', 'meters', 'metres', 'mtr', 'mtrs'],
    m2: ['m2', 'm²', 'sqm', 'sq m', 'square meter', 'square metre'],
    m3: ['m3', 'm³', 'cbm', 'cubic meter', 'cubic metre'],
    cm: ['cm', 'centimeter', 'centimetre', 'centimeters'],
    mm: ['mm', 'millimeter', 'millimetre', 'millimeters'],
    kg: ['kg', 'kgs', 'kilogram', 'kilo'],
    g: ['g', 'gram', 'grams'],
    l: ['l', 'litre', 'liter', 'litres', 'lt'],
    ml: ['ml', 'millilitre', 'milliliter'],
    roll: ['roll', 'rolls'],
    box: ['box', 'boxes', 'boxs'],
    bag: ['bag', 'bags'],
    pail: ['pail', 'tank', 'drum'],
    ft: ['ft', 'feet', 'foot'],
    'sqft': ['sqft', 'sq ft', 'square feet', 'ft2'],
};

/** Returns the canonical unit abbreviation for a raw token, else undefined. */
export const normalizeUnit = (raw) => {
    if (raw === undefined || raw === null) return undefined;
    const t = String(raw).trim().toLowerCase().replace(/[.\s]+/g, ' ').trim();
    if (t === '') return undefined;
    for (const [canon, syns] of Object.entries(UNIT_SYNONYMS)) {
        if (syns.includes(t)) return canon;
    }
    return undefined;
};

/**
 * Header normalisation — strip boilerplate so semantic matching is resilient:
 *   "QTY REQUIRED!" -> "qty required", "(Pack Qty)" -> "pack qty".
 */
export const normalizeHeader = (raw) => {
    const s = String(raw || '')
        .replace(/[^\w\s\/%()]/g, ' ')   // drop arrows, emoji, symbols
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    return s;
};