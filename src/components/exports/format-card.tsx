"use client";

import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Chip } from "@/components/chips/chips";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { JobProgress } from "@/components/wizard/job-progress";

/**
 * One export format: what it produces, the Build button (blue — a human
 * decision), and the live progress of a build in flight. A format that is
 * not available yet shows as "Later" with the button disabled.
 */
export function FormatCard({
  eyebrow,
  title,
  description,
  icon: Icon,
  buildLabel,
  canBuild,
  disabledHint,
  later = false,
  pending = false,
  activeJobId,
  progressTitle,
  progressDetail,
  onBuild,
  onSettled,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  buildLabel: string;
  canBuild: boolean;
  disabledHint: string | null;
  later?: boolean;
  pending?: boolean;
  activeJobId: string | null;
  progressTitle: string;
  progressDetail: string;
  onBuild: () => void;
  onSettled: () => void;
  children?: ReactNode;
}) {
  const router = useRouter();
  const disabled = !canBuild || pending || !!activeJobId;
  const hint = disabledHint;

  return (
    <Card size="sm" className="flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</span>
          {later ? <Chip tone="outline">Later</Chip> : null}
        </div>
        <CardTitle className="flex items-center gap-2 text-ui">
          <Icon className="size-4 text-brand-blue dark:text-sidebar-primary" />
          {title}
        </CardTitle>
        <CardDescription className="text-2xs">{description}</CardDescription>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
      <CardFooter className="mt-auto flex flex-col items-stretch gap-2">
        {/* A format that is not available yet says so once, with the chip; no button to explain. */}
        {later ? (
          <p className="text-2xs text-muted-foreground">Arrives in a later milestone.</p>
        ) : (
          <Button size="sm" className="w-full" onClick={onBuild} disabled={disabled} aria-label={buildLabel}>
            {pending ? <Spinner className="size-3.5" /> : <Icon />}
            {buildLabel}
          </Button>
        )}
        {!later && disabled && hint && !activeJobId ? <p className="text-2xs text-muted-foreground">{hint}</p> : null}
        {activeJobId ? (
          <JobProgress
            jobId={activeJobId}
            title={progressTitle}
            detail={progressDetail}
            onRetry={() => {
              onSettled();
              router.refresh();
            }}
            // useJob refreshes the router itself on settle; a second refresh here races it.
            onDone={() => {
              onSettled();
              toast.success("Export ready", { id: `export-${activeJobId}`, description: "Download it from the history below." });
            }}
            className="p-3"
          />
        ) : null}
      </CardFooter>
    </Card>
  );
}
