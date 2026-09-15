"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AppLockup, KognozMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Role } from "@/domain/enums";

import { NAV, isActive } from "./nav";
import { UserMenu } from "./user-menu";

export interface ShellUser {
  name: string;
  email: string;
  image: string | null;
  role: Role;
  workspaceName: string;
}

export function AppSidebar({ user }: { user: ShellUser }) {
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="h-topbar justify-center px-3 group-data-[collapsible=icon]:px-0">
        <Link
          href="/dashboard"
          className="flex items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-data-[collapsible=icon]:justify-center"
          aria-label="RFP Studio home"
        >
          {collapsed ? <KognozMark size={24} /> : <AppLockup />}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="pt-1">
          <SidebarGroupContent>
            <NewRfpButton collapsed={collapsed} />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const active = isActive(item, pathname);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className="data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground"
                    >
                      <Link href={item.href}>
                        <item.icon className={active ? "text-brand-blue dark:text-sidebar-primary" : undefined} />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-2">
        <UserMenu user={user} collapsed={collapsed} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function NewRfpButton({ collapsed }: { collapsed: boolean }) {
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button asChild size="icon" className="mx-auto flex">
            <Link href="/rfps/new" aria-label="New RFP">
              <Plus />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">New RFP</TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button asChild className="w-full justify-start gap-2">
      <Link href="/rfps/new">
        <Plus />
        New RFP
      </Link>
    </Button>
  );
}
