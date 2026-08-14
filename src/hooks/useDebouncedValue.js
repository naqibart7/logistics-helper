/**
 * useDebouncedValue — defer an updated value until it has stopped changing for
 * `delay` ms. Initialises to the first value immediately (no initial blank),
 * so first paint is instant and only rapid successive changes are coalesced.
 */
import { useState, useEffect } from 'react';

export const useDebouncedValue = (value, delay = 300) => {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(t);
    }, [value, delay]);

    return debounced;
};