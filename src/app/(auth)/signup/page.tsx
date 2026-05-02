'use client';

import { useState, useEffect } from 'react';
import { signIn, getProviders } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Github, Mail, Shield, Infinity, MessageSquare,
  Code2, Terminal, Eye, EyeOff, Lock, ArrowRight, Check,
  AlertCircle, RefreshCw, KeyRound, Zap, Cpu, Brain,
  ExternalLink
} from 'lucide-react';
import { SmokyBackground } from '@/components/chat/smoky-background';

interface ProviderInfo {
  id: string;
  name: string;
}

type Step = 'email' | 'username' | 'password' | 'policy' | 'verify' | 'success';

// ─── Password Strength Indicator ──────────────────────────────────────────────
function getPasswordStrength(password: string): {
  score: number; label: string; color: string;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Weak', color: 'bg-red-500' };
  if (score <= 4) return { score, label: 'Fair', color: 'bg-amber-500' };
  return { score, label: 'Strong', color: 'bg-emerald-500' };
}

// ─── OTP Input Component ──────────────────────────────────────────────────────
function OTPInput({ value, onChange, disabled, digits = 6 }: {
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
  digits?: number;
}) {

  const handleChange = (index: number, digit: string) => {
    if (!/^\d*$/.test(digit)) return;
    const newVal = value.split('');
    newVal[index] = digit.slice(-1);
    onChange(newVal.join('').padEnd(value.length).slice(0, digits));
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      const prev = document.getElementById(`otp-${index - 1}`);
      prev?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, digits);
    if (pasted.length > 0) {
      onChange(pasted.padEnd(value.length).slice(0, digits));
    }
  };

  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length: digits }).map((_, i) => (
        <input
          key={i}
          id={`otp-${i}`}
          name={`otp-digit-${i}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={(e) => {
            handleChange(i, e.target.value);
            if (e.target.value && i < digits - 1) {
              document.getElementById(`otp-${i + 1}`)?.focus();
            }
          }}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of verification code`}
          className="size-11 rounded-lg border border-border bg-card text-center text-lg font-bold text-foreground outline-none transition-all focus:border-primary/50 focus:bg-accent focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
        />
      ))}
    </div>
  );
}

// ─── Step Label Helper ────────────────────────────────────────────────────────
function getStepLabel(step: Step): string {
  switch (step) {
    case 'email': return 'Email';
    case 'username': return 'Username';
    case 'password': return 'Password';
    case 'policy': return 'Agreement';
    case 'verify': return 'Verify';
    case 'success': return 'Done';
  }
}

// ─── Signup Page ──────────────────────────────────────────────────────────────
export default function SignupPage() {
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});

  // Multi-step state
  const [step, setStep] = useState<Step>('email');

  // Form fields
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const [otp, setOtp] = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [hasResent, setHasResent] = useState(false);

  useEffect(() => {
    getProviders().then((p) => {
      if (p) setProviders(p as Record<string, ProviderInfo>);
    });
  }, []);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const hasGithub = !!providers['github'];

  // ── Step 1: Email validation & next ──────────────────────────────────────
  const handleEmailNext = () => {
    setError('');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    setStep('username');
  };

  // ── Step 2: Username ─────────────────────────────────────────────────────
  const handleUsernameNext = () => {
    setError('');
    if (!username.trim() || username.trim().length < 3) {
      setError('Username must be at least 3 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username.trim())) {
      setError('Username can only contain letters, numbers, underscores, and hyphens.');
      return;
    }
    setStep('password');
  };

  // ── Step 3: Password validation & next ───────────────────────────────────
  const handlePasswordNext = () => {
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError('Password must contain at least one uppercase letter.');
      return;
    }
    if (!/[a-z]/.test(password)) {
      setError('Password must contain at least one lowercase letter.');
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number.');
      return;
    }
    setStep('policy');
  };

  // ── Step 4: Policy agreement & submit sign-up ────────────────────────────
  const handlePolicySubmit = async () => {
    setError('');
    if (!agreedToPolicy) {
      setError('You must agree to the Eesha AI Privacy Policy and Terms of Service.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, username: username.trim(), agreedToPolicy }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Special case: user already exists — if they're unverified, auto-resend
        if (res.status === 409) {
          // "already registered" — try to resend verification
          console.log('[SIGNUP] User already exists, trying to resend verification');
          const otpRes = await fetch('/api/auth/resend-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          if (otpRes.ok) {
            const otpData = await otpRes.json();
            if (otpData.alreadyVerified) {
              setError('This email is already registered and verified. Please log in instead.');
              return;
            }
            setStep('verify');
            setResendCooldown(60);
            setHasResent(true);
            return;
          }
        }
        setError(data.error || 'Sign-up failed. Please try again.');
        return;
      }

      if (data.emailConfirmed) {
        setStep('success');
        return;
      }

      setStep('verify');
      setResendCooldown(60);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Step 5: Verify OTP ───────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    setError('');
    if (otp.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Verification failed.');
        return;
      }

      // Handle already-verified case (user clicked link)
      if (data.alreadyVerified) {
        setStep('success');
        return;
      }

      setStep('success');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Check if already verified (for link-click case) ─────────────────────
  const handleCheckVerification = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/check-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.status === 'verified') {
        setStep('success');
        return;
      }

      setError('Your email is not verified yet. Please enter the code or click the link in your email.');
    } catch {
      setError('Could not check verification status. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Resend OTP ───────────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();

      if (data.alreadyVerified) {
        setStep('success');
        return;
      }

      if (!res.ok) {
        setError(data.error || 'Could not resend code.');
      } else {
        setResendCooldown(60);
        setHasResent(true);
        setError('');
        setOtp('');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── GitHub sign-in ───────────────────────────────────────────────────────
  const handleGithubSignIn = async () => {
    setIsLoading(true);
    await signIn('github', { callbackUrl: '/' });
  };

  // ── Step indicator ───────────────────────────────────────────────────────
  const signupSteps: Step[] = ['email', 'username', 'password', 'policy', 'verify', 'success'];
  const currentStepIndex = signupSteps.indexOf(step);

  const StepIndicator = () => {
    const visibleSteps: Step[] = ['email', 'username', 'password', 'policy', 'verify'];
    const activeIndex = step === 'success' ? 4 : currentStepIndex;

    return (
      <div className="flex items-center gap-1 mb-8">
        {visibleSteps.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={`flex items-center justify-center rounded-full transition-all duration-300 ${
              i < activeIndex
                ? 'size-7 bg-emerald-500/20 border border-emerald-500/40'
                : i === activeIndex
                ? 'size-7 bg-violet-500/20 border border-violet-500/40'
                : 'size-7 bg-card border border-border'
            }`}>
              {i < activeIndex ? (
                <Check className="size-3.5 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <span className={`text-[10px] font-bold ${i === activeIndex ? 'text-primary' : 'text-muted-foreground'}`}>
                  {i + 1}
                </span>
              )}
            </div>
            {i < visibleSteps.length - 1 && (
              <div className={`h-px w-6 transition-all duration-300 ${
                i < activeIndex ? 'bg-emerald-500/40' : 'bg-accent'
              }`} />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="relative flex min-h-screen">
      {/* Canvas background — same as chat console */}
      <SmokyBackground />

      {/* ── Left Panel: Branding (hidden on mobile) ──────────────────────── */}
      <div className="hidden lg:flex relative z-10 w-1/2 flex-col justify-between p-12">
        {/* Back link */}
        <button
          onClick={() => window.location.href = '/'}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground self-start"
        >
          ← Back to chat
        </button>

        {/* Center branding */}
        <div className="flex flex-col items-start gap-6">
          <img src="/splash-screen.png" alt="Eesha AI" className="h-20 w-auto object-contain" />
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-foreground">
              The AI that codes<br />with a <span className="bg-gradient-to-r from-violet-500 to-emerald-500 dark:from-violet-400 dark:to-emerald-400 bg-clip-text text-transparent">committee mind</span>.
            </h1>
            <p className="text-base text-muted-foreground max-w-md leading-relaxed">
              Three specialized AI agents — a Drafter, a Critic, and a Consensus Builder — collaborate to deliver superior code quality on every request.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-4 mt-4">
            {[
              { icon: Brain, title: 'Multi-Agent Architecture', desc: 'Draft → Critique → Consensus pipeline' },
              { icon: Shield, title: 'Enterprise Security', desc: 'End-to-end encryption, RLS, email verification' },
              { icon: Code2, title: 'Workspace & Terminal', desc: 'Full development environment access' },
              { icon: Infinity, title: 'Unlimited Conversations', desc: 'No caps on messages or sessions' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="size-4 text-primary/60" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom security notice */}
        <div className="flex items-center gap-2">
          <Shield className="size-3.5 text-muted-foreground/60" />
          <span className="text-xs text-muted-foreground/60">Protected by Supabase RLS & end-to-end encryption</span>
        </div>
      </div>

      {/* ── Right Panel: Form ─────────────────────────────────────────────── */}
      <div className="relative z-10 flex w-full lg:w-1/2 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {/* Mobile back link */}
          <button
            onClick={() => window.location.href = '/'}
            className="lg:hidden flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground mb-6"
          >
            ← Back to chat
          </button>

          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <img src="/splash-screen.png" alt="Eesha AI" className="h-12 w-auto object-contain" />
          </div>

          {/* Step indicator */}
          <StepIndicator />

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">
              {step === 'success' ? 'Email Verified!' :
               step === 'verify' ? 'Verify your email' :
               'Create your account'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {step === 'success' ? 'Your account is ready. Sign in to get started.' :
               step === 'verify' ? <>Enter the 6-digit code sent to <strong className="text-foreground">{email}</strong></> :
               'Sign up to unlock unlimited AI conversations.'}
            </p>
          </div>

          {/* Error display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3"
            >
              <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-500 dark:text-red-400" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            </motion.div>
          )}

          {/* ── SIGN UP FLOW ────────────────────────────────────────── */}
          <AnimatePresence mode="wait">
            {/* Step 1: Email */}
            {step === 'email' && (
              <motion.div
                key="email"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                {/* GitHub */}
                {hasGithub && (
                  <button
                    onClick={handleGithubSignIn}
                    disabled={isLoading}
                    className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-medium text-foreground transition-all hover:bg-accent hover:border-primary/20 disabled:opacity-50"
                  >
                    <Github className="size-5" />
                    Continue with GitHub
                  </button>
                )}

                {hasGithub && (
                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-background px-3 text-muted-foreground">or sign up with email</span>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="signup-email" className="mb-2 block text-xs font-medium text-muted-foreground">Email address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="signup-email"
                      name="email"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(''); }}
                      placeholder="you@example.com"
                      autoComplete="email"
                      autoFocus
                      className="w-full rounded-xl border border-border bg-card py-3.5 pl-11 pr-4 text-sm text-foreground placeholder-muted-foreground outline-none transition-all focus:border-primary/50 focus:bg-accent focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <button
                  onClick={handleEmailNext}
                  disabled={!email.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                  <ArrowRight className="size-4" />
                </button>

                {/* Benefits on mobile */}
                <div className="lg:hidden grid grid-cols-2 gap-2 pt-2">
                  {[
                    { icon: Infinity, label: 'Unlimited chats', color: 'text-violet-500 dark:text-violet-400' },
                    { icon: MessageSquare, label: 'Save history', color: 'text-cyan-500 dark:text-cyan-400' },
                    { icon: Code2, label: 'Workspace access', color: 'text-emerald-500 dark:text-emerald-400' },
                    { icon: Terminal, label: 'Terminal access', color: 'text-amber-500 dark:text-amber-400' },
                  ].map(({ icon: Icon, label, color }) => (
                    <div key={label} className="flex items-center gap-2 rounded-lg bg-card px-3 py-2">
                      <Icon className={`size-4 ${color}`} />
                      <span className="text-xs text-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2: Username */}
            {step === 'username' && (
              <motion.div
                key="username"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="signup-username" className="mb-2 block text-xs font-medium text-muted-foreground">Choose a username</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                    <input
                      id="signup-username"
                      name="username"
                      type="text"
                      value={username}
                      onChange={(e) => { setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '')); setError(''); }}
                      placeholder="your_username"
                      autoComplete="username"
                      autoFocus
                      className="w-full rounded-xl border border-border bg-card py-3.5 pl-9 pr-4 text-sm text-foreground placeholder-muted-foreground outline-none transition-all focus:border-primary/50 focus:bg-accent focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">This will be your display name. 3+ characters, letters, numbers, underscores, hyphens.</p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setStep('email'); setError(''); }}
                    className="rounded-xl border border-border bg-card px-5 py-3.5 text-sm text-muted-foreground transition-all hover:bg-accent"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleUsernameNext}
                    disabled={username.trim().length < 3}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                    <ArrowRight className="size-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Password */}
            {step === 'password' && (
              <motion.div
                key="password"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="signup-password" className="mb-2 block text-xs font-medium text-muted-foreground">Create a password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="signup-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(''); }}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      autoFocus
                      className="w-full rounded-xl border border-border bg-card py-3.5 pl-11 pr-11 text-sm text-foreground placeholder-muted-foreground outline-none transition-all focus:border-primary/50 focus:bg-accent focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {/* Password strength */}
                {password.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5, 6].map(i => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-all ${
                            i <= getPasswordStrength(password).score
                              ? getPasswordStrength(password).color
                              : 'bg-accent'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className={`
                        ${getPasswordStrength(password).label === 'Weak' ? 'text-red-500 dark:text-red-400' : ''}
                        ${getPasswordStrength(password).label === 'Fair' ? 'text-amber-500 dark:text-amber-400' : ''}
                        ${getPasswordStrength(password).label === 'Strong' ? 'text-emerald-500 dark:text-emerald-400' : ''}
                      `}>
                        {getPasswordStrength(password).label}
                      </span>
                      <span className="text-muted-foreground">Use 8+ chars with mix of letters, numbers & symbols</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setStep('username'); setError(''); }}
                    className="rounded-xl border border-border bg-card px-5 py-3.5 text-sm text-muted-foreground transition-all hover:bg-accent"
                  >
                    Back
                  </button>
                  <button
                    onClick={handlePasswordNext}
                    disabled={password.length < 8}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                    <ArrowRight className="size-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 4: Policy Agreement */}
            {step === 'policy' && (
              <motion.div
                key="policy"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                {/* Summary */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2.5 text-sm text-foreground">
                    <Mail className="size-4 text-primary" />
                    <span className="truncate">{email}</span>
                    <Check className="size-3.5 text-emerald-500 dark:text-emerald-400 ml-auto" />
                  </div>
                  <div className="flex items-center gap-2.5 text-sm text-foreground">
                    <span className="size-4 text-center text-cyan-500 dark:text-cyan-400 font-bold text-xs">@</span>
                    <span>{username}</span>
                    <Check className="size-3.5 text-emerald-500 dark:text-emerald-400 ml-auto" />
                  </div>
                  <div className="flex items-center gap-2.5 text-sm text-foreground">
                    <Lock className="size-4 text-cyan-500 dark:text-cyan-400" />
                    <span>Password set</span>
                    <Check className="size-3.5 text-emerald-500 dark:text-emerald-400 ml-auto" />
                  </div>
                </div>

                {/* Policy checkbox */}
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                    agreedToPolicy
                      ? 'border-violet-500 bg-violet-600'
                      : 'border-border bg-card group-hover:border-primary/20'
                  }`}>
                    {agreedToPolicy && <Check className="size-3 text-white" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={agreedToPolicy}
                    onChange={(e) => { setAgreedToPolicy(e.target.checked); setError(''); }}
                    className="sr-only"
                  />
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    I agree to the{' '}
                    <a href="#" className="text-primary hover:text-primary/80 underline underline-offset-2">
                      Privacy Policy
                    </a>{' '}and{' '}
                    <a href="#" className="text-primary hover:text-primary/80 underline underline-offset-2">
                      Terms of Service
                    </a>
                    . I understand that my data is protected by end-to-end encryption and Row Level Security.
                  </span>
                </label>

                <div className="flex gap-3">
                  <button
                    onClick={() => { setStep('password'); setError(''); }}
                    className="rounded-xl border border-border bg-card px-5 py-3.5 text-sm text-muted-foreground transition-all hover:bg-accent"
                  >
                    Back
                  </button>
                  <button
                    onClick={handlePolicySubmit}
                    disabled={isLoading || !agreedToPolicy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Shield className="size-4" />
                        Create Account
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 5: OTP Verification */}
            {step === 'verify' && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="space-y-5"
              >
                <div className="flex justify-center">
                  <div className="flex size-16 items-center justify-center rounded-full bg-violet-600/10 border border-violet-500/20">
                    <KeyRound className="size-7 text-primary" />
                  </div>
                </div>

                <div className="text-center space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Check your email for a 6-digit verification code
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    If your email contains a verification link instead, click it to verify
                  </p>
                </div>

                <OTPInput value={otp} onChange={setOtp} disabled={isLoading} digits={6} />

                <button
                  onClick={handleVerifyOtp}
                  disabled={isLoading || otp.length !== 6}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <>
                      <Shield className="size-4" />
                      Verify Email
                    </>
                  )}
                </button>

                <div className="text-center space-y-2">
                  {resendCooldown > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Resend code in <span className="text-primary">{resendCooldown}s</span>
                    </p>
                  ) : (
                    <button
                      onClick={handleResendOtp}
                      disabled={isLoading}
                      className="text-xs text-primary hover:text-primary/80 transition-colors"
                    >
                      Didn&apos;t get a code? Resend
                    </button>
                  )}

                  <button
                    onClick={handleCheckVerification}
                    disabled={isLoading}
                    className="block mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Already clicked the link? Check status
                  </button>
                </div>

                {hasResent && (
                  <div className="flex items-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
                    <AlertCircle className="size-4 shrink-0 text-blue-500 dark:text-blue-400" />
                    <span className="text-xs text-blue-700 dark:text-blue-200">
                      A new code has been sent. Use the code from the LATEST email — previous codes are no longer valid.
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <AlertCircle className="size-4 shrink-0 text-amber-500 dark:text-amber-400" />
                  <span className="text-xs text-amber-700 dark:text-amber-200">
                    Your account is locked until you verify your email. This protects your data from unauthorized access.
                  </span>
                </div>
              </motion.div>
            )}

            {/* Step 6: Success */}
            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="space-y-5 text-center"
              >
                <div className="flex justify-center">
                  <div className="flex size-16 items-center justify-center rounded-full bg-emerald-600/10 border border-emerald-500/20">
                    <Check className="size-7 text-emerald-500 dark:text-emerald-400" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Your email has been verified. You can now sign in with your credentials.
                </p>
                <button
                  onClick={() => window.location.href = '/login'}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-emerald-500"
                >
                  Sign In Now
                  <ArrowRight className="size-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toggle login */}
          {step !== 'success' && step !== 'verify' && (
            <div className="mt-8 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <button
                onClick={() => window.location.href = '/login'}
                className="text-primary hover:text-primary/80 transition-colors font-medium"
              >
                Log in
              </button>
            </div>
          )}

          {/* Security notice */}
          <div className="mt-6 flex items-center justify-center gap-1.5">
            <Shield className="size-3 text-foreground/15" />
            <span className="text-[10px] text-foreground/15">
              Protected by Supabase RLS, end-to-end encryption &amp; email verification
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
