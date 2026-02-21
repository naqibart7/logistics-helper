
import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';

// Helper to get or create a stable Device ID for unauthenticated syncing
const getDeviceId = () => {
    let id = localStorage.getItem('app_device_id');
    if (!id) {
        id = `dev-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
        localStorage.setItem('app_device_id', id);
    }
    return id;
};

export const useSyncedState = (key, defaultValue) => {
    const [value, setValue] = useState(() => {
        const stored = localStorage.getItem(key);
        return stored ? JSON.parse(stored) : defaultValue;
    });

    const [user, setUser] = useState(null);
    const deviceId = getDeviceId();

    // The primary identifier for this user/device pairing
    const identifier = user ? `user:${user.id}` : `device:${deviceId}`;

    // 1. Listen for Auth Changes
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

    // 2. Initial Data Pull & Identity Migration
    useEffect(() => {
        if (!supabase) return;

        const fetchData = async () => {
            // Try to find existing data for the current identifier
            const { data, error } = await supabase
                .from('user_data')
                .select('value')
                .eq('key', key)
                .eq('identifier', identifier)
                .maybeSingle();

            if (data?.value) {
                setValue(data.value);
                localStorage.setItem(key, JSON.stringify(data.value));
            } else {
                // If it's the first time for this ID, push local data up
                await supabase
                    .from('user_data')
                    .upsert({
                        identifier,
                        key,
                        value,
                        user_id: user?.id || null
                    });
            }
        };

        fetchData();
    }, [user, key, identifier, value]);

    // 3. Save Logic
    const setSyncedValue = async (newValueOrFn) => {
        const newValue = typeof newValueOrFn === 'function' ? newValueOrFn(value) : newValueOrFn;

        setValue(newValue);
        localStorage.setItem(key, JSON.stringify(newValue));

        if (supabase) {
            try {
                await supabase
                    .from('user_data')
                    .upsert({
                        identifier,
                        key,
                        value: newValue,
                        user_id: user?.id || null
                    });
            } catch (err) {
                console.error('Cloud Sync Error:', err);
            }
        }
    };

    // 4. Cross-tab storage sync
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
