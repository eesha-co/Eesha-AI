'use client';

import { signIn, getProviders } from 'next-auth/react';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github, Mail, Chrome } from 'lucide-react';

interface ProviderInfo {
  id: string;
  name: string;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');
  const [providers, setProviders] = useState<Record<string, ProviderInfo>>({});
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    getProviders().then((p) => {
      if (p) setProviders(p as Record<string, ProviderInfo>);
    });
  }, []);

  const handleSignIn = async (providerId: string) => {
    setIsLoading(true);
    await signIn(providerId, { callbackUrl });
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsLoading(true);
    const result = await signIn('email', { email, callbackUrl, redirect: false });
    if (result?.ok) {
      setEmailSent(true);
    }
    setIsLoading(false);
  };

  const hasGithub = !!providers['github'];
  const hasGoogle = !!providers['google'];
  const hasEmail = !!providers['email'];
  const hasAnyProvider = hasGithub || hasGoogle || hasEmail;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09090f] px-4">
      {/* Animated background gradient */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-1/2 -top-1/2 h-[200%] w-[200%] animate-spin-slow bg-gradient-to-br from-violet-900/20 via-transparent to-cyan-900/20" style={{ animationDuration: '30s' }} />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo and branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600/20 to-cyan-600/20 p-3 backdrop-blur-sm border border-white/10">
            <img src="/logo-transparent.png" alt="Eesha AI" className="size-10 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            Welcome to <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Eesha AI</span>
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Sign in to access your AI coding workspace
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-300">
            {error === 'OAuthAccountNotLinked'
              ? 'This account is already linked to another sign-in method.'
              : error === 'EmailSignin'
              ? 'Failed to send sign-in email. Please try again.'
              : 'An error occurred during sign-in. Please try again.'}
          </div>
        )}

        {/* Sign-in card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
          {hasAnyProvider ? (
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

              {/* Google */}
              {hasGoogle && (
                <button
                  onClick={() => handleSignIn('google')}
                  disabled={isLoading}
                  className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-all hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Chrome className="size-5" />
                  Continue with Google
                </button>
              )}

              {/* Email / Magic Link */}
              {hasEmail && (
                <>
                  {(hasGithub || hasGoogle) && (
                    <div className="relative my-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/10" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-[#09090f] px-3 text-zinc-500">or</span>
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
            </div>
          ) : (
            /* No providers configured — show setup message */
            <div className="text-center">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm font-medium text-amber-300">Authentication Not Configured</p>
                <p className="mt-2 text-xs text-zinc-400">
                  The administrator needs to configure at least one authentication provider (GitHub, Google, or Email) in the environment variables.
                </p>
              </div>
              <button
                onClick={() => signIn('credentials', { callbackUrl })}
                className="mt-4 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 px-6 py-3 text-sm font-medium text-white transition-all hover:from-violet-500 hover:to-cyan-500"
              >
                Continue without auth (demo mode)
              </button>
            </div>
          )}
        </div>

        {/* Security notice */}
        <div className="mt-6 text-center">
          <p className="text-[11px] text-zinc-600">
            Protected by end-to-end encryption and Row Level Security
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#09090f]">
        <div className="text-zinc-500 text-sm">Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
