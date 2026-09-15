import type { RfpListRow } from "@/db/queries/rfps";
import { daysBetween } from "@/domain/dates";
import { cn } from "@/lib/utils";

const OPEN_STATUSES = new Set(["draft", "parsing", "questions_ready", "drafting", "in_review", "approved"]);

export function computeStats(rows: RfpListRow[], today: string) {
  const open = rows.filter((r) => OPEN_STATUSES.has(r.status));
  const dueSoon = open.filter((r) => r.dueDate && daysBetween(today, r.dueDate) <= 7);
  const awaiting = open.reduce((n, r) => n + Math.max(r.draftedCount - r.approvedCount, 0), 0);
  const totalQ = open.reduce((n, r) => n + r.questionCount, 0);
  const approvedQ = open.reduce((n, r) => n + r.approvedCount, 0);
  return {
    openRfps: open.length,
    dueSoon: dueSoon.length,
    awaitingReview: awaiting,
    approvedPct: totalQ ? Math.round((approvedQ / totalQ) * 100) : 0,
    approvedQ,
    totalQ,
  };
}

function Tile({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border bg-card px-4 py-3", className)}>
      <span className="text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      {/* Proportional figures on purpose: tabular digits look loose at this size. */}
      <span className="font-heading text-2xl font-semibold leading-none text-foreground">{value}</span>
      {hint && <span className="text-2xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** The KPI row. Four numbers, no charts — the number is the chart. */
export function StatTiles({ rows, today }: { rows: RfpListRow[]; today: string }) {
  const s = computeStats(rows, today);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Open RFPs" value={String(s.openRfps)} hint="not yet submitted" />
      <Tile
        label="Due within 7 days"
        value={String(s.dueSoon)}
        hint={s.dueSoon ? "needs attention" : "nothing urgent"}
        className={cn(s.dueSoon && "border-meaning-amber-text/30")}
      />
      <Tile label="Awaiting review" value={String(s.awaitingReview)} hint="drafted, not yet approved" />
      <Tile label="Approved" value={`${s.approvedPct}%`} hint={`${s.approvedQ} of ${s.totalQ} questions`} />
    </div>
  );
}
