"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { useCommandPalette } from "./command-palette";

const SECTION_TITLES: Record<string, string> = {
  dashboard: "Dashboard",
  rfps: "RFPs",
  kb: "Knowledge base",
  settings: "Settings",
};

/** The first path segment names the section; pages that need more render their own PageHeader. */
function sectionFor(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  return SECTION_TITLES[first] ?? "RFP Studio";
}

export function Topbar() {
  const pathname = usePathname();
  const { open } = useCommandPalette();

  return (
    <header className="sticky top-0 z-20 flex h-topbar shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 !h-4" />
      <span className="text-ui font-medium text-muted-foreground">{sectionFor(pathname)}</span>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-64 max-w-[40vw] justify-start gap-2 pr-1.5 text-muted-foreground shadow-none"
          onClick={open}
        >
          <Search className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left text-ui">Search RFPs, questions…</span>
          <KbdGroup className="shrink-0">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
      </div>
    </header>
  );
}
