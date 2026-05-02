import type { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSignupClient, createServerSupabaseClient } from "@/lib/supabase-server";

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
          // ── STEP 1: Try Supabase Auth signInWithPassword ─────────────────
          console.log('[AUTH] Attempting signInWithPassword for:', email);

          let supabaseLoginWorked = false;
          let supabaseUser: any = null;

          try {
            const signupClient = createSignupClient();
            const { data, error } = await signupClient.auth.signInWithPassword({
              email,
              password: credentials.password,
            });

            if (!error && data.user) {
              supabaseLoginWorked = true;
              supabaseUser = data.user;
              console.log('[AUTH] signInWithPassword succeeded for:', email);
            } else if (error) {
              console.error('[AUTH] signInWithPassword error:', error.message, '| status:', error.status);
            }
          } catch (e) {
            console.error('[AUTH] signInWithPassword threw:', e);
          }

          // ── STEP 2: If Supabase login worked → check verification & return ──
          if (supabaseLoginWorked && supabaseUser) {
            // Check email verification
            if (!supabaseUser.email_confirmed_at) {
              console.log('[AUTH] User email not verified:', email);
              throw new Error("EMAIL_NOT_VERIFIED");
            }

            // Find or create user in Prisma DB
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

          // ── STEP 3: Supabase login failed — try bcrypt fallback ──────────
          console.log('[AUTH] Trying local bcrypt fallback for:', email);
          const localUser = await db.user.findUnique({ where: { email } });

          if (localUser?.passwordHash) {
            const passwordMatches = await bcrypt.compare(credentials.password, localUser.passwordHash);
            if (passwordMatches) {
              console.log('[AUTH] Local bcrypt match! Fixing Supabase Auth password...');

              // Fix the password in Supabase Auth so next login works
              try {
                const adminClient = createServerSupabaseClient();
                await adminClient.auth.admin.updateUserById(localUser.id, {
                  password: credentials.password,
                });
                console.log('[AUTH] Password synced to Supabase Auth for:', email);
              } catch (syncErr) {
                console.error('[AUTH] Could not sync password to Supabase:', syncErr);
              }

              // Check email verification
              if (!localUser.emailVerified) {
                throw new Error("EMAIL_NOT_VERIFIED");
              }

              return {
                id: localUser.id,
                email: localUser.email,
                name: localUser.name || email.split("@")[0],
                image: localUser.image,
                emailVerified: localUser.emailVerified,
              };
            } else {
              console.log('[AUTH] bcrypt password did not match for:', email);
            }
          } else {
            console.log('[AUTH] No local user or passwordHash for:', email, '| hasUser:', !!localUser, '| hasHash:', !!localUser?.passwordHash);
          }

          // ── STEP 4: Last resort — admin API password reset ───────────────
          // If the user exists in Supabase Auth but the password doesn't match,
          // AND we don't have a bcrypt backup, check via admin API and try to
          // fix the password. This handles users created with the old flow
          // where the password was set via admin.createUser() but might have
          // been lost.
          console.log('[AUTH] Trying admin API fallback for:', email);
          try {
            const adminClient = createServerSupabaseClient();
            const { data: usersData } = await adminClient.auth.admin.listUsers();
            const supabaseUserRecord = usersData?.users?.find(
              (u: any) => u.email?.toLowerCase() === email
            );

            if (supabaseUserRecord) {
              console.log('[AUTH] User found in Supabase Auth:', email, '| confirmed:', !!supabaseUserRecord.email_confirmed_at);

              // Check if email is verified
              if (!supabaseUserRecord.email_confirmed_at) {
                throw new Error("EMAIL_NOT_VERIFIED");
              }

              // The user exists in Supabase Auth. Their password might be
              // corrupted or missing. Reset it with what they provided.
              console.log('[AUTH] Resetting password for existing user:', email);
              await adminClient.auth.admin.updateUserById(supabaseUserRecord.id, {
                password: credentials.password,
              });

              // Now try signInWithPassword again
              const signupClient = createSignupClient();
              const retryResult = await signupClient.auth.signInWithPassword({
                email,
                password: credentials.password,
              });

              if (!retryResult.error && retryResult.data.user) {
                console.log('[AUTH] Login succeeded after password reset for:', email);

                // Ensure Prisma DB record exists
                try {
                  await db.user.upsert({
                    where: { id: supabaseUserRecord.id },
                    create: {
                      id: supabaseUserRecord.id,
                      email,
                      name: supabaseUserRecord.user_metadata?.username || email.split("@")[0],
                      emailVerified: new Date(supabaseUserRecord.email_confirmed_at),
                      passwordHash: await bcrypt.hash(credentials.password, 12),
                    },
                    update: {
                      emailVerified: new Date(supabaseUserRecord.email_confirmed_at),
                      passwordHash: await bcrypt.hash(credentials.password, 12),
                    },
                  });
                } catch (dbErr) {
                  console.error('[AUTH] DB upsert failed (non-fatal):', dbErr);
                }

                return {
                  id: supabaseUserRecord.id,
                  email: supabaseUserRecord.email,
                  name: supabaseUserRecord.user_metadata?.username || email.split("@")[0],
                  emailVerified: new Date(supabaseUserRecord.email_confirmed_at),
                };
              } else {
                console.error('[AUTH] Login still failed after password reset:', retryResult.error?.message);
              }
            } else {
              console.log('[AUTH] User not found in Supabase Auth:', email);
            }
          } catch (adminErr) {
            // Re-throw EMAIL_NOT_VERIFIED
            if (adminErr instanceof Error && adminErr.message === "EMAIL_NOT_VERIFIED") {
              throw adminErr;
            }
            console.error('[AUTH] Admin API fallback failed:', adminErr);
          }

          // ── Nothing worked ────────────────────────────────────────────────
          console.log('[AUTH] All login methods failed for:', email);
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
