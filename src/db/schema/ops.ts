import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { brandTemplates } from "./core";
import { chroStatusEnum, chroThemeEnum, exportFormatEnum, jobStatusEnum, jobTypeEnum } from "./enums";
import { rfps } from "./rfp";

export const chroQuestions = pgTable(
  "chro_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    theme: chroThemeEnum("theme").notNull(),
    questionText: text("question_text").notNull(),
    /** Why we are asking; which gap or finding it comes from. */
    rationale: text("rationale").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    status: chroStatusEnum("status").notNull().default("suggested"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("chro_questions_rfp_idx").on(t.rfpId, t.sortOrder)],
);

/**
 * One row per background run (parse, extract, draft, chro, export). The UI
 * polls /api/jobs/[id]; Inngest steps update progress as they go.
 */
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    jobType: jobTypeEnum("job_type").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    progressDone: integer("progress_done").notNull().default(0),
    progressTotal: integer("progress_total").notNull().default(0),
    /** What the job was asked to do: document id, question ids, instruction, format. */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    inngestRunId: text("inngest_run_id"),
    error: text("error"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("generation_jobs_rfp_idx").on(t.rfpId, t.createdAt)],
);

export const exports = pgTable(
  "exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    format: exportFormatEnum("format").notNull(),
    brandTemplateId: uuid("brand_template_id").references(() => brandTemplates.id, {
      onDelete: "set null",
    }),
    fileUrl: text("file_url"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("exports_rfp_idx").on(t.rfpId, t.createdAt)],
);
