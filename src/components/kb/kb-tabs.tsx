import Link from "next/link";

import { KB_TABS, KB_TAB_LABEL, type KbTab } from "@/domain/kb";
import { cn } from "@/lib/utils";

/**
 * The four corpora, as links (each is a server-rendered list). Search and
 * module filters follow the reader across tabs; the source filter and the
 * open editor do not — they belong to one tab.
 */
export function KbTabs({ tab, counts, q, module }: { tab: KbTab; counts: Record<KbTab, number>; q: string; module: string | null }) {
  const carry = new URLSearchParams();
  if (q) carry.set("q", q);
  if (module) carry.set("module", module);
  return (
    <nav className="-mb-5 flex gap-1 overflow-x-auto" aria-label="Knowledge base sections">
      {KB_TABS.map((t) => {
        const params = new URLSearchParams(carry);
        if (t !== "capabilities") params.set("tab", t);
        const query = params.toString();
        const active = t === tab;
        return (
          <Link
            key={t}
            href={query ? `/kb?${query}` : "/kb"}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-t-sm border-b-2 px-3 py-2 text-ui font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-brand-blue text-foreground dark:border-sidebar-primary"
                : "border-transparent text-muted-foreground hover:border-line-strong hover:text-foreground",
            )}
          >
            {KB_TAB_LABEL[t]}
            <span className={cn("num text-2xs", active ? "text-muted-foreground" : "text-faint-ink")}>{counts[t]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
