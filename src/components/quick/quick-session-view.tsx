"use client";

import { ExternalLink, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { retryQuickIntake } from "@/app/actions/quick";
import { draftRfp } from "@/app/actions/responses";
import { Chip, RfpStatusChip } from "@/components/chips/chips";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { JobProgress } from "@/components/wizard/job-progress";
import type { JobView } from "@/db/jobs";
import type { QuickRow, QuickSession } from "@/db/queries/quick";
import type { Role } from "@/domain/enums";
import { quickCounts, quickPermissions, quickStage } from "@/domain/quick";

import { QuickAnswerCard } from "./quick-answer-card";

/**
 * One session: what was asked and for whom, the intake and drafting
 * progress (the page re-fetches every 2 s while either runs, so cards fill
 * in as each answer lands), then the answers.
 */
export function QuickSessionView({ session, rows, intake, draft, role, now }: { session: QuickSession; rows: QuickRow[]; intake: JobView | null; draft: JobView | null; role: Role; now: Date }) {
  const router = useRouter();
  const permissions = quickPermissions(role);
  const counts = quickCounts(rows);
  const stage = quickStage({ intake, draft, questionCount: rows.length, now });
  const [isPending, startTransition] = useTransition();
  const [retryJobId, setRetryJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!stage.active) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [stage.active, router]);

  function retry() {
    startTransition(async () => {
      const result = stage.show === "intake" ? await retryQuickIntake(session.id) : await draftRfp(session.id);
      if (!result.ok) return void toast.error(result.error);
      setRetryJobId(result.data.jobId);
      router.refresh();
    });
  }

  const undrafted = rows.filter((r) => r.status === null).length;
  const canDraftMore = permissions.draft && !stage.active && undrafted > 0 && session.status !== "parsing";

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <Link href="/quick" className="hover:text-foreground">
              Quick Q&A
            </Link>
            <span aria-hidden>/</span>
            <span className="normal-case tracking-normal">{session.isQuickClient ? "No client" : session.clientName}</span>
          </div>
          <h1 className="font-heading text-xl font-semibold">{session.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RfpStatusChip status={session.status} />
            <span className="num text-2xs text-muted-foreground">
              {counts.drafted} of {counts.total} drafted · {counts.approved} approved
            </span>
            {counts.inKb > 0 && (
              <Chip tone="green" dot>
                <span className="num">{counts.inKb}</span>&nbsp;in knowledge base
              </Chip>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canDraftMore && (
            <Button size="sm" variant="outline" onClick={retry} disabled={isPending}>
              {isPending ? <Spinner className="size-3.5" /> : <Zap />}
              Draft {undrafted} undrafted
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href={`/rfps/${session.id}/workspace`}>
              <ExternalLink />
              Open in workspace
            </Link>
          </Button>
        </div>
      </div>

      {session.context && (
        <details className="rounded-lg border bg-card px-4 py-3">
          <summary className="cursor-pointer text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Deal context</summary>
          <p className="mt-2 whitespace-pre-wrap text-ui leading-relaxed">{session.context}</p>
        </details>
      )}

      {stage.show === "intake" && intake && (
        <JobProgress
          jobId={retryJobId ?? intake.id}
          title={intake.status === "failed" ? "Reading the questions failed" : "Reading the questions"}
          detail="Claude turns the paste or file into a question list, then drafting starts on its own."
          onRetry={retry}
          className="p-4"
        />
      )}
      {stage.show === "draft" && draft && (
        <JobProgress
          jobId={retryJobId ?? draft.id}
          title={draft.status === "failed" ? "Drafting stopped" : "Drafting responses"}
          detail="Every answer is drafted from the knowledge base with citations; cards fill in as they land."
          onRetry={retry}
          className="p-4"
        />
      )}
      {stage.stale && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-4 py-3">
          <Chip tone="amber" dot>
            Not picked up
          </Chip>
          <span className="text-ui text-muted-foreground">No worker took this job. Check the job runner is registered, then try again.</span>
          {permissions.draft && (
            <Button size="sm" variant="outline" onClick={retry} disabled={isPending}>
              Retry
            </Button>
          )}
        </div>
      )}
      {stage.show === null && stage.active && <p className="text-2xs text-muted-foreground">Questions are in — starting the drafts…</p>}

      {rows.length ? (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <QuickAnswerCard key={`${row.questionId}:${row.revisionId ?? "none"}:${row.status ?? "none"}:${row.kbAnswerId ?? ""}`} rfpId={session.id} row={row} permissions={permissions} now={now} />
          ))}
        </div>
      ) : (
        !stage.active &&
        !stage.show && <EmptyState icon={Zap} title="Nothing to draft" description="No questions were found. Start a new session with one question per line." action={<Button asChild variant="outline"><Link href="/quick">Back to Quick Q&A</Link></Button>} />
      )}
    </div>
  );
}
