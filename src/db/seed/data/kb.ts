import type { Availability, KbEntryType, Module } from "@/domain/enums";

import { stableId } from "../ids";

export interface KbSeedEntry {
  slug: string;
  entryType: KbEntryType;
  product: string;
  module: Module;
  featureName: string;
  body: string;
  availability: Availability;
  tags: string[];
}

const dbx = (
  slug: string,
  module: Module,
  featureName: string,
  body: string,
  availability: Availability = "standard",
  tags: string[] = [],
): KbSeedEntry => ({
  slug,
  entryType: "darwinbox_capability",
  product: "Darwinbox",
  module,
  featureName,
  body,
  availability,
  tags,
});

const kgz = (
  slug: string,
  module: Module,
  featureName: string,
  body: string,
  tags: string[] = [],
): KbSeedEntry => ({
  slug,
  entryType: "kognoz_service",
  product: "Kognoz",
  module,
  featureName,
  body,
  availability: "standard",
  tags,
});

/**
 * Curated starting corpus. Each body is written the way an answer should cite
 * it: what is possible, how it is configured, and what the boundary is.
 * Reviewers extend and correct this in the Knowledge Base screen (M2); the
 * `kb:ingest` script adds entries from Darwinbox documentation PDFs.
 */
export const KB_ENTRIES: KbSeedEntry[] = [
  // ---- Core HR ----
  dbx(
    "core-employee-master",
    "core_hr",
    "Employee master and custom fields",
    "Darwinbox maintains a single employee master with standard fields for personal, employment, position, cost-centre and statutory data. Custom fields and custom sections can be added per entity or globally without code, with field-level visibility and edit permissions by role. Effective-dated changes keep a full history of every field.",
    "standard",
    ["employee master", "custom fields", "effective dating"],
  ),
  dbx(
    "core-org-structure",
    "core_hr",
    "Organisation structure and position management",
    "Organisation structure is modelled as configurable hierarchies (entity, business unit, department, sub-department, location, cost centre) with position management: positions carry grade, band, reporting line and headcount budget, and can be vacant or filled. Multiple legal entities and group companies run on one instance with entity-specific policies, letter templates and approval chains.",
    "standard",
    ["org structure", "positions", "multi-entity"],
  ),
  dbx(
    "core-workflows",
    "core_hr",
    "Configurable workflows and approvals",
    "Every transaction (data change, transfer, promotion, separation, leave, expense) runs through a configurable multi-level workflow builder with conditional routing by entity, grade, location or amount, parallel and sequential approvers, delegation, escalation timers and audit trail.",
    "standard",
    ["workflow", "approvals", "audit trail"],
  ),
  dbx(
    "core-letters-documents",
    "core_hr",
    "Letter generation and document management",
    "HR letters (offer, appointment, confirmation, transfer, increment, relieving) are generated from templates with merge fields and can be routed for digital signature. Employee documents are stored against the profile with categories, expiry tracking and role-based access.",
    "standard",
    ["letters", "documents", "e-sign"],
  ),
  dbx(
    "core-policies-helpdesk",
    "helpdesk",
    "Policy repository and HR helpdesk",
    "Policies are published in a searchable repository with version control and acknowledgement tracking. The HR helpdesk module provides ticket categories, SLAs, assignment rules and dashboards, and employees can raise queries from web or mobile.",
    "standard",
    ["policies", "helpdesk", "case management"],
  ),

  // ---- Payroll ----
  dbx(
    "payroll-india-statutory",
    "payroll",
    "India payroll with statutory compliance",
    "Darwinbox Payroll processes Indian payroll end to end: salary structures with configurable components, arrears, loans and advances, reimbursements, income-tax computation with investment declarations and proofs, PF, ESI, professional tax, LWF, TDS returns and Form 16 generation. Bank advice files and statutory reports are produced per entity.",
    "standard",
    ["payroll", "PF", "ESI", "TDS", "Form 16"],
  ),
  dbx(
    "payroll-multi-entity",
    "payroll",
    "Multi-entity, multi-cycle payroll",
    "Payroll can run per legal entity with separate calendars, pay cycles, components and statutory registrations, and a group-level view for consolidated cost reporting. Inputs flow from attendance, leave, expenses and one-time payments through maker–checker review before processing.",
    "standard",
    ["multi-entity", "pay cycles", "maker checker"],
  ),
  dbx(
    "payroll-inputs-digital",
    "payroll",
    "Digital payroll inputs and one-off payments",
    "One-off payments (joining bonus, retention bonus, incentives, recoveries) are captured as payroll input types with configurable approval workflows, eligibility rules and effective periods, replacing spreadsheet inputs. Bulk upload templates with validation remain available for high-volume inputs.",
    "standard",
    ["payroll inputs", "one-off payments", "bulk upload"],
  ),
  dbx(
    "payroll-fnf",
    "payroll",
    "Full and final settlement",
    "Full and final settlement is triggered from the separation workflow: it computes final salary, leave encashment, notice-period recovery, gratuity eligibility and pending reimbursements, with a settlement statement for the employee and accounting output.",
    "standard",
    ["F&F", "separation", "leave encashment"],
  ),
  dbx(
    "payroll-global",
    "payroll",
    "Payroll outside India",
    "Native payroll is available for India and selected APAC/Middle East countries; for other countries Darwinbox integrates with local payroll providers through standard payroll-output interfaces. Country coverage must be confirmed per RFP.",
    "configurable",
    ["global payroll", "payroll integration"],
  ),

  // ---- Time, attendance, leave ----
  dbx(
    "attendance-capture",
    "time_attendance",
    "Attendance capture: biometric, mobile, geo-fenced",
    "Attendance can be captured from biometric devices (device or database integration), web check-in, and the mobile app with geo-fencing, selfie/face verification and offline sync. Shift schedules, rosters, overtime rules, grace periods and regularisation workflows are configurable per location or employee group.",
    "standard",
    ["biometric", "geo-fencing", "shifts", "overtime"],
  ),
  dbx(
    "attendance-reports-lop",
    "time_attendance",
    "Attendance, working-day and LOP reporting",
    "Standard reports cover attendance summary, actual working days, loss of pay, late/early marks and overtime by date range, employee, department or location, exportable to Excel and schedulable. The report builder allows additional custom views on the same data.",
    "standard",
    ["LOP", "reports", "working days"],
  ),
  dbx(
    "leave-policies",
    "leave",
    "Leave policies, accruals and balances",
    "Leave types, accrual rules, carry-forward, encashment, comp-off, sandwich rules and holiday calendars are configured per entity, location or grade. Effective-dated balance reports and balance-as-on-date views are standard; balances feed payroll and full-and-final settlement.",
    "standard",
    ["leave", "accrual", "balances", "comp-off"],
  ),

  // ---- Recruiting & onboarding ----
  dbx(
    "recruit-requisition-to-offer",
    "recruiting",
    "Recruitment: requisition to offer",
    "Requisitions are raised against positions with approval workflows; jobs are published to the career page and to job boards (Naukri, LinkedIn, IIM Jobs) through standard integrations. Candidate pipeline stages, interview scheduling, scorecards, offer approval and offer-letter generation from approved salary structures are configurable.",
    "standard",
    ["requisition", "job boards", "offer letter", "career page"],
  ),
  dbx(
    "recruit-bgv-assessments",
    "recruiting",
    "Background verification and assessment integrations",
    "Darwinbox integrates with background-verification providers (pre-offer and post-offer BGV) and assessment platforms through its documented integration framework, so checks are triggered from the candidate or onboarding record and results write back to it.",
    "standard",
    ["BGV", "assessments", "integration"],
  ),
  dbx(
    "onboarding-preboarding",
    "onboarding",
    "Pre-boarding and onboarding",
    "Candidates get a pre-boarding portal to submit personal data and documents before joining; onboarding task lists, policy acknowledgements, buddy assignment, induction content and asset requests are tracked per persona, and data flows straight into the employee master on day one.",
    "standard",
    ["onboarding", "pre-boarding", "digital documents"],
  ),

  // ---- Performance, learning, talent ----
  dbx(
    "performance-cycles",
    "performance",
    "Performance management",
    "Goal setting (cascaded goals, OKRs), continuous check-ins and feedback, mid-year and annual reviews, calibration, normalisation and rating distribution are configurable by employee group. Probation confirmation and performance-improvement plans run as workflows with review dates driven by actual completion.",
    "standard",
    ["goals", "OKR", "reviews", "calibration", "probation"],
  ),
  dbx(
    "learning-lms",
    "learning",
    "Learning management",
    "The learning module supports course catalogues, SCORM and video content, learning paths, mandatory-training assignment by role, assessments, certifications with expiry, and classroom session management. Integration with external LMS platforms is supported through the documented LMS integration framework.",
    "standard",
    ["LMS", "SCORM", "certifications"],
  ),
  dbx(
    "talent-succession",
    "talent",
    "Talent review and succession",
    "Talent reviews use configurable nine-box grids, potential ratings, readiness and succession plans per critical position, with career-path and skills data from the employee profile.",
    "standard",
    ["succession", "nine-box", "talent review"],
  ),

  // ---- Compensation ----
  dbx(
    "comp-salary-structures",
    "compensation",
    "Salary structures and CTC components",
    "Salary structures are defined with components, formulas, applicability rules (entity, grade, location, employment type) and effective dates. CTC is calculated by the system from approved components; the same structures drive offer letters, increments and payroll, so one employee view shows compensation and benefits without duplicate entry.",
    "standard",
    ["CTC", "salary structure", "components", "applicability"],
  ),
  dbx(
    "comp-increment-cycles",
    "compensation",
    "Increment, promotion and bonus cycles",
    "Compensation planning cycles support budget allocation, guideline matrices (rating × position-in-range), manager recommendations, multi-level approvals and letter generation. Effective dates can follow actual events (e.g. probation or training completion) rather than action dates.",
    "standard",
    ["increment", "promotion", "bonus", "budget"],
  ),
  dbx(
    "comp-compport-partner",
    "compensation",
    "Advanced compensation planning via Compport",
    "For complex compensation planning (multi-entity incentive schemes, pay-equity analytics, long-term incentives), Darwinbox partners with Compport. Compport reads employee, position and compensation data from Darwinbox and writes approved outcomes back; Compport owns configuration on its platform.",
    "configurable",
    ["Compport", "incentives", "partner"],
  ),
  dbx(
    "comp-analytics",
    "analytics",
    "Compensation and workforce cost analytics",
    "Standard dashboards report total workforce cost, fixed vs variable pay, benefits cost, increment and promotion cost by entity, function, grade and location. Custom analytics beyond the standard set are built with the report builder or delivered through the analytics module; complex reward-effectiveness models may require scoping.",
    "configurable",
    ["analytics", "workforce cost", "dashboards"],
  ),

  // ---- Engagement, offboarding ----
  dbx(
    "engagement-surveys",
    "engagement",
    "Engagement surveys and recognition",
    "Pulse and annual engagement surveys, eNPS, anonymous responses with configurable thresholds, action planning, and a peer-recognition and social feed are part of the engagement module.",
    "standard",
    ["surveys", "eNPS", "recognition"],
  ),
  dbx(
    "offboarding-alumni",
    "offboarding",
    "Separation workflow and alumni access",
    "Separation runs as a workflow with clearances, exit interview, knowledge transfer and full-and-final settlement. Alumni can be given time-bound, role-controlled access to payslips, tax documents and employment letters, with alumni records linked to separation data such as leave balance on the last working day.",
    "standard",
    ["separation", "alumni", "exit"],
  ),

  // ---- AI, mobile, platform ----
  dbx(
    "ai-conversational-agent",
    "ai_agents",
    "Conversational HR agent for self-service",
    "Darwinbox's AI assistant lets employees apply for leave, regularise attendance, raise requests, check balances and policies, and get answers from the published policy repository, on web, mobile and messaging channels. Transactions execute the same workflows as the standard UI with role-based access.",
    "standard",
    ["AI", "chatbot", "self-service"],
  ),
  dbx(
    "ai-agent-builder-studio",
    "ai_agents",
    "Custom agents and manager insights via Studio",
    "Manager-facing agents that surface team analytics (attrition risk, open positions, probation due, leave patterns) and custom use-case agents are built on Darwinbox Studio, the low-code extension platform, using platform data and APIs. These are scoped and built per client rather than switched on.",
    "configurable",
    ["AI agents", "Studio", "manager insights"],
  ),
  dbx(
    "mobile-app",
    "mobile",
    "Mobile app",
    "Native iOS and Android apps cover attendance, leave, approvals, payslips, directory, recognition, surveys, learning and the AI assistant, with push notifications, face-recognition attendance and offline capture.",
    "standard",
    ["mobile", "iOS", "Android"],
  ),
  dbx(
    "platform-studio-lowcode",
    "integrations",
    "Darwinbox Studio (low-code extensions)",
    "Studio is Darwinbox's low-code platform for custom forms, workflows, apps and integrations that sit on the same data model and permissions, used where a requirement is not standard configuration.",
    "configurable",
    ["Studio", "low-code", "custom apps"],
  ),
  dbx(
    "integrations-apis-sso",
    "integrations",
    "Integration framework, APIs and SSO",
    "Darwinbox exposes REST APIs (employee master, organisation master, attendance, payroll outputs), SFTP-based file integrations, webhooks and pre-built connectors, with a documented partner integration SOP. Single sign-on supports SAML 2.0 and OIDC identity providers (Azure AD / Entra ID, Okta, Google).",
    "standard",
    ["API", "SSO", "SAML", "SFTP", "webhooks"],
  ),
  dbx(
    "integrations-erp-finance",
    "integrations",
    "ERP and finance integrations",
    "Payroll journals, cost-centre masters and headcount data integrate with ERPs (SAP, Oracle, Microsoft Dynamics) and planning tools (e.g. Hyperion) through standard APIs or file interfaces; the specific interface is designed during implementation.",
    "configurable",
    ["ERP", "SAP", "finance", "Hyperion"],
  ),
  dbx(
    "security-compliance",
    "security_compliance",
    "Security, privacy and compliance",
    "Darwinbox is ISO 27001 and SOC 2 certified, supports GDPR and India DPDP requirements, offers data residency options, encryption at rest and in transit, role-based access with field-level permissions, IP restrictions, MFA and comprehensive audit logs.",
    "standard",
    ["ISO 27001", "SOC 2", "GDPR", "DPDP", "RBAC"],
  ),
  dbx(
    "analytics-reporting",
    "analytics",
    "Reports and people analytics",
    "A drag-and-drop report builder covers every module with filters, scheduling and export; standard dashboards cover headcount, attrition, hiring, attendance, payroll cost and engagement. Data can be exported or connected to BI tools.",
    "standard",
    ["reports", "dashboards", "BI"],
  ),
  dbx(
    "data-migration",
    "data_migration",
    "Data migration and master harmonisation",
    "Migration uses Darwinbox load templates with validation rules per module. Establishing Darwinbox as the source of truth for employee, organisation and position data, and moving values from custom to standard fields, is handled through a source-to-target mapping and field dictionary agreed during design.",
    "standard",
    ["migration", "templates", "source of truth"],
  ),
  dbx(
    "implementation-methodology",
    "implementation",
    "Implementation approach and UAT",
    "Implementation follows discovery, design (configuration workbooks), build, data migration, integration, UAT with scenario scripts on dummy employees, training, go-live and hypercare, with a named project manager and phase sign-offs.",
    "standard",
    ["implementation", "UAT", "hypercare"],
  ),
  dbx(
    "support-model",
    "support",
    "Support and SLAs",
    "Post go-live support includes a ticketing portal, severity-based SLAs, a named customer success manager, quarterly release notes and a product roadmap review.",
    "standard",
    ["support", "SLA", "CSM"],
  ),

  // ---- Kognoz services ----
  kgz(
    "kognoz-change-management",
    "change_management",
    "Change management and adoption",
    "Kognoz runs the change workstream of HR technology programmes: leadership alignment and transformation narrative, stakeholder analysis and change-leader network, as-is/to-be impact assessment with sign-off, communication planning and execution across channels, persona-based training plans with manuals and navigation videos, and an adoption framework with governance and dashboards tracked post go-live.",
    ["change management", "adoption", "communication", "training"],
  ),
  kgz(
    "kognoz-org-design",
    "advisory",
    "Organisation design",
    "Kognoz designs operating models, organisation structures, role architectures and grade/band frameworks, including harmonisation across group entities and post-merger or demerger structures, using behaviour-science research and benchmarking.",
    ["org design", "harmonisation", "grades", "demerger"],
  ),
  kgz(
    "kognoz-employee-experience",
    "advisory",
    "Employee experience and culture transformation",
    "Kognoz diagnoses and redesigns employee experience journeys and culture, from listening strategy and survey design to culture playbooks and manager enablement.",
    ["employee experience", "culture"],
  ),
  kgz(
    "kognoz-leadership-learning",
    "learning",
    "Leadership development and Learning@Work",
    "Kognoz designs and delivers leadership development programmes, learning academies and skills-based learning architectures (Skillmaps, Hiper Learn), and configures learning platforms including Darwinbox Learning and Cornerstone.",
    ["leadership", "learning", "Skillmaps"],
  ),
  kgz(
    "kognoz-hr-process-design",
    "advisory",
    "HR process and policy design",
    "Before configuration, Kognoz standardises HR processes and policies (compensation structures, leave and attendance rules, performance frameworks) across entities, documents variations explicitly and produces the approved design that Darwinbox is configured from.",
    ["process design", "policy", "standardisation"],
  ),
  kgz(
    "kognoz-darwinbox-implementation",
    "implementation",
    "Darwinbox implementation partnership",
    "As a Darwinbox partner, Kognoz leads discovery, design workshops, configuration workbooks, data-migration mapping, UAT management and go-live readiness, and stays for adoption and hypercare, with Darwinbox providing platform configuration and support.",
    ["implementation", "partner", "Darwinbox"],
  ),
  kgz(
    "kognoz-pmo-governance",
    "implementation",
    "Programme governance and PMO",
    "Kognoz sets up programme governance: steering committee cadence, RAID logs, decision registers, phase-gate sign-offs and benefits tracking, so a multi-entity rollout stays visible and accountable.",
    ["PMO", "governance", "steering committee"],
  ),
];

export const KB_ENTRY_ID = (slug: string) => stableId("kb_entry", slug);
