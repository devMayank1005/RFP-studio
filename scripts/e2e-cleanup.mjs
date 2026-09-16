/**
 * Removes what the E2E smoke suite creates, so a shared development database
 * does not accumulate one "E2E smoke RFP" per run: the RFP itself (documents,
 * questions and jobs cascade from it) and the knowledge-base answer the
 * "Add to KB" case promotes from the seeded demo RFP, and the knowledge-base
 * entry the KB suite creates, CHRO questions and exports (rows, jobs and
 * blobs) on the demo RFP, and the dev consultant's role.
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
const entries = await c.query(`delete from kb_entries where feature_name = 'E2E smoke capability'`);
const roles = await c.query(`update member set role = 'consultant' where user_id in (select id from "user" where email = 'dev.consultant@rfp-studio.invalid') and role <> 'consultant'`);
const chro = await c.query(`delete from chro_questions where rfp_id in (select id from rfps where title like '%(demo)' or title = 'E2E smoke RFP')`);
const answers = await c.query(`delete from approved_answers where origin_rfp_id in (select id from rfps where title like '%(demo)' or title = 'E2E smoke RFP')`);
const exportRows = await c.query(`delete from exports where rfp_id in (select id from rfps where title like '%(demo)' or title = 'E2E smoke RFP') returning file_url`);
const exportJobs = await c.query(`delete from generation_jobs where job_type = 'export' and rfp_id in (select id from rfps where title like '%(demo)' or title = 'E2E smoke RFP')`);
const { rowCount } = await c.query(`delete from rfps where title = 'E2E smoke RFP'`);
await c.end();
const urls = exportRows.rows.map((r) => r.file_url).filter(Boolean);
if (urls.length && process.env.BLOB_READ_WRITE_TOKEN) {
  const { del } = await import("@vercel/blob");
  await del(urls);
}
console.log(`removed ${rowCount} E2E smoke RFP(s), ${exportRows.rowCount} demo export(s) (${urls.length} file(s), ${exportJobs.rowCount} job(s)), ${answers.rowCount} promoted demo answer(s), ${entries.rowCount} smoke KB entr${entries.rowCount === 1 ? 'y' : 'ies'}, ${chro.rowCount} demo CHRO question(s) and reset ${roles.rowCount} fixture role(s)`);
