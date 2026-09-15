import Link from "next/link";

import { RfpStatusChip } from "@/components/chips/chips";
import { ApprovalMeter } from "@/components/dashboard/approval-meter";
import { DueBadge } from "@/components/dashboard/due-badge";
import type { RfpHeader as RfpHeaderData } from "@/db/queries/rfps";
import { ENGAGEMENT_TYPE_LABEL } from "@/domain/enums";

import { RfpTabs } from "./rfp-tabs";

/** The RFP's identity row: client, title, status, due, progress; then the section tabs. */
export function RfpHeader({ rfp, today }: { rfp: RfpHeaderData; today: string }) {
  return (
    <div className="border-b bg-background px-6 pt-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              RFPs
            </Link>
            <span aria-hidden>/</span>
            <span className="normal-case tracking-normal">{rfp.clientName}</span>
          </div>
          <h1 className="truncate font-heading text-xl font-semibold">{rfp.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RfpStatusChip status={rfp.status} />
            <DueBadge dueDate={rfp.dueDate} today={today} />
            <span className="text-2xs text-muted-foreground">{ENGAGEMENT_TYPE_LABEL[rfp.engagementType]}</span>
          </div>
        </div>
        <div className="w-64 shrink-0 pt-1">
          <div className="mb-1 flex items-center justify-between text-2xs text-muted-foreground">
            <span>Approved</span>
            <span className="num">
              {rfp.draftedCount} drafted · {rfp.questionCount} total
            </span>
          </div>
          <ApprovalMeter approved={rfp.approvedCount} drafted={rfp.draftedCount} total={rfp.questionCount} />
        </div>
      </div>
      <div className="mt-3">
        <RfpTabs rfpId={rfp.id} />
      </div>
    </div>
  );
}
