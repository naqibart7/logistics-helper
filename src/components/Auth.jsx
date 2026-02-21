
import React, { useState } from 'react';
import { supabase } from '../utils/supabase';
import { LogIn, UserPlus, LogOut, Mail, Lock, Loader2 } from 'lucide-react';

const Auth = ({ user, onSignOut }) => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSignUp, setIsSignUp] = useState(false);
    const [message, setMessage] = useState(null);

    const handleAuth = async (e) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({ email, password });
                if (error) throw error;
                setMessage({ type: 'success', text: 'Success! Please check your email for the confirmation link.' });
            } else {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            }
        } catch (error) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        onSignOut?.();
    };

    if (user) {
        return (
            <div className="flex items-center gap-4 bg-white/50 backdrop-blur-sm px-4 py-2 rounded-full border shadow-sm">
                <div className="flex flex-col">
                    <span className="text-[10px] uppercase font-bold text-gray-400">Syncing as</span>
                    <span className="text-xs font-semibold text-gray-700 truncate max-w-[150px]">{user.email}</span>
                </div>
                <button
                    onClick={handleSignOut}
                    className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-full transition-colors"
                    title="Sign Out"
                >
                    <LogOut size={16} />
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white p-6 rounded-2xl border shadow-xl w-[320px]">
            <h3 className="text-xl font-bold mb-1 flex items-center gap-2">
                {isSignUp ? <UserPlus className="text-blue-600" /> : <LogIn className="text-blue-600" />}
                {isSignUp ? 'Create Account' : 'Sign In'}
            </h3>
            <p className="text-gray-500 text-xs mb-6">
                {isSignUp
                    ? 'Sync your projects across all devices'
                    : 'Access your projects from anywhere'}
            </p>

            <form onSubmit={handleAuth} className="space-y-4">
                <div className="relative">
                    <Mail className="absolute left-3 top-3 text-gray-400" size={16} />
                    <input
                        type="email"
                        placeholder="Email Address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        required
                    />
                </div>
                <div className="relative">
                    <Lock className="absolute left-3 top-3 text-gray-400" size={16} />
                    <input
                        type="password"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                        required
                    />
                </div>

                {message && (
                    <div className={`text-[11px] p-3 rounded-lg flex items-start gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
                        }`}>
                        {message.text}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : (isSignUp ? 'Sign Up' : 'Sign In')}
                </button>
            </form>

            <div className="mt-6 pt-6 border-t text-center">
                <button
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-xs font-medium text-gray-500 hover:text-blue-600"
                >
                    {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </button>
            </div>
        </div>
    );
};

export default Auth;
