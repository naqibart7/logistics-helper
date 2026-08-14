/**
 * recognize.js — Material Recognition (stage 8).
 *
 * Maps a supplier's free-text description to an internal catalog item using
 * fuzzy matching (sub-word token overlap + keyword hits + category agreement),
 * never exact spelling. It first consults the learning knowledge base, then the
 * catalog. Returns a 0–1 confidence so the caller can decide whether to trust
 * it or defer the row to the AI fallback.
 */
import { keyOf } from './normalize.js';
import { itemAliases } from '../catalogEnrich.js';

const STOP = new Set(['the', 'and', 'for', 'with', 'type', 'set', 'x', 'of', 'in', '&']);

const IS_NUM = /^\d+(?:\.\d+)?$/;

/**
 * Tokenise a description into usable matching tokens.
 * Decimal sizes ("1.5\"") stay ONE token and single-digit numerics ("3", "4"
 * from "3/4\"") are kept — sizes are the precise discriminators that stop one
 * product matching a sibling ("1\"" must never beat "1.5\"" or "3/4\"").
 */
const tokenize = (s) => keyOf(s)
    .split(/[^a-z0-9.]+/)
    .filter(t => (t.length > 1 || IS_NUM.test(t)) && !STOP.has(t));

const overlapScore = (a, b) => {
    const as = tokenize(a);
    const bs = tokenize(b);
    if (as.length === 0 || bs.length === 0) return 0;
    const setB = new Set(bs);
    const hit = as.filter(t => {
        if (setB.has(t)) return true;
        // numeric tokens match EXACTLY — "1.5" must not prefix-match "1"
        if (IS_NUM.test(t) && bs.some(bt => IS_NUM.test(bt))) return false;
        return bs.some(bt => bt.startsWith(t) || t.startsWith(bt));
    }).length;
    const symmetric = hit / Math.max(Math.min(as.length, bs.length), 1);
    return symmetric;
};

/**
 * Match one description against a flat catalog.
 * @param {string} itemText raw description
 * @param {Array<{name:string,price:number,category?:string}>} flatCatalog
 * @param {object} ctx {section:string} for category agreement bonus
 * @returns {{name?:string, price?:number, confidence:number, hit:string}} 
 */
export const recognizeMaterial = (itemText, flatCatalog, ctx = {}) => {
    if (!itemText || !Array.isArray(flatCatalog) || flatCatalog.length === 0) {
        return { confidence: 0, hit: 'none' };
    }
    const query = keyOf(itemText);
    const sectionKey = keyOf(ctx.section || '');

    let best = { confidence: 0, name: undefined, price: undefined, hit: 'none' };
    for (const c of flatCatalog) {
        const candidates = itemAliases(c); // name + aliases (learned) tokens
        if (candidates.length === 0) continue;
        const catName = candidates[0];
        let conf = 0;
        for (const cand of candidates) conf = Math.max(conf, overlapScore(query, cand));
        // Substring hit is a strong signal (name OR alias).
        if (candidates.some(cand => cand.includes(query) || query.includes(cand))) conf = Math.max(conf, 0.85);
        // Category agreement with the section name adds a small boost.
        const catKey = keyOf(c.category || '');
        if (sectionKey && catKey && catKey !== '' && sectionKey.includes(catKey.slice(0, 4))) conf = Math.min(1, conf + 0.05);
        if (conf > best.confidence) {
            // Only accept when the overlap is meaningful (>0.35) OR exact phrase.
            if (conf >= 0.35 || candidates.some(cand => query.includes(cand))) {
                best = { name: c.name, price: Number(c.price) || 0, category: c.category, confidence: conf, hit: 'catalog' };
            }
        }
    }
    return best;
};