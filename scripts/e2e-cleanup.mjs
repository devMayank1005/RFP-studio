/**
 * Removes what the E2E smoke suite creates, so a shared development database
 * does not accumulate one "E2E smoke RFP" per run: the RFP itself (documents,
 * questions and jobs cascade from it) and the knowledge-base answer the
 * "Add to KB" case promotes from the seeded demo RFP.
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
const answers = await c.query(`delete from approved_answers where origin_rfp_id in (select id from rfps where title like '%(demo)' or title = 'E2E smoke RFP')`);
const { rowCount } = await c.query(`delete from rfps where title = 'E2E smoke RFP'`);
await c.end();
console.log(`removed ${rowCount} E2E smoke RFP(s) and ${answers.rowCount} promoted demo answer(s)`);
