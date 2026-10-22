// @vitest-environment node
// (A server path: happy-dom's Request drops the cookie header, as a browser would.)
import { afterEach, describe, expect, it, vi } from "vitest";
import { Auth } from "@auth/core";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/test/db";
import { accounts, admins, users } from "@/lib/db/schema";

// Auth.js's own sign-in path (@auth/core), end to end, with auth.ts's real
// adapter, callbacks and provider options against a test database. Google is
// stood in for by a plain OAuth provider whose token and userinfo endpoints
// are stubbed, so there is no network and no id_token to sign.
const state = vi.hoisted(() => ({ config: undefined as unknown, db: undefined as unknown }));

vi.mock("next-auth", () => ({
  default: (config: unknown) => {
    state.config = config;
    return { handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() };
  },
}));
vi.mock("next-auth/providers/google", () => ({
  default: (options: Record<string, unknown>) => ({
    id: "google",
    name: "Google",
    type: "oauth",
    authorization: "https://google.test/auth",
    token: "https://google.test/token",
    userinfo: "https://google.test/userinfo",
    clientId: "test",
    clientSecret: "test",
    checks: ["state"],
    profile: (p: { sub: string; email: string }) => ({ id: p.sub, email: p.email, name: null, image: null }),
    ...options,
  }),
}));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return state.db;
  },
}));

const BASE = "http://localhost:3000/api/auth";
type GoogleUser = { sub: string; email: string; email_verified: boolean; hd?: string };

/** Signs in through Auth.js as `google` would answer; returns the final redirect and cookies. */
async function signInWithGoogle(config: Parameters<typeof Auth>[1], google: GoogleUser) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (url.startsWith("https://google.test/token")) return json({ access_token: "at", token_type: "bearer" });
    if (url.startsWith("https://google.test/userinfo")) return json(google);
    throw new Error(`unexpected fetch ${url}`);
  });
  const jar = new Map<string, string>();
  const keep = (res: Response) => {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrf = keep(await Auth(new Request(`${BASE}/csrf`), config));
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const start = keep(
    await Auth(
      new Request(`${BASE}/signin/google`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie() },
        body: new URLSearchParams({ csrfToken, callbackUrl: "http://localhost:3000/admin" }),
      }),
      config
    )
  );
  const authorize = new URL(start.headers.get("location")!);
  expect(authorize.origin, String(authorize)).toBe("https://google.test");
  const done = keep(
    await Auth(
      new Request(`${BASE}/callback/google?code=c&state=${authorize.searchParams.get("state")}`, {
        headers: { cookie: cookie() },
      }),
      config
    )
  );
  return { location: done.headers.get("location") ?? "", cookie: cookie() };
}

async function setup() {
  const { db, client } = await createTestDb();
  state.db = db;
  vi.resetModules();
  // No seed list: being an admin here can only come from the pre-created row.
  vi.stubEnv("ADMIN_SEED_EMAILS", "");
  vi.stubEnv("AUTH_EXTRA_ALLOWED_EMAILS", "");
  await import("@/auth");
  const config = {
    ...(state.config as Parameters<typeof Auth>[1]),
    secret: "test-only-secret",
    trustHost: true,
    basePath: "/api/auth",
  };
  return { db, client, config };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Imports Auth.js core and runs whole sign-ins: slow under a busy full suite.
describe("Google sign-in for an admin created before their first sign-in", { timeout: 30_000 }, () => {
  it("links to the existing row: no duplicate user, and the session is an admin", async () => {
    const { db, client, config } = await setup();
    await db.insert(users).values({ id: "u-pre", email: "zansari1@ucsc.edu" });
    await db.insert(admins).values({ userId: "u-pre" });

    const { location, cookie } = await signInWithGoogle(config, {
      sub: "google-123",
      email: "zansari1@ucsc.edu",
      email_verified: true,
      hd: "ucsc.edu",
    });
    expect(location).toBe("http://localhost:3000/admin");
    expect(await db.select({ id: users.id }).from(users)).toEqual([{ id: "u-pre" }]);
    const linked = await db.select().from(accounts).where(eq(accounts.userId, "u-pre"));
    expect(linked.map((a) => [a.provider, a.providerAccountId])).toEqual([["google", "google-123"]]);

    const session = await Auth(new Request(`${BASE}/session`, { headers: { cookie } }), config);
    const body = (await session.json()) as { user?: { email?: string; isAdmin?: boolean } };
    expect(body.user).toMatchObject({ email: "zansari1@ucsc.edu", isAdmin: true });

    // An ordinary first sign-in still makes its own row, as a non-admin.
    const other = await signInWithGoogle(config, { sub: "google-456", email: "slug@ucsc.edu", email_verified: true, hd: "ucsc.edu" });
    expect(other.location).toBe("http://localhost:3000/admin");
    expect((await db.select().from(users)).map((u) => u.email).sort()).toEqual(["slug@ucsc.edu", "zansari1@ucsc.edu"]);
    expect(await db.select().from(admins)).toHaveLength(1);
    client.close();
  });

  it("never links an address Google hasn't verified", async () => {
    const { db, client, config } = await setup();
    await db.insert(users).values({ id: "u-pre", email: "zansari1@ucsc.edu" });
    await db.insert(admins).values({ userId: "u-pre" });

    const { location } = await signInWithGoogle(config, { sub: "attacker", email: "zansari1@ucsc.edu", email_verified: false });
    expect(location).toContain("error=AccessDenied");
    expect(await db.select().from(accounts)).toEqual([]);
    client.close();
  });
});
