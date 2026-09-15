/**
 * The vocabulary of RFP Studio.
 *
 * Every enum the database, the engine's zod schemas and the UI chips agree on
 * lives here, once, as a readonly tuple plus a derived type. Labels sit next to
 * the values so a chip, a select and an export column all spell things the
 * same way.
 */

export const RFP_STATUSES = [
  "draft",
  "parsing",
  "questions_ready",
  "drafting",
  "in_review",
  "approved",
  "submitted",
  "won",
  "lost",
] as const;
export type RfpStatus = (typeof RFP_STATUSES)[number];

export const RFP_STATUS_LABEL: Record<RfpStatus, string> = {
  draft: "Draft",
  parsing: "Parsing",
  questions_ready: "Questions ready",
  drafting: "Drafting",
  in_review: "In review",
  approved: "Approved",
  submitted: "Submitted",
  won: "Won",
  lost: "Lost",
};

export const ENGAGEMENT_TYPES = [
  "hris_implementation",
  "advisory",
  "joint_bid",
  "managed_services",
] as const;
export type EngagementType = (typeof ENGAGEMENT_TYPES)[number];

export const ENGAGEMENT_TYPE_LABEL: Record<EngagementType, string> = {
  hris_implementation: "HRIS implementation",
  advisory: "Advisory",
  joint_bid: "Joint bid",
  managed_services: "Managed services",
};

export const BIDDERS = ["kognoz", "darwinbox", "joint"] as const;
export type Bidder = (typeof BIDDERS)[number];

export const DOCUMENT_KINDS = [
  "rfp_main",
  "appendix",
  "client_pointers",
  "our_prior_response",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  rfp_main: "Main RFP",
  appendix: "Appendix",
  client_pointers: "Client pointers",
  our_prior_response: "Our prior response",
  other: "Other",
};

export const PARSE_STATUSES = ["pending", "parsing", "parsed", "failed"] as const;
export type ParseStatus = (typeof PARSE_STATUSES)[number];

export const QUESTION_TYPES = [
  "compliance",
  "descriptive",
  "pricing",
  "yes_no",
  "attachment",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  compliance: "Compliance",
  descriptive: "Descriptive",
  pricing: "Pricing",
  yes_no: "Yes / No",
  attachment: "Attachment",
};

/** Who answers: the partner whose capability the question is really about. */
export const OWNERS = ["kognoz", "darwinbox", "joint", "not_applicable"] as const;
export type Owner = (typeof OWNERS)[number];

export const OWNER_LABEL: Record<Owner, string> = {
  kognoz: "Kognoz",
  darwinbox: "Darwinbox",
  joint: "Joint",
  not_applicable: "N/A",
};

/**
 * Product modules and service lines. Darwinbox modules first, then the Kognoz
 * practice areas, then the cross-cutting buckets an RFP always has.
 */
export const MODULES = [
  "core_hr",
  "payroll",
  "time_attendance",
  "leave",
  "recruiting",
  "onboarding",
  "performance",
  "learning",
  "compensation",
  "engagement",
  "talent",
  "analytics",
  "helpdesk",
  "expenses",
  "travel",
  "offboarding",
  "ai_agents",
  "mobile",
  "integrations",
  "security_compliance",
  "data_migration",
  "implementation",
  "change_management",
  "advisory",
  "support",
  "commercial",
  "general",
] as const;
export type Module = (typeof MODULES)[number];

export const MODULE_LABEL: Record<Module, string> = {
  core_hr: "Core HR",
  payroll: "Payroll",
  time_attendance: "Time & attendance",
  leave: "Leave",
  recruiting: "Recruiting",
  onboarding: "Onboarding",
  performance: "Performance",
  learning: "Learning",
  compensation: "Compensation",
  engagement: "Engagement",
  talent: "Talent",
  analytics: "Analytics",
  helpdesk: "Helpdesk",
  expenses: "Expenses",
  travel: "Travel",
  offboarding: "Offboarding & alumni",
  ai_agents: "AI agents",
  mobile: "Mobile",
  integrations: "Integrations",
  security_compliance: "Security & compliance",
  data_migration: "Data migration",
  implementation: "Implementation",
  change_management: "Change management",
  advisory: "Advisory",
  support: "Support",
  commercial: "Commercial",
  general: "General",
};

export const RESPONSE_STATUSES = ["ai_draft", "edited", "approved", "flagged"] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export const RESPONSE_STATUS_LABEL: Record<ResponseStatus, string> = {
  ai_draft: "AI draft",
  edited: "Edited",
  approved: "Approved",
  flagged: "Flagged",
};

export const COMPLIANCE_LEVELS = [
  "fully",
  "partial",
  "via_customization",
  "via_partner",
  "not_supported",
  "na",
] as const;
export type Compliance = (typeof COMPLIANCE_LEVELS)[number];

export const COMPLIANCE_LABEL: Record<Compliance, string> = {
  fully: "Fully",
  partial: "Partial",
  via_customization: "Via customisation",
  via_partner: "Via partner",
  not_supported: "Not supported",
  na: "N/A",
};

/** What a response was written by: the engine, a human, or an import. */
export const GENERATORS = ["model", "user", "import"] as const;
export type Generator = (typeof GENERATORS)[number];

export const CITATION_SOURCES = ["kb_entry", "approved_answer", "rfp_document"] as const;
export type CitationSource = (typeof CITATION_SOURCES)[number];

export const KB_ENTRY_TYPES = [
  "darwinbox_capability",
  "kognoz_service",
  "case_study",
  "boilerplate",
] as const;
export type KbEntryType = (typeof KB_ENTRY_TYPES)[number];

export const KB_ENTRY_TYPE_LABEL: Record<KbEntryType, string> = {
  darwinbox_capability: "Darwinbox capability",
  kognoz_service: "Kognoz service",
  case_study: "Case study",
  boilerplate: "Boilerplate",
};

export const AVAILABILITIES = ["standard", "configurable", "roadmap", "not_available"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const KB_SOURCE_KINDS = ["darwinbox_docs", "internal_doc", "rfp_response"] as const;
export type KbSourceKind = (typeof KB_SOURCE_KINDS)[number];

export const CHRO_THEMES = [
  "mandate_vision",
  "scope_structure",
  "operating_model",
  "tech_ai",
  "prioritization",
  "governance_culture",
] as const;
export type ChroTheme = (typeof CHRO_THEMES)[number];

export const CHRO_THEME_LABEL: Record<ChroTheme, string> = {
  mandate_vision: "Mandate & vision",
  scope_structure: "Scope & structure",
  operating_model: "Operating model",
  tech_ai: "Technology & AI",
  prioritization: "Prioritisation",
  governance_culture: "Governance & culture",
};

export const CHRO_STATUSES = ["suggested", "kept", "dropped"] as const;
export type ChroStatus = (typeof CHRO_STATUSES)[number];

export const JOB_TYPES = ["parse", "extract", "draft", "chro", "export"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ["queued", "running", "done", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const EXPORT_FORMATS = ["xlsx", "docx", "pptx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const ROLES = ["admin", "consultant", "sales", "reviewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  consultant: "Consultant",
  sales: "Sales",
  reviewer: "Reviewer",
};

/** Confidence bands the UI colours by. Thresholds are the product decision, not a style. */
export const CONFIDENCE_BANDS = ["high", "medium", "low"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

export function confidenceBand(confidence: number | null | undefined): ConfidenceBand | null {
  if (confidence === null || confidence === undefined || Number.isNaN(confidence)) return null;
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}
