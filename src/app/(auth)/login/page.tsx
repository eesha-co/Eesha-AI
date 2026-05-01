'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
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
        // Login failed — check the account status to give a specific error message
        try {
          const statusRes = await fetch('/api/auth/check-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const statusData = await statusRes.json();

          if (statusData.status === 'unverified') {
            setError('Your email has not been verified yet. Please check your email for a verification code, or sign up again to get a new one.');
          } else if (statusData.status === 'not_found') {
            setError('No account found with this email. Please sign up first.');
          } else {
            setError('Invalid email or password. Please try again.');
          }
        } catch {
          // If the status check also fails, show generic error
          setError('Invalid email or password. Please try again.');
        }
      } else if (result?.ok) {
        router.push('/');
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
      <div className="hidden lg:flex relative z-10 w-1/2 flex-col justify-between p-12 border-r border-white/5">
        {/* Back link */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300 self-start"
        >
          ← Back to chat
        </button>

        {/* Center branding */}
        <div className="flex flex-col items-start gap-6">
          <img src="/logo-transparent.png" alt="Eesha AI" className="h-20 w-auto object-contain" />
          <div className="space-y-3">
            <h1 className="text-3xl font-bold text-white">
              Welcome back to<br />
              <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Eesha AI</span>.
            </h1>
            <p className="text-base text-zinc-400 max-w-md leading-relaxed">
              Your AI coding partner with multi-agent intelligence. Sign in to continue where you left off.
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
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/10 border border-violet-500/20">
                  <Icon className="size-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{title}</p>
                  <p className="text-xs text-zinc-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom security notice */}
        <div className="flex items-center gap-2">
          <Shield className="size-3.5 text-zinc-600" />
          <span className="text-xs text-zinc-600">Protected by Supabase RLS & end-to-end encryption</span>
        </div>
      </div>

      {/* ── Right Panel: Form ─────────────────────────────────────────────── */}
      <div className="relative z-10 flex w-full lg:w-1/2 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-lg">
          {/* Mobile back link */}
          <button
            onClick={() => router.push('/')}
            className="lg:hidden flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300 mb-6"
          >
            ← Back to chat
          </button>

          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex items-center gap-3">
            <img src="/logo-transparent.png" alt="Eesha AI" className="h-10 w-auto object-contain" />
            <span className="text-lg font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Eesha AI</span>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">Welcome back</h2>
            <p className="mt-2 text-sm text-zinc-400">Sign in to continue where you left off.</p>
          </div>

          {/* Error display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3"
            >
              <AlertCircle className="size-4 shrink-0 text-red-400" />
              <span className="text-sm text-red-300">{error}</span>
            </motion.div>
          )}

          {/* GitHub sign-in */}
          {hasGithub && (
            <button
              onClick={handleGithubSignIn}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-medium text-white transition-all hover:bg-white/10 hover:border-white/20 disabled:opacity-50"
            >
              <Github className="size-5" />
              Sign in with GitHub
            </button>
          )}

          {hasGithub && (
            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#09090f] px-3 text-zinc-500">or sign in with email</span>
              </div>
            </div>
          )}

          {/* Email + Password form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-medium text-zinc-400">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(''); }}
                  placeholder="you@example.com"
                  autoFocus
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-4 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-violet-500/50 focus:bg-white/10 focus:ring-2 focus:ring-violet-500/30"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs font-medium text-zinc-400">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3.5 pl-11 pr-11 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-violet-500/50 focus:bg-white/10 focus:ring-2 focus:ring-violet-500/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email.trim() || !password}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-3.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <div className="mt-8 text-center text-sm text-zinc-400">
            Don&apos;t have an account?{' '}
            <button
              onClick={() => router.push('/signup')}
              className="text-violet-400 hover:text-violet-300 transition-colors font-medium"
            >
              Sign up
            </button>
          </div>

          {/* Security notice */}
          <div className="mt-6 flex items-center justify-center gap-1.5">
            <Shield className="size-3 text-zinc-600" />
            <span className="text-[10px] text-zinc-600">
              Protected by Supabase RLS, end-to-end encryption &amp; email verification
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
