import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { isAllowedSignIn, parseEmailList } from "@/lib/auth-policy";
import { seedAdminIfEligible } from "@/lib/admin-seed";
import {
  accounts,
  admins,
  sessions,
  users,
  verificationTokens,
} from "@/lib/db/schema";

const seedEmails = parseEmailList(process.env.ADMIN_SEED_EMAILS);
// Exact addresses that may sign in besides @ucsc.edu ones, such as a
// maintainer's gmail. Being let in isn't being an admin: that still takes
// ADMIN_SEED_EMAILS or a nomination.
const EXTRA_ALLOWED_EMAILS = new Set(parseEmailList(process.env.AUTH_EXTRA_ALLOWED_EMAILS));

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [Google],
  session: { strategy: "database" },
  callbacks: {
    async signIn({ user, profile }) {
      if (!isAllowedSignIn(user.email, profile, EXTRA_ALLOWED_EMAILS)) return false;
      const email = (user.email ?? "").toLowerCase();
      // Normalize email to lowercase before the adapter persists it. Without this,
      // case-sensitive lookups (eq(users.email, ...)) silently fail when Google
      // returns a mixed-case email.
      user.email = email;
      return true;
    },
    async session({ session, user }) {
      if (user?.id) {
        const rows = await db
          .select()
          .from(admins)
          .where(eq(admins.userId, user.id))
          .limit(1);
        session.user.isAdmin = rows.length > 0;
        session.user.adminId = rows[0]?.id ?? null;
        session.user.id = user.id;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (!user.id) return;
      const email = (user.email ?? "").toLowerCase();
      // Backfill: ensure existing rows are lowercase so future lookups match.
      if (user.email && user.email !== email) {
        await db.update(users).set({ email }).where(eq(users.id, user.id));
      }
      // Skips anyone a nomination has removed, so demotions stick.
      await seedAdminIfEligible(db, user.id, email, seedEmails);
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
