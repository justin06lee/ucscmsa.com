import { existsSync, readFileSync } from "node:fs";
import type { BrowserContext } from "@playwright/test";

type Seed = { adminToken: string; memberToken: string };

/** The seed written by scripts/seed-local.ts (see playwright.config.ts). */
export function seed(): Seed | null {
  const file = process.env.E2E_SEED_FILE;
  if (!file || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as Seed;
}

/** Sign the context in as the seeded admin or member via the Auth.js session cookie. */
export async function signIn(context: BrowserContext, baseURL: string, as: "admin" | "member") {
  const s = seed();
  if (!s) throw new Error("no seed file: set E2E_SEED_FILE to scripts/seed-local.ts output");
  await context.addCookies([
    { name: "authjs.session-token", value: as === "admin" ? s.adminToken : s.memberToken, url: baseURL },
  ]);
}
