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

// Server actions are reachable by a direct POST whatever page they sit on, so
// every exported function of a "use server" file checks for an admin itself,
// before it reads or writes anything.
function serverActionFiles(dir = "app/admin"): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return serverActionFiles(p);
    if (!/\.tsx?$/.test(e.name) || e.name.includes(".test.")) return [];
    return /^\s*["']use server["']/.test(fs.readFileSync(p, "utf8")) ? [p] : [];
  });
}

describe("admin server actions", () => {
  const files = serverActionFiles();

  it("are all found, the board's included", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "app/admin/_actions.ts",
        "app/admin/plan/_actions.ts",
        "app/admin/playbook/_actions.ts",
      ]),
    );
  });

  const actions = files.flatMap((file) => {
    const src = fs.readFileSync(file, "utf8");
    const parts = src.split(/^export async function /m).slice(1);
    return parts.map((body) => [`${file} ${body.slice(0, body.indexOf("("))}`, body] as const);
  });

  it("export only async functions", () => {
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      const exported = src.match(/^export (?!async function )\S+/gm) ?? [];
      expect(exported, file).toEqual([]);
    }
  });

  // The body starts at the "{" ending the signature line, after the
  // parameters' closing ")": parameter types may hold braces of their own.
  function bodyOf(fn: string): string {
    let depth = 0;
    let i = fn.indexOf("(");
    for (; i < fn.length; i++) {
      if (fn[i] === "(") depth++;
      else if (fn[i] === ")" && --depth === 0) break;
    }
    return fn.slice(fn.indexOf("{\n", i) + 1);
  }

  it.each(actions)("%s checks for an admin first", (_, body) => {
    // The first statement of the function body awaits requireAdmin/requireAdminId.
    const firstStatement = bodyOf(body).trim().split("\n")[0];
    expect(firstStatement).toMatch(/await requireAdmin(Id)?\(\)/);
  });
});
