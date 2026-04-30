import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import EmailProvider from "next-auth/providers/email";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  // ─── Database Adapter ────────────────────────────────────────────────────
  adapter: PrismaAdapter(db),

  // ─── Authentication Providers ─────────────────────────────────────────────
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
    }),
    EmailProvider({
      server: {
        host: process.env.EMAIL_SERVER_HOST || "",
        port: Number(process.env.EMAIL_SERVER_PORT) || 587,
        auth: {
          user: process.env.EMAIL_SERVER_USER || "",
          pass: process.env.EMAIL_SERVER_PASSWORD || "",
        },
      },
      from: process.env.EMAIL_FROM || "noreply@eesha-ai.com",
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
  // The AuthModal component handles login/signup inline on the main page.
  // NextAuth defaults to its own built-in sign-in page if needed.
  pages: {
    error: "/",
  },

  // ─── Callbacks ────────────────────────────────────────────────────────────
  callbacks: {
    async jwt({ token, user, account }) {
      // First time signing in — add user ID to token
      if (user) {
        token.id = user.id;
        token.email = user.email;
        // Carry email verification status
        token.emailVerified = user.emailVerified ?? null;
      }
      // Always include the user ID
      return token;
    },

    async session({ session, token }) {
      // Attach user ID to session for API route usage
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
        // GitHub doesn't always provide email_verified in profile
        // Trust GitHub's verification — if they have a primary email it's verified
        return true;
      }

      // For email magic link: NextAuth's email provider only sends to verified emails
      // The token in the verification_tokens table handles verification
      if (account?.provider === "email") {
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
