/**
 * ai.js — AI Fallback (stage 13).
 *
 * Deterministic algorithms run FIRST. Only LOW-confidence rows are sent to the
 * LLM, and only for the narrow, genuinely-contested tasks: ambiguous header
 * mapping, entity extraction from messy rows, and material recognition. This
 * module is OPTIONAL: if no endpoint is configured it returns `null` and the
 * pipeline simply keeps the deterministic (flagged) result — never fabricating
 * certainty, never sending the whole workbook.
 *
 * Contract for the endpoint:
 *   POST <VITE_AI_OCR_ENDPOINT>/excel-enrich
 *   body: { supplier, rows: [ {original, item, quantity, unit, ...}, ... ] }
 *   returns: { enrichments: [ { index, item, quantity, unit, unitPrice, confidence }, ... ] }
 */

const ENDPOINT = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_AI_OCR_ENDPOINT) || '';

/**
 * Ask the LLM to enrich ONLY the supplied low-confidence rows.
 * @param {string} supplier
 * @param {Array<object>} rows — compact uncertain rows (index + fields)
 * @param {number} timeoutMs
 * @returns {Promise<Array|null>} enrichments or null when unavailable/no-op
 */
export const enrichWithAI = async (supplier, rows, timeoutMs = 8000) => {
    if (!ENDPOINT || !rows || rows.length === 0) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(`${ENDPOINT}/excel-enrich`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ supplier, rows }),
            signal: ctrl.signal,
        });
        if (!res.ok) return null;
        const body = await res.json();
        return Array.isArray(body.enrichments) ? body.enrichments : null;
    } catch {
        return null; // AI never breaks a deterministic parse
    } finally {
        clearTimeout(timer);
    }
};

/** True when an AI endpoint is configured at all. */
export const isAIConfigured = () => Boolean(ENDPOINT);