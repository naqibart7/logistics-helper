/**
 * catalogLearning.js — Learn from suppliers & projects.
 *
 * Mines price/supplier intelligence from data the user ALREADY enters:
 *   - project BOM materials (item + pricePerUnit + optional assignedSupplier)
 *   - supplier quotation imports (Excel / supplier files)
 * and stores compact, persistent observations keyed by canonical catalog item.
 * Nothing here changes the catalog price automatically — a BEST price is simply
 * recorded, surfaced in the Catalog tab, and applied only when the user taps
 * "Apply".
 *
 * Matching is via the same fuzzy recogniser the Excel parser uses, so names
 * that have never been seen before still land on the right catalog item.
 */
import { recognizeMaterial } from './excelParser/recognize.js';

const LS_KEY = 'logistics.catalogInsights.v1';
const MAX_SEEN = 4000;

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : NaN);
const keyOf = (s) => String(s || '').toLowerCase();

/** Title-case a supplier name for display while keeping unique keys case-less. */
const displayName = (s) => String(s || '').trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

/** Variant fingerprint: "size:0.5in|colour:black" — empty parts dropped. */
const vfKey = (size, colour) => {
    const parts = [];
    if (size) parts.push(`size:${keyOf(size)}`);
    if (colour) parts.push(`colour:${keyOf(colour)}`);
    return parts.join('|');
};
const vfLabel = (size, colour) => [size, colour].filter(Boolean).join(' · ') || '_';

export const loadStore = () => {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : { items: {}, seen: [] };
    } catch {
        return { items: {}, seen: [] };
    }
};

const saveStore = (store) => {
    try {
        if (store.seen.length > MAX_SEEN) store.seen = store.seen.slice(-MAX_SEEN);
        localStorage.setItem(LS_KEY, JSON.stringify(store));
    } catch { /* non-fatal */ }
};

/** Record one observed row against a matching catalog item. */
const recordEntry = (store, catalog, rawName, opts) => {
    if (!rawName) return;
    const unitPrice = num(opts.unitPrice) || num(opts.pricePerUnit);
    if (!Number.isFinite(unitPrice)) return;

    const match = recognizeMaterial(rawName, catalog, { section: opts.section || '' });
    if (!match || match.hit !== 'catalog' || match.confidence < 0.5) return;

    const key = keyOf(match.name);
    const ins = store.items[key] || {
        key, name: match.name, lowest: Infinity, highest: 0, count: 0, last: 0, unit: opts.unit || 'pcs',
        suppliers: {}, variants: {},
    };
    ins.last = unitPrice;
    if (unitPrice < ins.lowest) ins.lowest = unitPrice;
    if (unitPrice > ins.highest) ins.highest = unitPrice;
    ins.count += 1;
    if (opts.unit) ins.unit = ins.unit === 'pcs' ? opts.unit : ins.unit;
    if (opts.supplier) {
        const sk = keyOf(opts.supplier);
        const prev = ins.suppliers[sk];
        ins.suppliers[sk] = {
            name: prev ? prev.name : displayName(opts.supplier),
            price: unitPrice,
            count: (prev ? prev.count : 0) + 1,
        };
    }
    const vf = vfKey(opts.size, opts.colour);
    if (vf) {
        const prev = ins.variants[vf];
        ins.variants[vf] = {
            label: prev ? prev.label : vfLabel(opts.size, opts.colour),
            best: unitPrice < (prev ? prev.best : Infinity) ? unitPrice : (prev ? prev.best : Infinity),
            count: (prev ? prev.count : 0) + 1,
        };
    }
    store.items[key] = ins;
};

/**
 * Scan projects + suppliers for price intelligence. Idempotent per material id.
 */
export const observeProjects = ({ catalog, projects }) => {
    const store = loadStore();
    const list = Array.isArray(projects) ? projects : [];
    let added = 0;
    for (const p of list) {
        for (const m of (p.materials || [])) {
            const id = String(m.id || `${p.id}-${m.item}`);
            if (store.seen.includes(id)) continue;
            const before = Object.keys(store.items).length;
            recordEntry(store, catalog, m.item, {
                unitPrice: m.unitPrice, pricePerUnit: m.pricePerUnit,
                unit: m.unit, qty: m.quantity,
                supplier: (m.assignedSupplier && m.assignedSupplier.name) || undefined,
                section: m.section || p.name,
                size: m.size || (m.specs && m.specs.size) || undefined,
                colour: m.colour || (m.specs && m.specs.colour) || undefined,
            });
            if (Object.keys(store.items).length > before) store.seen.push(id);
            added += 1;
        }
    }
    saveStore(store);
    return added;
};

/** Record a supplier quotation import (Excel parse output). */
export const observeSupplierImport = ({catalog, supplier, materials}) => {
    const store = loadStore();
    let added = 0;
    for (const m of (materials || [])) {
        recordEntry(store, catalog, m.item || m.original, {
            unitPrice: m.unitPrice, pricePerUnit: m.pricePerUnit,
            unit: m.unit, section: m.section || '',
            supplier,
            size: m.size || (m.specs && m.specs.size) || undefined,
            colour: m.colour || (m.specs && m.specs.colour) || undefined,
        });
        added += 1;
    }
    saveStore(store);
    return added;
};

/** Snapshot of insights for display. */
export const getCatalogInsights = () => {
    const { items } = loadStore();
    return Object.values(items).map(i => ({
        key: i.key, name: i.name, count: i.count, best: i.lowest,
        range: i.highest >= i.lowest && i.highest !== Infinity ? [i.lowest, i.highest] : null,
        last: i.last, unit: i.unit, suppliers: Object.values(i.suppliers),
        variants: Object.values(i.variants || {}).map(v => ({
            ...v, best: v.best === Infinity ? null : v.best,
        })),
    }));
};

/**
 * Apply a learned best price onto the stored catalog (explicit user action).
 * @returns {number} the applied price, or NaN when unknown
 */
export const applyBestPrice = (catalog, itemName) => {
    const { items } = loadStore();
    const ins = items[keyOf(itemName)];
    const best = ins && (ins.lowest !== Infinity ? ins.lowest : ins.last);
    return Number.isFinite(best) ? best : NaN;
};