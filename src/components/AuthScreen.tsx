import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  Shield,
  User,
  KeyRound,
} from 'lucide-react';
import { api } from '../api/client.ts';
import { signInWithGooglePopup } from '../auth/googleAuth.ts';
import type { UserProfile, UserRole } from '../types.ts';
import { BrandLogo } from './BrandLogo.tsx';

interface AuthScreenProps {
  initialMode?: 'login' | 'signup';
  initialRole?: UserRole;
  cities: string[];
  onAuthenticated: (token: string, user: UserProfile) => void;
  onBackToBrowse: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  initialMode = 'login',
  initialRole = 'buyer',
  cities,
  onAuthenticated,
  onBackToBrowse,
}) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [role, setRole] = useState<UserRole>(initialRole);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredCity, setPreferredCity] = useState(cities[0] || 'Lahore');
  const [password, setPassword] = useState('');
  const [adminPasscode, setAdminPasscode] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [adminStatus, setAdminStatus] = useState<{
    claimed: boolean;
    hasEnvPasscode: boolean;
  } | null>(null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (role === 'admin') {
      api
        .getAdminStatus()
        .then(setAdminStatus)
        .catch(() => setAdminStatus({ claimed: false, hasEnvPasscode: false }));
    }
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (role === 'admin') {
        const shouldClaim =
          adminStatus && (!adminStatus.claimed || (mode === 'signup' && adminStatus.hasEnvPasscode));
        if (shouldClaim) {
          const res = await api.claimAdmin({
            displayName: displayName || 'Platform Admin',
            email,
            password,
            passcode: adminPasscode || undefined,
          });
          onAuthenticated(res.token, res.user);
        } else {
          const res = await api.login({ email, password, role: 'admin' });
          onAuthenticated(res.token, res.user);
        }
        return;
      }

      if (mode === 'signup') {
        const res = await api.register({
          role,
          displayName,
          email,
          phone,
          password,
          preferredCity,
        });
        onAuthenticated(res.token, res.user);
      } else {
        const res = await api.login({ email, password, role });
        onAuthenticated(res.token, res.user);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (role === 'admin') return;
    setError('');
    setGoogleLoading(true);
    try {
      const { idToken } = await signInWithGooglePopup();
      const res = await api.googleAuth({
        idToken,
        role,
        preferredCity,
        intent: mode,
      });
      onAuthenticated(res.token, res.user);
    } catch (err: unknown) {
      const code = typeof err === 'object' && err !== null && 'code' in err ? String((err as { code?: unknown }).code) : '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError('Google sign-in was cancelled.');
      } else if (code === 'auth/popup-blocked') {
        setError('Popup was blocked by your browser. Please allow popups and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Google sign-in failed.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotMsg('');
    try {
      const res = await api.forgotPassword(forgotEmail);
      setForgotMsg(res.message);
    } catch (err) {
      setForgotMsg(err instanceof Error ? err.message : 'Unable to process request.');
    }
  };

  const isAdminClaimFlow =
    role === 'admin' &&
    adminStatus !== null &&
    (!adminStatus.claimed || (mode === 'signup' && adminStatus.hasEnvPasscode));

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center px-4 py-8">
      <div className="w-full max-w-md mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToBrowse}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Listings
        </button>
      </div>

      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-slate-200 p-6 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <BrandLogo variant="light" />
          <h1 className="font-display font-bold text-2xl text-slate-900 mt-5">
            {role === 'admin'
              ? isAdminClaimFlow
                ? 'Initialize Admin Access'
                : 'Administrator Sign In'
              : mode === 'signup'
                ? 'Create Account'
                : 'Welcome Back'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {role === 'admin'
              ? isAdminClaimFlow
                ? 'Set up the first administrator account for platform moderation.'
                : 'Sign in through the protected admin portal.'
              : mode === 'signup'
                ? 'Join us to find or rent your dream home'
                : 'Login to your account'}
          </p>
        </div>

        {/* Role Selector */}
        <div className="mt-6 grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
          {(['buyer', 'seller', 'admin'] as UserRole[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => {
                setRole(r);
                setError('');
              }}
              className={`py-2 px-3 text-sm font-semibold rounded-lg capitalize transition-all whitespace-nowrap ${
                role === r
                  ? 'bg-[#5B3CF5] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {r}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3.5">
          {(mode === 'signup' || isAdminClaimFlow) && (
            <label className="block">
              <span className="sr-only">Full Name</span>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Full Name"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </label>
          )}

          <label className="block">
            <span className="sr-only">Email Address</span>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email Address"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </label>

          {mode === 'signup' && role !== 'admin' && (
            <>
              <label className="block">
                <span className="sr-only">Mobile Number</span>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Mobile Number (+92 300 ...)"
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>
              </label>

              <label className="block">
                <span className="block text-xs font-medium text-slate-500 mb-1">Preferred City</span>
                <select
                  value={preferredCity}
                  onChange={(e) => setPreferredCity(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {isAdminClaimFlow && adminStatus?.hasEnvPasscode && (
            <label className="block">
              <span className="sr-only">Admin Passcode</span>
              <div className="relative">
                <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={adminPasscode}
                  onChange={(e) => setAdminPasscode(e.target.value)}
                  placeholder="Server Admin Passcode"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </label>
          )}

          <label className="block">
            <span className="sr-only">Password</span>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min 6 characters)"
                className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-5 rounded-xl bg-[#5B3CF5] hover:bg-[#4F32DF] disabled:opacity-60 text-white font-semibold text-sm shadow-sm transition-colors min-h-[44px]"
          >
            {loading
              ? 'Please wait...'
              : role === 'admin'
                ? isAdminClaimFlow
                  ? 'Initialize & Sign In'
                  : 'Admin Login'
                : mode === 'signup'
                  ? 'Sign Up'
                  : 'Login'}
          </button>
        </form>

        {mode === 'login' && role !== 'admin' && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => {
                setForgotOpen(true);
                setForgotMsg('');
              }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Forgot Password?
            </button>
          </div>
        )}

        {role !== 'admin' && (
          <div className="mt-5">
            <div className="relative flex items-center justify-center my-4">
              <div className="border-t border-slate-200 w-full" />
              <span className="bg-white px-3 text-[11px] font-medium uppercase tracking-wider text-slate-400 shrink-0">
                Or continue with
              </span>
              <div className="border-t border-slate-200 w-full" />
            </div>

            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={loading || googleLoading}
              className="gsi-material-button w-full inline-flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60 text-slate-800 font-medium text-sm shadow-xs transition-colors min-h-[44px]"
            >
              <span className="gsi-material-button-icon w-5 h-5 shrink-0 flex items-center justify-center">
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  className="w-5 h-5 block"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
              </span>
              <span className="gsi-material-button-contents">
                {googleLoading
                  ? 'Connecting Google...'
                  : mode === 'signup'
                    ? `Sign up with Google as ${role === 'seller' ? 'Seller' : 'Buyer'}`
                    : 'Continue with Google'}
              </span>
            </button>
          </div>
        )}

        {role !== 'admin' && (
          <p className="mt-5 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'login' : 'signup');
                setError('');
              }}
              className="font-semibold text-indigo-600 hover:text-indigo-800"
            >
              {mode === 'signup' ? 'Login' : 'Sign Up'}
            </button>
          </p>
        )}

        {role === 'admin' && (
          <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2.5 text-xs text-slate-600">
            <Shield className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <span>
              {isAdminClaimFlow
                ? 'First-run setup creates a single protected admin account and locks public claiming.'
                : 'Admin sign-in enforces server-side role verification and logs all moderation actions.'}
            </span>
          </div>
        )}
      </div>

      {/* Forgot Password Modal */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-xl border border-slate-200">
            <h2 className="font-display font-bold text-lg text-slate-900">Reset Password</h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your registered email address to receive recovery instructions.
            </p>
            <form onSubmit={handleForgotSubmit} className="mt-4 space-y-3">
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {forgotMsg && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                  {forgotMsg}
                </p>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Close
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#5B3CF5] text-white text-xs font-semibold hover:bg-[#4F32DF]"
                >
                  Send Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
