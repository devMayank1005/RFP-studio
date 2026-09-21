import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Migration bookkeeping, checked without a database.
 *
 * WHY THIS EXISTS. `drizzle-kit migrate` does not scan `drizzle/` for .sql files — it
 * reads `meta/_journal.json` and runs the tags listed there. A migration written by hand
 * is therefore invisible to it, and `pnpm db:migrate` exits 0 having applied nothing,
 * which reads exactly like success.
 *
 * That happened: `0009_voice_guide_version.sql` was hand-written, never entered in the
 * journal, and never ran. The schema in `src/db/schema` had the column, the database did
 * not, and every signed-in page 500'd with `column "version" does not exist` — because
 * `getActiveBrand` runs in the (app) layout, so it is on every authenticated route.
 *
 * Nothing else catches this. `typecheck` sees valid TypeScript. `test` sees passing
 * tests. `build` compiles clean. The .sql file is a text file nobody parses until
 * production does. So it is caught here, where it costs one `pnpm db:generate` to fix
 * instead of an outage.
 *
 * The fix, if this fails: delete the hand-written .sql and run `pnpm db:generate`, which
 * writes the file, the journal entry and the snapshot together.
 */

const DRIZZLE_DIR = join(__dirname, "../../drizzle");
const META_DIR = join(DRIZZLE_DIR, "meta");

interface JournalEntry {
  idx: number;
  tag: string;
}

const journal: { entries: JournalEntry[] } = JSON.parse(
  readFileSync(join(META_DIR, "_journal.json"), "utf8"),
);

const sqlTags = readdirSync(DRIZZLE_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.replace(/\.sql$/, ""))
  .sort();

const journalTags = journal.entries.map((e) => e.tag);

describe("every migration on disk is one the migrator will run", () => {
  it("has a journal entry for each .sql file", () => {
    // The failure that took production down. A file here and not in the journal is a
    // migration that silently never runs.
    const orphaned = sqlTags.filter((tag) => !journalTags.includes(tag));
    expect(orphaned, "hand-written migrations, absent from _journal.json").toEqual([]);
  });

  it("has a .sql file for each journal entry", () => {
    // The mirror image: the migrator reads the tag, finds no file, and fails at the
    // point of running — on a deploy or a teammate's first setup, not here.
    const missing = journalTags.filter((tag) => !sqlTags.includes(tag));
    expect(missing, "journal entries with no .sql file").toEqual([]);
  });

  it("has a snapshot for each journal entry", () => {
    // `db:generate` diffs the schema against the LAST snapshot. A missing one means the
    // next generated migration silently re-emits changes already applied, or omits
    // changes it thinks are already there.
    const snapshots = new Set(readdirSync(META_DIR).filter((f) => f.endsWith("_snapshot.json")));
    const missing = journalTags.filter((tag) => !snapshots.has(`${tag.slice(0, 4)}_snapshot.json`));
    expect(missing, "journal entries with no meta/NNNN_snapshot.json").toEqual([]);
  });
});

describe("the journal is ordered the way the migrator assumes", () => {
  it("numbers entries contiguously from 0", () => {
    // Drizzle applies entries in array order and records the index. A gap or a repeat
    // means a migration is skipped or applied twice.
    expect(journal.entries.map((e) => e.idx)).toEqual(journal.entries.map((_, i) => i));
  });

  it("matches each entry's idx to its filename prefix", () => {
    // `0009_…` at idx 8 would apply in an order nobody reading the folder expects.
    for (const { idx, tag } of journal.entries) {
      expect(tag.slice(0, 4), `${tag} sits at idx ${idx}`).toBe(String(idx).padStart(4, "0"));
    }
  });

  it("holds no duplicate tags", () => {
    expect(new Set(journalTags).size).toBe(journalTags.length);
  });
});

describe("the voice guide's version column is a migration, not just a schema edit", () => {
  it("is present in the journal, so db:migrate will apply it", () => {
    // Pins the specific regression rather than the general rule, so a failure names the
    // change that caused it.
    expect(journalTags).toContain("0009_voice_guide_version");
  });

  it("adds the column the optimistic lock depends on", () => {
    const sql = readFileSync(join(DRIZZLE_DIR, "0009_voice_guide_version.sql"), "utf8");
    expect(sql).toMatch(/alter table "brand_templates" add column "version"/i);
  });
});
