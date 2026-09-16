"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { RfpKind } from "@/domain/enums";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "workspace", title: "Workspace" },
  { key: "setup", title: "Setup" },
  { key: "chro", title: "CHRO questions" },
  { key: "exports", title: "Exports" },
] as const;

/** Section tabs under the RFP header. Links, not client tabs: each is a route with its own data. A Quick Q&A session has its own page plus the workspace. */
export function RfpTabs({ rfpId, kind = "full" }: { rfpId: string; kind?: RfpKind }) {
  const pathname = usePathname();
  const tabs = kind === "quick" ? [{ href: `/quick/${rfpId}`, title: "Quick Q&A" }, { href: `/rfps/${rfpId}/workspace`, title: "Workspace" }] : TABS.map((tab) => ({ href: `/rfps/${rfpId}/${tab.key}`, title: tab.title }));
  return (
    <nav className="-mb-px flex gap-1" aria-label="RFP sections">
      {tabs.map((tab) => {
        const href = tab.href;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "border-b-2 px-3 py-2 text-ui font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring rounded-t-sm",
              active
                ? "border-brand-blue text-foreground dark:border-sidebar-primary"
                : "border-transparent text-muted-foreground hover:border-line-strong hover:text-foreground",
            )}
          >
            {tab.title}
          </Link>
        );
      })}
    </nav>
  );
}
