import { cva, type VariantProps } from "class-variance-authority";

import {
  COMPLIANCE_LABEL,
  MODULE_LABEL,
  OWNER_LABEL,
  QUESTION_TYPE_LABEL,
  RESPONSE_STATUS_LABEL,
  RFP_STATUS_LABEL,
  confidenceBand,
  type Compliance,
  type Module,
  type Owner,
  type QuestionType,
  type ResponseStatus,
  type RfpStatus,
} from "@/domain/enums";
import { cn } from "@/lib/utils";

/**
 * Chips carry meaning through colour, and only through the grammar in
 * globals.css: blue = human action, teal = machine signal, green = only
 * approved/verified, amber = attention, red = not supported. Everything that
 * is merely a category (owner, type, module) is neutral.
 */
export const chipVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-2xs font-medium whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "border-transparent bg-meaning-neutral-bg text-meaning-neutral-text",
        blue: "border-transparent bg-meaning-blue-bg text-meaning-blue-text",
        teal: "border-transparent bg-meaning-teal-bg text-meaning-teal-text",
        green: "border-transparent bg-meaning-green-bg text-meaning-green-text",
        amber: "border-transparent bg-meaning-amber-bg text-meaning-amber-text",
        red: "border-transparent bg-meaning-red-bg text-meaning-red-text",
        outline: "border-border bg-transparent text-muted-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type ChipTone = NonNullable<VariantProps<typeof chipVariants>["tone"]>;

export function Chip({
  tone,
  dot = false,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof chipVariants> & { dot?: boolean }) {
  return (
    <span className={cn(chipVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

// ---- Enum → tone maps (one place, so the grid, the panel and the dashboard agree) ----

export const RFP_STATUS_TONE: Record<RfpStatus, ChipTone> = {
  draft: "neutral",
  parsing: "teal",
  questions_ready: "blue",
  drafting: "teal",
  in_review: "blue",
  approved: "green",
  submitted: "blue",
  won: "green",
  lost: "red",
};

export const RESPONSE_STATUS_TONE: Record<ResponseStatus, ChipTone> = {
  ai_draft: "teal",
  edited: "blue",
  approved: "green",
  flagged: "amber",
};

export const COMPLIANCE_TONE: Record<Compliance, ChipTone> = {
  fully: "green",
  partial: "amber",
  via_customization: "blue",
  via_partner: "blue",
  not_supported: "red",
  na: "neutral",
};

export function RfpStatusChip({ status, className }: { status: RfpStatus; className?: string }) {
  return (
    <Chip tone={RFP_STATUS_TONE[status]} dot className={className}>
      {RFP_STATUS_LABEL[status]}
    </Chip>
  );
}

export function ResponseStatusChip({ status, className }: { status: ResponseStatus | null; className?: string }) {
  if (!status) {
    return (
      <Chip tone="outline" className={className}>
        Not drafted
      </Chip>
    );
  }
  return (
    <Chip tone={RESPONSE_STATUS_TONE[status]} dot className={className}>
      {RESPONSE_STATUS_LABEL[status]}
    </Chip>
  );
}

export function ComplianceChip({ compliance, className }: { compliance: Compliance | null; className?: string }) {
  if (!compliance) return <span className={cn("text-2xs text-faint-ink", className)}>—</span>;
  return (
    <Chip tone={COMPLIANCE_TONE[compliance]} className={className}>
      {COMPLIANCE_LABEL[compliance]}
    </Chip>
  );
}

/** Confidence is a machine signal: teal when high, amber medium, red low. The figure itself is always shown. */
export function ConfidenceChip({ confidence, className }: { confidence: number | null; className?: string }) {
  const band = confidenceBand(confidence);
  if (band === null || confidence === null) return <span className={cn("text-2xs text-faint-ink", className)}>—</span>;
  const tone: ChipTone = band === "high" ? "teal" : band === "medium" ? "amber" : "red";
  return (
    <Chip tone={tone} className={cn("num font-mono", className)} title={`Model confidence ${confidence.toFixed(2)}`}>
      {confidence.toFixed(2)}
    </Chip>
  );
}

export function OwnerChip({ owner, className }: { owner: Owner; className?: string }) {
  return (
    <Chip tone="outline" className={cn(owner === "kognoz" && "text-brand-blue dark:text-sidebar-primary", className)}>
      {OWNER_LABEL[owner]}
    </Chip>
  );
}

export function QuestionTypeChip({ type, className }: { type: QuestionType; className?: string }) {
  return (
    <Chip tone="outline" className={className}>
      {QUESTION_TYPE_LABEL[type]}
    </Chip>
  );
}

export function ModuleChip({ module, className }: { module: Module; className?: string }) {
  return (
    <Chip tone="neutral" className={className}>
      {MODULE_LABEL[module]}
    </Chip>
  );
}

export function MandatoryChip({ mandatory, className }: { mandatory: boolean; className?: string }) {
  if (!mandatory) return null;
  return (
    <Chip tone="outline" className={cn("border-dashed", className)}>
      Must have
    </Chip>
  );
}
