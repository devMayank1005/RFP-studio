import type { Compliance, Module, Owner, QuestionType, ResponseStatus } from "@/domain/enums";

import { stableId } from "../ids";

import { CLIENTS } from "./clients";

/**
 * A seeded RFP so the dashboard and the workspace have something honest to
 * show before the first real upload: mixed statuses, compliance levels and
 * confidence, and citations into the seeded knowledge base.
 */
export const DEMO_RFP_ID = stableId("rfp", "apex-hrms-2026");
export const DEMO_CLIENT_ID = CLIENTS[1].id;
export const VEDANTA_RFP_ID = stableId("rfp", "vedanta-hr-transformation");

export interface DemoQuestion {
  ref: string;
  text: string;
  type: QuestionType;
  mandatory: boolean;
  owner: Owner;
  module: Module;
  /** Original client columns, kept verbatim. */
  meta: Record<string, string>;
  response?: {
    status: ResponseStatus;
    compliance: Compliance;
    confidence: number;
    text: string;
    citations: string[]; // kb slugs
    openPoints?: string[];
  };
}

export interface DemoSection {
  title: string;
  refCode: string;
  questions: DemoQuestion[];
}

const q = (
  ref: string,
  text: string,
  type: QuestionType,
  mandatory: boolean,
  owner: Owner,
  module: Module,
  priority: string,
  response?: DemoQuestion["response"],
): DemoQuestion => ({
  ref,
  text,
  type,
  mandatory,
  owner,
  module,
  meta: { Priority: priority, "Response required": type === "compliance" ? "Yes/Partial/No + remarks" : "Narrative" },
  response,
});

export const DEMO_SECTIONS: DemoSection[] = [
  {
    title: "Core HR & organisation",
    refCode: "A",
    questions: [
      q("A.1", "Maintain a single employee master across both legal entities with entity-specific custom fields and effective-dated history.", "compliance", true, "darwinbox", "core_hr", "Must Have", {
        status: "approved", compliance: "fully", confidence: 0.93,
        text: "Fully compliant. Darwinbox runs both Apex Industries and Apex Components on one instance with a single employee master; entity-specific custom fields and sections are configured without code, and every field change is effective-dated with full history [1]. Entity-specific policies, letters and approval chains sit on the same structure [2].",
        citations: ["core-employee-master", "core-org-structure"],
      }),
      q("A.2", "Support position management with headcount budgets and vacancy tracking per business unit.", "compliance", true, "darwinbox", "core_hr", "Must Have", {
        status: "approved", compliance: "fully", confidence: 0.9,
        text: "Fully compliant. Positions carry grade, band, reporting line and headcount budget, can be vacant or filled, and roll up to business unit and cost centre for vacancy and budget reporting [1].",
        citations: ["core-org-structure"],
      }),
      q("A.3", "Describe how the proposed structure will handle the planned demerger of the components business, including re-mapping of employees, positions and approval chains.", "descriptive", true, "joint", "advisory", "Must Have", {
        status: "edited", compliance: "partial", confidence: 0.71,
        text: "Partially compliant, delivered jointly. Darwinbox supports moving employees and positions between legal entities on an effective date, with the receiving entity's policies, letters and approval chains applying from that date [1][2]. Kognoz designs the target organisation structure, role architecture and grade mapping for the demerged entity and manages the transition plan and communication [3]. Open point: statutory registrations for the new entity must be confirmed before payroll cutover.",
        citations: ["core-org-structure", "core-workflows", "kognoz-org-design"],
        openPoints: ["Confirm statutory registrations and payroll cutover date for the demerged entity"],
      }),
      q("A.4", "Generate HR letters (appointment, confirmation, transfer, increment) from templates with digital signature.", "compliance", false, "darwinbox", "core_hr", "Should Have", {
        status: "ai_draft", compliance: "fully", confidence: 0.88,
        text: "Fully compliant. Letters are generated from templates with merge fields and routed for digital signature; documents are stored against the employee profile with role-based access [1].",
        citations: ["core-letters-documents"],
      }),
      q("A.5", "Provide a policy repository with acknowledgement tracking and an HR helpdesk with SLAs.", "compliance", false, "darwinbox", "helpdesk", "Should Have", {
        status: "ai_draft", compliance: "fully", confidence: 0.86,
        text: "Fully compliant. Policies are published with version control and acknowledgement tracking; the helpdesk module provides categories, SLAs, assignment rules and dashboards, accessible from web and mobile [1].",
        citations: ["core-policies-helpdesk"],
      }),
      q("A.6", "Multi-level, conditional approval workflows by entity, grade and amount with delegation and escalation.", "compliance", true, "darwinbox", "core_hr", "Must Have", {
        status: "approved", compliance: "fully", confidence: 0.95,
        text: "Fully compliant. The workflow builder supports conditional routing by entity, grade, location or amount, parallel and sequential approvers, delegation, escalation timers and a complete audit trail [1].",
        citations: ["core-workflows"],
      }),
    ],
  },
  {
    title: "Payroll & compensation",
    refCode: "B",
    questions: [
      q("B.1", "Process Indian payroll for both entities with PF, ESI, PT, LWF, TDS and Form 16, on separate pay calendars.", "compliance", true, "darwinbox", "payroll", "Must Have", {
        status: "approved", compliance: "fully", confidence: 0.94,
        text: "Fully compliant. Payroll runs per legal entity with its own calendar, components and statutory registrations, covering PF, ESI, professional tax, LWF, TDS returns and Form 16, with bank advice and statutory reports per entity [1][2].",
        citations: ["payroll-india-statutory", "payroll-multi-entity"],
      }),
      q("B.2", "Replace spreadsheet-based one-off payment inputs (joining bonus, retention bonus, recoveries) with a digital maker–checker workflow.", "compliance", true, "darwinbox", "payroll", "Must Have", {
        status: "ai_draft", compliance: "fully", confidence: 0.84,
        text: "Fully compliant. One-off payments are captured as payroll input types with eligibility rules, approval workflows and effective periods; inputs pass maker–checker review before processing, and validated bulk templates remain available for high volumes [1][2].",
        citations: ["payroll-inputs-digital", "payroll-multi-entity"],
      }),
      q("B.3", "Standardise salary structures and CTC components across entities and generate offer letters from the approved structures.", "compliance", true, "joint", "compensation", "Must Have", {
        status: "edited", compliance: "fully", confidence: 0.82,
        text: "Fully compliant. Kognoz first standardises the compensation structures, components and grade/location mappings across both entities and documents the agreed variations [3]; Darwinbox then configures the structures with applicability rules and effective dates, and offer letters are generated from the same approved mappings [1][2].",
        citations: ["comp-salary-structures", "recruit-requisition-to-offer", "kognoz-hr-process-design"],
      }),
      q("B.4", "Run annual increment and promotion cycles with budget control and guideline matrices, with effective dates driven by actual probation completion.", "compliance", true, "darwinbox", "compensation", "Must Have", {
        status: "ai_draft", compliance: "fully", confidence: 0.79,
        text: "Fully compliant. Compensation cycles support budget allocation, guideline matrices, manager recommendations and multi-level approval; effective dates can follow the actual probation or training completion date rather than the action date [1].",
        citations: ["comp-increment-cycles"],
      }),
      q("B.5", "Provide real-time compensation cost and reward-effectiveness analytics across total, fixed, variable and benefits cost.", "descriptive", false, "darwinbox", "analytics", "Should Have", {
        status: "flagged", compliance: "partial", confidence: 0.48,
        text: "Partially compliant. Standard dashboards cover total workforce cost, fixed versus variable pay, benefits, increment and promotion cost by entity, function, grade and location [1]. Reward-effectiveness modelling beyond these views needs scoping; it can be built with the report builder or, for advanced analytics, through Compport [2]. Open point: define the reward-effectiveness measures required.",
        citations: ["comp-analytics", "comp-compport-partner"],
        openPoints: ["Define the reward-effectiveness measures and refresh frequency required"],
      }),
      q("B.6", "Automate bonus payout calculation with integration to the finance planning system (Hyperion).", "compliance", false, "darwinbox", "integrations", "Should Have", {
        status: "ai_draft", compliance: "via_customization", confidence: 0.55,
        text: "Compliant via customisation. Bonus calculation runs in the compensation cycle with configurable formulas [1]; the Hyperion interface is designed during implementation on Darwinbox's standard API or file integrations [2]. Open point: confirm the Hyperion data contract and refresh cadence.",
        citations: ["comp-increment-cycles", "integrations-erp-finance"],
        openPoints: ["Confirm Hyperion data contract and refresh cadence"],
      }),
    ],
  },
  {
    title: "Time, attendance & leave",
    refCode: "C",
    questions: [
      q("C.1", "Capture attendance from existing biometric devices at plants and from the mobile app with geo-fencing for field staff.", "compliance", true, "darwinbox", "time_attendance", "Must Have", {
        status: "approved", compliance: "fully", confidence: 0.91,
        text: "Fully compliant. Biometric devices integrate via device or database integration; the mobile app supports geo-fenced check-in with face verification and offline sync [1].",
        citations: ["attendance-capture"],
      }),
      q("C.2", "Provide LOP and actual-working-day reports by date range, employee and department.", "compliance", true, "darwinbox", "time_attendance", "Must Have", {
        status: "ai_draft", compliance: "fully", confidence: 0.87,
        text: "Fully compliant. Standard reports cover loss of pay and actual working days by date range, employee, department or location, exportable and schedulable, with the report builder for additional views [1].",
        citations: ["attendance-reports-lop"],
      }),
      q("C.3", "Configure entity- and location-specific leave policies with comp-off and effective-dated balance reporting.", "compliance", true, "darwinbox", "leave", "Must Have", {
        status: "ai_draft", compliance: "fully", confidence: 0.9,
        text: "Fully compliant. Leave types, accruals, carry-forward, encashment, comp-off and holiday calendars are configured per entity, location or grade; balance-as-on-date and effective-dated balance reports are standard [1].",
        citations: ["leave-policies"],
      }),
      q("C.4", "Support unionised workmen shift rosters with overtime rules that differ by plant.", "compliance", true, "darwinbox", "time_attendance", "Must Have", {
        status: "ai_draft", compliance: "partial", confidence: 0.58,
        text: "Partially compliant. Shift schedules, rosters, overtime rules and grace periods are configurable per location or employee group [1]. Union-specific overtime and allowance rules must be documented per plant during design; unusual rules may need Studio configuration. Open point: collect the plant-wise union agreements.",
        citations: ["attendance-capture", "platform-studio-lowcode"],
        openPoints: ["Collect plant-wise union agreements for overtime and allowances"],
      }),
    ],
  },
  {
    title: "Change management & implementation",
    refCode: "D",
    questions: [
      q("D.1", "Describe your change-management approach, including leadership alignment, communication plan and persona-based training.", "descriptive", true, "kognoz", "change_management", "Must Have", {
        status: "approved", compliance: "fully", confidence: 0.92,
        text: "Fully compliant. Kognoz leads the change workstream: leadership alignment and a signed-off transformation narrative, stakeholder analysis with a change-leader network, an as-is/to-be impact assessment, a communication plan executed across channels, and persona-based training with manuals and navigation videos, followed by an adoption framework with dashboards tracked after go-live [1].",
        citations: ["kognoz-change-management"],
      }),
      q("D.2", "Provide the implementation methodology, phases, and UAT approach.", "descriptive", true, "joint", "implementation", "Must Have", {
        status: "edited", compliance: "fully", confidence: 0.85,
        text: "Fully compliant. The programme runs discovery, design (configuration workbooks), build, migration, integration, UAT on scenario scripts with dummy employees, training, go-live and hypercare with phase sign-offs [1]. Kognoz leads discovery, design workshops, migration mapping and UAT management; Darwinbox configures and supports the platform [2].",
        citations: ["implementation-methodology", "kognoz-darwinbox-implementation"],
      }),
      q("D.3", "Establish Darwinbox as the source of truth for employee, organisation and position data and retire redundant custom fields.", "compliance", true, "joint", "data_migration", "Must Have", {
        status: "ai_draft", compliance: "fully", confidence: 0.8,
        text: "Fully compliant. A source-to-target mapping and common field dictionary define each core field's owner, source and downstream consumers; values move from custom to standard fields with migration and validation rules, and redundant fields are retired [1]. Kognoz produces and governs the design; Darwinbox executes the load [2].",
        citations: ["data-migration", "kognoz-darwinbox-implementation"],
      }),
      q("D.4", "Provide a manager-facing AI agent that surfaces team attrition risk, open positions and probation due dates.", "descriptive", false, "darwinbox", "ai_agents", "Should Have", {
        status: "ai_draft", compliance: "via_customization", confidence: 0.52,
        text: "Compliant via customisation. Employee self-service agents are standard [1]; a manager-facing insights agent is built on Darwinbox Studio using platform data and APIs and is scoped per client [2]. Open point: agree the insight set and the RBAC scope for manager views.",
        citations: ["ai-conversational-agent", "ai-agent-builder-studio"],
        openPoints: ["Agree the manager insight set and RBAC scope"],
      }),
      q("D.5", "Confirm security certifications, data residency in India and SSO with Microsoft Entra ID.", "compliance", true, "darwinbox", "security_compliance", "Must Have", {
        status: "approved", compliance: "fully", confidence: 0.96,
        text: "Fully compliant. Darwinbox is ISO 27001 and SOC 2 certified, supports India DPDP and GDPR, offers India data residency, and provides SAML 2.0 / OIDC single sign-on with Microsoft Entra ID [1].",
        citations: ["security-compliance", "integrations-apis-sso"],
      }),
      q("D.6", "State post go-live support model and SLAs.", "descriptive", false, "darwinbox", "support", "Should Have", {
        status: "ai_draft", compliance: "fully", confidence: 0.83,
        text: "Fully compliant. Support includes a ticketing portal, severity-based SLAs, a named customer success manager and quarterly release reviews [1]; Kognoz remains through hypercare for adoption [2].",
        citations: ["support-model", "kognoz-darwinbox-implementation"],
      }),
      q("D.7", "Provide indicative pricing for licences, implementation and change management.", "pricing", true, "joint", "commercial", "Must Have"),
      q("D.8", "Attach relevant case studies from metals, mining or manufacturing clients.", "attachment", false, "joint", "general", "Should Have"),
    ],
  },
];

export const DEMO_RFP = {
  id: DEMO_RFP_ID,
  clientId: DEMO_CLIENT_ID,
  title: "Apex Manufacturing — HRMS implementation RFP (demo)",
  engagementType: "hris_implementation",
  bidderOfRecord: "joint",
  status: "in_review",
  dueDate: "2026-10-09",
  contextSummary:
    "Apex Manufacturing (8,200 employees, two Indian legal entities, unionised plant workforce) is replacing a homegrown HR system and spreadsheets with an integrated HRMS. The components business will be demerged next financial year, so entity moves, separate payroll calendars and harmonised compensation structures matter. Priorities: single employee master, Indian statutory payroll for both entities, biometric and geo-fenced attendance, digital payroll inputs, and a strong change-management workstream. Finance runs Hyperion; SSO is Microsoft Entra ID.",
} as const;

export const VEDANTA_RFP = {
  id: VEDANTA_RFP_ID,
  clientId: CLIENTS[0].id,
  title: "Vedanta — HR transformation requirements",
  engagementType: "joint_bid",
  bidderOfRecord: "joint",
  status: "draft",
  dueDate: "2026-10-24",
} as const;
