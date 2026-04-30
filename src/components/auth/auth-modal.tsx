'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signIn, getProviders } from 'next-auth/react';
import { X, Github, Mail, Zap, Shield, Infinity, MessageSquare, Code2, Terminal } from 'lucide-react';
import { useChatStore } from '@/stores/chat-store';

interface ProviderInfo {
  id: string;
  name: string;
}

export function AuthModal() {
  const { showLoginPrompt, setShowLoginPrompt, freeCreditsUsed } = useChatStore();
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<'login' | 'signup'>('signup');

  const FREE_TIER_MAX = 5;

  useEffect(() => {
    getProviders().then((p) => {
      if (p) setProviders(p as Record<string, ProviderInfo>);
    });
  }, []);

  const handleSignIn = async (providerId: string) => {
    setIsLoading(true);
    await signIn(providerId, { callbackUrl: '/' });
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    const result = await signIn('email', { email, callbackUrl: '/', redirect: false });
    if (result?.ok) {
      setEmailSent(true);
    }
    setIsLoading(false);
  };

  const handleClose = () => {
    setShowLoginPrompt(false);
    setEmailSent(false);
    setEmail('');
  };

  const hasGithub = !!providers['github'];
  const hasEmail = !!providers['email'];
  const hasAnyProvider = hasGithub || hasEmail;

  const creditsRemaining = Math.max(0, FREE_TIER_MAX - freeCreditsUsed);
  const isCreditExpired = freeCreditsUsed >= FREE_TIER_MAX;

  return (
    <AnimatePresence>
      {showLoginPrompt && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f1a] shadow-2xl shadow-black/50">
              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
              </button>

              {/* Gradient glow at top */}
              <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-violet-600/20 to-transparent" />

              <div className="relative p-6">
                {/* Header */}
                <div className="mb-6 text-center">
                  <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/20 to-cyan-600/20 p-2.5 backdrop-blur-sm border border-white/10">
                    <img src="/logo-transparent.png" alt="Eesha AI" className="size-9 object-contain" />
                  </div>

                  {isCreditExpired ? (
                    <>
                      <h2 className="text-xl font-bold text-white">
                        Free messages used up
                      </h2>
                      <p className="mt-2 text-sm text-zinc-400">
                        You&apos;ve used all {FREE_TIER_MAX} free messages. Sign in for unlimited access to Eesha AI.
                      </p>
                    </>
                  ) : view === 'signup' ? (
                    <>
                      <h2 className="text-xl font-bold text-white">
                        Create your free account
                      </h2>
                      <p className="mt-2 text-sm text-zinc-400">
                        Sign up to unlock unlimited AI conversations and more.
                      </p>
                    </>
                  ) : (
                    <>
                      <h2 className="text-xl font-bold text-white">
                        Welcome back
                      </h2>
                      <p className="mt-2 text-sm text-zinc-400">
                        Sign in to continue where you left off.
                      </p>
                    </>
                  )}
                </div>

                {/* Benefits if credits expired or signup */}
                {(isCreditExpired || view === 'signup') && (
                  <div className="mb-6 grid grid-cols-2 gap-2">
                    {[
                      { icon: Infinity, label: 'Unlimited chats', color: 'text-violet-400' },
                      { icon: MessageSquare, label: 'Save history', color: 'text-cyan-400' },
                      { icon: Code2, label: 'Workspace access', color: 'text-emerald-400' },
                      { icon: Terminal, label: 'Terminal access', color: 'text-amber-400' },
                    ].map(({ icon: Icon, label, color }) => (
                      <div key={label} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                        <Icon className={`size-4 ${color}`} />
                        <span className="text-xs text-zinc-300">{label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Credits remaining notice */}
                {!isCreditExpired && creditsRemaining > 0 && creditsRemaining < FREE_TIER_MAX && (
                  <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                    <Zap className="size-4 text-amber-400" />
                    <span className="text-xs text-amber-200">
                      {creditsRemaining} free message{creditsRemaining !== 1 ? 's' : ''} remaining. Sign in for unlimited access.
                    </span>
                  </div>
                )}

                {/* Auth providers */}
                <div className="space-y-3">
                  {/* GitHub */}
                  {hasGithub && (
                    <button
                      onClick={() => handleSignIn('github')}
                      disabled={isLoading}
                      className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Github className="size-5" />
                      Continue with GitHub
                    </button>
                  )}

                  {/* Email / Magic Link */}
                  {hasEmail && (
                    <>
                      {hasGithub && (
                        <div className="relative my-3">
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10" />
                          </div>
                          <div className="relative flex justify-center text-xs">
                            <span className="bg-[#0f0f1a] px-3 text-zinc-500">or</span>
                          </div>
                        </div>
                      )}

                      {emailSent ? (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                          <Mail className="mx-auto mb-2 size-8 text-emerald-400" />
                          <p className="text-sm font-medium text-emerald-300">Check your email</p>
                          <p className="mt-1 text-xs text-zinc-400">
                            We sent a sign-in link to <strong>{email}</strong>
                          </p>
                        </div>
                      ) : (
                        <form onSubmit={handleEmailSignIn} className="space-y-3">
                          <div>
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="you@example.com"
                              required
                              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-zinc-500 outline-none transition-all focus:border-violet-500/50 focus:bg-white/10 focus:ring-1 focus:ring-violet-500/30"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isLoading || !email.trim()}
                            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-4 py-3 text-sm font-medium text-white transition-all hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Mail className="size-4" />
                            Send magic link
                          </button>
                        </form>
                      )}
                    </>
                  )}

                  {/* No providers configured */}
                  {!hasAnyProvider && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
                      <p className="text-sm font-medium text-amber-300">Authentication Not Configured</p>
                      <p className="mt-2 text-xs text-zinc-400">
                        The administrator needs to configure at least one authentication provider.
                      </p>
                    </div>
                  )}
                </div>

                {/* Toggle login/signup */}
                <div className="mt-5 text-center text-sm text-zinc-400">
                  {view === 'signup' ? (
                    <>
                      Already have an account?{' '}
                      <button
                        onClick={() => setView('login')}
                        className="text-violet-400 hover:text-violet-300 transition-colors font-medium"
                      >
                        Log in
                      </button>
                    </>
                  ) : (
                    <>
                      Don&apos;t have an account?{' '}
                      <button
                        onClick={() => setView('signup')}
                        className="text-violet-400 hover:text-violet-300 transition-colors font-medium"
                      >
                        Sign up
                      </button>
                    </>
                  )}
                </div>

                {/* Security notice */}
                <div className="mt-4 flex items-center justify-center gap-1.5">
                  <Shield className="size-3 text-zinc-600" />
                  <span className="text-[10px] text-zinc-600">
                    Protected by Row Level Security &amp; end-to-end encryption
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
