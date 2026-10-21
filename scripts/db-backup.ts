import { createClient, type InValue } from "@libsql/client";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// Dumps a whole database to one SQL file (schema and rows), then restores it
// into a scratch file database and checks every table's row count matches.
// Run it before any production migration:
//
//   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… bun scripts/db-backup.ts ~/ucscmsa-backups/prod-before-<what>.sql
//
// The file holds every row (emails, sessions), so it is written 0600 and must
// never go in the repo.

function literal(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (v instanceof ArrayBuffer) return `X'${Buffer.from(v).toString("hex")}'`;
  if (ArrayBuffer.isView(v)) return `X'${Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("hex")}'`;
  return `'${String(v).replaceAll("'", "''")}'`;
}

const quoteId = (s: string) => `"${s.replaceAll('"', '""')}"`;

async function main() {
  const out = process.argv[2];
  if (!out) {
    console.error("usage: bun scripts/db-backup.ts <file.sql>");
    process.exit(2);
  }
  if (fs.existsSync(out)) {
    console.error(`${out} exists; pick a new name`);
    process.exit(2);
  }
  const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

  const objects = (await client.execute(
    "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' ORDER BY type = 'table' DESC, name"
  )).rows.map((r) => ({ type: String(r.type), name: String(r.name), sql: String(r.sql) }));
  const tables = objects.filter((o) => o.type === "table");

  const lines = [
    `-- ucscmsa database backup ${new Date().toISOString()}`,
    "PRAGMA foreign_keys=OFF;",
    "BEGIN TRANSACTION;",
  ];
  const counts = new Map<string, number>();
  for (const t of tables) {
    lines.push(`${t.sql};`);
    const rows = await client.execute(`SELECT * FROM ${quoteId(t.name)}`);
    counts.set(t.name, rows.rows.length);
    const cols = rows.columns.map(quoteId).join(",");
    for (const row of rows.rows) {
      const values = rows.columns.map((_, i) => literal(row[i] as InValue));
      lines.push(`INSERT INTO ${quoteId(t.name)} (${cols}) VALUES(${values.join(",")});`);
    }
  }
  for (const o of objects.filter((o) => o.type !== "table")) lines.push(`${o.sql};`);
  lines.push("COMMIT;", "");
  client.close();

  fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
  fs.writeFileSync(out, lines.join("\n"), { mode: 0o600 });

  // Restore check.
  const scratch = path.join(os.tmpdir(), `ucscmsa-restore-${crypto.randomUUID()}.db`);
  const restored = createClient({ url: `file:${scratch}` });
  try {
    await restored.executeMultiple(fs.readFileSync(out, "utf8"));
    for (const [name, n] of counts) {
      const got = Number((await restored.execute(`SELECT count(*) AS n FROM ${quoteId(name)}`)).rows[0].n);
      if (got !== n) throw new Error(`restore check: ${name} has ${got} rows, expected ${n}`);
    }
  } finally {
    restored.close();
    fs.rmSync(scratch, { force: true });
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  console.log(`backup: ${out} (${fs.statSync(out).size} bytes, ${tables.length} tables, ${total} rows); restore check passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
