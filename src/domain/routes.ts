import type { RfpStatus } from "./enums";

/**
 * Where a link into an RFP should land. Pure so the dashboard, the RFP index
 * redirect and the setup entry point agree.
 */

/** Statuses in which the question list is not confirmed yet: the RFP lives in the wizard. */
export const INTAKE_STATUSES: readonly RfpStatus[] = ["draft", "parsing"];

export function rfpLandingPath(rfpId: string, status: RfpStatus): string {
  return INTAKE_STATUSES.includes(status) ? `/rfps/${rfpId}/setup` : `/rfps/${rfpId}/workspace`;
}

export type SetupStep = "upload" | "questions";

/**
 * The wizard step to resume at. /setup itself has no page; the tab and the
 * dashboard both arrive here and are sent to the first step that still has
 * something to show.
 */
export function setupStepFor(input: { status: RfpStatus; questionCount: number; hasExtractionJob: boolean }): SetupStep {
  if (!INTAKE_STATUSES.includes(input.status)) return "questions";
  if (input.questionCount > 0 || input.hasExtractionJob) return "questions";
  return "upload";
}

export function setupStepPath(rfpId: string, step: SetupStep): string {
  return `/rfps/${rfpId}/setup/${step}`;
}
