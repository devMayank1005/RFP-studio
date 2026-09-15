import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

import { organization, user } from "./auth";
import { clients } from "./core";
import {
  bidderEnum,
  documentKindEnum,
  engagementTypeEnum,
  moduleEnum,
  ownerEnum,
  parseStatusEnum,
  questionTypeEnum,
  rfpStatusEnum,
} from "./enums";

/** Voyage `voyage-4` family: 1024 dimensions. Changing the model means re-embedding. */
export const EMBEDDING_DIMENSIONS = 1024;

export const rfps = pgTable(
  "rfps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    engagementType: engagementTypeEnum("engagement_type").notNull().default("hris_implementation"),
    bidderOfRecord: bidderEnum("bidder_of_record").notNull().default("joint"),
    status: rfpStatusEnum("status").notNull().default("draft"),
    dueDate: date("due_date"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    outcomeNotes: text("outcome_notes"),
    /** AI-written one-page brief, used as system context for every draft. */
    contextSummary: text("context_summary"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [
    index("rfps_workspace_status_idx").on(t.workspaceId, t.status),
    index("rfps_client_idx").on(t.clientId),
  ],
);

export const rfpDocuments = pgTable(
  "rfp_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    kind: documentKindEnum("kind").notNull().default("rfp_main"),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    pageCount: integer("page_count"),
    parseStatus: parseStatusEnum("parse_status").notNull().default("pending"),
    /** Blob URL of the ParsedDocument JSON produced by src/lib/parsing. */
    parsedTextUrl: text("parsed_text_url"),
    parseError: text("parse_error"),
    uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("rfp_documents_rfp_idx").on(t.rfpId)],
);

export const rfpSections = pgTable(
  "rfp_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    refCode: text("ref_code"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("rfp_sections_rfp_idx").on(t.rfpId, t.sortOrder)],
);

export const rfpQuestions = pgTable(
  "rfp_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rfpId: uuid("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => rfpSections.id, { onDelete: "set null" }),
    refNo: text("ref_no").notNull(),
    questionText: text("question_text").notNull(),
    /** "Acceptance criteria / minimum expected outcome" when the client supplies one. */
    acceptanceCriteria: text("acceptance_criteria"),
    questionType: questionTypeEnum("question_type").notNull().default("descriptive"),
    isMandatory: boolean("is_mandatory").notNull().default(false),
    owner: ownerEnum("owner").notNull().default("joint"),
    moduleHint: moduleEnum("module_hint").notNull().default("general"),
    /** The client's own columns, verbatim, keyed by their original header. Never hidden. */
    rawMeta: jsonb("raw_meta").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    /**
     * A vendor's earlier answer found in the sheet (e.g. a half-filled Feasibility /
     * Solution column). Kept here until the confirm step decides whether to import
     * it as revision v1; cleared afterwards.
     */
    existingAnswer: jsonb("existing_answer").$type<{
      compliance: string | null;
      answer: string | null;
      questions: string | null;
    }>(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    sourceDocumentId: uuid("source_document_id").references(() => rfpDocuments.id, {
      onDelete: "set null",
    }),
    /** 1-based row (xlsx) or page (pdf/docx) the question came from. */
    sourceRow: integer("source_row"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("rfp_questions_rfp_sort_idx").on(t.rfpId, t.sortOrder),
    index("rfp_questions_section_idx").on(t.sectionId),
  ],
);
