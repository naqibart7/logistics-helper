
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
        <div className="bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-2xl w-[360px] transform transition-all">
            <h3 className="text-2xl font-black mb-1 flex items-center gap-3 text-slate-800">
                {isSignUp ? <UserPlus className="text-blue-600" size={24} /> : <LogIn className="text-blue-600" size={24} />}
                {isSignUp ? 'Create Account' : 'Welcome Back'}
            </h3>
            <p className="text-slate-500 text-sm font-medium mb-8">
                {isSignUp
                    ? 'Sync your projects across all devices'
                    : 'Sign in to access your cloud data'}
            </p>

            <form onSubmit={handleAuth} className="space-y-5">
                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Email Address</label>
                    <div className="relative group">
                        <Mail className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                        <input
                            type="email"
                            placeholder="name@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-[15px] font-semibold text-slate-800 placeholder:text-slate-300 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-sm"
                            required
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase ml-1">Password</label>
                    <div className="relative group">
                        <Lock className="absolute left-4 top-3.5 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={18} />
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border-2 border-transparent rounded-2xl text-[15px] font-semibold text-slate-800 placeholder:text-slate-300 focus:bg-white focus:border-blue-500 outline-none transition-all shadow-sm"
                            required
                        />
                    </div>
                </div>

                {message && (
                    <div className={`text-xs p-4 rounded-2xl font-semibold flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 ${message.type === 'success'
                            ? 'bg-emerald-50 text-emerald-700 border-2 border-emerald-100'
                            : 'bg-rose-50 text-rose-700 border-2 border-rose-100'
                        }`}>
                        <div className="mt-0.5">{message.text}</div>
                    </div>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-[15px] hover:bg-blue-700 active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : (isSignUp ? 'Create My Account' : 'Sign In Now')}
                </button>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
                <button
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="text-sm font-bold text-slate-400 hover:text-blue-600 transition-colors"
                >
                    {isSignUp ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
                </button>
            </div>
        </div>
    );
};

export default Auth;
