"use client";

import { RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { requestChroQuestions } from "@/app/actions/chro";
import { Chip } from "@/components/chips/chips";
import { ApprovalMeter } from "@/components/dashboard/approval-meter";
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
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { JobProgress } from "@/components/wizard/job-progress";
import type { chroReadiness } from "@/domain/chro";

type Readiness = ReturnType<typeof chroReadiness>;

/**
 * Where the RFP stands and the one primary action. Generation is sharpest
 * once 80 % is approved, but never blocked: a team can ask early and
 * regenerate later, keeping what it liked.
 */
export function ChroReadiness({ rfpId, readiness, hasRows, canGenerate, activeJobId, lastJobError }: { rfpId: string; readiness: Readiness; hasRows: boolean; canGenerate: boolean; activeJobId: string | null; lastJobError: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<"replace_suggested" | "append">("replace_suggested");
  const [jobId, setJobId] = useState<string | null>(activeJobId);
  const [isPending, startTransition] = useTransition();

  function generate(chosen: "replace_suggested" | "append") {
    startTransition(async () => {
      const result = await requestChroQuestions(rfpId, chosen);
      if (!result.ok) return void toast.error(result.error);
      setJobId(result.data.jobId);
    });
  }

  const button = hasRows ? (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={isPending || !!jobId}>
          <RefreshCw />
          Regenerate
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ask Claude again?</AlertDialogTitle>
          <AlertDialogDescription>Questions you kept always survive. Choose what happens to the rest.</AlertDialogDescription>
        </AlertDialogHeader>
        <ToggleGroup type="single" variant="outline" size="sm" value={mode} onValueChange={(v) => v && setMode(v as typeof mode)} className="w-full" aria-label="Regenerate mode">
          <ToggleGroupItem value="replace_suggested" className="flex-1 text-ui">
            Replace suggested and dropped
          </ToggleGroupItem>
          <ToggleGroupItem value="append" className="flex-1 text-ui">
            Add to the current list
          </ToggleGroupItem>
        </ToggleGroup>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => generate(mode)}>Regenerate</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : (
    <Button size="sm" onClick={() => generate("replace_suggested")} disabled={isPending || !!jobId}>
      {isPending ? <Spinner className="size-3.5" /> : <Sparkles />}
      Generate with Claude
    </Button>
  );

  return (
    <div className="flex flex-col gap-3 border-b bg-background px-6 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-ui font-medium">
              <span className="num">{readiness.pct}%</span> approved
            </span>
            <span className="num text-2xs text-muted-foreground">
              {readiness.approved} of {readiness.total} answers
            </span>
            {readiness.ready ? (
              <Chip tone="green" dot>
                Ready for discovery
              </Chip>
            ) : (
              <Chip tone="amber">Sharpest once 80% is approved — you can still generate now</Chip>
            )}
          </div>
          <ApprovalMeter approved={readiness.approved} drafted={readiness.total} total={readiness.total} showLabel={false} className="max-w-md" />
        </div>
        {canGenerate && <div className="shrink-0">{button}</div>}
      </div>
      {lastJobError && !jobId && <p className="text-2xs text-meaning-red-text">Last run failed: {lastJobError}</p>}
      {jobId && (
        <JobProgress
          jobId={jobId}
          title="Writing the CHRO agenda"
          detail="Opus reads the approved answers and the gaps, then proposes 12–16 questions by theme."
          onRetry={() => {
            setJobId(null);
            router.refresh();
          }}
          // useJob refreshes the router itself on settle; a second refresh here raced it and lost the payload.
          onDone={() => {
            setJobId(null);
            toast.success("CHRO questions ready", { description: "Keep the ones worth asking; drop the rest." });
          }}
          className="p-4"
        />
      )}
    </div>
  );
}
