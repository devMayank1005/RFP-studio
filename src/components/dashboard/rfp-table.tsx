import Link from "next/link";

import { RfpStatusChip } from "@/components/chips/chips";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RfpListRow } from "@/db/queries/rfps";
import { timeAgo } from "@/domain/dates";
import { ENGAGEMENT_TYPE_LABEL } from "@/domain/enums";
import { rfpLandingPath } from "@/domain/routes";

import { ApprovalMeter } from "./approval-meter";
import { DueBadge } from "./due-badge";

export function RfpTable({ rows, today, now }: { rows: RfpListRow[]; today: string; now: Date }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {/* Columns drop by priority as the viewport narrows: date text, Questions and Updated under xl (the meter label already shows approved/total) — the table never clips. */}
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[38%]">RFP</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Due</TableHead>
            <TableHead className="w-[18%]">Approved</TableHead>
            <TableHead className="hidden text-right xl:table-cell">Questions</TableHead>
            <TableHead className="hidden text-right xl:table-cell">Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="group relative h-row">
              <TableCell className="py-2">
                <Link
                  href={rfpLandingPath(r.id, r.status)}
                  className="block min-w-0 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                >
                  <span className="block truncate text-ui font-medium text-foreground group-hover:text-brand-blue dark:group-hover:text-sidebar-primary">
                    {r.title}
                  </span>
                  <span className="block truncate text-2xs text-muted-foreground">
                    {r.clientName} · {ENGAGEMENT_TYPE_LABEL[r.engagementType]}
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <RfpStatusChip status={r.status} />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                <DueBadge dueDate={r.dueDate} today={today} dateClassName="hidden xl:inline" />
              </TableCell>
              <TableCell>
                <ApprovalMeter approved={r.approvedCount} drafted={r.draftedCount} total={r.questionCount} />
              </TableCell>
              <TableCell className="num hidden text-right text-ui text-muted-foreground xl:table-cell">{r.questionCount}</TableCell>
              <TableCell className="hidden whitespace-nowrap text-right text-2xs text-muted-foreground xl:table-cell">{timeAgo(r.updatedAt, now)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
