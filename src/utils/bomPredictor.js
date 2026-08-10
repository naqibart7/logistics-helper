/**
 * bomPredictor.js — Predictive BOM Compiler (MDP over project contexts).
 *
 * Minimises manual correction by turning the current draft state D into
 * strictly catalog-bounded, structured suggestions. Every emitted SKU is a
 * real item that exists in the Canonical Catalog (or resolves via Quick-Kit
 * catalog items) — nothing is invented.
 *
 * Forward pass per draft change:
 *   1. Semantic mapping — each draft row's raw text is scored against the
 *      catalog; sim >= τ_high (0.94) with aligned unit ⇒ AUTO_INJECT.
 *   2. Co-occurrence inference — P(item_x | D) is read from a matrix learned
 *      from every saved project BOM (seeded with the catalog Quick Kits so the
 *      compiler works before real history accumulates). Suggestions ≥ 0.85.
 *   3. Quantity scaling — accessories inherit the driver's live quantity via
 *      the learned mean ratio vector R (e.g. drywall +100% ⇒ screws +100%).
 *   4. Conflict detection — family rules (wood vs steel framing) emit a
 *      CONFLICT_WARNING with a catalog-resolution SKU.
 *
 * Output is the strictly-typed JSON state-update contract below.
 */
import { recognizeMaterial } from './excelParser/recognize.js';
import { resolveKit, QUICK_KITS } from '../data/catalogHierarchy.js';

export const TAU_HIGH = 0.94;   // aligned unit ⇒ AUTO_INJECT
export const TAU_LOW = 0.6;     // weak hit ⇒ manual/verify
export const P_THRESHOLD = 0.85; // co-occurrence emission gate

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : NaN);
const keyOf = (s) => String(s || '').toLowerCase();

/* ── framing-family rules (catalog-bounded conflict detection) ─────────────── */
const WOOD_FRAMING = /(wood stud|timber stud|wooden stud|2x4|4x2)/i;
const STEEL_FRAMING = /(steel stud|metal stud|iron stud|25ga|22ga)/i;
const isWoodFraming = (name) => WOOD_FRAMING.test(name);
const isSteelFraming = (name) => STEEL_FRAMING.test(name);

/** Canonical catalog key for a draft row; null when out-of-distribution. */
const catalogKey = (name, catalog, section) => {
    const m = recognizeMaterial(name, catalog, { section: section || '' });
    return m && m.hit === 'catalog' ? m.name : null;
};

/* ── Step 0: build the co-occurrence matrix ────────────────────────────────── */
/**
 * Sum (pairs, ratios, project counts) from saved project BOMs, seeded with the
 * catalog Quick Kits so first-use still yields safe accessory suggestions.
 */
export const buildCooccurrence = ({ projects = [], catalog = [] }) => {
    const pair = {};   // "a\u0000b" -> co-occurrences
    const ratio = {};  // "a\u0000b" -> { sum, n }  (qty_b / qty_a)
    const totals = {}; // key -> number of projects containing it
    const edge = (a, b, qa, qb) => {
        // a<->b are canonical keys — never self-edges
        if (!a || !b || a === b) return;
        const k = a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
        pair[k] = (pair[k] || 0) + 1;
        if (num(qa) && num(qb)) {
            const r = qb / qa;
            const prev = ratio[k] || { sum: 0, n: 0 };
            ratio[k] = { sum: prev.sum + r, n: prev.n + 1 };
        }
    };

    const absorb = (list) => {
        const keys = [];
        for (const it of list) {
            if (!it) continue;
            const name = it.item || it.name;
            if (!name) continue;
            const key = catalogKey(name, catalog, it.section);
            if (!key) continue;
            keys.push({ key, qty: it.quantity || it.qty || 1 });
            totals[key] = (totals[key] || 0) + 1;
        }
        for (let i = 0; i < keys.length; i++) {
            for (let j = i + 1; j < keys.length; j++) {
                edge(keys[i].key, keys[j].key, keys[i].qty, keys[j].qty);
            }
        }
    };

    // Seed: Quick Kits resolve to real catalog SKUs (no hallucination).
    for (const kit of QUICK_KITS || []) absorb(resolveKit(kit, catalog || []));
    // Learn: saved project BOMs.
    for (const p of Array.isArray(projects) ? projects : []) absorb(p.materials || []);

    return { pair, ratio, totals };
};

/* ── Step 1: semantic mapping (AUTO_INJECT / SUGGEST_VERIFY) ──────────────── */
/** Classify a raw text line against the canonical catalog. */
export const classifyText = (text, catalog, unit) => {
    if (!text) return { verdict: 'none' };
    const m = recognizeMaterial(text, catalog, {});
    if (!m || m.hit !== 'catalog') return { verdict: 'none', confidence: m && m.confidence };
    const aligned = !unit || !m.unit || keyOf(unit) === keyOf(m.unit);
    const verdict = m.confidence >= TAU_HIGH && aligned ? 'auto' : (m.confidence >= TAU_LOW ? 'verify' : 'none');
    return { verdict, confidence: m.confidence, sku: m.name, unit: m.unit };
};

/* ── Step 3: quantity scaling via learned ratios ──────────────────────────── */
const scaledQty = (suggestion, draftKeys, matrix) => {
    let best = NaN;
    for (const d of draftKeys) {
        if (d.key === suggestion) continue;
        const k = d.key < suggestion ? `${d.key}\u0000${suggestion}` : `${suggestion}\u0000${d.key}`;
        const r = matrix.ratio[k];
        const qa = num(d.qty);
        if (r && r.n && qa) {
            const predicted = (qa * (r.sum / r.n));
            if (Number.isFinite(predicted)) best = Math.max(best, predicted);
        }
    }
    return Number.isFinite(best) ? Math.max(1, Math.round(best)) : 1;
};

/* ── Step 4: family conflicts ──────────────────────────────────────────────── */
const detectConflicts = (suggestions, draftKeys, catalog) => {
    const conflicts = [];
    const draftHasWood = draftKeys.some(d => isWoodFraming(d.key));
    const draftHasSteel = draftKeys.some(d => isSteelFraming(d.key));
    const resolution = (familyTest) => {
        const hit = (catalog || []).find(c => familyTest(c.name));
        return hit ? hit.name : null;
    };
    for (const s of suggestions) {
        if (isWoodFraming(s) && draftHasSteel && !draftHasWood) {
            const res = resolution(isSteelFraming);
            if (res) {
                conflicts.push({
                    target_sku: s,
                    resolution_sku: res,
                    reason: `Wood stud signalled in a steel-framing draft — use ${res} instead.`,
                });
            }
        } else if (isSteelFraming(s) && draftHasWood && !draftHasSteel) {
            const res = resolution(isWoodFraming);
            if (res) {
                conflicts.push({
                    target_sku: s,
                    resolution_sku: res,
                    reason: `Steel stud signalled in a wood-framing draft — use ${res} instead.`,
                });
            }
        }
    }
    return conflicts;
};

/* ── THE INFERENCE PASS ────────────────────────────────────────────────────── */
/**
 * @param {Array}  draft    – current BOM rows {item, quantity, unit, ...}
 * @param {Array}  catalog  – canonical catalog
 * @param {Object} matrix   – result of buildCooccurrence (optional)
 * @returns {{
 *   auto_injections: Array<{sku:string, qty:number, confidence:number}>,
 *   proactive_suggestions: Array<{sku:string, reason:string, suggested_qty:number}>,
 *   conflicts: Array<{target_sku:string, resolution_sku:string, reason:string}>
 * }}
 */
export const predictBOM = (draft = [], catalog = [], matrix = null) => {
    const m = matrix || { pair: {}, ratio: {}, totals: {} };
    const rows = Array.isArray(draft) ? draft : [];

    const draftKeys = rows
        .map(r => {
            const key = catalogKey(r.item || r.original, catalog, r.section);
            if (!key) return null;
            return { key, qty: num(r.quantity) || num(r.qty) || 1, unit: r.unit };
        })
        .filter(Boolean);
    const present = new Set(draftKeys.map(d => d.key));

    /* 1) Semantic mapping — recognised rows with unit alignment auto-carry. */
    const auto_injections = rows
        .map(r => {
            const cls = classifyText(r.item || r.original, catalog, r.unit);
            if (cls.verdict !== 'auto') return null;
            return { sku: cls.sku, qty: Math.max(1, Math.round(num(r.quantity) || num(r.qty) || 1)), confidence: Math.round(cls.confidence * 100) / 100 };
        })
        .filter(Boolean);

    /* 2) Co-occurrence — P(item_x | D) >= 0.85, top-k=4. */
    const scores = new Map();
    for (const d of draftKeys) {
        for (const [k, count] of Object.entries(m.pair)) {
            const [a, b] = k.split('\u0000');
            const neighbor = a === d.key ? b : (b === d.key ? a : null);
            if (!neighbor || present.has(neighbor)) continue;
            scores.set(neighbor, (scores.get(neighbor) || 0) + count);
        }
    }
    const probe = draftKeys.length || 1;
    const proactive_suggestions = [...scores.entries()]
        .filter(([, c]) => c / probe >= P_THRESHOLD)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 4)
        .map(([sku]) => ({
            sku,
            reason: 'co_occurrence',
            suggested_qty: scaledQty(sku, draftKeys, m),
        }));

    const conflicts = detectConflicts(proactive_suggestions.map(s => s.sku), draftKeys, catalog);

    return { auto_injections, proactive_suggestions, conflicts };
};