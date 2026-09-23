import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { citationSourceEnum, complianceEnum, generatorEnum, responseStatusEnum } from "./enums";
import { rfpQuestions } from "./rfp";

/**
 * One response per question; the text lives in revisions so every edit,
 * regenerate and import is kept. `currentRevisionId` points at the revision
 * the grid shows.
 */
export const responses = pgTable(
  "responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => rfpQuestions.id, { onDelete: "cascade" }),
    currentRevisionId: uuid("current_revision_id").references(
      (): AnyPgColumn => responseRevisions.id,
      { onDelete: "set null" },
    ),
    status: responseStatusEnum("status").notNull().default("ai_draft"),
    compliance: complianceEnum("compliance"),
    /** 0–1, from the model. Null for imported or hand-written answers. */
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    flagReason: text("flag_reason"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [uniqueIndex("responses_question_uidx").on(t.questionId)],
);

export const responseRevisions = pgTable(
  "response_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    responseId: uuid("response_id")
      .notNull()
      .references(() => responses.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    /** What the model (or import) produced. */
    draftText: text("draft_text").notNull(),
    /** What the human left; equals draftText until someone edits. */
    finalText: text("final_text").notNull(),
    generatedBy: generatorEnum("generated_by").notNull(),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    model: text("model"),
    promptVersion: text("prompt_version"),
    /** "regenerate: shorter / more formal / cite the SAP migration" — saved with the revision. */
    instruction: text("instruction"),
    openPoints: jsonb("open_points").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Token counts from the model call(s), plus `truncated: true` when the answer had to be cut to fit ANSWER_MAX_CHARS. */
    usage: jsonb("usage").$type<Record<string, number | boolean>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("response_revisions_version_uidx").on(t.responseId, t.version)],
);

export const responseCitations = pgTable(
  "response_citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => responseRevisions.id, { onDelete: "cascade" }),
    /** 1-based number the draft refers to as [n]. */
    ordinal: integer("ordinal").notNull(),
    sourceType: citationSourceEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    similarity: numeric("similarity", { precision: 5, scale: 4 }),
    excerpt: text("excerpt").notNull(),
    /** Why the model used it, in its own words. */
    reason: text("reason"),
  },
  (t) => [index("response_citations_revision_idx").on(t.revisionId)],
);
