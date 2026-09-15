import type { LucideIcon } from "lucide-react";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/**
 * A designed non-happy path. Every screen that can be empty uses this rather
 * than a sentence in a div, and the "coming in milestone 2" screens use the
 * `milestone` eyebrow so it reads as a plan, not a bug.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  milestone,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  milestone?: string;
  className?: string;
}) {
  return (
    <Empty className={cn("m-6 min-h-[360px] border bg-card/60", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-10 rounded-xl bg-secondary text-brand-blue dark:text-sidebar-primary [&_svg]:size-5">
          <Icon />
        </EmptyMedia>
        {milestone && (
          <span className="text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{milestone}</span>
        )}
        <EmptyTitle className="font-heading text-base font-semibold">{title}</EmptyTitle>
        {description && <EmptyDescription className="text-ui">{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
