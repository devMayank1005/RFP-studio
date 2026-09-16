import { pgEnum } from "drizzle-orm/pg-core";

import {
  AVAILABILITIES,
  BIDDERS,
  CHRO_STATUSES,
  CHRO_THEMES,
  CITATION_SOURCES,
  COMPLIANCE_LEVELS,
  DOCUMENT_KINDS,
  ENGAGEMENT_TYPES,
  EXPORT_FORMATS,
  GENERATORS,
  JOB_STATUSES,
  JOB_TYPES,
  KB_ENTRY_TYPES,
  KB_SOURCE_KINDS,
  MODULES,
  OWNERS,
  PARSE_STATUSES,
  QUESTION_TYPES,
  RESPONSE_STATUSES,
  RFP_KINDS,
  RFP_STATUSES,
} from "@/domain/enums";

/**
 * Postgres enums, generated from the single vocabulary in src/domain/enums.ts
 * so the database, the engine's schemas and the UI can never disagree on a
 * spelling. Adding a value is a migration (`ALTER TYPE … ADD VALUE`).
 */
export const rfpStatusEnum = pgEnum("rfp_status", RFP_STATUSES);
export const rfpKindEnum = pgEnum("rfp_kind", RFP_KINDS);
export const engagementTypeEnum = pgEnum("engagement_type", ENGAGEMENT_TYPES);
export const bidderEnum = pgEnum("bidder", BIDDERS);
export const documentKindEnum = pgEnum("document_kind", DOCUMENT_KINDS);
export const parseStatusEnum = pgEnum("parse_status", PARSE_STATUSES);
export const questionTypeEnum = pgEnum("question_type", QUESTION_TYPES);
export const ownerEnum = pgEnum("owner", OWNERS);
export const moduleEnum = pgEnum("module", MODULES);
export const responseStatusEnum = pgEnum("response_status", RESPONSE_STATUSES);
export const complianceEnum = pgEnum("compliance", COMPLIANCE_LEVELS);
export const generatorEnum = pgEnum("generator", GENERATORS);
export const citationSourceEnum = pgEnum("citation_source", CITATION_SOURCES);
export const kbEntryTypeEnum = pgEnum("kb_entry_type", KB_ENTRY_TYPES);
export const availabilityEnum = pgEnum("availability", AVAILABILITIES);
export const kbSourceKindEnum = pgEnum("kb_source_kind", KB_SOURCE_KINDS);
export const chroThemeEnum = pgEnum("chro_theme", CHRO_THEMES);
export const chroStatusEnum = pgEnum("chro_status", CHRO_STATUSES);
export const jobTypeEnum = pgEnum("job_type", JOB_TYPES);
export const jobStatusEnum = pgEnum("job_status", JOB_STATUSES);
export const exportFormatEnum = pgEnum("export_format", EXPORT_FORMATS);
