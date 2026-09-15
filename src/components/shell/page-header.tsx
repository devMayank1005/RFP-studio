import { cn } from "@/lib/utils";

/**
 * Title row for a page: eyebrow (optional), title, one-line description, and
 * actions on the right. Dense pages pass `compact`.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  compact = false,
  className,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  compact?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-3 border-b bg-background px-6", compact ? "py-3" : "py-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow && (
            <div className="mb-1 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{eyebrow}</div>
          )}
          <h1 className={cn("font-heading font-semibold text-foreground", compact ? "text-base" : "text-xl")}>
            {title}
          </h1>
          {description && <p className="mt-1 max-w-2xl text-ui text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
