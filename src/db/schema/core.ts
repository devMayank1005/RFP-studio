import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { organization, user } from "./auth";

/**
 * Workspace-level tables. A workspace IS a Better Auth organization; the
 * `organization` and `member` tables in auth.ts are the workspaces and
 * memberships from the product spec, with `member.role` carrying
 * admin | consultant | sales | reviewer.
 */

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    industry: text("industry"),
    hqCountry: text("hq_country"),
    countriesCount: integer("countries_count"),
    headcount: integer("headcount"),
    currentHrms: text("current_hrms"),
    /** Free-form: entities, unions, demergers — whatever shapes the answer. */
    groupStructure: jsonb("group_structure").$type<Record<string, unknown>>(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("clients_workspace_idx").on(t.workspaceId, t.name), index("clients_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops"))],
);

/**
 * Brand is a setting, not a code change. The active template drives the app
 * chrome (via <BrandStyle/>) and, later, the exports. The defaults in
 * globals.css equal Kognoz, so an empty table renders correctly.
 */
export const brandTemplates = pgTable(
  "brand_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color").notNull().default("#005184"),
    accentColor: text("accent_color").notNull().default("#2B9E85"),
    successColor: text("success_color").notNull().default("#71A247"),
    fontFamily: text("font_family").notNull().default("Inter"),
    docxTemplateUrl: text("docx_template_url"),
    pptxTemplateUrl: text("pptx_template_url"),
    footerText: text("footer_text"),
    /** The voice guide the drafting prompt is built from. Editable in Settings. */
    voiceGuide: text("voice_guide"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("brand_templates_workspace_idx").on(t.workspaceId)],
);

/**
 * Why a sign-in failed, recorded server-side. Better Auth answers OAuth
 * failures with a redirect to /api/auth/error?error=CODE and nothing else, so
 * without this table the cause is invisible unless someone is watching the
 * server log at that moment. Messages are redacted and bounded before insert.
 */
export const authErrors = pgTable("auth_errors", {
  id: uuid("id").primaryKey().defaultRandom(),
  path: text("path"),
  code: text("code"),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Every mutation writes one row. `diff` is {before, after} of the fields that changed. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    diff: jsonb("diff").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("audit_log_workspace_created_idx").on(t.workspaceId, t.createdAt),
    index("audit_log_entity_idx").on(t.entity, t.entityId),
  ],
);
