import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { Loader2, LogIn, Mail, Lock, UserPlus, X } from 'lucide-react';
import { auth, googleProvider, isFirebaseConfigured } from '../firebase';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!isFirebaseConfigured || !auth) {
      setError('Firebase is not configured yet. Add VITE_FIREBASE_* keys to frontend/.env.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const cred =
        mode === 'signup'
          ? await createUserWithEmailAndPassword(auth, email.trim(), password)
          : await signInWithEmailAndPassword(auth, email.trim(), password);
      onAuthSuccess?.(cred.user);
      onClose();
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured || !auth || !googleProvider) {
      setError('Firebase is not configured yet. Add VITE_FIREBASE_* keys to frontend/.env.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      onAuthSuccess?.(cred.user);
      onClose();
    } catch (err) {
      setError(err.message || 'Google sign-in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl backdrop-blur-xl bg-[#120907]/95 border border-amber-200/15 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              {mode === 'signup' ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                {mode === 'signup' ? 'Create Account' : 'Sign In'}
              </h2>
              <p className="text-[11px] text-slate-400">
                Firebase Authentication
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Google Sign In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-slate-100 text-xs font-medium flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.9C6.2 7.3 8.9 5 12 5z"
              />
              <path
                fill="#4285F4"
                d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
              />
              <path
                fill="#FBBC05"
                d="M5.3 14.7c-.2-.8-.4-1.7-.4-2.7s.2-1.9.4-2.7L1.6 6.4C.6 8.1 0 10 0 12s.6 3.9 1.6 5.6l3.7-2.9z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.9C3.5 20.4 7.4 23 12 23z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <div className="h-px flex-1 bg-white/10" />
            <span>or with email</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
              />
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 chars)"
                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/15 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {mode === 'signup' ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400">
            {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => {
                setMode((m) => (m === 'signup' ? 'signin' : 'signup'));
                setError('');
              }}
              className="text-amber-300 hover:text-amber-200 font-medium cursor-pointer"
            >
              {mode === 'signup' ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
