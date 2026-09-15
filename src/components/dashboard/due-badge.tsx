import { Chip, type ChipTone } from "@/components/chips/chips";
import { daysBetween, dueLabel, formatDate, type DueUrgency } from "@/domain/dates";
import { cn } from "@/lib/utils";

const TONE: Record<DueUrgency, ChipTone> = {
  overdue: "red",
  soon: "amber",
  later: "outline",
  none: "outline",
};

/**
 * Due-date urgency. `today` is computed once on the server in Asia/Kolkata and
 * passed down, so the same day renders on the server and the client.
 */
export function DueBadge({ dueDate, today, className, withDate = true }: { dueDate: string | null; today: string; className?: string; withDate?: boolean }) {
  const days = dueDate ? daysBetween(today, dueDate) : null;
  const { text, urgency } = dueLabel(days);

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Chip tone={TONE[urgency]} className={cn(urgency === "none" && "text-faint-ink")}>
        {text}
      </Chip>
      {withDate && dueDate && <span className="text-2xs text-muted-foreground">{formatDate(dueDate)}</span>}
    </span>
  );
}
