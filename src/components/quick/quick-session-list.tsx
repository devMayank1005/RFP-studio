import { Zap } from "lucide-react";
import Link from "next/link";

import { Chip, RfpStatusChip } from "@/components/chips/chips";
import { EmptyState } from "@/components/shell/empty-state";
import type { QuickSessionRow } from "@/db/queries/quick";
import { timeAgo } from "@/domain/dates";

/** Past sessions, newest first: what was asked, for whom, and how far it got. */
export function QuickSessionList({ sessions, now }: { sessions: QuickSessionRow[]; now: Date }) {
  if (!sessions.length) {
    return <EmptyState icon={Zap} title="No sessions yet" description="Paste a few questions above and the drafts land here, with citations, in about a minute." className="py-10" />;
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Quick Q&A sessions">
      {sessions.map((s) => (
        <li key={s.id}>
          <Link href={`/quick/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="min-w-0 flex-1">
              <div className="truncate text-ui font-medium">{s.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-muted-foreground">
                {s.isQuickClient ? <span>No client</span> : <span>{s.clientName}</span>}
                <span aria-hidden>·</span>
                <span className="num">{timeAgo(new Date(s.createdAt), now)}</span>
              </div>
            </div>
            <span className="num text-2xs text-muted-foreground">
              {s.draftedCount} of {s.questionCount} drafted · {s.approvedCount} approved
            </span>
            {s.inKbCount > 0 && (
              <Chip tone="green" dot>
                <span className="num">{s.inKbCount}</span>&nbsp;in knowledge base
              </Chip>
            )}
            <RfpStatusChip status={s.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
