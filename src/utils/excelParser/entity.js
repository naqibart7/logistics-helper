/**
 * entity.js — Entity Extraction (stage 6 + part of 7).
 *
 * Builds a candidate material from a classified row using (a) the semantic
 * column mapping when detected and (b) heuristic positional fallbacks when the
 * layout is unknown. Pure function: everything is passed in; nothing mutates
 * the workbook.
 */
import { cleanText, parseQuantity, normalizeUnit, parseNumber } from './normalize.js';

/**
 * Pull mapped fields + fallbacks out of a row's cells.
 * @param {Array<{col,text,kind,value}>} cells classified material row cells
 * @param {Map<number,string>} mapping columnIndex → field
 * @returns candidate object (fields may be undefined when unknown)
 */
export const extractEntity = (cells, mapping, sheetName) => {
    const out = {
        text: cells.map(c => c.text).join(' '),
        item: '',
        itemText: '',
        quantity: undefined,
        unit: undefined,
        unitPrice: undefined,
        price: undefined,
        size: undefined,
        colour: undefined,
        brand: undefined,
        code: undefined,
        spec: undefined,
        remark: undefined,
        source: 'heuristic',
        sheet: sheetName,
    };
    const cellTokens = [];

    for (const c of cells) {
        const field = mapping.get(c.col);
        if (field && !field.endsWith('__raw')) {
            out.source = 'mapped';
            const numeric = ['quantity', 'unitPrice', 'price'];
            if (numeric.includes(field)) {
                const n = parseNumber(c.text);
                if (field === 'quantity') out.quantity = parseQuantity(c.text);
                else out[field] = Number.isFinite(n) ? n : undefined;
                continue;
            }
            if (field === 'unit') {
                const u = normalizeUnit(c.text);
                out.unit = u || cleanText(c.text, { keepCase: true });
                continue;
            }
            out[field] = cleanText(c.text, { keepCase: true });
            continue;
        }
        cellTokens.push(c.text);
    }

    // Item: prefer the explicit mapped item column, else join the raw tokens.
    out.item = out.item
        ? cleanText(out.item, { keepCase: true })
        : cleanText(cellTokens.join(' '), { keepCase: true });
    out.itemText = cleanText(cellTokens.join(' '), { keepCase: true });
    return out;
};