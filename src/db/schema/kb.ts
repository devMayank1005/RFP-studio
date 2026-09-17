import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";

import { organization } from "./auth";
import { availabilityEnum, jobStatusEnum, kbEntryTypeEnum, kbSourceKindEnum, moduleEnum } from "./enums";
import { responses } from "./responses";
import { EMBEDDING_DIMENSIONS, rfps } from "./rfp";

/** Where an entry came from: a Darwinbox doc, an internal deck, a past response. */
export const kbSources = pgTable(
  "kb_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: kbSourceKindEnum("kind").notNull(),
    fileUrl: text("file_url"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
    /** Browser ingests run as a job; the CLI writes synchronously and lands on "done". */
    status: jobStatusEnum("status").notNull().default("done"),
    error: text("error"),
    entryCount: integer("entry_count").notNull().default(0),
    progressDone: integer("progress_done").notNull().default(0),
    progressTotal: integer("progress_total").notNull().default(0),
  },
  (t) => [index("kb_sources_workspace_idx").on(t.workspaceId)],
);

/** Darwinbox capabilities + Kognoz services + case studies + boilerplate. */
export const kbEntries = pgTable(
  "kb_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    entryType: kbEntryTypeEnum("entry_type").notNull(),
    /** "Darwinbox", "Kognoz", "Compport" … */
    product: text("product").notNull(),
    module: moduleEnum("module").notNull().default("general"),
    featureName: text("feature_name").notNull(),
    /** The canonical description of what is possible. This is what gets cited. */
    body: text("body").notNull(),
    availability: availabilityEnum("availability").notNull().default("standard"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    sourceId: uuid("source_id").references(() => kbSources.id, { onDelete: "set null" }),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("kb_entries_workspace_module_idx").on(t.workspaceId, t.module, t.isActive),
    index("kb_entries_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

/**
 * The flywheel: an approved response, generalised (client name stripped) and
 * embedded, so the next RFP starts from what a reviewer already signed off.
 */
export const approvedAnswers = pgTable(
  "approved_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    originResponseId: uuid("origin_response_id").references(() => responses.id, {
      onDelete: "set null",
    }),
    originRfpId: uuid("origin_rfp_id").references(() => rfps.id, { onDelete: "set null" }),
    canonicalQuestion: text("canonical_question").notNull(),
    canonicalAnswer: text("canonical_answer").notNull(),
    module: moduleEnum("module").notNull().default("general"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    reuseCount: integer("reuse_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("approved_answers_workspace_idx").on(t.workspaceId, t.module),
    index("approved_answers_embedding_hnsw_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
    // One precedent per response — the promote guard is enforced here, not only by a read-then-insert.
    uniqueIndex("approved_answers_origin_response_uidx")
      .on(t.originResponseId)
      .where(sql`${t.originResponseId} is not null`),
  ],
);
