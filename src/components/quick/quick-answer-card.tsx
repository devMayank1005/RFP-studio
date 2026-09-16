"use client";

import { BookPlus, Check, Pencil, RefreshCw, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { promoteToKb } from "@/app/actions/kb";
import { approveAndPromote } from "@/app/actions/quick";
import { regenerateResponse } from "@/app/actions/responses";
import { approveResponses, editResponse, unapproveResponses } from "@/app/actions/review";
import { Chip, ComplianceChip, ConfidenceChip, ResponseStatusChip } from "@/components/chips/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { JobProgress } from "@/components/wizard/job-progress";
import type { QuickRow } from "@/db/queries/quick";
import { timeAgo } from "@/domain/dates";
import type { quickPermissions } from "@/domain/quick";
import { cn } from "@/lib/utils";

type Permissions = ReturnType<typeof quickPermissions>;

const SOURCE_FALLBACK = { kb_entry: "Knowledge base", approved_answer: "Approved answer", rfp_document: "RFP document" } as const;

/**
 * One question with its drafted answer and the four things a reviewer does
 * with it: edit, regenerate with an instruction, approve, and keep it as a
 * precedent. Model-authored text carries the teal hairline; approval and
 * "in knowledge base" are the only greens.
 */
export function QuickAnswerCard({ rfpId, row, permissions, now }: { rfpId: string; row: QuickRow; permissions: Permissions; now: Date }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"approve" | "unapprove" | "promote" | "edit" | "regenerate" | null>(null);

  function run(kind: NonNullable<typeof busy>, fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setBusy(kind);
    startTransition(async () => {
      const result = await fn();
      setBusy(null);
      if (!result.ok) return void toast.error(result.error ?? "Something went wrong.");
      if (success) toast.success(success);
      router.refresh();
    });
  }

  const answered = row.status !== null && !!row.finalText;
  const approved = row.status === "approved";

  return (
    <article className="rounded-lg border bg-card p-4" aria-label={`${row.refNo} ${row.questionText}`}>
      <div className="flex items-start gap-3">
        <span className="num mt-0.5 shrink-0 font-mono text-2xs text-muted-foreground">{row.refNo}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-ui font-medium leading-relaxed">{row.questionText}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <ResponseStatusChip status={row.status} />
            {row.compliance && <ComplianceChip compliance={row.compliance} />}
            {row.confidence !== null && <ConfidenceChip confidence={row.confidence} />}
            {row.kbAnswerId && (
              <Chip tone="green" dot>
                In knowledge base
              </Chip>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 pl-8">
        {editing && row.finalText !== null ? (
          <Editor
            initial={row.finalText}
            pending={busy === "edit"}
            onCancel={() => setEditing(false)}
            onSave={(text) =>
              run(
                "edit",
                async () => {
                  const r = await editResponse(rfpId, row.questionId, text);
                  if (r.ok) setEditing(false);
                  return r;
                },
                "Revision saved",
              )
            }
          />
        ) : answered ? (
          <div className={cn("rounded-md border bg-card p-3", row.generatedBy === "model" && "engine-hairline")}>
            <p className="whitespace-pre-wrap text-ui leading-relaxed">{row.finalText}</p>
            {row.openPoints.length > 0 && (
              <div className="mt-3 rounded-md bg-meaning-amber-bg p-2.5 text-2xs text-meaning-amber-text">
                <div className="mb-1 font-medium uppercase tracking-[0.1em]">Open points</div>
                <ul className="list-disc pl-4">
                  {row.openPoints.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
            {row.flagReason && <div className="mt-3 rounded-md bg-meaning-amber-bg p-2.5 text-2xs text-meaning-amber-text">Flagged: {row.flagReason}</div>}
            {row.citations.length > 0 && (
              <ol className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground" aria-label="Sources">
                {row.citations.map((c) => (
                  <li key={c.ordinal}>
                    <span className="num">[{c.ordinal}]</span> {c.title ?? SOURCE_FALLBACK[c.sourceType]}
                  </li>
                ))}
              </ol>
            )}
            <div className="mt-2 text-2xs text-faint-ink">
              {row.version !== null && <span className="num">v{row.version}</span>}
              {row.generatedBy === "model" ? " · drafted by Claude" : row.generatedBy === "user" ? " · edited by hand" : row.generatedBy === "import" ? " · imported" : ""}
              {row.revisionAt && <span className="num"> · {timeAgo(new Date(row.revisionAt), now)}</span>}
              {row.instruction && <span> · “{row.instruction}”</span>}
            </div>
          </div>
        ) : (
          <p className="text-ui italic text-muted-foreground">{row.status === null ? "Not drafted yet." : "The answer is empty."}</p>
        )}

        {regenerating && (
          <div className="mt-3 flex flex-col gap-2 rounded-md border border-dashed p-3">
            <Input
              autoFocus
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Tell Claude what to change — shorter, mention the API, cite the payroll entry…"
              aria-label="Regeneration instruction"
              onKeyDown={(e) => {
                if (e.key === "Escape") setRegenerating(false);
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRegenerating(false)} disabled={!!jobId}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!!jobId || busy === "regenerate"}
                onClick={() =>
                  run("regenerate", async () => {
                    const r = await regenerateResponse(rfpId, row.questionId, instruction.trim());
                    if (r.ok) setJobId(r.data.jobId);
                    return r;
                  })
                }
              >
                {busy === "regenerate" ? <Spinner className="size-3.5" /> : <RefreshCw />}
                Regenerate
              </Button>
            </div>
            {jobId && (
              <JobProgress
                jobId={jobId}
                title="Regenerating"
                className="border-0 p-0"
                onRetry={() => setJobId(null)}
                onDone={() => {
                  setJobId(null);
                  setRegenerating(false);
                  setInstruction("");
                  toast.success("Answer regenerated");
                }}
              />
            )}
          </div>
        )}

        {answered && !editing && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {permissions.edit && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={isPending}>
                <Pencil />
                Edit
              </Button>
            )}
            {permissions.draft && (
              <Button size="sm" variant="outline" onClick={() => setRegenerating((v) => !v)} aria-expanded={regenerating} disabled={isPending}>
                <RefreshCw />
                Regenerate
              </Button>
            )}
            {permissions.approve &&
              (approved ? (
                <Button size="sm" variant="ghost" onClick={() => run("unapprove", () => unapproveResponses(rfpId, [row.questionId]))} disabled={isPending}>
                  {busy === "unapprove" ? <Spinner className="size-3.5" /> : <Undo2 />}
                  Unapprove
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => run("approve", () => approveResponses(rfpId, [row.questionId]), "Approved")} disabled={isPending}>
                  {busy === "approve" ? <Spinner className="size-3.5" /> : <Check />}
                  Approve
                </Button>
              ))}
            {permissions.promote && !row.kbAnswerId && (
              <Button
                size="sm"
                onClick={() =>
                  run("promote", () => (approved ? promoteToKb(rfpId, row.questionId) : approveAndPromote(rfpId, row.questionId)), "Added to the knowledge base")
                }
                disabled={isPending}
              >
                {busy === "promote" ? <Spinner className="size-3.5" /> : <BookPlus />}
                {busy === "promote" ? "Adding…" : "Add to knowledge base"}
              </Button>
            )}
            {!permissions.approve && !permissions.promote && <span className="text-2xs text-muted-foreground">Ask a consultant or reviewer to approve and add answers to the knowledge base.</span>}
          </div>
        )}
      </div>
    </article>
  );
}

function Editor({ initial, pending, onSave, onCancel }: { initial: string; pending: boolean; onSave: (t: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSave(value);
        }}
        className="min-h-40 text-ui leading-relaxed"
        aria-label="Answer text"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-2xs text-muted-foreground">
          <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> saves a new revision
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(value)} disabled={pending || value.trim() === initial.trim() || !value.trim()}>
          {pending ? <Spinner className="size-3.5" /> : null}
          Save revision
        </Button>
      </div>
    </div>
  );
}
