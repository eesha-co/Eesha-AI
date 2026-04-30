import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const authOptions: NextAuthOptions = {
  // ─── Database Adapter ────────────────────────────────────────────────────
  adapter: PrismaAdapter(db),

  // ─── Authentication Providers ─────────────────────────────────────────────
  providers: [
    // GitHub OAuth — trusted provider, email is pre-verified by GitHub
    GithubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
    }),

    // Email + Password credentials — verified against Supabase Auth
    // This replaces the old "magic link" email provider for better security
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
          // ── Verify credentials against Supabase Auth ──────────────────────
          const supabase = createServerSupabaseClient();
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: credentials.password,
          });

          if (error) {
            // Map common errors to user-friendly messages
            if (error.message.includes('Invalid login credentials')) {
              throw new Error("Invalid email or password.");
            }
            throw new Error("Login failed. Please try again.");
          }

          if (!data.user) {
            throw new Error("Invalid email or password.");
          }

          // ── CRITICAL: Check email verification ────────────────────────────
          if (!data.user.email_confirmed_at) {
            throw new Error("EMAIL_NOT_VERIFIED");
          }

          // ── Find or create user in our Prisma DB ──────────────────────────
          let user = await db.user.findUnique({
            where: { email },
          });

          if (!user) {
            // Edge case: user exists in Supabase but not in our DB yet
            user = await db.user.create({
              data: {
                id: data.user.id,
                email,
                name: email.split("@")[0],
                emailVerified: new Date(data.user.email_confirmed_at),
              },
            });
          } else if (!user.emailVerified && data.user.email_confirmed_at) {
            // Update verification status if it was pending
            await db.user.update({
              where: { id: user.id },
              data: { emailVerified: new Date(data.user.email_confirmed_at) },
            });
          }

          return {
            id: data.user.id,
            email: data.user.email,
            name: user.name || email.split("@")[0],
            image: user.image,
            emailVerified: data.user.email_confirmed_at ? new Date(data.user.email_confirmed_at) : null,
          };
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
  // We use a MODAL-based auth flow (like ChatGPT), not a separate login page.
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
        // But if the user already has an account with unverified email,
        // we should still allow GitHub sign-in since GitHub has verified the email
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
