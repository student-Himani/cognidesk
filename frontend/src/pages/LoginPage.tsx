import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Brain,
  Shield,
  KeyRound,
  Mail,
  User as UserIcon,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  HardDrive,
  Cpu,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, register, continueAsGuest } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasGuestData = !!localStorage.getItem('cognidesk_guest_token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ email, password, full_name: fullName });
      }
      navigate('/');
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        'Authentication failed. Please verify your details.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGuestMode = async () => {
    setError(null);
    setGuestLoading(true);
    try {
      await continueAsGuest();
      navigate('/');
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.message ||
        'Unable to initialize guest session. Please verify backend connectivity.';
      setError(msg);
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-8 overflow-hidden select-none">
      {/* Background ambient gradient glow */}
      <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-purple-600/15 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-blue-600/5 blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-tr from-indigo-600/20 via-purple-600/20 to-blue-500/10 border border-indigo-500/30 shadow-lg shadow-indigo-500/10 mb-3 backdrop-blur-md">
            <Brain className="h-8 w-8 text-indigo-400 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            CogniDesk <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">AI</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 font-medium">
            Intelligent Knowledge Engine & AI Workspace
          </p>
        </div>

        {/* Security & Deployment Pill */}
        <div className="flex items-center justify-center gap-2 mb-4 text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-3 py-1 rounded-full mx-auto w-fit">
          <Shield className="h-3.5 w-3.5" />
          <span>Cloud & Local Hybrid • Persistent Storage • Zero Expose</span>
        </div>

        {/* Guest Data Preserved Notice */}
        {hasGuestData && (
          <div className="mb-4 flex items-center gap-2.5 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs">
            <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              <strong>Guest session found!</strong> Registering or signing in will safely transfer all your documents, chats, and notes.
            </span>
          </div>
        )}

        {/* Auth Glass Card */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 backdrop-blur-xl p-6 shadow-2xl shadow-black/60">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-950/80 border border-slate-800 rounded-xl mb-5">
            <button
              type="button"
              id="tab-login"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              id="tab-register"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-red-950/50 border border-red-500/30 text-red-200 text-xs">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    id="input-fullname"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Marie Curie"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  id="input-email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@cognidesk.local"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="input-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              id="btn-auth-submit"
              disabled={loading || guestLoading}
              className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In to Workspace' : 'Create Local Account'}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-[11px] uppercase">
              <span className="bg-slate-900 px-3 text-slate-400 font-medium tracking-wider">
                or
              </span>
            </div>
          </div>

          {/* Guest Mode Button */}
          <button
            type="button"
            id="btn-continue-guest"
            onClick={handleGuestMode}
            disabled={loading || guestLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-950/80 hover:bg-slate-800/80 border border-slate-700/70 hover:border-indigo-500/50 text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-2.5 transition-all shadow-sm group disabled:opacity-50"
          >
            {guestLoading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-amber-400 group-hover:rotate-12 transition-transform" />
                <span>Continue without account (Guest Mode)</span>
              </>
            )}
          </button>
          <p className="text-[11px] text-center text-slate-400 mt-2">
            No signup needed. Start immediately and claim your data later.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-3 gap-2 mt-6 text-center text-[11px] text-slate-400">
          <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-sm">
            <Cpu className="h-4 w-4 mx-auto mb-1 text-indigo-400" />
            <span>Cloud & Local AI</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-sm">
            <HardDrive className="h-4 w-4 mx-auto mb-1 text-purple-400" />
            <span>Persistent Vectors</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/40 border border-slate-800/60 backdrop-blur-sm">
            <CheckCircle2 className="h-4 w-4 mx-auto mb-1 text-emerald-400" />
            <span>Workspace Safe</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
