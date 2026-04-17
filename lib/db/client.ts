import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  throw new Error("TURSO_DATABASE_URL is not set");
}

export const libsql = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(libsql, { schema });
export type DB = typeof db;
