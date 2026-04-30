import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "@/lib/db/schema";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

export async function createTestDb() {
  // A unique on-disk temp file per call, because:
  //  - The libSQL client opens a fresh connection for every `db.transaction()`
  //    call, and pure `:memory:` databases are not shared across connections
  //    (transaction commits become invisible to the main connection).
  //  - `file::memory:?cache=shared` fixes that but shares state with every
  //    other `createTestDb()` call in the same process, breaking isolation.
  // A tempfile URL gives per-test isolation and faithful tx semantics.
  const file = path.join(os.tmpdir(), `ucscmsa-testdb-${crypto.randomUUID()}.db`);
  const client = createClient({ url: `file:${file}` });
  const origClose = client.close.bind(client);
  client.close = () => {
    origClose();
    try {
      fs.unlinkSync(file);
    } catch {
      // ignore cleanup errors
    }
  };
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return { db, client };
}
