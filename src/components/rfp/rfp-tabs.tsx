"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const TABS = [
  { key: "workspace", title: "Workspace" },
  { key: "setup", title: "Setup" },
  { key: "chro", title: "CHRO questions" },
  { key: "exports", title: "Exports" },
] as const;

/** Section tabs under the RFP header. Links, not client tabs: each is a route with its own data. */
export function RfpTabs({ rfpId }: { rfpId: string }) {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1" aria-label="RFP sections">
      {TABS.map((tab) => {
        const href = `/rfps/${rfpId}/${tab.key}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.key}
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
