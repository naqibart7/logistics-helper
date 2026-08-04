import { useState, useEffect } from 'react';
import { storage } from '../utils/storage';

export const useLocalStorage = (key, initialValue) => {
    const [value, setValue] = useState(() => {
        return storage.load(key, initialValue);
    });

    const [error, setError] = useState(null);

    useEffect(() => {
        const handleStorageChange = (e) => {
            if (e.key === key && e.newValue) {
                try {
                    setValue(JSON.parse(e.newValue));
                } catch (err) {
                    console.error('Failed to sync storage:', err);
                }
            }
        };

        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, [key]);

    useEffect(() => {
        const result = storage.save(key, value);
        if (!result.success) {
            setError(result.error);
            console.error('Storage error:', result.error);
        } else {
            setError(null);
        }
    }, [key, value]);

    return [value, setValue, error];
};
