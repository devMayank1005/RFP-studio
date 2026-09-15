"use client";

import { ChevronsUpDown, LogOut, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { ROLE_LABEL } from "@/domain/enums";
import { signOut } from "@/lib/auth-client";

import type { ShellUser } from "./app-sidebar";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase() || "?";
}

export function UserMenu({ user, collapsed }: { user: ShellUser; collapsed: boolean }) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent" tooltip={user.name}>
              <Avatar className="size-7 rounded-md">
                {user.image && <AvatarImage src={user.image} alt="" />}
                <AvatarFallback className="rounded-md bg-secondary text-2xs font-semibold text-secondary-foreground">
                  {initials(user.name)}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-ui font-medium">{user.name}</span>
                  <span className="truncate text-2xs text-muted-foreground">{ROLE_LABEL[user.role]}</span>
                </div>
              )}
              {!collapsed && <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="grid gap-0.5">
                <span className="text-ui font-medium">{user.name}</span>
                <span className="truncate text-2xs text-muted-foreground">{user.email}</span>
                <span className="text-2xs text-muted-foreground">
                  {ROLE_LABEL[user.role]} · {user.workspaceName}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
              {resolvedTheme === "dark" ? "Light mode" : "Late shift (dark)"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleSignOut} disabled={signingOut}>
              <LogOut />
              {signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
