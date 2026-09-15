/**
 * Removes the RFPs the E2E smoke suite creates, so a shared development
 * database does not accumulate one "E2E smoke RFP" per run. Child rows
 * (documents, questions, jobs) cascade from the RFP.
 *
 * Usage: node scripts/e2e-cleanup.mjs
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const c = new pg.Client({ connectionString: url });
await c.connect();
const { rowCount } = await c.query(`delete from rfps where title = 'E2E smoke RFP'`);
await c.end();
console.log(`removed ${rowCount} E2E smoke RFP(s)`);
