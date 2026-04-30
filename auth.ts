import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  accounts,
  admins,
  sessions,
  users,
  verificationTokens,
} from "@/lib/db/schema";

const seedEmails = (process.env.ADMIN_SEED_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

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
    async signIn({ user }) {
      const email = (user.email ?? "").toLowerCase();
      return email.endsWith("@ucsc.edu");
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
      if (!seedEmails.includes(email)) return;
      await db
        .insert(admins)
        .values({ userId: user.id, promotedByNominationId: null })
        .onConflictDoNothing();
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
