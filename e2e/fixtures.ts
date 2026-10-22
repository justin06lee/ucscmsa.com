import { existsSync, readFileSync } from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";

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

/** Santa Cruz's date `days` from now, as the date picker labels it and as YYYY-MM-DD. */
export function santaCruzDay(days: number) {
  const d = new Date(Date.now() + days * 86_400_000);
  const tz = { timeZone: "America/Los_Angeles" } as const;
  const label = d.toLocaleDateString("en-US", { ...tz, weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const ymd = d.toLocaleDateString("en-CA", tz);
  return { label, ymd };
}

export async function pickDate(page: Page, field: string, label: string) {
  await page.getByLabel(new RegExp(`^${field}`)).click();
  const dialog = page.getByRole("dialog", { name: "Choose date" });
  for (let i = 0; i < 3 && !(await dialog.getByRole("gridcell", { name: label }).isVisible()); i++) {
    await dialog.getByRole("button", { name: "Next month" }).click();
  }
  await dialog.getByRole("gridcell", { name: label }).click();
}

export async function typeTime(page: Page, field: string, value: string) {
  const input = page.getByRole("textbox", { name: new RegExp(`^${field}`) });
  await input.fill(value);
  await input.press("Enter");
}

/** An event's row on the admin Events page, found by searching its title, in whichever tab holds it. */
export async function adminRow(page: Page, title: string) {
  await page.goto(`/admin?q=${encodeURIComponent(title)}`);
  const row = page.locator(".admin-event").filter({ hasText: title });
  if ((await row.count()) === 0) await page.getByRole("tab", { name: /^Past/ }).click();
  return row;
}
