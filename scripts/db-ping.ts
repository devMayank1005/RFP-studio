/**
 * Proves the database connection and the pgvector extension from the shell.
 *
 *   pnpm db:ping
 */
import "@/lib/load-env";

import { sql } from "drizzle-orm";

import { db } from "@/db/client";

async function main() {
  const started = Date.now();
  const [{ version, now }] = (await db.execute(sql`select version() as version, now() as now`)).rows as Array<{
    version: string;
    now: string;
  }>;
  const [{ has_vector }] = (
    await db.execute(sql`select exists(select 1 from pg_extension where extname = 'vector') as has_vector`)
  ).rows as Array<{ has_vector: boolean }>;
  const [{ tables }] = (
    await db.execute(sql`select count(*)::int as tables from information_schema.tables where table_schema = 'public'`)
  ).rows as Array<{ tables: number }>;

  console.log(`[db] ok in ${Date.now() - started}ms`);
  console.log(`[db] ${version.split(",")[0]} · server time ${now}`);
  console.log(`[db] pgvector: ${has_vector ? "installed" : "MISSING"} · public tables: ${tables}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[db] ping failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
