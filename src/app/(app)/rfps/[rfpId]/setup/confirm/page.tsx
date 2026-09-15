import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OwnerChip } from "@/components/chips/chips";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { ConfirmPanel } from "@/components/wizard/confirm-panel";
import { listQuestionsForSetup } from "@/db/queries/questions";
import { getRfpHeader } from "@/db/queries/rfps";
import { OWNERS, QUESTION_TYPE_LABEL, type Owner, type QuestionType } from "@/domain/enums";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Confirm" };

function tally<T extends string>(items: T[]): Array<[T, number]> {
  const m = new Map<T, number>();
  for (const it of items) m.set(it, (m.get(it) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

/** Wizard step 4: the numbers, the brief, the import switch, the button. */
export default async function ConfirmPage({ params }: PageProps<"/rfps/[rfpId]/setup/confirm">) {
  const [session, { rfpId }] = await Promise.all([requireSession(), params]);
  const [rfp, setup] = await Promise.all([getRfpHeader(session.workspaceId, rfpId), listQuestionsForSetup(session.workspaceId, rfpId)]);
  if (!rfp || !setup) notFound();
  const { questions, sections } = setup;

  if (!["draft", "parsing"].includes(rfp.status)) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Questions are confirmed"
        description={`${rfp.questionCount} questions are locked for this RFP. Drafting and review happen in the workspace.`}
        action={
          <Button asChild>
            <Link href={`/rfps/${rfpId}/workspace`}>Open the workspace</Link>
          </Button>
        }
      />
    );
  }

  const withExisting = questions.filter((q) => q.existingAnswer && (q.existingAnswer.answer || q.existingAnswer.compliance)).length;
  const bySection = tally(questions.map((q) => q.sectionTitle ?? "Unsectioned"));
  const byOwner = tally(questions.map((q) => q.owner));
  const byType = tally(questions.map((q) => q.questionType));
  const mandatory = questions.filter((q) => q.isMandatory).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
      <div>
        <h2 className="font-heading text-base font-semibold">Confirm the question list</h2>
        <p className="text-ui text-muted-foreground">
          {questions.length} questions in {sections.length} sections · {mandatory} mandatory. Nothing is drafted before you confirm.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">By section</div>
          <ul className="space-y-1 text-ui">
            {bySection.slice(0, 8).map(([title, n]) => (
              <li key={title} className="flex justify-between gap-2">
                <span className="truncate">{title}</span>
                <span className="num text-muted-foreground">{n}</span>
              </li>
            ))}
            {bySection.length > 8 && <li className="text-2xs text-muted-foreground">+{bySection.length - 8} more</li>}
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Who answers</div>
          <ul className="space-y-1.5 text-ui">
            {OWNERS.filter((o) => byOwner.some(([k]) => k === o)).map((o) => (
              <li key={o} className="flex items-center justify-between gap-2">
                <OwnerChip owner={o as Owner} />
                <span className="num text-muted-foreground">{byOwner.find(([k]) => k === o)?.[1]}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Question types</div>
          <ul className="space-y-1 text-ui">
            {byType.map(([t, n]) => (
              <li key={t} className="flex justify-between gap-2">
                <span>{QUESTION_TYPE_LABEL[t as QuestionType]}</span>
                <span className="num text-muted-foreground">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {rfp.contextSummary && (
        <details className="group rounded-lg border bg-card">
          <summary className="cursor-pointer select-none px-4 py-3 text-ui font-medium">Context brief (what every draft reads first)</summary>
          <div className="whitespace-pre-wrap border-t px-4 py-3 text-ui leading-relaxed text-foreground/90">{rfp.contextSummary}</div>
        </details>
      )}

      <ConfirmPanel rfpId={rfpId} withExisting={withExisting} total={questions.length} />
    </div>
  );
}
