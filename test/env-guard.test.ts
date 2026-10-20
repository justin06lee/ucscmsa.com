import { describe, expect, it } from "vitest";

describe("test environment", () => {
  it("never points the db client at a remote (production) database", () => {
    // bun auto-loads .env.local, which may hold the production Turso URL and
    // token. vitest.config.ts overrides both so no test can reach it.
    expect(process.env.TURSO_DATABASE_URL).toMatch(/^file:/);
    expect(process.env.TURSO_AUTH_TOKEN ?? "").toBe("");
  });
});
