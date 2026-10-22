import { createClient } from "@libsql/client";

// Read-only look at a database before or after a migration: row counts per
// table, the migrations drizzle has recorded, and whether foreign keys are
// enforced. Prints no row contents.
//
//   TURSO_DATABASE_URL=libsql://… TURSO_AUTH_TOKEN=… bun scripts/db-inspect.ts
//
// Defaults to file:./local.db, like scripts/migrate.ts.

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    console.log(`database: ${new URL(url).host || url}`);
    const tables = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'libsql_%' ORDER BY name"
    );
    for (const { name } of tables.rows) {
      const n = await client.execute(`SELECT count(*) AS n FROM "${String(name).replaceAll('"', '""')}"`);
      console.log(`  ${String(name).padEnd(28)} ${n.rows[0].n}`);
    }
    const migrations = await client.execute(
      "SELECT id, substr(hash, 1, 12) AS hash, created_at FROM __drizzle_migrations ORDER BY created_at"
    ).catch(() => null);
    console.log(`migrations recorded: ${migrations?.rows.length ?? "none (no __drizzle_migrations)"}`);
    for (const m of migrations?.rows ?? []) {
      console.log(`  ${m.hash}…  ${new Date(Number(m.created_at)).toISOString()}`);
    }
    const fk = await client.execute("PRAGMA foreign_keys");
    console.log(`foreign_keys: ${fk.rows[0]?.[0]}`);
  } finally {
    client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
