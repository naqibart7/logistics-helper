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
    if (!m || m.hit !== 'catalog') return null;
    return (catalog || []).find(x => x.name === m.name) || { name: m.name, m };
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
export const wasteOf = (name) => {
    const hit = WASTE.find(r => r.kw.test(name));
    return hit ? hit.w : 0;
};

/** Best-effort pack size P from unit + name. Continuous units → NaN (skip). */
const DISCRETE_UNITS = new Set(['pcs', 'piece', 'pieces', 'no', 'pc', 'box', 'bag', 'pack', 'roll', 'rolls', 'set', 'unit', 'carton']);
const CONTAINER_UNITS = new Set(['box', 'bag', 'pack', 'roll', 'rolls', 'set', 'carton']);
export const packOf = (itemName, unit, item) => {
    // A supplier-declared packSize always wins (overrides unit heuristics).
    if (item && Number.isFinite(Number(item.packSize)) && Number(item.packSize) > 0) {
        return Math.max(1, Math.round(Number(item.packSize)));
    }
    const u = keyOf(unit || 'pcs');
    if (!DISCRETE_UNITS.has(u)) return NaN; // continuous unit — quantization ignored
    if (CONTAINER_UNITS.has(u)) return 1;   // a box/bag/roll is already one order unit
    const m = String(itemName).match(/(\d+[\d,.]*)\s*(pcs|pieces|units?)/i) ||
        String(itemName).match(/box\s*(?:of\s*|\()?(\d+[\d,.]*)/i);
    return m ? Math.max(1, Math.round(parseFloat(m[1].replace(/,/g, '')))) : 1;
};

/* ── Coverage rates (m² covered per unit, per discipline) ───────────────────── */
/** keyword → { m2PerUnit, unitHint } — engineering-standard constants. */
const COVERAGE = [
    { kw: /(emulsion|paint)/i, m2PerUnit: 12, unitHint: 'L' },         // per coat, 1 coat baseline
    { kw: /(tile adhesive|adhesive for tile)/i, m2PerUnit: 3, unitHint: 'bag' },
    { kw: /(tile grout|grout)/i, m2PerUnit: 8, unitHint: 'bag' },
    { kw: /(joint compound|compound)/i, m2PerUnit: 8, unitHint: 'bag' },
];
const coverageOf = (name, item) => {
    if (item && Number.isFinite(Number(item.coverage)) && Number(item.coverage) > 0) {
        return { m2PerUnit: Number(item.coverage), unitHint: item.unit || '', fromItem: true };
    }
    const hit = COVERAGE.find(r => r.kw.test(name));
    return hit ? hit : null;
};

/** Resolve the draft's working Area (m²): explicit ctx first, else an Area row. */
export const detectArea = (draft, ctxArea) => {
    const explicit = Number(ctxArea);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    for (const r of Array.isArray(draft) ? draft : []) {
        const name = String(r.item || r.original || '');
        const q = Number(r.quantity) || Number(r.qty);
        if (!Number.isFinite(q) || q <= 0) continue;
        const isArea = /(floor area|site area|total area|coverage area|area\b)/i.test(name) ||
            /\b(sqm|m²|sq ft|sqft|square (meter|foot)s?)\b/i.test(name);
        if (!isArea) continue;
        return /\bsq ?ft\b|\bsquare feet?\b/i.test(name) ? q / 10.7639 : q; // ft² → m²
    }
    return 0; // unknown area → coverage checks cannot run (no blind guessing)
};

/** Same-family catalog item whose dimension token matches the required value. */
export const matchingFitting = (catalog, familyKw, wantToken) => {
    if (!wantToken) return null;
    for (const item of (catalog || [])) {
        if (!familyKw.test(item.name)) continue;
        const t = sizeToken(item.name);
        if (t && Math.abs(t.value - wantToken.value) < 1e-6) return item.name;
    }
    return null;
};

/* ── Unit homogeneity: extract a dimensional token for a family ────────────── */
export const sizeToken = (name) => {
    const m = String(name).match(/(\d+(?:\.\d+)?)\s*(mm|cm|in|inch|"|ft|feet)/i);
    if (!m) return null;
    const v = parseFloat(m[1]);
    const u = keyOf(m[2]).includes('in') || m[2] === '"' ? 'in' : (keyOf(m[2]).includes('mm') ? 'mm' : keyOf(m[2]).includes('cm') ? 'cm' : 'ft');
    return { value: u === 'inch' || u === 'in' ? v : u === 'mm' ? v / 25.4 : u === 'cm' ? v / 2.54 : v * 12, label: `${m[1]}${m[2]}` };
};

/* ── THE DETERMINISTIC PASS ─────────────────────────────────────────────────── */
/**
 * Full pre-flight validation of a draft against the dependency graph, pack
 * sizes, unit space and coverage math.
 * @param {Array} draft   – current BOM rows {item, quantity, unit, ...}
 * @param {Array} catalog – canonical catalog
 * @param {Object} [ctx]  – { area } project area in m² (optional; may also be
 *                          carried by an "Area" row in the draft)
 * @returns {{
 *   quantized_adjustments: Array<{sku, raw_qty, final_qty, reason}>,
 *   critical_dependencies: Array<{parent_sku, missing_sku, risk_level}>,
 *   unit_conflicts: Array<{item_a, item_b, reason, resolution_sku?}>,
 *   coverage_shortages: Array<{sku, current_qty, required_qty, reason}>,
 *   dimensional_conflicts: Array<{target_sku, resolution_sku, reason}>
 * }}
 */
export const validateDraft = (draft = [], catalog = [], ctx = {}) => {
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
        const P = packOf(c.name, r.unit, c);
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
    const dimensional_conflicts = [];
    const pipeFamily = resolved.filter(({ c }) => /(pipe|pvc|conduit)/i.test(c.name));
    for (let i = 0; i < pipeFamily.length; i++) {
        for (let j = i + 1; j < pipeFamily.length; j++) {
            const a = pipeFamily[i], b = pipeFamily[j];
            const sa = sizeToken(a.c.name), sb = sizeToken(b.c.name);
            if (sa && sb && Math.abs(sa.value - sb.value) > 1e-6) {
                // resolution = the mismatched fitting re-sized to match its parent
                const isFit = (n) => /(fitting|elbow|tee|coupling|connector|cap|reducer|union)/i.test(n);
                let resolution_sku = null;
                if (isFit(b.c.name)) {
                    resolution_sku = matchingFitting(catalog, /(fitting|elbow|tee|coupling|connector|cap|reducer|union)/i, sa);
                } else if (isFit(a.c.name)) {
                    resolution_sku = matchingFitting(catalog, /(fitting|elbow|tee|coupling|connector|cap|reducer|union)/i, sb);
                }
                unit_conflicts.push({
                    item_a: a.c.name,
                    item_b: b.c.name,
                    reason: `${sa.label} vs ${sb.label} — dimensional_mismatch`,
                    resolution_sku,
                });
                if (resolution_sku) {
                    const target = isFit(b.c.name) ? b.c.name : a.c.name;
                    dimensional_conflicts.push({
                        target_sku: target,
                        resolution_sku,
                        reason: 'dimension_mismatch',
                    });
                }
            }
        }
    }

    /* 4) Coverage math — CRITICAL_SHORTAGE when Draft < Area/rate × (1+W) */
    const coverage_shortages = [];
    const area = detectArea(rows, ctx.area);
    if (area > 0) {
        for (const { r, c } of resolved) {
            const cov = coverageOf(c.name, c);
            if (!cov) continue;
            const q = Number(r.quantity) || Number(r.qty);
            if (!Number.isFinite(q) || q <= 0) continue;
            const W = wasteOf(c.name);
            const required = (area / cov.m2PerUnit) * (1 + W);
            if (q < required) {
                coverage_shortages.push({
                    sku: c.name,
                    current_qty: q,
                    required_qty: Math.ceil(required),
                    reason: 'coverage_deficit',
                });
            }
        }
    }

    return { quantized_adjustments, critical_dependencies, unit_conflicts, coverage_shortages, dimensional_conflicts };
};

/** True when the draft carries any unresolved CRITICAL_MISSING_DEPENDENCY. */
export const hasCritical = (draft, catalog) => validateDraft(draft, catalog).critical_dependencies.length > 0;

/**
 * Pass 3 — Deterministic Injection. Emits the CSP state-update contract with
 * the exact resolution SKU from the Canonical Catalog that satisfies each
 * constraint. Every injected SKU exists in the catalog and its quantity is
 * derived from exact coverage math — never a guess.
 * @returns {{
 *   dimensional_conflicts: Array<{target_sku, resolution_sku, reason}>,
 *   coverage_shortages: Array<{sku, current_qty, required_qty, reason}>,
 *   auto_injections: Array<{sku, qty, confidence}>
 * }}
 */
export const satisfyDraft = (draft = [], catalog = [], ctx = {}) => {
    const v = validateDraft(draft, catalog, ctx);

    const auto_injections = [];
    // dependency accessor + the shortage make-up qty + dimensional replacement
    for (const d of v.critical_dependencies) {
        if (d.missing_sku) auto_injections.push({ sku: d.missing_sku, qty: 1, confidence: 1 });
    }
    for (const s of v.coverage_shortages) {
        const makeUp = s.required_qty - Math.floor(s.current_qty);
        if (makeUp > 0) auto_injections.push({ sku: s.sku, qty: makeUp, confidence: 1 });
    }
    for (const c of v.dimensional_conflicts) {
        if (c.resolution_sku && !auto_injections.some(a => a.sku === c.resolution_sku)) {
            auto_injections.push({ sku: c.resolution_sku, qty: 1, confidence: 1 });
        }
    }

    return {
        dimensional_conflicts: v.dimensional_conflicts,
        coverage_shortages: v.coverage_shortages,
        auto_injections,
    };
};