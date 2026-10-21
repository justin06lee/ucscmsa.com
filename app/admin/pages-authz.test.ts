import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// The admin layout's check doesn't re-run on client-side navigation (Next's
// partial rendering), and proxy.ts is a single line of defence. Every admin
// page must check for itself, close to the data it reads.
function adminPages(dir = "app/admin"): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return adminPages(p);
    return e.name === "page.tsx" ? [p] : [];
  });
}

describe("admin pages", () => {
  const pages = adminPages();

  it("are all found", () => {
    expect(pages.length).toBeGreaterThanOrEqual(5);
  });

  it.each(pages)("%s calls requireAdmin() itself", (file) => {
    expect(fs.readFileSync(file, "utf8")).toMatch(/await requireAdmin(Id)?\(\)/);
  });
});
