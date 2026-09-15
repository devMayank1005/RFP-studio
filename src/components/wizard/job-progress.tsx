"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useJob } from "@/hooks/use-job";
import { cn } from "@/lib/utils";

const LABELS: Record<string, { running: string; done: string }> = {
  parse: { running: "Reading the file", done: "Parsed" },
  extract: { running: "Extracting questions", done: "Questions extracted" },
  draft: { running: "Drafting responses", done: "Drafts ready" },
  chro: { running: "Writing CHRO questions", done: "CHRO questions ready" },
  export: { running: "Building the export", done: "Export ready" },
};

/**
 * One background job as a card: a live bar, "n / total", and a retry when it
 * failed. The fill is the brand gradient — the one place besides the logo
 * it is allowed, because machine progress is the one thing the gradient
 * means here.
 */
export function JobProgress({
  jobId,
  title,
  detail,
  onRetry,
  onDone,
  className,
}: {
  jobId: string;
  title?: string;
  detail?: string;
  onRetry?: () => void;
  onDone?: () => void;
  className?: string;
}) {
  const { job, isActive } = useJob(jobId, {
    onSettled: (j) => {
      if (j.error) toast.warning(j.error, { duration: 8000 });
      if (j.status === "done") onDone?.();
    },
  });
  const labels = LABELS[job?.jobType ?? "extract"] ?? LABELS.extract;
  const total = job?.progressTotal ?? 0;
  const done = job?.progressDone ?? 0;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : isActive ? 8 : 0;
  const failed = job?.status === "failed";

  return (
    <div className={cn("rounded-lg border bg-card p-5", className)}>
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-ui font-medium">
            {isActive ? <Spinner className="size-3.5 text-brand-teal" /> : failed ? <AlertTriangle className="size-4 text-meaning-red-text" /> : null}
            {title ?? (failed ? "Something went wrong" : isActive ? labels.running : labels.done)}
          </div>
          {detail && <p className="mt-0.5 text-2xs text-muted-foreground">{detail}</p>}
          {failed && job?.error && <p className="mt-1 text-2xs text-meaning-red-text">{job.error}</p>}
        </div>
        <span className="num shrink-0 text-2xs text-muted-foreground">
          {total ? `${done} / ${total}` : job?.status === "queued" ? "queued" : ""}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-meaning-teal-bg" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div
          className={cn("h-full rounded-full transition-[width] duration-500 ease-out", failed ? "bg-meaning-red-text" : "brand-gradient")}
          style={{ width: `${failed ? 100 : pct}%` }}
        />
      </div>
      {job?.status === "queued" && (
        <p className="mt-2 text-2xs text-muted-foreground">
          Waiting for a worker. In development, make sure <code className="font-mono">pnpm inngest:dev</code> is running.
        </p>
      )}
      {failed && onRetry && (
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RotateCcw />
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
