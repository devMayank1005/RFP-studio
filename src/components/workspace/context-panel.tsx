"use client";

import { BookPlus, Check, Flag, Pencil, RefreshCw, Sparkles, Undo2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { regenerateResponse } from "@/app/actions/responses";
import { COMPLIANCE_TONE, Chip, ComplianceChip, ConfidenceChip, MandatoryChip, OwnerChip, QuestionTypeChip, ResponseStatusChip } from "@/components/chips/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ANSWER_MAX_CHARS } from "@/domain/drafting";
import { CellMenu } from "@/components/wizard/cell-menu";
import { JobProgress } from "@/components/wizard/job-progress";
import type { WorkspaceRow } from "@/db/queries/workspace";
import { can } from "@/domain/access";
import { timeAgo } from "@/domain/dates";
import { COMPLIANCE_LABEL, COMPLIANCE_LEVELS, type Compliance, type Role } from "@/domain/enums";
import { useApprove, useEdit, useFlag, usePromoteToKb, useQuestionDetail, useSetCompliance, useUnapprove, type QuestionDetailJson } from "@/hooks/use-workspace-data";
import { cn } from "@/lib/utils";
import { useWorkspaceStore } from "@/store/workspace";

/**
 * The right pane: trust and control for one row. The original question and
 * the client's own columns are always one tab away; the response shows its
 * compliance, confidence, citations and every revision; and every action a
 * reviewer takes lives here.
 */
export function ContextPanel({ rfpId, row, role, onDraftOne, onJobDone }: { rfpId: string; row: WorkspaceRow | null; role: Role; onDraftOne: (id: string) => void; onJobDone: () => void }) {
  const panelTab = useWorkspaceStore((s) => s.panelTab);
  const setPanelTab = useWorkspaceStore((s) => s.setPanelTab);
  const editorOpen = useWorkspaceStore((s) => s.editorOpen);
  const setEditorOpen = useWorkspaceStore((s) => s.setEditorOpen);
  const regenerateOpen = useWorkspaceStore((s) => s.regenerateOpen);
  const setRegenerateOpen = useWorkspaceStore((s) => s.setRegenerateOpen);

  const detail = useQuestionDetail(rfpId, row?.questionId ?? null);
  const approve = useApprove(rfpId);
  const unapprove = useUnapprove(rfpId);
  const flag = useFlag(rfpId);
  const edit = useEdit(rfpId);
  const compliance = useSetCompliance(rfpId);
  const promote = usePromoteToKb(rfpId);

  if (!row) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-ui font-medium">Select a row</p>
        <p className="text-2xs text-muted-foreground">
          Or press <Kbd>J</Kbd> to start at the top. <Kbd>?</Kbd> shows every shortcut.
        </p>
      </div>
    );
  }

  const current = detail.data?.revisions.find((r) => r.id === detail.data?.response?.currentRevisionId) ?? detail.data?.revisions[0] ?? null;
  // Until the detail arrives the grid's 240-char preview stands in, marked as such.
  const text = current?.finalText ?? (row.responsePreview ? row.responsePreview + (detail.isLoading ? "…" : "") : "");
  const canApprove = can(role, "response.approve");
  const canEdit = can(role, "response.edit");
  const canDraft = can(role, "response.draft");
  const canPromote = can(role, "kb.promote");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 pt-3 pb-2">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="num font-mono text-2xs text-muted-foreground">{row.refNo}</span>
          <ResponseStatusChip status={row.status} />
          <ComplianceChip compliance={row.compliance} />
          <ConfidenceChip confidence={row.confidence} />
        </div>
        <p className="line-clamp-3 text-ui leading-snug">{row.questionText}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <QuestionTypeChip type={row.questionType} />
          <OwnerChip owner={row.owner} />
          <MandatoryChip mandatory={row.isMandatory} />
          {row.sectionTitle && <span className="text-2xs text-muted-foreground">· {row.sectionTitle}</span>}
        </div>
      </div>

      <Tabs value={panelTab} onValueChange={(v) => setPanelTab(v as typeof panelTab)} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-4 mt-2 w-auto justify-start">
          <TabsTrigger value="response">Response</TabsTrigger>
          <TabsTrigger value="question">Question</TabsTrigger>
          <TabsTrigger value="citations">Citations{current?.citations.length ? ` · ${current.citations.length}` : ""}</TabsTrigger>
          <TabsTrigger value="history">History{detail.data?.revisions.length ? ` · ${detail.data.revisions.length}` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="response" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
          {row.status === null && !editorOpen ? (
            <div className="rounded-md border border-dashed p-4 text-center">
              <p className="text-ui text-muted-foreground">No response yet.</p>
              <div className="mt-2 flex justify-center gap-2">
                {canDraft && (
                  <Button size="sm" onClick={() => onDraftOne(row.questionId)}>
                    <Sparkles />
                    Draft with Claude
                  </Button>
                )}
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => setEditorOpen(true)}>
                    <Pencil />
                    Write it
                  </Button>
                )}
              </div>
            </div>
          ) : editorOpen ? (
            <ResponseEditor
              key={row.questionId}
              initial={text}
              pending={edit.isPending}
              onCancel={() => setEditorOpen(false)}
              onSave={(t) => edit.mutate({ questionId: row.questionId, text: t }, { onSuccess: (r) => r.ok && setEditorOpen(false) })}
            />
          ) : (
            <div className={cn("rounded-md border bg-card p-3", current?.generatedBy === "model" && "engine-hairline")}>
              <p className="whitespace-pre-wrap text-ui leading-relaxed">{text}</p>
              {current?.openPoints.length ? (
                <div className="mt-3 rounded-md bg-meaning-amber-bg p-2.5 text-2xs text-meaning-amber-text">
                  <div className="mb-1 font-medium uppercase tracking-[0.1em]">Open points</div>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {current.openPoints.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {detail.data?.response?.flagReason && (
                <div className="mt-3 rounded-md bg-meaning-amber-bg p-2.5 text-2xs text-meaning-amber-text">
                  <span className="font-medium">Flagged:</span> {detail.data.response.flagReason}
                </div>
              )}
              {current && (
                <div className="mt-2 text-2xs text-faint-ink">
                  v{current.version} · {current.generatedBy === "model" ? (current.model ?? "Claude") : current.generatedBy === "import" ? "imported from the sheet" : (current.authorName ?? "edited")} ·{" "}
                  {timeAgo(new Date(current.createdAt))}
                  {current.instruction ? ` · "${current.instruction}"` : ""}
                </div>
              )}
            </div>
          )}

          {row.status !== null && !editorOpen && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {row.status === "approved" ? (
                canApprove && (
                  <Button size="sm" variant="outline" onClick={() => unapprove.mutate([row.questionId])} disabled={unapprove.isPending}>
                    <Undo2 />
                    Unapprove
                  </Button>
                )
              ) : (
                canApprove && (
                  <Button size="sm" onClick={() => approve.mutate([row.questionId])} disabled={approve.isPending}>
                    <Check />
                    Approve
                    <Kbd className="ml-1">A</Kbd>
                  </Button>
                )
              )}
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => setEditorOpen(true)}>
                  <Pencil />
                  Edit
                  <Kbd className="ml-1">E</Kbd>
                </Button>
              )}
              {canDraft && (
                <Button size="sm" variant="outline" onClick={() => setRegenerateOpen(!regenerateOpen)} aria-expanded={regenerateOpen}>
                  <RefreshCw />
                  Regenerate
                  <Kbd className="ml-1">R</Kbd>
                </Button>
              )}
              <FlagButton
                flagged={row.status === "flagged"}
                pending={flag.isPending}
                onFlag={(reason) => flag.mutate({ questionId: row.questionId, reason })}
                disabled={!can(role, "response.flag")}
              />
              {row.status === "approved" &&
                canPromote &&
                (detail.data?.response?.kbAnswerId ? (
                  <Chip tone="green" dot title="This answer is in the knowledge base and will be offered to future drafts">
                    In knowledge base
                  </Chip>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => promote.mutate(row.questionId)} disabled={promote.isPending} title="Generalise this approved answer and add it to the knowledge base">
                    <BookPlus />
                    {promote.isPending ? "Adding…" : "Add to KB"}
                  </Button>
                ))}
              {canEdit && (
                <CellMenu
                  ariaLabel="Compliance"
                  value={row.compliance}
                  options={COMPLIANCE_LEVELS}
                  labels={(c) => COMPLIANCE_LABEL[c]}
                  placeholder="Set compliance"
                  onChange={(c) => compliance.mutate({ questionId: row.questionId, compliance: c as Compliance })}
                  className={cn("ml-auto h-7", row.compliance && `bg-meaning-${COMPLIANCE_TONE[row.compliance]}-bg`)}
                />
              )}
            </div>
          )}

          {regenerateOpen && row.status !== null && (
            <RegenerateBox rfpId={rfpId} questionId={row.questionId} onClose={() => setRegenerateOpen(false)} onDone={onJobDone} />
          )}
        </TabsContent>

        <TabsContent value="question" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
          <div className="text-2xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Client&apos;s wording</div>
          <p className="mt-1 whitespace-pre-wrap text-ui leading-relaxed">{row.questionText}</p>
          {row.acceptanceCriteria && (
            <>
              <div className="mt-3 text-2xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Acceptance criteria</div>
              <p className="mt-1 whitespace-pre-wrap text-ui leading-relaxed">{row.acceptanceCriteria}</p>
            </>
          )}
          {Object.keys(row.rawMeta).length > 0 && (
            <>
              <div className="mt-3 text-2xs font-medium uppercase tracking-[0.1em] text-muted-foreground">Every client column</div>
              <dl className="mt-1 divide-y rounded-md border">
                {Object.entries(row.rawMeta).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[minmax(96px,35%)_1fr] gap-2 px-2.5 py-1.5 text-2xs">
                    <dt className="truncate text-muted-foreground" title={k}>
                      {k}
                    </dt>
                    <dd className="whitespace-pre-wrap">{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </TabsContent>

        <TabsContent value="citations" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
          {!current?.citations.length ? (
            <p className="text-ui text-muted-foreground">{row.status === null ? "Nothing drafted yet." : "This revision cites no knowledge-base passages."}</p>
          ) : (
            <ol className="space-y-2">
              {current.citations.map((c) => (
                <li key={c.id} className="rounded-md border bg-card p-2.5 text-2xs">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="num font-mono text-brand-teal">[{c.ordinal}]</span>
                    <span className="truncate font-medium text-foreground">{c.title ?? (c.sourceType === "approved_answer" ? "Approved answer" : "Knowledge base")}</span>
                    {c.similarity !== null && <Chip tone="teal" className="num ml-auto">{Math.round(c.similarity * 100)}% match</Chip>}
                  </div>
                  <p className="text-muted-foreground">{c.excerpt}</p>
                  {c.reason && <p className="mt-1 italic text-faint-ink">Why: {c.reason}</p>}
                </li>
              ))}
            </ol>
          )}
        </TabsContent>

        <TabsContent value="history" className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
          <History revisions={detail.data?.revisions ?? []} currentId={detail.data?.response?.currentRevisionId ?? null} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ResponseEditor({ initial, pending, onSave, onCancel }: { initial: string; pending: boolean; onSave: (t: string) => void; onCancel: () => void }) {
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
        className="min-h-56 text-ui leading-relaxed"
        aria-label="Response text"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-2xs text-muted-foreground">
          <Kbd>⌘</Kbd> <Kbd>Enter</Kbd> saves a new revision ·{" "}
          <span className={cn("num", value.length > ANSWER_MAX_CHARS && "text-meaning-amber-text")}>{value.length} / {ANSWER_MAX_CHARS}</span>
        </span>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(value)} disabled={pending || value.trim() === initial.trim() || !value.trim()}>
          Save revision
        </Button>
      </div>
    </div>
  );
}

function FlagButton({ flagged, pending, onFlag, disabled }: { flagged: boolean; pending: boolean; onFlag: (reason: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  if (flagged) {
    return (
      <Button size="sm" variant="outline" className="text-meaning-amber-text" disabled>
        <Flag />
        Flagged
      </Button>
    );
  }
  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={disabled || pending}>
        <Flag />
        Flag
        <Kbd className="ml-1">F</Kbd>
      </Button>
    );
  }
  return (
    <form
      className="flex w-full items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        onFlag(reason);
        setOpen(false);
        setReason("");
      }}
    >
      <Input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this flagged?" className="h-8 flex-1 text-ui" aria-label="Flag reason" />
      <Button size="sm" type="submit" disabled={pending}>
        Flag
      </Button>
      <Button size="icon-sm" type="button" variant="ghost" onClick={() => setOpen(false)} aria-label="Cancel">
        <X />
      </Button>
    </form>
  );
}

function RegenerateBox({ rfpId, questionId, onClose, onDone }: { rfpId: string; questionId: string; onClose: () => void; onDone: () => void }) {
  const [instruction, setInstruction] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await regenerateResponse(rfpId, questionId, instruction);
      if (!result.ok) return void toast.error(result.error);
      setJobId(result.data.jobId);
    });
  }

  return (
    <div className="mt-3 rounded-md border bg-card p-3">
      {jobId ? (
        <JobProgress
          jobId={jobId}
          title="Regenerating"
          className="border-0 p-0"
          onDone={() => {
            setJobId(null);
            onDone();
            onClose();
            toast.success("New revision ready");
          }}
        />
      ) : (
        <>
          <label className="text-2xs font-medium uppercase tracking-[0.1em] text-muted-foreground" htmlFor="regen">
            Regenerate with an instruction
          </label>
          <Input
            id="regen"
            autoFocus
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
              if (e.key === "Escape") onClose();
            }}
            placeholder="e.g. shorter · more formal · mention the SAP migration experience"
            className="mt-1.5 h-8 text-ui"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={run} disabled={isPending}>
              <RefreshCw />
              Regenerate
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function History({ revisions, currentId }: { revisions: QuestionDetailJson["revisions"]; currentId: string | null }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!revisions.length) return <p className="text-ui text-muted-foreground">No revisions yet.</p>;
  return (
    <ol className="space-y-2">
      {revisions.map((r) => (
        <li key={r.id} className={cn("rounded-md border bg-card text-2xs", r.id === currentId && "border-brand-blue/40 dark:border-sidebar-primary/40")}>
          <button type="button" className="flex w-full items-center gap-2 px-2.5 py-2 text-left" onClick={() => setOpenId(openId === r.id ? null : r.id)} aria-expanded={openId === r.id}>
            <span className="num font-mono">v{r.version}</span>
            <Chip tone={r.generatedBy === "model" ? "teal" : r.generatedBy === "import" ? "neutral" : "blue"}>
              {r.generatedBy === "model" ? (r.model ?? "Claude") : r.generatedBy === "import" ? "Imported" : (r.authorName ?? "Edited")}
            </Chip>
            {r.instruction && <span className="truncate italic text-muted-foreground">&ldquo;{r.instruction}&rdquo;</span>}
            <span className="ml-auto shrink-0 text-faint-ink">{timeAgo(new Date(r.createdAt))}</span>
            {r.id === currentId && <span className="text-brand-blue dark:text-sidebar-primary">current</span>}
          </button>
          {openId === r.id && <p className="whitespace-pre-wrap border-t px-2.5 py-2 text-ui leading-relaxed">{r.finalText}</p>}
        </li>
      ))}
    </ol>
  );
}
