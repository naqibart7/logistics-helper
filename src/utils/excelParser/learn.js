/**
 * learn.js — Learning Knowledge Base (stage 14).
 *
 * A growing, supplier-aware correction store persisted in localStorage.
 * Whenever the user edits a parsed result, call `recordCorrection(...)` so the
 * NEXT parse automatically applies the correction for the same supplier +
 * original text — the user should never fix the same thing twice.
 *
 * Storage is capped to avoid unbounded growth and is namespaced per app key.
 */

const LS_KEY = 'logistics.parser.knowledge.v1';
const MAX_ENTRIES = 2000;

export const loadKnowledge = () => {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return { corrections: [], supplierProfile: {} };
        const parsed = JSON.parse(raw);
        return {
            corrections: Array.isArray(parsed.corrections) ? parsed.corrections : [],
            supplierProfile: parsed.supplierProfile || {},
        };
    } catch {
        return { corrections: [], supplierProfile: {} };
    }
};

const saveKnowledge = (kb) => {
    try {
        if (kb.corrections.length > MAX_ENTRIES) {
            kb.corrections = kb.corrections.slice(-MAX_ENTRIES);
        }
        localStorage.setItem(LS_KEY, JSON.stringify(kb));
    } catch { /* storage full / unavailable — non-fatal */ }
};

/**
 * Find a correction that applies to a given supplier + original text.
 * @param {string} supplier
 * @param {string} original
 * @returns {object|undefined}
 */
export const lookupCorrection = (supplier, original) => {
    const kb = loadKnowledge();
    const key = (original || '').trim().toLowerCase();
    if (!key) return undefined;
    return kb.corrections.find(
        c => c.original.toLowerCase() === key && (!c.supplier || !supplier || c.supplier === supplier || c.supplier === '*')
    );
};

/**
 * Store a correction. supplier may be a real supplier or '*' for global rules.
 */
export const recordCorrection = ({ supplier = '*', original, corrected }) => {
    const kb = loadKnowledge();
    const key = (original || '').trim();
    if (!key || !corrected) return kb;
    const existing = kb.corrections.find(c =>
        c.supplier === supplier && c.original === key
    );
    if (existing) {
        existing.corrected = { ...existing.corrected, ...corrected };
        existing.updatedAt = Date.now();
    } else {
        kb.corrections.push({ supplier, original: key, corrected, createdAt: Date.now(), updatedAt: Date.now() });
    }
    saveKnowledge(kb);
    return kb;
};

/** Record which columns/sections a supplier typically uses, for profiling. */
export const recordSupplierProfile = (supplier, profile) => {
    const kb = loadKnowledge();
    if (!supplier) return;
    kb.supplierProfile[supplier] = { ...(kb.supplierProfile[supplier] || {}), ...profile, updatedAt: Date.now() };
    saveKnowledge(kb);
};

/** Export the knowledge base (diagnostics / backup). */
export const exportKnowledge = () => loadKnowledge();