/**
 * useQuickKits — React hook over the custom quick-kit store.
 *
 * Returns the effective kit list (defaults + your overrides/custom kits) plus
 * mutation helpers that write through to localStorage and refresh the merged
 * list. Kits are stable enough for `resolveKit` and are keyed by id; the picker
 * reads `kits` directly.
 */
import { useCallback, useState } from 'react';
import { generateId } from '../utils/helpers';
import {
    collectKits, loadCustomKits, saveCustomKit, createCustomKit,
    removeCustomKit, resetCustomKit,
} from '../utils/quickKits';

export const useQuickKits = () => {
    const [kits, setKits] = useState(collectKits());

    const save = useCallback((mutate) => {
        const next = mutate(loadCustomKits());
        setKits(collectKits(next));
    }, []);

    const addKit = useCallback((partial) => {
        save(custom => createCustomKit({
            id: `custom-${generateId()}`,
            emoji: '📦',
            main: 'drywall',
            items: [],
            ...partial,
        }, custom));
    }, [save]);

    const updateKit = useCallback((kit) => {
        save(custom => saveCustomKit(kit, custom));
    }, [save]);

    const removeKit = useCallback((id) => {
        save(custom => removeCustomKit(id, custom));
    }, [save]);

    const resetKit = useCallback((id) => {
        save(custom => resetCustomKit(id, custom));
    }, [save]);

    return { kits, addKit, updateKit, removeKit, resetKit };
};