'use client';

import { useState, useEffect } from 'react';
import { signIn, getProviders } from 'next-auth/react';
import { motion } from 'framer-motion';
import {
  Github, Mail, Eye, EyeOff, Lock, ArrowRight,
  AlertCircle, RefreshCw, Shield, Brain, Code2, Infinity, Terminal
} from 'lucide-react';
import { SmokyBackground } from '@/components/chat/smoky-background';

interface ProviderInfo {
  id: string;
  name: string;
}

export default function LoginPage() {
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getProviders().then((p) => {
      if (p) setProviders(p as Record<string, ProviderInfo>);
    });
  }, []);

  const hasGithub = !!providers['github'];

  const handleGithubSignIn = async () => {
    setIsLoading(true);
    await signIn('github', { callbackUrl: '/' });
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        callbackUrl: '/',
        redirect: false,
      });

      if (result?.error) {
        // NextAuth maps thrown Errors to the error string.
        // Our authorize() throws: NO_ACCOUNT, INVALID_PASSWORD
        const errType = result.error;

        if (errType === 'NO_ACCOUNT') {
          setError('No account found with this email. Please sign up first.');
        } else if (errType === 'INVALID_PASSWORD') {
          setError('Incorrect password. Please try again.');
        } else {
          setError('Invalid email or password. Please try again.');
        }
      } else if (result?.ok) {
        window.location.href = '/';
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
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
              Welcome back.
            </h1>
            <p className="text-base text-muted-foreground max-w-md leading-relaxed">
              Your AI coding partner with multi-agent intelligence. Sign in to continue where you left off.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-4 mt-4">
            {[
              { icon: Brain, title: 'Multi-Agent Architecture', desc: 'Draft → Critique → Consensus pipeline' },
              { icon: Shield, title: 'Enterprise Security', desc: 'End-to-end encryption & bcrypt password hashing' },
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
          <span className="text-xs text-muted-foreground/60">Protected by bcrypt encryption & secure password hashing</span>
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

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sign in to continue where you left off.</p>
          </div>

          {/* Error display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3"
            >
              <AlertCircle className="size-4 shrink-0 text-red-500 dark:text-red-400" />
              <span className="text-sm text-red-700 dark:text-red-300">{error}</span>
            </motion.div>
          )}

          {/* GitHub sign-in */}
          {hasGithub && (
            <button
              onClick={handleGithubSignIn}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-sm font-medium text-foreground transition-all hover:bg-accent hover:border-primary/20 disabled:opacity-50"
            >
              <Github className="size-5" />
              Sign in with GitHub
            </button>
          )}

          {hasGithub && (
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-3 text-muted-foreground">or sign in with email</span>
              </div>
            </div>
          )}

          {/* Email + Password form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-2 block text-xs font-medium text-muted-foreground">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="login-email"
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

            <div>
              <label htmlFor="login-password" className="mb-2 block text-xs font-medium text-muted-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
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

            <button
              type="submit"
              disabled={isLoading || !email.trim() || !password}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-emerald-600 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? <RefreshCw className="size-4 animate-spin" /> : (
                <>
                  Sign In
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </form>

          {/* Toggle signup */}
          <div className="mt-8 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <button
              onClick={() => window.location.href = '/signup'}
              className="text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Sign up
            </button>
          </div>

          {/* Security notice */}
          <div className="mt-6 flex items-center justify-center gap-1.5">
            <Shield className="size-3 text-foreground/15" />
            <span className="text-[10px] text-foreground/15">
              Protected by bcrypt encryption &amp; secure password hashing
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
