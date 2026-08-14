/**
 * quickKitEngine.js — Quick-Kit Curation & Injection Engine.
 *
 * Two-source kit resolution, gated by deterministic validation:
 *
 *  1. STRUCTURAL KITS (manual, `src/data/structuralKits.js`) encode PHYSICS.
 *     They are authoritative and parameterized by ratio formulas. When their
 *     `driver` matches a draft row, `required` components are injected and
 *     `optional` components are suggested — but ONLY when every component
 *     resolves to a live Canonical Catalog SKU and the dimensional-homogeneity
 *     check passes.
 *
 *  2. DISCOVERED KITS (learned) encode PATTERNS. They are candidates only:
 *     discovered from the co-occurrence matrix the compiler already builds,
 *     they carry a confidence score and require human approval
 *     (`approveLearnedKit`) before they may inject anything. Unapproved
 *     learned accessories surface as `suggestions` with `learned_candidate`.
 *
 *  RETRACTION — the engine is a pure function of the current draft delta. If a
 *  kit's driver is removed from the draft the kit stops firing, so its
 *  injections are naturally absent from the next pass. `retractKitInjections`
 *  additionally prunes previously-added `{fromKit}` rows whose driver vanished.
 *
 *  STRICT CONSTRAINTS honoured:
 *    - Never invent a SKU. `resolveKitSku` only returns live catalog items.
 *    - Never inject a `required` component without a resolvable SKU.
 *    - Never promote a learned kit without human approval.
 *
 *  Output JSON contract:
 *    {
 *      injections:  [{ sku, qty, source: 'manual' | 'learned' }],
 *      suggestions: [{ sku, reason: 'optional' | 'learned_candidate' }],
 *      blocked:     [{ sku, reason: 'unresolved' | 'conflict' }]
 *    }
 */
import { recognizeMaterial } from './excelParser/recognize.js';
import { STRUCTURAL_KITS } from '../data/structuralKits.js';
import { packOf, detectArea, sizeToken, matchingFitting, wasteOf } from './bomValidator.js';

const keyOf = (s) => String(s || '').toLowerCase();
const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : NaN);

/* ── learned-kit store (candidates require approval) ───────────────────────── */
const LEARNED_KEY = 'logistics.learnedKits.v1';

const readStore = () => {
    try { return JSON.parse(globalThis.localStorage?.getItem(LEARNED_KEY) || '{}') || {}; }
    catch { return {}; }
};
const writeStore = (s) => {
    try { globalThis.localStorage?.setItem(LEARNED_KEY, JSON.stringify(s)); } catch { /* noop */ }
};

/**
 * Discover candidate kits from the co-occurrence matrix. A candidate is a
 * `driver` key with high-support accessory neighbors (pair count / driver
 * presence ≥ P_THRESHOLD). Candidates carry a confidence and are stored for
 * human approval; left unpromoted they never inject.
 * @param {object} matrix  – output of buildCooccurrence
 * @param {number} [threshold] – support gate (default 0.85)
 * @returns {object} map driverKey → {kitId, candidate:{sku,confidence}}
 */
export const discoverLearnedKits = (matrix, threshold = 0.85) => {
    const { pair = {}, totals = {} } = matrix || {};
    const store = readStore();
    const discovered = {};
    for (const [k, count] of Object.entries(pair)) {
        const [a, b] = k.split('\u0000');
        const supportA = count / (totals[a] || 1);
        const supportB = count / (totals[b] || 1);
        // the accessory is the end that appears more often with the other
        const acc = supportA >= supportB ? b : a;
        const driver = supportA >= supportB ? a : b;
        const conf = Math.max(supportA, supportB);
        if (conf < threshold) continue;
        discovered[driver] = {
            kitId: `learned::${driver}::${acc}`,
            candidate: { sku: acc, confidence: conf },
        };
    }
    writeStore({ ...store, discovered: { ...(store.discovered || {}), ...discovered } });
    return discovered;
};

/** Human approval — the ONLY way a learned kit becomes injectable. */
export const approveLearnedKit = (kitId) => {
    const store = readStore();
    const approved = store.approved || {};
    approved[kitId] = { approvedAt: Date.now() };
    writeStore({ ...store, approved });
    return true;
};

/** Approved learned candidates (now treated like structural kits). */
export const getApprovedLearnedKits = () => {
    const store = readStore();
    const approved = store.approved || {};
    const discovered = store.discovered || {};
    const kits = [];
    const seen = new Set();
    for (const [cid, { candidate, kitId }] of Object.entries(discovered)) {
        if (!approved[kitId]) continue;
        if (seen.has(candidate.sku)) continue; // one accessory per unique SKU
        seen.add(candidate.sku);
        kits.push({
            id: kitId,
            driver: new RegExp(keyOf(cid).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
            source: 'learned',
            required: [{ sku: candidate.sku, qtyFormula: { per: 'driver', factor: 1 } }],
            optional: [],
        });
    }
    return kits;
};

/**
 * Retract kit-injected rows whose driver has vanished from the draft.
 *
 * Materials added via a kit injection are tagged `{ fromKit: <driverName> }` by
 * the panel. Given the current draft's recognized item names, any tagged row
 * whose driver is no longer present is returned so the caller can drop it.
 * Untagged/manual rows are never auto-pruned.
 * @param {Array} rows  – the full BOM rows (may carry { fromKit } tags)
 * @param {Array} draft – the current draft rows
 * @returns {Array} rows that should be pruned
 */
export const retractKitInjections = (rows, draft) => {
    const recognized = (r) => {
        const n = r && (r.item || r.original);
        return n ? keyOf(String(n)) : '';
    };
    const driverNames = new Set((draft || []).map(recognized).filter(Boolean));
    const hasDriver = (tag) => {
        if (!tag) return true; // untagged → caller's decision, never auto-prune
        const t = keyOf(String(tag));
        return [...driverNames].some(d => d === t || d.includes(t) || t.includes(d));
    };
    return (rows || []).filter(r => {
        if (r && typeof r.fromKit === 'string' && r.fromKit) return !hasDriver(r.fromKit);
        return false;
    });
};

/* ── SKU resolution (strictly catalog-bounded) ─────────────────────────────── */
/**
 * Resolve a kit SKU to a live Canonical Catalog item.
 *
 * Resolution is EXACT-NAME ONLY. Kit components are authoritative references
 * to precise catalog names; fuzzy matching would let an invented SKU ("Unicorn
 * Wing") drift onto a real-but-wrong item ("1186 UNICORN") and inject the
 * wrong material. A component that is not an exact catalog name is
 * deliberately UNRESOLVED (blocked), never guessed at.
 */
export const resolveKitSku = (sku, catalog) => {
    const list = Array.isArray(catalog) ? catalog : [];
    return list.find(c => keyOf(c.name) === keyOf(sku)) || null;
};

/* ── quantity formula + pack quantization ──────────────────────────────────── */
const evalFormula = (formula, { driverQty = 1, area = 0 } = {}) => {
    const f = formula || {};
    if (f.fixed !== undefined) return Number(f.fixed) || 0;
    if (f.per === 'driver') return (driverQty || 1) * (Number(f.factor) || 0);
    if (f.per === 'area') return (Number(area) || 0) * (Number(f.factor) || 0);
    return 0;
};

/** Q_final = ceil(Q_raw / P) × P using the live item's pack size. */
const quantize = (raw, sku, unit, item) => {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    const P = packOf(sku, unit || 'pcs', item);
    // continuous units: still round UP so a kit never ships a fractional order
    const final = Number.isFinite(P) ? Math.ceil(raw / P) * P : Math.ceil(raw);
    return Math.max(1, final);
};

/* ── driver matching ───────────────────────────────────────────────────────── */
export const matchKitDriver = (kit, draft, catalog) => {
    for (const r of Array.isArray(draft) ? draft : []) {
        const name = r.item || r.original;
        if (!name) continue;
        const rec = recognizeMaterial(name, catalog, { section: r.section || '' });
        const probe = rec && rec.hit === 'catalog' ? rec.name : String(name);
        // kit drivers are EXACT names (manual kits reference catalog SKUs,
        // learned drivers are matrix keys) — a raw draft name that is itself
        // an exact catalog hit must match too, even when recognition folds a
        // superset name ("Plasterboard Screws") onto a shorter sibling.
        if (kit.driver && kit.driver.test(probe)) {
            return { name: probe, qty: num(r.quantity) || num(r.qty) || 1 };
        }
        const exact = resolveKitSku(String(name), catalog);
        if (kit.driver && exact && kit.driver.test(exact.name)) {
            return { name: exact.name, qty: num(r.quantity) || num(r.qty) || 1 };
        }
    }
    return null;
};

/* ── dimensional homogeneity WITHOUT inventing a SKU ───────────────────────── */
const FIT_KINDS = /(elbow|tee|coupling|connector|cap|reducer|union|bend|fitting|socket|junction)/i;

const dimensionCheck = (driverName, kit, resolved, catalog) => {
    if (!kit.dimensionFamily) return null;
    const family = kit.dimensionFamily;
    if (!family.test(driverName)) return null;
    const want = sizeToken(driverName);
    if (!want) return null;
    for (const member of resolved) {
        if (!family.test(member.sku)) continue;
        const got = sizeToken(member.sku);
        if (got && Math.abs(got.value - want.value) > 1e-6) {
            // resolution = a fitting of the CORRECT size, never the driver itself
            const resolution = matchingFitting(catalog, FIT_KINDS, want) ||
                (catalog || []).find(c => c.name !== driverName && FIT_KINDS.test(c.name) && (() => { const t = sizeToken(c.name); return t && Math.abs(t.value - want.value) < 1e-6; })())?.name;
            return { sku: member.sku, reason: 'conflict', resolution_sku: resolution || undefined };
        }
    }
    return null;
};

/* ── THE INJECTION PROTOCOL ────────────────────────────────────────────────── */
/**
 * @param {Array} draft  – current BOM rows
 * @param {Array} catalog – canonical catalog
 * @param {object} [ctx] – { area } project area in m²
 * @param {object} [opts] – { kits: additional custom kits, approveThreshold }
 * @returns {{injections, suggestions, blocked}}
 */
export const runKitEngine = (draft = [], catalog = [], ctx = {}, opts = {}) => {
    const allKits = [...(opts.kits || []), ...STRUCTURAL_KITS, ...getApprovedLearnedKits()];
    const area = Number(ctx.area) || detectArea(draft, ctx.area) || 0;
    const injections = [];
    const suggestions = [];
    const blocked = [];
    const injectedSku = new Set();

    for (const kit of allKits) {
        const driver = matchKitDriver(kit, draft, catalog);
        if (!driver) continue; // driver removed → retraction is automatic

        const resolved = [];
        for (const comp of kit.required || []) {
            const item = resolveKitSku(comp.sku, catalog);
            if (!item) {
                blocked.push({ sku: comp.sku, reason: 'unresolved' });
                continue;
            }
            resolved.push({ comp, item });
        }
        // dimensional homogeneity — only when the kit declares a family
        const conflict = dimensionCheck(driver.name, kit, resolved.map(r => ({ sku: r.item.name })), catalog);
        if (conflict) {
            blocked.push({ sku: conflict.sku, reason: 'conflict', resolution_sku: conflict.resolution_sku });
            continue;
        }

        for (const { comp, item } of resolved) {
            if (injectedSku.has(item.name)) continue;
            injectedSku.add(item.name);
            const raw = evalFormula(comp.qtyFormula, { driverQty: driver.qty, area });
            const qty = quantize(raw, item.name, comp.unit || item.unit, item);
            if (qty === null) continue;
            injections.push({ sku: item.name, qty, source: kit.source || 'manual', kit: kit.id, driver: driver.name });
        }

        for (const comp of kit.optional || []) {
            if (injectedSku.has(comp.sku)) continue;
            const item = resolveKitSku(comp.sku, catalog);
            if (!item) continue; // optional: silently skipped when unresolvable
            suggestions.push({ sku: item.name, reason: 'optional' });
        }
    }

    /* unapproved learned candidates → suggestions only (never inject).
     * Approved learned kits already injected via the main loop, so skip any
     * candidate whose kitId was approved. */
    const store = readStore();
    const approvedMap = store.approved || {};
    const cached = store.discovered || {};
    for (const [driverKey, entry] of Object.entries(cached)) {
        if (approvedMap[entry.kitId]) continue; // already a learned injection
        const probe = keyOf(String(driverKey));
        const driverHit = (draft || []).some(r => {
            const name = r.item || r.original;
            if (!name) return false;
            // matrix keys are the ACTUAL recognized names from the compiler —
            // match either the raw draft text or its recognized catalog name
            const raw = keyOf(String(name));
            if (probe === raw) return true;
            const rec = recognizeMaterial(name, catalog, { section: r.section || '' });
            return probe === keyOf(rec && rec.hit === 'catalog' ? rec.name : String(name));
        });
        if (!driverHit) continue;
        const item = resolveKitSku(entry.candidate.sku, catalog);
        if (!item || injectedSku.has(item.name)) continue;
        injectedSku.add(item.name);
        suggestions.push({ sku: item.name, reason: 'learned_candidate', kitId: entry.kitId, confidence: Math.round(entry.candidate.confidence * 100) / 100 });
    }

    return { injections, suggestions, blocked };
};

/** One-call convenience for tests/App: structural kits in a clean delta. */
export const quickKitDelta = (draft, catalog, ctx, opts) => runKitEngine(draft, catalog, ctx, opts);

// keep wasteOf import referenced for reuse by callers
export { wasteOf };