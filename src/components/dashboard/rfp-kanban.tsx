import Link from "next/link";

import { RfpStatusChip } from "@/components/chips/chips";
import type { RfpListRow } from "@/db/queries/rfps";
import type { RfpStatus } from "@/domain/enums";
import { cn } from "@/lib/utils";

import { ApprovalMeter } from "./approval-meter";
import { DueBadge } from "./due-badge";

interface Lane {
  key: string;
  title: string;
  statuses: RfpStatus[];
}

/** The pipeline, in the order work flows. Terminal states share one lane. */
const LANES: Lane[] = [
  { key: "intake", title: "Intake", statuses: ["draft", "parsing"] },
  { key: "ready", title: "Questions ready", statuses: ["questions_ready"] },
  { key: "drafting", title: "Drafting", statuses: ["drafting"] },
  { key: "review", title: "In review", statuses: ["in_review"] },
  { key: "done", title: "Approved & sent", statuses: ["approved", "submitted", "won", "lost"] },
];

export function RfpKanban({ rows, today }: { rows: RfpListRow[]; today: string }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
      {LANES.map((lane) => {
        const cards = rows.filter((r) => lane.statuses.includes(r.status));
        return (
          <section key={lane.key} className="flex w-72 shrink-0 flex-col gap-2" aria-label={lane.title}>
            <header className="flex items-center justify-between px-1">
              <h2 className="text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{lane.title}</h2>
              <span className="num text-2xs text-faint-ink">{cards.length}</span>
            </header>
            <div className={cn("flex min-h-32 flex-col gap-2 rounded-lg bg-muted/60 p-2", !cards.length && "border border-dashed")}>
              {cards.map((r) => (
                <Link
                  key={r.id}
                  href={`/rfps/${r.id}/workspace`}
                  className="group rounded-md border bg-card p-3 shadow-[0_1px_2px_rgba(35,38,40,0.04)] outline-none transition-colors hover:border-line-strong focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <span className="line-clamp-2 text-ui font-medium text-foreground group-hover:text-brand-blue dark:group-hover:text-sidebar-primary">
                      {r.title}
                    </span>
                  </div>
                  <div className="mb-2.5 text-2xs text-muted-foreground">{r.clientName}</div>
                  <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                    <RfpStatusChip status={r.status} />
                    <DueBadge dueDate={r.dueDate} today={today} withDate={false} />
                  </div>
                  <ApprovalMeter approved={r.approvedCount} drafted={r.draftedCount} total={r.questionCount} />
                </Link>
              ))}
              {!cards.length && <p className="m-auto text-2xs text-faint-ink">Nothing here</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
