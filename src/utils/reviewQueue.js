/**
 * reviewQueue.js — persistent human-in-the-loop queue (out-of-distribution bin).
 *
 * Rows that failed the parser's confidence threshold (τ = 0.6) are parked here
 * instead of silently dropped or hallucinated. A human either:
 *   1. Rounds it to a corrected canonical name → `resolveReviewRow` records a
 *      knowledge-base correction so the same supplier+text parses confidently
 *      on the next import (mirrors ImportPreview's edit-to-learn), or
 *   2. Discards it as noise (TOTAL/Signature/thank-you lines that slipped
 *      through classification).
 *
 * Stateful by design: the queue is persisted so nothing is lost on reload.
 */
import { recordCorrection } from './excelParser/learn.js';

const LS_KEY = 'logistics.reviewQueue.v1';
const MAX_ROWS = 300;

const load = () => {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

const save = (rows) => {
    try {
        if (rows.length > MAX_ROWS) rows = rows.slice(-MAX_ROWS);
        localStorage.setItem(LS_KEY, JSON.stringify(rows));
    } catch { /* storage full / unavailable — non-fatal */ }
    return rows;
};

/** A stable key so re-importing the same supplier+text does not duplicate. */
const rowKey = (r) =>
    `${String(r.supplier || '').toLowerCase()}::${String(r.original || r.item || '').trim().toLowerCase()}`;

export const getReviewQueue = () => load();
export const reviewQueueCount = () => load().length;

/** Park out-of-distribution rows. Returns how many were newly added. */
export const addToReviewQueue = (...newRows) => {
    const rows = load();
    const flat = newRows.flat().filter(Boolean);
    if (!flat.length) return 0;
    const seen = new Set(rows.map(rowKey));
    let added = 0;
    for (const r of flat) {
        const key = rowKey(r);
        if (seen.has(key)) continue;
        rows.unshift({
            key,
            item: r.item || 'Unknown Item',
            original: r.original || r.item || '',
            supplier: r.supplier || '',
            reason: r.reason || 'below confidence threshold',
            confidence: Number(r.confidence) || 0,
            source: r.source || 'excel-v2',
            createdAt: r.createdAt || Date.now(),
        });
        seen.add(key);
        added += 1;
    }
    save(rows);
    return added;
};

export const discardReviewRow = (key) => save(load().filter(row => row.key !== key));

export const clearReviewQueue = () => save([]);

/**
 * Resolve a row to a canonical name and learn from it. Returns the corrected
 * name, or null if the key is unknown.
 */
export const resolveReviewRow = (key, corrected) => {
    const rows = load();
    const row = rows.find(r => r.key === key);
    const canonical = String(corrected || '').trim();
    if (!row || !canonical) return null;
    recordCorrection({
        supplier: row.supplier,
        original: row.original,
        corrected: { item: canonical },
    });
    save(rows.filter(r => r.key !== key));
    return canonical;
};