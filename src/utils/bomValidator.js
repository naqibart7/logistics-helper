/**
 * bomValidator.js — Hybrid Logistics Compiler, Pass 2 (Deterministic "Physics").
 *
 * Probabilistic injection (Pass 1) is `bomPredictor`. This module is the
 * deterministic pre-flight gate that guarantees Zero-Omission before a PO:
 *
 *   1. Dependency Traversal  — families that require accessories (drywall →
 *      screws + tape + compound). Missing requisites emit CRITICAL_MISSING_DEPENDENCY.
 *   2. Pack-Size Quantization — Q_final = ceil(Q_draft × (1+W) / P) × P, so no
 *      fractional / short order ever ships.
 *   3. Unit Homogeneity — dimensional compatibility in a family (pipe vs
 *      fitting sizes) emits CONFLICT_WARNING.
 *
 * Strictly catalog-bounded: a missing SKU is only ever reported when that SKU
 * actually exists in the Canonical Catalog. Nothing is invented here.
 */
import { recognizeMaterial } from './excelParser/recognize.js';

const keyOf = (s) => String(s || '').toLowerCase();

/** Catalog item that recognizes a raw text; null when out-of-distribution. */
const catOf = (name, catalog, section) => {
    const m = recognizeMaterial(name, catalog, { section: section || '' });
    return m && m.hit === 'catalog' ? { name: m.name, m } : null;
};

/* ── Dependency Graph G (catalog-filtered accessory rules) ─────────────────── */
/** parent keywords → required accessory keyword matchers */
const DEPENDENCIES = [
    {
        parents: /(gypsum|plaster|drywall board)/i,
        requires: [
            { kw: /(drywall screw|screw)/i, role: 'fastener' },
            { kw: /(joint tape|mesh tape)/i, role: 'jointing' },
            { kw: /(joint compound|compound)/i, role: 'finishing' },
        ],
    },
    {
        parents: /(pvc pipe|pvc conduit|pvc pipe )/i,
        requires: [
            { kw: /(pvc (pipe )?(glue|solvent|cement))/i, role: 'adhesive' },
            { kw: /(pvc (pipe )?(elbow|fitting|connector))/i, role: 'joint' },
        ],
    },
    {
        parents: /(emulsion|paint)/i,
        requires: [
            { kw: /(masking tape)/i, role: 'masking' },
        ],
    },
];

/* ── Waste factors W by discipline (fractional-shortage insurance) ─────────── */
const WASTE = [
    { kw: /(tile|ceramic)/i, w: 0.15 },
    { kw: /(gypsum|plaster|drywall)/i, w: 0.1 },
    { kw: /(paint|emulsion)/i, w: 0.1 },
    { kw: /(plywood|timber|wood)/i, w: 0.1 },
];
const wasteOf = (name) => {
    const hit = WASTE.find(r => r.kw.test(name));
    return hit ? hit.w : 0;
};

/** Best-effort pack size P from unit + name. Continuous units → NaN (skip). */
const DISCRETE_UNITS = new Set(['pcs', 'piece', 'pieces', 'no', 'pc', 'box', 'bag', 'pack', 'roll', 'rolls', 'set', 'unit', 'carton']);
const CONTAINER_UNITS = new Set(['box', 'bag', 'pack', 'roll', 'rolls', 'set', 'carton']);
const packOf = (itemName, unit) => {
    const u = keyOf(unit || 'pcs');
    if (!DISCRETE_UNITS.has(u)) return NaN; // continuous unit — quantization ignored
    if (CONTAINER_UNITS.has(u)) return 1;   // a box/bag/roll is already one order unit
    const m = String(itemName).match(/(\d+[\d,.]*)\s*(pcs|pieces|units?)/i) ||
        String(itemName).match(/box\s*(?:of\s*|\()?(\d+[\d,.]*)/i);
    return m ? Math.max(1, Math.round(parseFloat(m[1].replace(/,/g, '')))) : 1;
};

/* ── Unit homogeneity: extract a dimensional token for a family ────────────── */
const sizeToken = (name) => {
    const m = String(name).match(/(\d+(?:\.\d+)?)\s*(mm|cm|in|inch|"|ft|feet)/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    const u = keyOf(m[2]).includes('in') || m[2] === '"' ? 'in' : (keyOf(m[2]).includes('mm') ? 'mm' : keyOf(m[2]).includes('cm') ? 'cm' : 'ft');
    return { value: u === 'inch' || u === 'in' ? v : u === 'mm' ? v / 25.4 : u === 'cm' ? v / 2.54 : v * 12, label: `${m[1]}${m[2]}` };
};

/* ── THE DETERMINISTIC PASS ─────────────────────────────────────────────────── */
/**
 * Full pre-flight validation of a draft against the dependency graph, pack
 * sizes and unit space.
 * @returns {{
 *   quantized_adjustments: Array<{sku, raw_qty, final_qty, reason}>,
 *   critical_dependencies: Array<{parent_sku, missing_sku, risk_level}>,
 *   unit_conflicts: Array<{item_a, item_b, reason}>
 * }}
 */
export const validateDraft = (draft = [], catalog = []) => {
    const rows = Array.isArray(draft) ? draft : [];
    const resolved = rows
        .map(r => ({ r, c: catOf(r.item || r.original, catalog, r.section) }))
        .filter(x => x.c);

    /* 1) Dependency traversal */
    const critical_dependencies = [];
    const seenPair = new Set();
    for (const { r, c } of resolved) {
        for (const rule of DEPENDENCIES) {
            if (!rule.parents.test(c.name)) continue;
            for (const req of rule.requires) {
                const available = (catalog || []).find(item => req.kw.test(item.name));
                if (!available) continue; // no such SKU → cannot report (no hallucination)
                const exists = resolved.some(({ c: cc }) => req.kw.test(cc.name));
                if (exists) continue;
                const pairKey = `${c.name}::${available.name}`;
                if (seenPair.has(pairKey)) continue;
                seenPair.add(pairKey);
                critical_dependencies.push({
                    parent_sku: c.name,
                    missing_sku: available.name,
                    risk_level: 'critical',
                });
            }
        }
    }

    /* 2) Pack-size quantization (Q_final = ceil(Q×(1+W)/P)×P) */
    const quantized_adjustments = [];
    for (const { r, c } of resolved) {
        const q = Number(r.quantity) || Number(r.qty);
        if (!Number.isFinite(q) || q <= 0) continue;
        const P = packOf(c.name, r.unit);
        if (!Number.isFinite(P)) continue; // continuous unit — skip
        const W = wasteOf(c.name);
        const final = Math.ceil((q * (1 + W)) / P) * P;
        if (final > q && (P > 1 || W > 0)) {
            const reasons = [];
            if (W > 0) reasons.push('waste');
            if (P > 1) reasons.push('pack_size');
            quantized_adjustments.push({
                sku: c.name,
                raw_qty: q,
                final_qty: final,
                reason: reasons.join('|'),
            });
        }
    }

    /* 3) Unit homogeneity within a connected family (pipe vs fitting) */
    const unit_conflicts = [];
    const pipeFamily = resolved.filter(({ c }) => /(pipe|pvc)/i.test(c.name));
    for (let i = 0; i < pipeFamily.length; i++) {
        for (let j = i + 1; j < pipeFamily.length; j++) {
            const a = pipeFamily[i], b = pipeFamily[j];
            const sa = sizeToken(a.c.name), sb = sizeToken(b.c.name);
            if (sa && sb && Math.abs(sa.value - sb.value) > 1e-6) {
                unit_conflicts.push({
                    item_a: a.c.name,
                    item_b: b.c.name,
                    reason: `${sa.label} vs ${sb.label} — dimensional_mismatch`,
                });
            }
        }
    }

    return { quantized_adjustments, critical_dependencies, unit_conflicts };
};

/** True when the draft carries any unresolved CRITICAL_MISSING_DEPENDENCY. */
export const hasCritical = (draft, catalog) => validateDraft(draft, catalog).critical_dependencies.length > 0;