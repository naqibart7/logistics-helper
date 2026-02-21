
import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';

export const useSyncedState = (key, defaultValue) => {
    // 1. Initialize from localStorage
    const [value, setValue] = useState(() => {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : defaultValue;
    });

    const [user, setUser] = useState(null);

    // Watch for Auth changes
    useEffect(() => {
        if (!supabase) return;

        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    // 2. Fetch from Supabase when user logs in
    useEffect(() => {
        if (!user || !supabase) return;

        const fetchData = async () => {
            const { data, error } = await supabase
                .from('user_data')
                .select('value')
                .eq('key', key)
                .single();

            if (data?.value) {
                setValue(data.value);
                // Sync to local storage too
                localStorage.setItem(key, JSON.stringify(data.value));
            } else if (error && error.code === 'PGRST116') {
                // Key not found in cloud, push local data for first time migration
                await supabase
                    .from('user_data')
                    .upsert({
                        user_id: user.id,
                        key: key,
                        value: value
                    });
            }
        };

        fetchData();
    }, [user, key]);

    // 3. Save to Local & Cloud
    const setSyncedValue = async (newValueOrFn) => {
        const newValue = typeof newValueOrFn === 'function' ? newValueOrFn(value) : newValueOrFn;

        // Update Local State
        setValue(newValue);
        localStorage.setItem(key, JSON.stringify(newValue));

        // Update Cloud if authenticated
        if (user && supabase) {
            try {
                await supabase
                    .from('user_data')
                    .upsert({
                        user_id: user.id,
                        key: key,
                        value: newValue
                    });
            } catch (err) {
                console.error('Failed to sync to cloud:', err);
            }
        }
    };

    // Cross-tab sync for localStorage (fallback when offline/unauthenticated)
    useEffect(() => {
        const handleStorage = (e) => {
            if (e.key === key && e.newValue) {
                setValue(JSON.parse(e.newValue));
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, [key]);

    return [value, setSyncedValue, user];
};
