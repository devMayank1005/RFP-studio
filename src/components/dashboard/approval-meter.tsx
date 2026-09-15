import { cn } from "@/lib/utils";

/**
 * How far an RFP is from done: approved (green — the only thing green means)
 * over drafted (teal — machine-authored, awaiting a human) over the remaining
 * track. The track is a lighter step of the same green so the whole bar reads
 * as one state, and fills keep a 2px surface gap.
 */
export function ApprovalMeter({
  approved,
  drafted,
  total,
  className,
  showLabel = true,
}: {
  approved: number;
  drafted: number;
  total: number;
  className?: string;
  showLabel?: boolean;
}) {
  const safeTotal = Math.max(total, 0);
  const pctApproved = safeTotal ? (approved / safeTotal) * 100 : 0;
  const pctDraftedOnly = safeTotal ? (Math.max(drafted - approved, 0) / safeTotal) * 100 : 0;
  const label = safeTotal ? `${approved} / ${safeTotal} approved` : "No questions yet";

  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <div
        role="meter"
        aria-label="Approved responses"
        aria-valuemin={0}
        aria-valuemax={safeTotal}
        aria-valuenow={approved}
        aria-valuetext={label}
        className="relative h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-meaning-green-bg"
      >
        {pctDraftedOnly > 0 && (
          <div
            className="absolute inset-y-0 rounded-full bg-brand-teal/55"
            style={{ left: `${pctApproved}%`, width: `calc(${pctDraftedOnly}% - 2px)`, marginLeft: pctApproved > 0 ? 2 : 0 }}
          />
        )}
        {pctApproved > 0 && (
          <div className="absolute inset-y-0 left-0 rounded-full bg-brand-green" style={{ width: `${pctApproved}%` }} />
        )}
      </div>
      {showLabel && (
        <span className="num shrink-0 text-2xs text-muted-foreground">
          {safeTotal ? (
            <>
              <span className="font-medium text-foreground">{approved}</span>/{safeTotal}
            </>
          ) : (
            "—"
          )}
        </span>
      )}
    </div>
  );
}
