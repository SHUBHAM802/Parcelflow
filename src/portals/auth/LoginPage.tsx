import React, { useState } from 'react';
import { useAuth } from '../../shared/store/authContext';
import { Lock, Mail, User, Phone, ArrowRight, AlertCircle, Eye, EyeOff, ShieldAlert, KeyRound, CheckCircle } from 'lucide-react';
import { apiFetch } from '../../shared/lib/api';
import { auth, googleProvider, isFirebaseConfigured } from '../../shared/lib/firebase';
import { signInWithPopup } from 'firebase/auth';

export const LoginPage: React.FC = () => {
  const { login, register, loginWithGoogle, isLoading } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const demoAccounts = [
    {
      role: 'Admin',
      portal: 'Admin Business Center',
      email: 'admin@parcelflow.com',
      password: 'demo123',
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200'
    },
    {
      role: 'Operator',
      portal: 'Warehouse Control Room',
      email: 'operator@parcelflow.com',
      password: 'demo123',
      badgeColor: 'bg-teal-100 text-teal-800 border-teal-200'
    },
    {
      role: 'Customer',
      portal: 'Customer Storefront',
      email: 'rahul@parcelflow.com',
      password: 'demo123',
      badgeColor: 'bg-orange-100 text-orange-800 border-orange-200'
    }
  ];

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (!email || !password) {
      setError('Please enter both your email and password.');
      return;
    }

    try {
      await login(email.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMessage(null);
    setGoogleLoading(true);

    if (!isFirebaseConfigured() || !auth || !googleProvider) {
      setError(
        'Google Sign-In requires Firebase configuration. Please configure VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, and VITE_FIREBASE_PROJECT_ID in your .env file, and enable Google Sign-In in Firebase Console.'
      );
      setGoogleLoading(false);
      return;
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      if (!fbUser.email) {
        setError('No email address provided by your Google account. Please use email/password.');
        setGoogleLoading(false);
        return;
      }
      const idToken = await fbUser.getIdToken();
      await loginWithGoogle({
        uid: fbUser.uid,
        email: fbUser.email,
        displayName: fbUser.displayName,
        photoURL: fbUser.photoURL,
        idToken
      });
    } catch (err: any) {
      console.error('[ParcelFlow] Google Sign-In Error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled. The Google sign-in window was closed.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('The Google sign-in popup was blocked by your browser. Please allow popups for localhost.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized in your Firebase Console. Please add localhost to Authorized Domains under Authentication > Settings.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Google Sign-In is disabled in your Firebase project. Please enable it in Firebase Console under Authentication > Sign-in method > Google.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error while connecting to Google authentication. Please check your internet connection.');
      } else {
        setError(err.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name || !email || !password) {
      setError('Name, email, and password are required.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }

    try {
      await register(name.trim(), email.trim(), password, phone.trim());
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setForgotLoading(true);

    if (!email) {
      setError('Please enter your email address.');
      setForgotLoading(false);
      return;
    }

    try {
      const res = await apiFetch<{ success: boolean; message: string; token?: string; email?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim() })
      });

      if (res.token) {
        setResetToken(res.token);
        setResetEmail(res.email || email.trim());
        setMode('reset');
        setSuccessMessage('A 6-digit reset token has been generated. Enter it below with your new password.');
      } else {
        setSuccessMessage(res.message || 'If an account with that email exists, a reset token has been generated.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to process password reset request.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setForgotLoading(true);

    if (!resetToken || !newPassword) {
      setError('Reset token and new password are required.');
      setForgotLoading(false);
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match.');
      setForgotLoading(false);
      return;
    }

    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters long.');
      setForgotLoading(false);
      return;
    }

    try {
      const res = await apiFetch<{ success: boolean; message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail || email.trim(), token: resetToken.trim(), newPassword })
      });

      setSuccessMessage(res.message || 'Password has been reset successfully. Redirecting to login...');
      setTimeout(() => {
        setMode('login');
        setPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setResetToken('');
        setResetEmail('');
        setSuccessMessage(null);
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password.');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSelectDemoAccount = (acc: typeof demoAccounts[0]) => {
    setError(null);
    setSuccessMessage(null);
    setMode('login');
    setEmail(acc.email);
    setPassword(acc.password);
  };

  const getHeaderTitle = () => {
    switch (mode) {
      case 'login': return 'Sign in to ParcelFlow';
      case 'signup': return 'Create Customer Account';
      case 'forgot': return 'Reset Your Password';
      case 'reset': return 'Enter Reset Code';
    }
  };

  const getHeaderSubtitle = () => {
    switch (mode) {
      case 'login': return 'Enter your account credentials to access your designated workspace.';
      case 'signup': return 'Sign up for parcel ordering, tracking, and automated fulfillment updates.';
      case 'forgot': return 'Enter the email associated with your account to receive a reset token.';
      case 'reset': return 'Enter the 6-digit token and choose your new password.';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 selection:bg-orange-500/30 selection:text-orange-200">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-zinc-800/90 border border-zinc-700/80 text-xs text-zinc-300 shadow-xs mb-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="font-semibold tracking-wider text-white">PARCELFLOW</span>
            <span className="text-zinc-500">|</span>
            <span className="text-zinc-400">Enterprise Unified Platform</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {getHeaderTitle()}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mx-auto">
            {getHeaderSubtitle()}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 sm:p-7 shadow-2xl space-y-5">
          {/* Inline Error Notice */}
          {error && (
            <div
              id="auth-error-alert"
              role="alert"
              className="p-3 bg-red-950/80 border border-red-800/80 text-red-200 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{error}</div>
            </div>
          )}

          {/* Success Notice */}
          {successMessage && (
            <div
              id="auth-success-alert"
              className="p-3 bg-emerald-950/80 border border-emerald-800/80 text-emerald-200 text-xs rounded-xl flex items-start gap-2.5 leading-relaxed"
            >
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{successMessage}</div>
            </div>
          )}

          {mode === 'login' ? (
            /* Login Form: Strictly Email and Password */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="login-email" className="block text-xs font-medium text-zinc-300">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@parcelflow.com"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-xs font-medium text-zinc-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setSuccessMessage(null);
                      setMode('forgot');
                    }}
                    className="text-[11px] text-zinc-400 hover:text-orange-400 transition-colors cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                id="login-submit-btn"
                type="submit"
                disabled={isLoading || googleLoading}
                className="w-full mt-2 py-2.5 px-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-medium text-xs sm:text-sm transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <span>Authenticating...</span>
                ) : (
                  <>
                    <span>Log In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative my-3 sm:my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-[10px] sm:text-xs uppercase">
                  <span className="bg-zinc-950 px-3 text-zinc-500 font-semibold tracking-wider">Or continue with</span>
                </div>
              </div>

              {/* Continue with Google Button */}
              <button
                id="google-signin-btn"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || isLoading}
                className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white rounded-xl font-medium text-xs sm:text-sm transition-all shadow-xs active:scale-[0.99] flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                title="Sign in with your Google account"
              >
                {googleLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <span>Signing in with Google...</span>
                  </span>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setMode('signup');
                  }}
                  className="text-xs text-zinc-400 hover:text-orange-400 transition-colors cursor-pointer"
                >
                  Don't have an account? <span className="font-semibold text-orange-400 underline decoration-orange-400/40 underline-offset-2">Sign up</span>
                </button>
              </div>
            </form>
          ) : mode === 'signup' ? (
            /* Customer Registration Form */
            <form onSubmit={handleSignupSubmit} className="space-y-4">
              <div className="p-2.5 bg-orange-950/40 border border-orange-900/60 rounded-xl text-[11px] text-orange-300 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <span>Customer accounts only. Warehouse Operator and Admin accounts are pre-provisioned by IT administrators.</span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="signup-name" className="block text-xs font-medium text-zinc-300">
                  Full Name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Rahul Sharma"
                    className="w-full pl-10 pr-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="signup-email" className="block text-xs font-medium text-zinc-300">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="customer@gmail.com"
                    className="w-full pl-10 pr-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="signup-phone" className="block text-xs font-medium text-zinc-300">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full pl-10 pr-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="signup-password" className="block text-xs font-medium text-zinc-300">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Choose a password"
                    className="w-full pl-10 pr-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="signup-confirm-password" className="block text-xs font-medium text-zinc-300">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="signup-confirm-password"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full pl-10 pr-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              <button
                id="signup-submit-btn"
                type="submit"
                disabled={isLoading || googleLoading}
                className="w-full mt-2 py-2.5 px-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-medium text-xs sm:text-sm transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
              >
                {isLoading ? (
                  <span>Creating account...</span>
                ) : (
                  <>
                    <span>Create Customer Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative my-3 sm:my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-zinc-800" />
                </div>
                <div className="relative flex justify-center text-[10px] sm:text-xs uppercase">
                  <span className="bg-zinc-950 px-3 text-zinc-500 font-semibold tracking-wider">Or continue with</span>
                </div>
              </div>

              {/* Continue with Google Button */}
              <button
                id="google-signup-btn"
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading || isLoading}
                className="w-full py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-700 text-zinc-200 hover:text-white rounded-xl font-medium text-xs sm:text-sm transition-all shadow-xs active:scale-[0.99] flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                title="Sign up with your Google account"
              >
                {googleLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <span>Signing in with Google...</span>
                  </span>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setMode('login');
                  }}
                  className="text-xs text-zinc-400 hover:text-orange-400 transition-colors cursor-pointer"
                >
                  Already have an account? <span className="font-semibold text-orange-400 underline decoration-orange-400/40 underline-offset-2">Log In</span>
                </button>
              </div>
            </form>
          ) : mode === 'forgot' ? (
            /* Forgot Password Form */
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="p-2.5 bg-zinc-900 border border-zinc-700 rounded-xl text-[11px] text-zinc-300 flex items-start gap-2">
                <KeyRound className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <span>Enter your registered email address. A 6-digit reset token will be generated for password recovery.</span>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="forgot-email" className="block text-xs font-medium text-zinc-300">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@parcelflow.com"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              <button
                id="forgot-submit-btn"
                type="submit"
                disabled={forgotLoading}
                className="w-full mt-2 py-2.5 px-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-medium text-xs sm:text-sm transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {forgotLoading ? (
                  <span>Generating token...</span>
                ) : (
                  <>
                    <span>Send Reset Token</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setMode('login');
                  }}
                  className="text-xs text-zinc-400 hover:text-orange-400 transition-colors cursor-pointer"
                >
                  Remember your password? <span className="font-semibold text-orange-400 underline decoration-orange-400/40 underline-offset-2">Log In</span>
                </button>
              </div>
            </form>
          ) : (
            /* Reset Password Form */
            <form onSubmit={handleResetSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="reset-token" className="block text-xs font-medium text-zinc-300">
                  Reset Token
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reset-token"
                    type="text"
                    required
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="6-digit token"
                    maxLength={6}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors font-mono tracking-widest"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reset-new-password" className="block text-xs font-medium text-zinc-300">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reset-new-password"
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Choose a new password"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="reset-confirm-password" className="block text-xs font-medium text-zinc-300">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reset-confirm-password"
                    type="password"
                    required
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500 transition-colors"
                  />
                </div>
              </div>

              <button
                id="reset-submit-btn"
                type="submit"
                disabled={forgotLoading}
                className="w-full mt-2 py-2.5 px-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl font-medium text-xs sm:text-sm transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {forgotLoading ? (
                  <span>Resetting password...</span>
                ) : (
                  <>
                    <span>Reset Password</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="text-center pt-2 space-y-1">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setMode('forgot');
                  }}
                  className="text-xs text-zinc-400 hover:text-orange-400 transition-colors cursor-pointer block mx-auto"
                >
                  Didn't receive the token? <span className="font-semibold text-orange-400 underline decoration-orange-400/40 underline-offset-2">Resend</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setNewPassword('');
                    setConfirmNewPassword('');
                    setResetToken('');
                    setMode('login');
                  }}
                  className="text-xs text-zinc-400 hover:text-orange-400 transition-colors cursor-pointer block mx-auto"
                >
                  Back to <span className="font-semibold text-orange-400 underline decoration-orange-400/40 underline-offset-2">Log In</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Demo Accounts Quick-Test Table — Only shown on Login screen */}
        {mode === 'login' && (
          <div className="bg-zinc-950/60 border border-zinc-800/80 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <span>Seed Accounts</span>
                <span className="text-[10px] text-zinc-500 font-normal lowercase">(for instant testing)</span>
              </h2>
              <span className="text-[11px] text-zinc-500">Auto-routes to role portal</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-[11px]">
                    <th className="pb-2 font-medium">Role</th>
                    <th className="pb-2 font-medium">Email</th>
                    <th className="pb-2 font-medium">Password</th>
                    <th className="pb-2 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                  {demoAccounts.map((acc) => (
                    <tr
                      key={acc.role}
                      onClick={() => handleSelectDemoAccount(acc)}
                      className="hover:bg-zinc-900/80 cursor-pointer transition-colors group"
                      title={`Click to fill ${acc.role} credentials`}
                    >
                      <td className="py-2.5 font-medium text-white">
                        <span className="inline-block font-semibold">
                          {acc.role}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-zinc-300 text-[11px]">
                        {acc.email}
                      </td>
                      <td className="py-2.5 font-mono text-zinc-400 text-[11px]">
                        {acc.password}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectDemoAccount(acc);
                          }}
                          className="px-2 py-0.5 rounded text-[11px] font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 cursor-pointer transition-colors group-hover:bg-orange-600 group-hover:border-orange-500 group-hover:text-white"
                        >
                          Use
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-zinc-500 text-center pt-1">
              Clicking any row autofills the login form. The system authenticates your credentials and automatically routes to the appropriate portal.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
