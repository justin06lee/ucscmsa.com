import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// e2e runs against a dev server on a freshly seeded throwaway DB
// (scripts/seed-local.ts), never the TURSO_DATABASE_URL in .env.local, which
// may be production. To test a server you started yourself (e.g. `next start`
// on a seeded file: DB), set PLAYWRIGHT_BASE_URL and no server is launched.
const external = process.env.PLAYWRIGHT_BASE_URL;
const port = 3210;
const baseURL = external ?? `http://localhost:${port}`;
const dbPath = path.join(os.tmpdir(), "ucscmsa-e2e.db");
const dbUrl = `file:${dbPath}`;
// Session tokens from the seed, for specs that sign in (e2e/fixtures.ts).
// With PLAYWRIGHT_BASE_URL, point E2E_SEED_FILE at your own seed's output.
process.env.E2E_SEED_FILE ??= path.join(os.tmpdir(), "ucscmsa-e2e-seed.json");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  webServer: external
    ? undefined
    : {
        // A new file each run: the seed resets events and people, but the
        // playbook's cards and guide versions come from migrations, so cards
        // a previous run added would otherwise still be there.
        command: `rm -f ${dbPath} ${dbPath}-wal ${dbPath}-shm && bun scripts/seed-local.ts ${dbUrl} > ${process.env.E2E_SEED_FILE} && bun run dev --port ${port}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          TURSO_DATABASE_URL: dbUrl,
          TURSO_AUTH_TOKEN: "",
          AUTH_SECRET: "e2e-only-not-a-real-secret",
          AUTH_GOOGLE_ID: "e2e",
          AUTH_GOOGLE_SECRET: "e2e",
          AUTH_TRUST_HOST: "true",
          AUTH_URL: baseURL,
          ADMIN_SEED_EMAILS: "aisha.karim@ucsc.edu,omar.farouk@ucsc.edu,maryam.siddiqui@ucsc.edu",
          NEXT_PUBLIC_SITE_URL: baseURL,
          // The timeline planner uses its keyword rules, never the model.
          PLANNER_LLM: "off",
        },
      },
  use: {
    // Full Chromium in new headless mode. The default headless shell stalls
    // after many rich-editor mounts in one worker (seen on tenet, also on the
    // branch before the visual editor); real Chromium does not.
    channel: "chromium",
    baseURL,
    timezoneId: "America/Los_Angeles",
    trace: "retain-on-failure",
  },
});
