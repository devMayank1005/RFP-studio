"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { RfpStatus } from "@/domain/enums";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "client", title: "Client", hint: "Who and what" },
  { key: "upload", title: "Upload", hint: "RFP files" },
  { key: "questions", title: "Questions", hint: "Review extraction" },
  { key: "confirm", title: "Confirm", hint: "Lock the list" },
] as const;

/**
 * The four-step intake. Step 1 lives at /rfps/new; the rest under
 * /rfps/[id]/setup. Completed steps are links; the current one is bold; the
 * ones ahead are muted (but still reachable — the list is small and the
 * actions guard themselves).
 */
export function Stepper({ rfpId, status }: { rfpId: string; status: RfpStatus }) {
  const pathname = usePathname();
  const currentKey = pathname.split("/").pop() ?? "upload";
  const currentIndex = Math.max(0, STEPS.findIndex((s) => s.key === currentKey));
  const confirmed = !["draft", "parsing"].includes(status);

  return (
    <ol className="flex items-center gap-2 overflow-x-auto px-6 py-3 text-ui" aria-label="Setup steps">
      {STEPS.map((step, i) => {
        const done = confirmed || i < currentIndex || (i === 0 && rfpId !== "new");
        const active = i === currentIndex;
        const href = step.key === "client" ? `/rfps/new` : `/rfps/${rfpId}/setup/${step.key}`;
        const inner = (
          <>
            <span
              className={cn(
                "num flex size-5 items-center justify-center rounded-full border text-2xs font-semibold",
                done && !active && "border-brand-green bg-meaning-green-bg text-meaning-green-text",
                active && "border-brand-blue bg-brand-blue text-primary-foreground dark:border-sidebar-primary dark:bg-sidebar-primary",
                !done && !active && "border-line-strong text-muted-foreground",
              )}
            >
              {done && !active ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={cn("font-medium", active ? "text-foreground" : done ? "text-foreground/80" : "text-muted-foreground")}>
              {step.title}
            </span>
            <span className="hidden text-2xs text-muted-foreground lg:inline">{step.hint}</span>
          </>
        );
        return (
          <li key={step.key} className="flex items-center gap-2">
            {step.key === "client" && rfpId !== "new" ? (
              <span className="flex items-center gap-2 rounded-md px-2 py-1">{inner}</span>
            ) : (
              <Link href={href} className="flex items-center gap-2 rounded-md px-2 py-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
                {inner}
              </Link>
            )}
            {i < STEPS.length - 1 && <span aria-hidden className="h-px w-6 bg-line-strong" />}
          </li>
        );
      })}
    </ol>
  );
}
