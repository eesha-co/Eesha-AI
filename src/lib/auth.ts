import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";
import { createSignupClient, createServerSupabaseClient } from "@/lib/supabase-server";

export const authOptions: NextAuthOptions = {
  // ─── Database Adapter ────────────────────────────────────────────────────
  // PrismaAdapter is ONLY used for OAuth account linking (GitHub).
  // For credentials login, we use Supabase Auth exclusively.
  // Prisma connects to the same Supabase PostgreSQL database — NOT local storage.
  adapter: PrismaAdapter(db),

  // ─── Authentication Providers ─────────────────────────────────────────────
  providers: [
    // GitHub OAuth — trusted provider, email is pre-verified by GitHub
    GithubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
    }),

    // Email + Password credentials — verified against Supabase Auth ONLY
    CredentialsProvider({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Email and password are required.");
        }

        const email = credentials.email.toLowerCase().trim();

        try {
          // ── STEP 1: Authenticate via Supabase Auth ───────────────────────
          // Supabase Auth is the SOLE source of truth for credential verification.
          // We call signInWithPassword() directly — no bcrypt, no Prisma for auth.
          console.log('[AUTH] Attempting signInWithPassword for:', email);

          let supabaseUser: any = null;
          let supabaseError: any = null;

          try {
            const signupClient = createSignupClient();
            const { data, error } = await signupClient.auth.signInWithPassword({
              email,
              password: credentials.password,
            });

            if (!error && data.user) {
              supabaseUser = data.user;
              console.log('[AUTH] signInWithPassword succeeded for:', email);
            } else if (error) {
              supabaseError = error;
              console.error('[AUTH] signInWithPassword error:', error.message, '| code:', error.code, '| status:', error.status);
            }
          } catch (e: any) {
            supabaseError = e;
            console.error('[AUTH] signInWithPassword threw:', e?.message || e);
          }

          // ── STEP 2: If Supabase login succeeded → verify email & return ──
          if (supabaseUser) {
            // Check email verification
            if (!supabaseUser.email_confirmed_at) {
              console.log('[AUTH] User email not verified:', email);
              throw new Error("EMAIL_NOT_VERIFIED");
            }

            // Find or create user in Prisma DB (for NextAuth session management)
            // This does NOT verify the password — it just ensures the Prisma record exists
            let user = await db.user.findUnique({ where: { email } });

            if (!user) {
              try {
                user = await db.user.create({
                  data: {
                    id: supabaseUser.id,
                    email,
                    name: supabaseUser.user_metadata?.username || email.split("@")[0],
                    emailVerified: new Date(supabaseUser.email_confirmed_at),
                  },
                });
              } catch (createErr) {
                console.error('[AUTH] DB create failed:', createErr);
                // Return the user anyway — they authenticated with Supabase
                return {
                  id: supabaseUser.id,
                  email: supabaseUser.email,
                  name: supabaseUser.user_metadata?.username || email.split("@")[0],
                  emailVerified: new Date(supabaseUser.email_confirmed_at),
                };
              }
            } else if (!user.emailVerified && supabaseUser.email_confirmed_at) {
              try {
                await db.user.update({
                  where: { id: user.id },
                  data: { emailVerified: new Date(supabaseUser.email_confirmed_at) },
                });
              } catch {}
            }

            return {
              id: supabaseUser.id,
              email: supabaseUser.email,
              name: supabaseUser.user_metadata?.username || user?.name || email.split("@")[0],
              image: user?.image,
              emailVerified: supabaseUser.email_confirmed_at ? new Date(supabaseUser.email_confirmed_at) : null,
            };
          }

          // ── STEP 3: Supabase login failed → diagnose and return error ────
          // Instead of silently trying bcrypt, we check the Supabase Auth
          // admin API to give the user a SPECIFIC error message.
          console.log('[AUTH] Supabase login failed for:', email, '| checking user status...');

          try {
            const adminClient = createServerSupabaseClient();

            // Find the user in Supabase Auth
            const { data: usersData } = await adminClient.auth.admin.listUsers();
            const supabaseUserRecord = usersData?.users?.find(
              (u: any) => u.email?.toLowerCase() === email
            );

            if (!supabaseUserRecord) {
              console.log('[AUTH] User not found in Supabase Auth:', email);
              throw new Error("NO_ACCOUNT");
            }

            // Check if email is confirmed
            if (!supabaseUserRecord.email_confirmed_at) {
              console.log('[AUTH] User exists but email not verified:', email);
              throw new Error("EMAIL_NOT_VERIFIED");
            }

            // User exists and is verified, but password doesn't match
            console.log('[AUTH] User exists, email verified, but password wrong:', email);
            throw new Error("INVALID_PASSWORD");

          } catch (adminErr: any) {
            // Re-throw our specific errors
            if (adminErr?.message === "NO_ACCOUNT" ||
                adminErr?.message === "EMAIL_NOT_VERIFIED" ||
                adminErr?.message === "INVALID_PASSWORD") {
              throw adminErr;
            }
            // Admin API failed too — just return generic error
            console.error('[AUTH] Admin API check failed:', adminErr);
          }

          // ── Fallback: generic error ──────────────────────────────────────
          console.log('[AUTH] All checks failed for:', email);
          throw new Error("Invalid email or password.");

        } catch (error: unknown) {
          // Re-throw known errors
          if (error instanceof Error) {
            throw error;
          }
          throw new Error("An unexpected error occurred during login.");
        }
      },
    }),
  ],

  // ─── Session Configuration ────────────────────────────────────────────────
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 hours
    updateAge: 4 * 60 * 60, // Update session every 4 hours
  },

  // ─── JWT Configuration ────────────────────────────────────────────────────
  jwt: {
    maxAge: 24 * 60 * 60, // 24 hours
  },

  // ─── Pages ────────────────────────────────────────────────────────────────
  pages: {
    error: "/",
  },

  // ─── Callbacks ────────────────────────────────────────────────────────────
  callbacks: {
    async jwt({ token, user, account }) {
      // First time signing in — add user info to token
      if (user) {
        token.id = user.id;
        token.email = user.email;
        // Carry email verification status
        token.emailVerified = user.emailVerified ?? null;
      }
      return token;
    },

    async session({ session, token }) {
      // Attach user info to session for API route usage
      if (session.user) {
        session.user.id = token.id as string;
        // Include email verification status in session
        (session.user as any).emailVerified = token.emailVerified;
      }
      return session;
    },

    async signIn({ user, account, profile }) {
      // Security: Block sign-in if email is not verified

      if (account?.provider === "github") {
        // GitHub OAuth — GitHub verifies emails, so we trust it
        return true;
      }

      if (account?.provider === "credentials") {
        // Credentials provider — email verification is already checked
        // in the authorize() function above (throws EMAIL_NOT_VERIFIED)
        return true;
      }

      return true;
    },
  },

  // ─── Security Settings ────────────────────────────────────────────────────
  secret: process.env.NEXTAUTH_SECRET,

  // Enable debug in development only
  debug: process.env.NODE_ENV === "development",

  // ─── Events (for audit logging) ───────────────────────────────────────────
  events: {
    async signIn({ user, account }) {
      console.log(`[AUTH] User signed in: ${user.email} via ${account?.provider}`);
    },
    async signOut({ session }) {
      console.log(`[AUTH] User signed out: ${session?.user?.email}`);
    },
    async createUser({ user }) {
      console.log(`[AUTH] New user created: ${user.email}`);
    },
  },
};
