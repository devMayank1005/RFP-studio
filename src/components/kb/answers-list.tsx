"use client";

import { MessageSquareQuote, SearchX } from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";

import { Chip, ModuleChip } from "@/components/chips/chips";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ApprovedAnswerRow } from "@/db/queries/kb";
import { timeAgo } from "@/domain/dates";

import { kbParsers } from "./params";

/** The flywheel: every answer a reviewer promoted, with how often drafts have leaned on it since. */
export function AnswersList({ rows, filtered }: { rows: ApprovedAnswerRow[]; filtered: boolean }) {
  const [, setParams] = useQueryStates(kbParsers, { shallow: true, history: "push" });
  const now = new Date();

  if (!rows.length) {
    return filtered ? (
      <EmptyState icon={SearchX} title="Nothing matches these filters" description="Try a shorter search or another module." action={<Button variant="outline" onClick={() => void setParams({ q: "", module: null })}>Clear filters</Button>} />
    ) : (
      <EmptyState
        icon={MessageSquareQuote}
        title="No approved answers yet"
        description="Approve an answer in a workspace and click Add to KB. It is generalised, embedded, and offered to every later draft."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">Open the pipeline</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-lg border bg-card">
        {/* Fixed layout: the clamped question text must not widen its column and push the rest off-screen. */}
        <Table className="table-fixed min-w-[720px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[46%]">Question</TableHead>
              <TableHead className="w-44">Module</TableHead>
              <TableHead className="w-20 text-right">Reused</TableHead>
              <TableHead className="hidden w-28 lg:table-cell">Last used</TableHead>
              <TableHead className="hidden xl:table-cell">Origin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} className="group cursor-pointer" onClick={() => void setParams({ entry: r.id })} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && void setParams({ entry: r.id })}>
                <TableCell className="py-2.5">
                  <div className="line-clamp-2 text-ui font-medium text-foreground group-hover:text-brand-blue dark:group-hover:text-sidebar-primary">{r.canonicalQuestion}</div>
                  <div className="mt-0.5 line-clamp-1 text-2xs text-muted-foreground">{r.canonicalAnswer}</div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ModuleChip module={r.module} />
                    {!r.embedded && <Chip tone="amber">Not embedded</Chip>}
                  </div>
                </TableCell>
                <TableCell className="num text-right text-ui text-muted-foreground">{r.reuseCount || "—"}</TableCell>
                <TableCell className="hidden text-2xs text-muted-foreground lg:table-cell">{r.lastUsedAt ? timeAgo(new Date(r.lastUsedAt), now) : "never"}</TableCell>
                <TableCell className="hidden truncate text-2xs xl:table-cell">
                  {r.originRfpId && r.originRfpTitle ? (
                    <Link
                      href={r.originQuestionId ? `/rfps/${r.originRfpId}/workspace?row=${r.originQuestionId}` : `/rfps/${r.originRfpId}/workspace`}
                      className="text-muted-foreground hover:text-brand-blue dark:hover:text-sidebar-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.originRfpTitle}
                    </Link>
                  ) : (
                    <span className="text-faint-ink">Origin removed</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
