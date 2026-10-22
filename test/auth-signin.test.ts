import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { admins, users } from "@/lib/db/schema";

// auth.ts hands its config to NextAuth at import. Capture it so the sign-in,
// seeding and session callbacks run exactly as written, against a test database.
type Config = {
  callbacks: {
    signIn: (a: { user: { email?: string | null }; profile?: Record<string, unknown> }) => Promise<boolean>;
    session: (a: {
      session: { user: Record<string, unknown> };
      user: { id: string };
    }) => Promise<{ user: Record<string, unknown> }>;
  };
  events: { signIn: (a: { user: { id?: string; email?: string | null } }) => Promise<void> };
};
const state = vi.hoisted(() => ({ config: undefined as unknown, db: undefined as unknown }));

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    state.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/google", () => ({
  default: (options: Record<string, unknown>) => ({ id: "google", ...options }),
}));
vi.mock("@auth/drizzle-adapter", () => ({ DrizzleAdapter: () => ({}) }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return state.db;
  },
}));

const MAINTAINER = "maintainer@gmail.com";

async function loadAuth(env: { ADMIN_SEED_EMAILS?: string; AUTH_EXTRA_ALLOWED_EMAILS?: string }) {
  vi.resetModules();
  vi.stubEnv("ADMIN_SEED_EMAILS", env.ADMIN_SEED_EMAILS ?? "");
  vi.stubEnv("AUTH_EXTRA_ALLOWED_EMAILS", env.AUTH_EXTRA_ALLOWED_EMAILS ?? "");
  await import("@/auth");
  return state.config as Config;
}

// What Google sends for a consumer account: verified, no hosted domain.
const gmailProfile = (email: string, verified = true) => ({
  email,
  email_verified: verified,
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("auth.ts sign-in", () => {
  const env = {
    ADMIN_SEED_EMAILS: `a@ucsc.edu,b@ucsc.edu,c@ucsc.edu,${MAINTAINER}`,
    AUTH_EXTRA_ALLOWED_EMAILS: MAINTAINER,
  };

  it("lets the listed gmail in and makes it an admin through the seed", async () => {
    const { db, client } = await createTestDb();
    state.db = db;
    const config = await loadAuth(env);

    const user = { email: "Maintainer@gmail.com" };
    expect(await config.callbacks.signIn({ user, profile: gmailProfile(MAINTAINER) })).toBe(true);
    expect(user.email).toBe(MAINTAINER);

    // The adapter creates the user row, then the signIn event seeds the admin.
    await db.insert(users).values({ id: "u-m", email: MAINTAINER });
    await config.events.signIn({ user: { id: "u-m", email: MAINTAINER } });
    expect(await db.select().from(admins).where(eq(admins.userId, "u-m"))).toHaveLength(1);

    const session = await config.callbacks.session({ session: { user: {} }, user: { id: "u-m" } });
    expect(session.user.isAdmin).toBe(true);
    expect(session.user.adminId).toEqual(expect.any(Number));
    client.close();
  });

  it("rejects any other gmail", async () => {
    const config = await loadAuth(env);
    const other = "someone@gmail.com";
    expect(await config.callbacks.signIn({ user: { email: other }, profile: gmailProfile(other) })).toBe(false);
  });

  it("rejects the listed gmail when Google doesn't say it is verified", async () => {
    const config = await loadAuth(env);
    const user = { email: MAINTAINER };
    expect(await config.callbacks.signIn({ user, profile: gmailProfile(MAINTAINER, false) })).toBe(false);
    expect(await config.callbacks.signIn({ user, profile: { email: MAINTAINER } })).toBe(false);
    expect(await config.callbacks.signIn({ user })).toBe(false);
  });

  it("rejects the gmail when AUTH_EXTRA_ALLOWED_EMAILS doesn't list it, seed or not", async () => {
    const config = await loadAuth({ ADMIN_SEED_EMAILS: env.ADMIN_SEED_EMAILS });
    expect(
      await config.callbacks.signIn({ user: { email: MAINTAINER }, profile: gmailProfile(MAINTAINER) })
    ).toBe(false);
  });

  it("lets verified UCSC Workspace accounts in, and seeds them as before", async () => {
    const { db, client } = await createTestDb();
    state.db = db;
    const config = await loadAuth(env);
    const ucsc = (email: string) => ({ email, email_verified: true, hd: "ucsc.edu" });
    const user = { email: "A@UCSC.edu" };
    expect(await config.callbacks.signIn({ user, profile: ucsc("A@UCSC.edu") })).toBe(true);
    expect(user.email).toBe("a@ucsc.edu");
    expect(await config.callbacks.signIn({ user: { email: "slug@ucsc.edu" }, profile: ucsc("slug@ucsc.edu") })).toBe(true);
    // Linking by email trusts the address, so the suffix alone isn't enough.
    expect(await config.callbacks.signIn({ user: { email: "slug@ucsc.edu" } })).toBe(false);
    expect(
      await config.callbacks.signIn({ user: { email: "slug@ucsc.edu" }, profile: { ...ucsc("slug@ucsc.edu"), email_verified: false } })
    ).toBe(false);
    expect(
      await config.callbacks.signIn({ user: { email: "slug@ucsc.edu" }, profile: { ...ucsc("slug@ucsc.edu"), hd: undefined } })
    ).toBe(false);

    await db.insert(users).values([
      { id: "u-a", email: "a@ucsc.edu" },
      { id: "u-s", email: "slug@ucsc.edu" },
    ]);
    await config.events.signIn({ user: { id: "u-a", email: "a@ucsc.edu" } });
    await config.events.signIn({ user: { id: "u-s", email: "slug@ucsc.edu" } });
    expect((await db.select().from(admins)).map((a) => a.userId)).toEqual(["u-a"]);
    const session = await config.callbacks.session({ session: { user: {} }, user: { id: "u-s" } });
    expect(session.user.isAdmin).toBe(false);
    client.close();
  });

  it("a listed gmail that isn't seeded signs in without becoming an admin", async () => {
    const { db, client } = await createTestDb();
    state.db = db;
    const config = await loadAuth({ AUTH_EXTRA_ALLOWED_EMAILS: MAINTAINER });
    expect(
      await config.callbacks.signIn({ user: { email: MAINTAINER }, profile: gmailProfile(MAINTAINER) })
    ).toBe(true);
    await db.insert(users).values({ id: "u-m", email: MAINTAINER });
    await config.events.signIn({ user: { id: "u-m", email: MAINTAINER } });
    const session = await config.callbacks.session({ session: { user: {} }, user: { id: "u-m" } });
    expect(session.user.isAdmin).toBe(false);
    client.close();
  });
});
