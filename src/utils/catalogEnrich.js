/**
 * catalogEnrich.js — Automatic catalog enrichment ("learn from previous data").
 *
 * Every catalog item gets its missing rich fields DERIVED at read/display time
 * (never written back — idempotent, storage/sync-safe):
 *   - unit, colour, size, brand parsed from the item name itself
 *   - aliases sourced from (1) the built-in synonym dictionaries, and (2) the
 *     parser's knowledge base — past supplier→corrected-item learnings become
 *     aliases, so next-time uploads map correctly without re-fixing.
 *
 * Consumers (hierarchy builder, picker, fuzzy matcher) run this so catalog data
 * "learns" from prior usage without any migration chores.
 */
import { extractSpecs } from './excelParser/specs.js';
import { ITEM_MAPPING } from './normalization.js';
import { loadKnowledge } from './excelParser/learn.js';

const toKey = (s) => String(s || '').toLowerCase();

/** Derive a sensible unit from a name like "10m cable", "18L paint", "4x8 board". */
const deriveUnit = (name) => {
    const n = toKey(name);
    if (!n) return undefined;
    // Dimensioned products (an "x" size) are almost always sold as a piece,
    // even though their spec mentions mm/cm/ft — e.g. "4x8ft" or "75x25x8".
    if (
        /\d+(?:\.\d+)?\s*x{1,2}\s*\d+(?:\.\d+)?/i.test(n) ||
        /\b\d+(?:\.\d+)?\s*(?:mm|cm|ft|m|mtr)\s*x\s*\d+(?:\.\d+)?/i.test(n)
    ) return 'pcs';
    if (/\b(box|boxes)\b/.test(n)) return 'box';
    if (/\b(roll|rolls)\b/.test(n)) return 'roll';
    if (/\b(bag|bags)\b/.test(n)) return 'bag';
    if (/\b(kg|kgs|kilogram)\b/.test(n)) return 'kg';
    if (/\b(g|gram)\b/.test(n)) return 'g';
    if (/\b(ml|lite?rs?)\b/.test(n)) return 'l';
    if (/\b\d+\.?\d*\s*(m2|sqm|sq.?m)\b/.test(n)) return 'm2';
    if (/\b\d+\.?\d*\s*(m|mtr|metre?s?)\b/.test(n)) return 'm'; // linear length sold by the metre
    if (/\b\d+\.?\d*\s*(mm)\b/.test(n)) return 'mm';
    if (/\b\d+\.?\d*\s*(cm)\b/.test(n)) return 'cm';
    if (/\b\d+\.?\d*\s*(ft|feet)\b/.test(n)) return 'ft';
    if (/\b(sqf|sqft|ft2)\b/.test(n)) return 'sqft';
    return undefined;
};

/** Synonyms from the master dictionaries that describe this exact item. */
const dictionaryAliases = (name) => {
    const n = toKey(name);
    const out = [];
    for (const [standard, keywords] of Object.entries(ITEM_MAPPING)) {
        if (keywords.some(k => n.includes(toKey(k)))) {
            keywords.concat([standard])
                .filter(k => !n.includes(toKey(k)))
                .forEach(a => out.push(a));
        }
    }
    return [...new Set(out.map(toKey))];
};

/**
 * Enrich a SINGLE item, filling only missing fields.
 * @param {object} item raw catalog item
 * @param {Array} kbCorrections optional list of learn.js corrections
 */
export const enrichItem = (item, kbCorrections = []) => {
    if (!item || typeof item.name !== 'string') return item;
    const specs = extractSpecs(item.name);
    const enriched = { ...item };

    if (!enriched.unit) enriched.unit = deriveUnit(item.name) || 'pcs';
    if (!enriched.brand && specs.brand) enriched.brand = specs.brand;
    if (!enriched.size && specs.size && item.name.match(/([0-9.]+x[0-9.]+|\d+(\.\d+)?\s*(mm|cm|ft)\b)/i)) enriched.size = specs.size;
    if (!enriched.colour && specs.colour) enriched.colour = specs.colour;

    const aliases = new Set(Array.isArray(enriched.aliases) ? enriched.aliases.map(toKey) : []);
    dictionaryAliases(item.name).forEach(a => aliases.add(a));
    // Learned mappings: a correction "original → THIS catalog item name" teaches
    // us that the original supplier text is an alias for this item.
    for (const c of kbCorrections) {
        if (c && c.corrected && c.corrected.item && toKey(c.corrected.item) === toKey(item.name) && c.original) {
            aliases.add(toKey(c.original));
        }
    }
    aliases.delete(toKey(item.name)); // never alias itself
    if (aliases.size) enriched.aliases = [...aliases];

    return enriched;
};

/**
 * Enrich a whole flat catalog. Cheap + idempotent; safe to call on every read.
 */
export const enrichCatalog = (catalog) => {
    if (!Array.isArray(catalog)) return catalog;
    const kb = loadKnowledge();
    const corrections = kb.corrections || [];
    return catalog.map(item => enrichItem(item, corrections));
};

/** The alias list an item should be matched against (name + aliases). */
export const itemAliases = (item) => {
    const all = new Set([toKey(item && item.name)]);
    (item && Array.isArray(item.aliases) ? item.aliases : []).forEach(a => all.add(toKey(a)));
    return [...all].filter(Boolean);
};