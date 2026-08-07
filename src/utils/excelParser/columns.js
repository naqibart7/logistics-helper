/**
 * columns.js — Column Mapping (stage 3).
 *
 * Maps detected header cells to semantic fields WITHOUT exact-match reliance.
 * A synonym dictionary handles "Description", "Product", "Barang" → item,
 * "QTY Required" → quantity, "UOM" → unit, etc. When no clean match exists the
 * column is left `unmapped` — data there is still captured into the raw row so
 * nothing is lost, and the AI fallback may re-map it later.
 */
import { normalizeHeader } from './normalize.js';

/** Semantic fields the rest of the pipeline understands. */
export const FIELDS = {
    item: 'item',
    code: 'code',
    spec: 'spec',           // free-text specification / model
    quantity: 'quantity',
    unit: 'unit',
    unitPrice: 'unitPrice',
    price: 'price',         // line total
    size: 'size',
    colour: 'colour',
    brand: 'brand',
    remark: 'remark',
    section: 'section',
    no: 'no',               // row index column
};

/** Normalised header hint → field (longest match wins; order matters). */
const SYNONYM_MAP = [
    // item / description
    [/description/, FIELDS.item], [/desc\b/, FIELDS.item], [/^item\b/, FIELDS.item],
    [/^items\b/, FIELDS.item], [/^product/, FIELDS.item], [/^barang/, FIELDS.item],
    [/^material/, FIELDS.item], [/nama material/, FIELDS.item], [/detail/, FIELDS.item],
    [/particular/, FIELDS.item], [/goods/, FIELDS.item], [/^name/, FIELDS.item],
    // quantity
    [/qty required/, FIELDS.quantity], [/qty\b/, FIELDS.quantity], [/^quantity/, FIELDS.quantity],
    [/^jumlah/, FIELDS.quantity], [/^kuantiti/, FIELDS.quantity], [/total qty/, FIELDS.quantity],
    // price — checked BEFORE unit so "unit price" wins over "unit"
    [/unit price/, FIELDS.unitPrice], [/price\/unit/, FIELDS.unitPrice], [/rate\b/, FIELDS.unitPrice],
    [/^price/, FIELDS.unitPrice], [/harga seunit/, FIELDS.unitPrice], [/harga unit/, FIELDS.unitPrice],
    // unit
    [/^uom/, FIELDS.unit], [/^unit\b(?!\s*price)/, FIELDS.unit], [/satuan/, FIELDS.unit], [/^pak/, FIELDS.unit],
    // amount / total
    [/^total\b/, FIELDS.price], [/^amount\b/, FIELDS.price], [/^sub.?total/, FIELDS.price],
    [/jumlah harga/, FIELDS.price], [/total price/, FIELDS.price], [/nilai\b/, FIELDS.price],
    // size / dimensions
    [/^size\b/, FIELDS.size], [/dimension/, FIELDS.size], [/^dim\b/, FIELDS.size],
    [/ukuran/, FIELDS.size], [/thickness/, FIELDS.size], [/ketebalan/, FIELDS.size],
    // colour
    [/colour/, FIELDS.colour], [/^color/, FIELDS.colour], [/warna/, FIELDS.colour],
    // brand / code / spec / remark
    [/^brand/, FIELDS.brand], [/jenama/, FIELDS.brand], [/code\b/, FIELDS.code],
    [/part no/, FIELDS.code], [/^no\.?$/, FIELDS.no], [/^no\b/, FIELDS.no],
    [/^#/, FIELDS.no], [/model\b/, FIELDS.spec], [/^spec/, FIELDS.spec], [/remark/, FIELDS.remark],
    [/^note\b/, FIELDS.remark], [/^remarks/, FIELDS.remark], [/keterangan/, FIELDS.remark],
    [/section/, FIELDS.section],
];

/**
 * Map detected header columns → semantic field assignments.
 * @param {{row:number,columns:Array}} header from headerDetect
 * @returns {Map<number,string>} columnIndex → field
 */
export const mapColumns = (header) => {
    const assignment = new Map();
    if (!header) return assignment;

    for (const col of header.columns) {
        if (!col.hint) continue;
        for (const [re, field] of SYNONYM_MAP) {
            if (re.test(col.hint)) { assignment.set(col.index, field); break; }
        }
    }

    // Duplicate fields (two "item" columns, two "quantity" columns): keep the
    // first, demote extras to raw-only so they never clobber a mapping.
    const seen = new Map();
    for (const [idx, field] of assignment) {
        if (seen.has(field)) assignment.set(idx, field + '__raw');
        else seen.set(field, idx);
    }
    return assignment;
};

/** Human label for a mapped field (used for diagnostics). */
export const fieldLabel = (field) => {
    const labels = {
        item: 'Item', code: 'Code', spec: 'Specification', quantity: 'Quantity',
        unit: 'Unit', unitPrice: 'Unit Price', price: 'Line Total', size: 'Size',
        colour: 'Colour', brand: 'Brand', remark: 'Remark', section: 'Section',
        no: 'Index', item__raw: 'Item (raw)', quantity__raw: 'Qty (raw)',
    };
    return labels[field] || field;
};