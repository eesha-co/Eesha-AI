import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  // ─── Database Adapter ────────────────────────────────────────────────────
  // PrismaAdapter connects to Supabase PostgreSQL via DATABASE_URL.
  // All data (users, sessions, conversations) lives in Supabase — NOT local storage.
  adapter: PrismaAdapter(db),

  // ─── Authentication Providers ─────────────────────────────────────────────
  providers: [
    // GitHub OAuth — trusted provider, email is pre-verified by GitHub
    GithubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
    }),

    // Email + Password credentials — verified against our `users` table directly
    // We use bcrypt to compare the input password against the encrypted hash stored in the table.
    // No Supabase Auth signInWithPassword() — we own the auth logic.
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
          // ── Look up user in our `users` table ────────────────────────────
          // The `users` table lives in Supabase PostgreSQL (via Prisma).
          // It stores: email, name (username), passwordHash (bcrypt), emailVerified
          console.log('[AUTH] Looking up user in users table:', email);

          const user = await db.user.findUnique({ where: { email } });

          if (!user) {
            console.log('[AUTH] No account found:', email);
            throw new Error("NO_ACCOUNT");
          }

          // ── Check if password hash exists ────────────────────────────────
          if (!user.passwordHash) {
            console.log('[AUTH] User has no password set (OAuth-only account?):', email);
            throw new Error("INVALID_PASSWORD");
          }

          // ── Compare input password against bcrypt hash ───────────────────
          // bcrypt.compare() hashes the input and compares against the stored hash.
          // The stored hash was created by bcrypt.hash(password, 12) during signup.
          console.log('[AUTH] Comparing password with bcrypt hash for:', email);
          const passwordMatches = await bcrypt.compare(credentials.password, user.passwordHash);

          if (!passwordMatches) {
            console.log('[AUTH] Password does not match for:', email);
            throw new Error("INVALID_PASSWORD");
          }

          // ── Success — return the user ────────────────────────────────────
          console.log('[AUTH] Login successful for:', email);
          return {
            id: user.id,
            email: user.email,
            name: user.name || email.split("@")[0],
            image: user.image,
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
  pages: {
    error: "/",
  },

  // ─── Callbacks ────────────────────────────────────────────────────────────
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },

    async signIn({ user, account }) {
      if (account?.provider === "github") {
        return true;
      }
      if (account?.provider === "credentials") {
        return true;
      }
      return true;
    },
  },

  // ─── Security Settings ────────────────────────────────────────────────────
  secret: process.env.NEXTAUTH_SECRET,
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
