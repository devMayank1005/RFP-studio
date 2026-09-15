import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

import { AppSidebar, type ShellUser } from "./app-sidebar";
import { CommandPaletteProvider } from "./command-palette";
import { Topbar } from "./topbar";

/**
 * Sidebar rail + topbar around every signed-in page. Server component: the
 * session is resolved in the (app) layout and only the display fields reach
 * the client components.
 */
export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "14rem", "--sidebar-width-icon": "3.5rem" } as React.CSSProperties}
    >
      <CommandPaletteProvider>
        <AppSidebar user={user} />
        {/* The inset is exactly one viewport tall: pages scroll inside it, and the
            workspace grid gets a bounded height so its virtualiser owns the scroll. */}
        <SidebarInset className="h-svh max-h-svh min-w-0 overflow-hidden">
          <Topbar />
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </SidebarInset>
      </CommandPaletteProvider>
    </SidebarProvider>
  );
}
