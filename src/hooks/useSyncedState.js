
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

    // 2. Initial Data Pull (Cloud -> Local)
    useEffect(() => {
        if (!supabase) return;

        const fetchData = async () => {
            // Priority: User ID if logged in, otherwise Device ID
            const identifierText = user ? 'user_id' : 'device_id';
            const identifierValue = user ? user.id : deviceId;

            const { data, error } = await supabase
                .from('user_data')
                .select('value')
                .eq('key', key)
                .eq(identifierText, identifierValue)
                .maybeSingle();

            if (data?.value) {
                // Cloud has data - update local
                setValue(data.value);
                localStorage.setItem(key, JSON.stringify(data.value));
            } else if (!data && !error) {
                // Cloud is empty - push local data up (Migration/First Time)
                await supabase
                    .from('user_data')
                    .upsert({
                        key,
                        value,
                        user_id: user?.id || null,
                        device_id: user ? null : deviceId
                    });
            }
        };

        fetchData();
    }, [user, key]); // Re-fetch/re-sync when login status changes

    // 3. Save Logic (Local -> Cloud)
    const setSyncedValue = async (newValueOrFn) => {
        const newValue = typeof newValueOrFn === 'function' ? newValueOrFn(value) : newValueOrFn;

        setValue(newValue);
        localStorage.setItem(key, JSON.stringify(newValue));

        if (supabase) {
            try {
                await supabase
                    .from('user_data')
                    .upsert({
                        key,
                        value: newValue,
                        user_id: user?.id || null,
                        device_id: user ? null : deviceId
                    }, { onConflict: 'user_id,key' }); // Ensure unique constraint handling
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
