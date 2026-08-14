/**
 * Custom quick-kit store.
 *
 * The app ships a set of default quick kits (`QUICK_KITS` from
 * `../data/catalogHierarchy`). Users can edit, duplicate, add or hide them;
 * those changes live in localStorage under `STORAGE_KEYS.CUSTOM_KITS` and are
 * layered over the defaults.
 *
 * Stored record shapes (kept deliberately small):
 *   { id, name, emoji, main, items: [{name, qty}] }  — a create or an override
 *   { id, deleted: true }                            — tombstone hiding a default
 *
 * The effective kit list consumed by the UI is produced by `collectKits()`:
 * every default (minus tombstones) plus every non-default custom kit. An
 * override reuses the default's id so `resolveKit` keeps working unchanged.
 */
import { QUICK_KITS } from '../data/catalogHierarchy';
import { storage, STORAGE_KEYS } from './storage';

const isDefault = (id) => QUICK_KITS.some(kit => kit.id === id);

export const loadCustomKits = () => storage.load(STORAGE_KEYS.CUSTOM_KITS, []);

export const persistCustomKits = (custom) => {
    storage.save(STORAGE_KEYS.CUSTOM_KITS, custom);
    return custom;
};

/**
 * Merge stored custom kits over the defaults → the effective kit list.
 * Each returned kit is tagged with `fromDefault` and `customized` so the UI
 * can show "default" vs "your edit" states.
 */
export const collectKits = (custom = loadCustomKits()) => {
    const records = Array.isArray(custom) ? custom : [];
    const deleted = new Set(records.filter(k => k.deleted).map(k => k.id));
    const overrides = new Map(records.filter(k => !k.deleted).map(k => [k.id, k]));

    const result = [];
    for (const def of QUICK_KITS) {
        if (deleted.has(def.id)) continue;
        const override = overrides.get(def.id);
        if (override) {
            result.push({
                ...def,
                ...override,
                fromDefault: true,
                customized: true,
                deleted: false,
            });
        } else {
            result.push({ ...def, fromDefault: true, customized: false, deleted: false });
        }
    }
    for (const [id, record] of overrides) {
        if (isDefault(id)) continue;
        result.push({ ...record, fromDefault: false, customized: true, deleted: false });
    }
    return result;
};

/** Save (create or update) a kit. Editing a default becomes an override. */
export const saveCustomKit = (kit, custom = loadCustomKits()) => {
    const record = { ...kit, deleted: false };
    const next = [...custom];
    const idx = next.findIndex(k => k.id === kit.id);
    if (idx >= 0) next[idx] = record;
    else next.push(record);
    return persistCustomKits(next);
};

/** Add a brand-new kit with a fresh id. */
export const createCustomKit = (kit, custom = loadCustomKits()) => {
    return saveCustomKit({ ...kit, id: kit.id }, custom);
};

/** Hide a default (tombstone) or permanently remove a custom kit. */
export const removeCustomKit = (id, custom = loadCustomKits()) => {
    if (isDefault(id)) {
        const withoutTomb = custom.filter(k => k.id !== id);
        if (!withoutTomb.some(k => k.id === id)) withoutTomb.push({ id, deleted: true });
        return persistCustomKits(withoutTomb);
    }
    return persistCustomKits(custom.filter(k => k.id !== id));
};

/** Restore a hidden/edited default back to its stock definition. */
export const resetCustomKit = (id, custom = loadCustomKits()) => {
    return persistCustomKits(custom.filter(k => k.id !== id));
};