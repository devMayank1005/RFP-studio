"use client";

import { Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteApprovedAnswer, updateApprovedAnswer } from "@/app/actions/kb";
import { Chip } from "@/components/chips/chips";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovedAnswerRow } from "@/db/queries/kb";
import { timeAgo } from "@/domain/dates";
import { MODULES, MODULE_LABEL, type Module } from "@/domain/enums";
import { workspaceHref } from "@/components/workspace/params";

import { kbParsers } from "./params";

interface Draft {
  canonicalQuestion: string;
  canonicalAnswer: string;
  module: Module;
  tags: string;
}

function draftFrom(a: ApprovedAnswerRow): Draft {
  return { canonicalQuestion: a.canonicalQuestion, canonicalAnswer: a.canonicalAnswer, module: a.module, tags: a.tags.join(", ") };
}

/** The sheet for one promoted answer: read it, correct it, or remove it. Same URL contract as the entry editor. */
export function AnswerEditor({ rows, fallbackAnswer, canEdit, now }: { rows: ApprovedAnswerRow[]; fallbackAnswer: ApprovedAnswerRow | null; canEdit: boolean; now: Date }) {
  const [params, setParams] = useQueryStates(kbParsers, { shallow: true, history: "replace" });
  const answer = params.entry ? (rows.find((r) => r.id === params.entry) ?? (fallbackAnswer?.id === params.entry ? fallbackAnswer : null)) : null;
  const close = () => void setParams({ entry: "" });

  return (
    <Sheet open={answer !== null} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
        {answer && <AnswerForm key={answer.id} answer={answer} canEdit={canEdit} now={now} onClose={close} />}
      </SheetContent>
    </Sheet>
  );
}

function AnswerForm({ answer, canEdit, now, onClose }: { answer: ApprovedAnswerRow; canEdit: boolean; now: Date; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(answer));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isSaving, startSave] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const pristine = JSON.stringify(draft) === JSON.stringify(draftFrom(answer));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function save() {
    if (!canEdit || isSaving || pristine) return;
    startSave(async () => {
      const result = await updateApprovedAnswer(answer.id, draft);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      if (result.data.warning) toast.warning("Answer saved", { description: result.data.warning, duration: 8000 });
      else toast.success("Answer saved");
      router.refresh();
      onClose();
    });
  }

  function remove() {
    startDelete(async () => {
      const result = await deleteApprovedAnswer(answer.id);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Answer removed from the knowledge base", { description: "Future drafts will no longer cite it." });
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle className="font-heading text-base">Approved answer</SheetTitle>
        <SheetDescription className="text-2xs">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="num">Reused {answer.reuseCount} {answer.reuseCount === 1 ? "time" : "times"}</span>
            {answer.lastUsedAt ? <> · last {timeAgo(new Date(answer.lastUsedAt), now)}</> : null}
            {answer.embedded ? <Chip tone="teal">Embedded</Chip> : <Chip tone="amber">Not embedded</Chip>}
          </span>
          {answer.originRfpId && answer.originRfpTitle && (
            <span className="mt-1 block">
              Promoted from{" "}
              <Link href={workspaceHref(answer.originRfpId, answer.originQuestionId ? { row: answer.originQuestionId } : {})} className="text-brand-blue hover:underline dark:text-sidebar-primary">
                {answer.originRfpTitle}
              </Link>
            </span>
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="aa-question">Canonical question</FieldLabel>
            <Textarea id="aa-question" value={draft.canonicalQuestion} onChange={(e) => set("canonicalQuestion", e.target.value)} disabled={!canEdit} className="min-h-16 text-ui leading-relaxed" />
            <FieldDescription className="text-2xs">As a future RFP would ask it — no client names or numbers.</FieldDescription>
            {errors.canonicalQuestion && <FieldError>{errors.canonicalQuestion.join(" ")}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="aa-answer">Canonical answer</FieldLabel>
            <Textarea id="aa-answer" value={draft.canonicalAnswer} onChange={(e) => set("canonicalAnswer", e.target.value)} disabled={!canEdit} className="min-h-48 text-ui leading-relaxed" />
            {errors.canonicalAnswer && <FieldError>{errors.canonicalAnswer.join(" ")}</FieldError>}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="aa-module">Module</FieldLabel>
              <Select value={draft.module} onValueChange={(v) => set("module", v as Module)} disabled={!canEdit}>
                <SelectTrigger id="aa-module" className="w-full text-ui">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {MODULES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MODULE_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="aa-tags">Tags</FieldLabel>
              <Input id="aa-tags" value={draft.tags} onChange={(e) => set("tags", e.target.value)} disabled={!canEdit} className="text-ui" />
            </Field>
          </div>
        </FieldGroup>
      </div>

      <SheetFooter className="flex-row items-center gap-2 border-t px-5 py-3">
        {canEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="mr-auto text-meaning-red-text" disabled={isDeleting || isSaving}>
                {isDeleting ? <Spinner className="size-3.5" /> : <Trash2 />}
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this approved answer?</AlertDialogTitle>
                <AlertDialogDescription>
                  Future drafts will no longer retrieve or cite it. Drafts that already cited it keep the excerpt they quoted. The original response in its RFP is untouched.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep it</AlertDialogCancel>
                <AlertDialogAction onClick={remove}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {!canEdit && <span className="mr-auto text-2xs text-muted-foreground">Read-only — your role cannot edit the knowledge base.</span>}
        <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
          {canEdit ? "Cancel" : "Close"}
        </Button>
        {canEdit && (
          <Button size="sm" onClick={save} disabled={isSaving || pristine}>
            {isSaving ? <Spinner className="size-3.5" /> : <Save />}
            Save
            <Kbd className="ml-1">⌘↵</Kbd>
          </Button>
        )}
      </SheetFooter>
    </div>
  );
}
