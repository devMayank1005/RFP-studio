"use client";

import { FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { requestExport } from "@/app/actions/exports";
import { Chip } from "@/components/chips/chips";
import { ApprovalMeter } from "@/components/dashboard/approval-meter";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ExportRow } from "@/db/queries/exports";
import { can } from "@/domain/access";
import { ROLE_LABEL, type ExportFormat, type Role } from "@/domain/enums";
import { EXPORT_FORMAT_META, type ExportReadiness, type ExportShape } from "@/domain/export";
import { isStaleQueuedJob } from "@/domain/jobs";

import { ExportHistory } from "./export-history";
import { FormatCard } from "./format-card";

/**
 * The Exports tab: where the answers stand, the two builds you can ask for
 * (and the deck that is coming), and the history of every file built.
 * Unapproved answers are never hidden — the band says how many there are
 * before you build, and the file marks them.
 */
export function ExportsPanel({
  rfpId,
  readiness,
  history,
  role,
  engineError,
  canFill,
  now,
}: {
  rfpId: string;
  readiness: ExportReadiness;
  history: ExportRow[];
  role: Role;
  engineError: string | null;
  canFill: boolean;
  now: Date;
}) {
  const router = useRouter();
  const canBuild = can(role, "export.create");
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [shape, setShape] = useState<ExportShape>("fresh");
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [isPending, startTransition] = useTransition();
  // Builds this panel started; a build already running when the page loads
  // (or the history refreshes) is picked up from the rows instead.
  const [jobs, setJobs] = useState<Partial<Record<ExportFormat, string>>>({});
  const fromHistory = useMemo(() => activeBuilds(history, now), [history, now]);
  // Jobs whose card has already settled: the history may still say "running"
  // until its refresh lands, and must not resurrect the progress card.
  const [settledIds, setSettledIds] = useState<ReadonlySet<string>>(() => new Set());
  const active = (format: ExportFormat): string | null => {
    const started = jobs[format];
    if (started && !settledIds.has(started)) {
      const row = history.find((r) => r.jobId === started);
      // Not in the history yet (its refresh is pending) or still live: keep showing it.
      if (!row || (row.status !== "done" && row.status !== "failed")) return started;
    }
    const fromRows = fromHistory[format];
    return fromRows && !settledIds.has(fromRows) ? fromRows : null;
  };

  // The history refreshes every 2 s while a build runs, so the server can
  // report it finished before the card's poll sees it. Say so from here too;
  // the toast id keeps the two paths from stacking two toasts.
  const toasted = useRef(new Set<string>());
  useEffect(() => {
    for (const jobId of Object.values(jobs)) {
      if (!jobId || toasted.current.has(jobId)) continue;
      if (history.some((r) => r.jobId === jobId && r.status === "done")) {
        toasted.current.add(jobId);
        toast.success("Export ready", { id: `export-${jobId}`, description: "Download it from the history below." });
      }
    }
  }, [history, jobs]);

  function build(format: ExportFormat) {
    setPending(format);
    startTransition(async () => {
      const result = await requestExport(rfpId, format, { approvedOnly, shape: format === "xlsx" ? shape : undefined });
      setPending(null);
      if (!result.ok) return void toast.error(result.error);
      setJobs((j) => ({ ...j, [format]: result.data.jobId }));
      // The queued row belongs in the history straight away; the settle refresh handles completion.
      router.refresh();
    });
  }

  const settle = (format: ExportFormat) => () => {
    const id = jobs[format] ?? fromHistory[format];
    if (id) setSettledIds((ids) => (ids.has(id) ? ids : new Set(ids).add(id)));
    setJobs((j) => {
      if (!(format in j)) return j;
      const next = { ...j };
      delete next[format];
      return next;
    });
  };

  const roleHint = canBuild ? null : `Your role (${ROLE_LABEL[role]}) cannot create exports.`;
  const noQuestions = readiness.total === 0;
  const buildHint = roleHint ?? (noQuestions ? "Add and confirm questions first." : null);
  const canBuildNow = canBuild && !noQuestions;
  const pct = readiness.total ? Math.round((readiness.approved / readiness.total) * 100) : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-3 border-b bg-background px-6 py-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-ui font-medium">
                <span className="num">{pct}%</span> approved
              </span>
              <span className="num text-2xs text-muted-foreground">
                {readiness.approved} of {readiness.total} answers
              </span>
              {readiness.total === 0 ? (
                <Chip tone="neutral">No questions yet</Chip>
              ) : readiness.unapproved > 0 ? (
                <Chip tone="amber" dot>
                  <span className="num">{readiness.unapproved}</span>&nbsp;unapproved answers will be exported as they stand
                  {readiness.flagged ? (
                    <>
                      &nbsp;· <span className="num">{readiness.flagged}</span>&nbsp;flagged
                    </>
                  ) : null}
                </Chip>
              ) : (
                <Chip tone="green" dot>
                  Every answer is approved
                </Chip>
              )}
            </div>
            <ApprovalMeter approved={readiness.approved} drafted={readiness.drafted} total={readiness.total} showLabel={false} className="max-w-md" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="approved-only" checked={approvedOnly} onCheckedChange={(v) => setApprovedOnly(v === true)} disabled={!canBuild} />
            <Label htmlFor="approved-only" className="text-ui font-normal">
              Only approved answers — leave the rest blank
            </Label>
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-6 py-5 md:grid-cols-3">
        <FormatCard
          eyebrow="Excel"
          title="Response workbook"
          description="The client's own columns with ours appended — or their file, filled in."
          icon={FileSpreadsheet}
          buildLabel="Build Excel"
          canBuild={canBuildNow}
          disabledHint={buildHint}
          pending={isPending && pending === "xlsx"}
          activeJobId={active("xlsx")}
          progressTitle="Building the Excel export"
          progressDetail={shape === "fill" ? "Writing every answer into the client's own workbook." : "Laying out the client's columns, then Compliance, Response, Status, Owner, Open points and Sources."}
          onBuild={() => build("xlsx")}
          onSettled={settle("xlsx")}
        >
          <ToggleGroup type="single" variant="outline" size="sm" value={shape} onValueChange={(v) => v && setShape(v as ExportShape)} className="w-full" aria-label="Excel shape" disabled={!canBuild}>
            <ToggleGroupItem value="fresh" className="flex-1 text-2xs">
              Fresh workbook
            </ToggleGroupItem>
            <ToggleGroupItem value="fill" className="flex-1 text-2xs" disabled={!canFill} title={canFill ? undefined : "Needs the client's Excel questionnaire, parsed on the upload step."}>
              Fill the client&apos;s file
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="mt-2 text-2xs text-muted-foreground">
            {shape === "fill" ? "Their file, with answers written into their own columns; unapproved answers are tinted amber." : "A new workbook: their columns first, then ours."}
          </p>
        </FormatCard>
        <FormatCard
          eyebrow="Word"
          title="Response document"
          description="Executive summary, every section with its answers and sources, and the CHRO appendix — in the brand template."
          icon={FileText}
          buildLabel="Build Word"
          canBuild={canBuildNow}
          disabledHint={buildHint ?? engineError}
          pending={isPending && pending === "docx"}
          activeJobId={active("docx")}
          progressTitle="Building the Word export"
          progressDetail="Claude writes the executive summary from the approved answers, then the document is laid out."
          onBuild={() => build("docx")}
          onSettled={settle("docx")}
        />
        <FormatCard
          eyebrow="Deck"
          title="Value-proposition deck"
          description={`${EXPORT_FORMAT_META.pptx.label}: the joint Kognoz and Darwinbox story for the evaluation committee.`}
          icon={Presentation}
          buildLabel="Build deck"
          canBuild={canBuild}
          disabledHint={roleHint}
          later
          activeJobId={null}
          progressTitle=""
          progressDetail=""
          onBuild={() => undefined}
          onSettled={() => undefined}
        />
      </div>

      <div className="flex flex-col gap-2 px-6 pb-6">
        <h2 className="text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Export history</h2>
        <ExportHistory rfpId={rfpId} rows={history} canManage={canBuild} now={now} />
      </div>
    </div>
  );
}

/** The newest live build per format, so a running job shows its progress after a reload. */
function activeBuilds(history: ExportRow[], now: Date): Partial<Record<ExportFormat, string>> {
  const active: Partial<Record<ExportFormat, string>> = {};
  for (const r of history) {
    if ((r.status === "queued" || r.status === "running") && r.jobId && !isStaleQueuedJob(r, now) && !active[r.format]) active[r.format] = r.jobId;
  }
  return active;
}
