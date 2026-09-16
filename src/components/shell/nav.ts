import { BookOpen, LayoutDashboard, Settings2, Zap, type LucideIcon } from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Routes that light this item up (prefix match). */
  match: string[];
  shortcut?: string;
}

/** The whole information architecture, in one place. The sidebar and ⌘K both read it. */
export const NAV: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, match: ["/dashboard", "/rfps"], shortcut: "G D" },
  { title: "Quick Q&A", href: "/quick", icon: Zap, match: ["/quick"], shortcut: "G Q" },
  { title: "Knowledge base", href: "/kb", icon: BookOpen, match: ["/kb"], shortcut: "G K" },
  { title: "Settings", href: "/settings", icon: Settings2, match: ["/settings"], shortcut: "G S" },
];

export function isActive(item: NavItem, pathname: string): boolean {
  return item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}
