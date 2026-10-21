import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    setupFiles: ["./test/setup.ts"],
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**", "**/e2e/**"],
    // .env.local may hold the production Turso URL and token. Pin every test
    // to a throwaway local database so nothing here can ever reach it.
    // NEXT_PUBLIC_SITE_URL is pinned to production so SEO tests (canonicals,
    // sitemap, JSON-LD) don't follow whatever a local shell or .env sets.
    env: {
      TURSO_DATABASE_URL: "file::memory:",
      TURSO_AUTH_TOKEN: "",
      NEXT_PUBLIC_SITE_URL: "https://ucscmsa.com",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
