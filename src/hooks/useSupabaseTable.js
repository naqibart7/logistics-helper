/**
 * Supabase-backed state hooks with a localStorage fallback.
 *
 * API is intentionally identical to the old `useSyncedState`/`useLocalStorage`
 * hooks so `App.jsx` barely changes:
 *
 *     const [projects, setProjects, user] = useSupabaseProjects();
 *     const [suppliers, setSuppliers]      = useSupabaseSuppliers();
 *
 * Behaviour
 * ---------
 * - Always mirrors the latest value to localStorage (offline-safe).
 * - When signed in AND online, data is also pulled from / pushed to the
 *   matching Supabase table (`projects` / `suppliers`).
 * - Frontend string IDs are preserved in a `local_id` column; the DB PK stays
 *   `uuid` as specified by the schema (see server/schema.sql).
 * - Any Supabase failure (offline, table missing, RLS) silently falls back to
 *   localStorage so the app never breaks.
 * - Real-time subscriptions can be enabled later inside `subscribeToChanges`.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { storage, STORAGE_KEYS } from '../utils/storage';
import { INITIAL_SUPPLIERS } from '../data/initialData';

const DEBOUNCE_MS = 400;

// ─── Column mapping helpers ───────────────────────────────────────────────────
// Frontend row → Supabase row. The DB PK is a uuid; the frontend string id is
// kept in `local_id` so existing projects/suppliers keep their references.
const toRow = (tableName, row, userId) => {
    const base = {
        user_id: userId,
        local_id: String(row.id || ''),
    };
    if (tableName === 'projects') {
        return {
            ...base,
            name: row.name || 'Untitled Project',
            client: row.client || null,
            location: row.location || null,
            delivery_address: row.deliveryAddress || null,
            contact_person: row.contactPerson || null,
            contact_phone: row.contactPhone || null,
            need_by_date: row.needByDate || null,
            quotation_number: row.quotationNumber || null,
            status: row.status || 'Draft',
            materials: row.materials || [],
            raw_text: row.rawText || null,
            ocr_method: row.ocrMethod || null,
        };
    }
    // suppliers
    return {
        ...base,
        name: row.name || '',
        categories: row.categories || [],
        location: row.location || null,
        contact: row.contact || null,
        whatsapp: row.whatsapp || null,
    };
};

// Supabase row → frontend row (camelCase).
const fromRow = (tableName, row) => {
    const base = { ...row, id: row.local_id || row.id };
    delete base.local_id;
    delete base.user_id;
    if (tableName === 'projects') {
        return {
            ...base,
            client: row.client ?? '',
            location: row.location ?? '',
            deliveryAddress: row.delivery_address ?? '',
            contactPerson: row.contact_person ?? '',
            contactPhone: row.contact_phone ?? '',
            needByDate: row.need_by_date ?? '',
            quotationNumber: row.quotation_number ?? '',
            projectNumber: row.project_number ?? '',
            materials: row.materials ?? [],
            rawText: row.raw_text ?? '',
            ocrMethod: row.ocr_method ?? '',
        };
    }
    return {
        ...base,
        categories: row.categories ?? [],
        location: row.location ?? '',
        contact: row.contact ?? '',
        whatsapp: row.whatsapp ?? '',
    };
};

// ─── Session hook ─────────────────────────────────────────────────────────────
export const useSupabaseSession = () => {
    const [user, setUser] = useState(null);
    const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);

    useEffect(() => {
        if (!supabase) return;
        let active = true;

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (active) setUser(session?.user ?? null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (active) setUser(session?.user ?? null);
        });

        const goOnline = () => setOnline(true);
        const goOffline = () => setOnline(false);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);

        return () => {
            active = false;
            subscription?.unsubscribe();
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    return { user, online };
};

// ─── Generic table hook ───────────────────────────────────────────────────────
const useSupabaseTable = (tableName, storageKey, defaultValue) => {
    const [value, setValue] = useState(() => storage.load(storageKey, defaultValue));
    const { user, online } = useSupabaseSession();
    const [lastSyncedAt, setLastSyncedAt] = useState(null);

    // Pull cloud rows and MERGE with local state (instead of replacing) so
    // local-only rows are never lost — they get pushed up on the next sync.
    const pullCloud = useCallback(async () => {
        if (!supabase || !user || !online) return { pulled: 0 };
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.warn(`[supabase] ${tableName} fetch failed, using local data:`, error.message);
            return { pulled: 0, error };
        }
        if (data && data.length > 0) {
            const mapped = data.map(row => fromRow(tableName, row));
            const cloudIds = new Set(mapped.map(m => m.id));
            setValue(prev => {
                const prevList = Array.isArray(prev) ? prev : [];
                const localOnly = prevList.filter(p => !cloudIds.has(p.id));
                return [...mapped, ...localOnly];
            });
            setLastSyncedAt(new Date());
            return { pulled: mapped.length };
        }
        return { pulled: 0 };
    }, [tableName, user, online]);

    // 1. Initial cloud pull (only when signed in & online).
    useEffect(() => {
        if (!supabase || !user || !online) return;
        let cancelled = false;

        pullCloud().then(({ pulled }) => {
            if (cancelled) return;
            if (pulled === 0 && value.length === 0) {
                // Signed in but the cloud table is empty: nothing to restore.
                console.info(`[supabase] ${tableName}: cloud empty, keeping local.`);
            }
        });

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tableName, user, online]);

    // 2. Mirror every value change to localStorage (offline-safe).
    useEffect(() => {
        storage.save(storageKey, value);
    }, [storageKey, value]);

    // 3. Push changes to cloud (debounced) whenever the value changes.
    useEffect(() => {
        if (!supabase || !user || !online) return;

        const timer = setTimeout(async () => {
            try {
                const rows = (value || []).map(row => toRow(tableName, row, user.id));
                if (rows.length === 0) return;
                const { error } = await supabase
                    .from(tableName)
                    .upsert(rows, { onConflict: 'local_id' });
                if (error) {
                    console.warn(`[supabase] ${tableName} sync failed:`, error.message);
                } else {
                    setLastSyncedAt(new Date());
                }
            } catch (err) {
                console.warn(`[supabase] ${tableName} sync error:`, err.message);
            }
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [tableName, value, user, online]);

    // 4. Setter — pure state update (persistence handled by effects above).
    const set = useCallback((newValueOrFn) => {
        setValue(prev => typeof newValueOrFn === 'function' ? newValueOrFn(prev) : newValueOrFn);
    }, []);

    const syncInfo = { online, lastSyncedAt, restoreFromCloud: pullCloud };

    return [value, set, user, syncInfo];
};

/**
 * Projects hook — backed by Supabase `projects` table, falls back to
 * localStorage when offline / unauthenticated / unconfigured.
 */
export const useSupabaseProjects = () => {
    return useSupabaseTable('projects', STORAGE_KEYS.PROJECTS, []);
};

/**
 * Suppliers hook — backed by Supabase `suppliers` table, falls back to
 * localStorage when offline / unauthenticated / unconfigured.
 */
export const useSupabaseSuppliers = () => {
    return useSupabaseTable('suppliers', STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS);
};

// NOTE: Real-time support (future). When enabled, subscribe like:
//   supabase.channel(`realtime:${tableName}`)
//     .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, (payload) => { ... })
//     .subscribe();
