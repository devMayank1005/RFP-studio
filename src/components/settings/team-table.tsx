"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { setMemberRole } from "@/app/actions/team";
import { Chip } from "@/components/chips/chips";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MemberRow } from "@/db/queries/team";
import { timeAgo } from "@/domain/dates";
import { ROLES, ROLE_LABEL, type Role } from "@/domain/enums";
import { adminCount, canChangeRole } from "@/domain/team";

const ROLE_SUMMARY: Record<Role, string> = {
  admin: "Everything, including team, brand and voice settings.",
  consultant: "Create RFPs, draft, review and approve, edit the knowledge base.",
  sales: "Create RFPs, draft, edit and flag responses; no approvals.",
  reviewer: "Review, approve, flag, and promote answers to the knowledge base.",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase() || "?";
}

/**
 * Who is in the workspace and what they may do. Admins change roles inline;
 * the last admin's role is locked so the workspace can never lose its
 * administrator.
 */
export function TeamTable({ members: initial, meId, canManage, now }: { members: MemberRow[]; meId: string; canManage: boolean; now: Date }) {
  const router = useRouter();
  const [members, setMembers] = useState(initial);
  const [pending, setPending] = useState<string | null>(null);
  const admins = adminCount(members);

  async function change(userId: string, role: Role) {
    const before = members;
    setMembers((ms) => ms.map((m) => (m.userId === userId ? { ...m, role } : m)));
    setPending(userId);
    const result = await setMemberRole(userId, role);
    setPending(null);
    if (!result.ok) {
      setMembers(before);
      toast.error(result.error);
      return;
    }
    const who = members.find((m) => m.userId === userId);
    toast.success(`${who?.name ?? "Member"} is now ${ROLE_LABEL[role].toLowerCase()}`);
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table className="table-fixed min-w-[640px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[48%]">Member</TableHead>
              <TableHead className="w-44">Role</TableHead>
              <TableHead className="hidden lg:table-cell">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => {
              const lastAdmin = m.role === "admin" && admins <= 1;
              const locked = !canManage || lastAdmin || pending === m.userId;
              const select = (
                <Select value={m.role} onValueChange={(v) => void change(m.userId, v as Role)} disabled={locked}>
                  <SelectTrigger size="sm" className="w-40 text-ui" aria-label={`Role for ${m.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r} disabled={!canChangeRole(members, m.userId, r).ok}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
              return (
                <TableRow key={m.userId}>
                  <TableCell className="py-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8 rounded-md">
                        {m.image && <AvatarImage src={m.image} alt="" />}
                        <AvatarFallback className="rounded-md bg-secondary text-2xs font-semibold text-secondary-foreground">{initials(m.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-ui font-medium">{m.name}</span>
                          {m.userId === meId && <Chip tone="blue">You</Chip>}
                        </div>
                        <div className="truncate text-2xs text-muted-foreground">{m.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canManage ? (
                      lastAdmin ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-block">{select}</span>
                          </TooltipTrigger>
                          <TooltipContent>The workspace needs at least one admin. Make someone else admin first.</TooltipContent>
                        </Tooltip>
                      ) : (
                        select
                      )
                    ) : (
                      <span className="text-ui">{ROLE_LABEL[m.role]}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-2xs text-muted-foreground lg:table-cell">{timeAgo(new Date(m.joinedAt), now)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-lg border bg-card/60 p-4">
        <h2 className="text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">What each role may do</h2>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-ui sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="flex gap-2">
              <dt className="w-24 shrink-0 font-medium">{ROLE_LABEL[r]}</dt>
              <dd className="text-muted-foreground">{ROLE_SUMMARY[r]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-2xs text-muted-foreground">
          Anyone with an allowed email domain joins on first sign-in — the first person as admin, everyone after as a consultant. There is no invite step.
        </p>
      </div>
    </div>
  );
}
