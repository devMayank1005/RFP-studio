"use client";

import { Download, FileOutput, FileSpreadsheet, FileText, Presentation, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { deleteExport } from "@/app/actions/exports";
import { Chip, type ChipTone } from "@/components/chips/chips";
import { EmptyState } from "@/components/shell/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ExportRow } from "@/db/queries/exports";
import { timeAgo } from "@/domain/dates";
import type { ExportFormat, JobStatus } from "@/domain/enums";
import { EXPORT_FORMAT_META } from "@/domain/export";
import { formatBytes } from "@/domain/format";
import { isStaleQueuedJob } from "@/domain/jobs";

// Green is reserved for approved / fully compliant / success — a finished build is the third.
const STATUS_TONE: Record<JobStatus, ChipTone> = { queued: "neutral", running: "teal", done: "green", failed: "red", cancelled: "neutral" };
const STATUS_LABEL: Record<JobStatus, string> = { queued: "Queued", running: "Building", done: "Ready", failed: "Failed", cancelled: "Cancelled" };
const ICON: Record<ExportFormat, typeof FileSpreadsheet> = { xlsx: FileSpreadsheet, docx: FileText, pptx: Presentation };

/**
 * Every build of this RFP, newest first, with who made it and a download
 * for the finished ones. While a row is queued or building the list
 * re-fetches every 2 s — the server render is the poll, like the KB sources.
 */
export function ExportHistory({ rfpId, rows, canManage, now }: { rfpId: string; rows: ExportRow[]; canManage: boolean; now: Date }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState<string | null>(null);
  const busy = rows.some((r) => (r.status === "queued" || r.status === "running") && !isStaleQueuedJob(r, now));

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [busy, router]);

  async function remove(row: ExportRow) {
    setDeleting(row.id);
    const result = await deleteExport(rfpId, row.id);
    setDeleting(null);
    if (!result.ok) return void toast.error(result.error);
    toast.success("Export deleted");
    router.refresh();
  }

  if (!rows.length) {
    return <EmptyState icon={FileOutput} title="No exports yet" description="Build an Excel or Word response above. Every build is kept here with who made it and when." className="py-10" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table className="table-fixed min-w-[720px]" aria-label="Export history">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-28">Format</TableHead>
            <TableHead>File</TableHead>
            <TableHead className="w-32">Status</TableHead>
            <TableHead className="w-20 text-right">Size</TableHead>
            <TableHead className="hidden w-40 lg:table-cell">By</TableHead>
            <TableHead className="w-40 text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const Icon = ICON[r.format];
            const stale = (r.status === "queued" || r.status === "running") && isStaleQueuedJob(r, now);
            return (
              <TableRow key={r.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className="size-4 text-muted-foreground" />
                    <Chip tone="outline">{EXPORT_FORMAT_META[r.format].label}</Chip>
                  </span>
                </TableCell>
                <TableCell className="py-2.5">
                  <div className="truncate text-ui font-medium">{r.fileName ?? (r.status === "failed" ? "Not built" : "Building…")}</div>
                  <div className="mt-0.5 text-2xs text-muted-foreground">
                    {r.format === "xlsx" ? (r.options.shape === "fill" ? "Client's workbook, filled in" : "Fresh workbook") : r.format === "docx" ? "Response document" : "Deck"}
                    {r.options.approvedOnly ? " · approved answers only" : ""}
                  </div>
                  {r.status === "failed" && r.error && <div className="mt-0.5 line-clamp-2 text-2xs text-meaning-red-text">{r.error}</div>}
                  {stale && <div className="mt-0.5 text-2xs text-meaning-amber-text">Not picked up by a worker. Build again.</div>}
                </TableCell>
                <TableCell>
                  <Chip tone={stale ? "amber" : STATUS_TONE[r.status]} dot={r.status !== "done"}>
                    {r.status === "running" && !stale && <Spinner className="size-3" />}
                    {stale ? "Not picked up" : STATUS_LABEL[r.status]}
                  </Chip>
                </TableCell>
                <TableCell className="num text-right text-ui text-muted-foreground">{r.sizeBytes !== null ? formatBytes(r.sizeBytes) : "—"}</TableCell>
                <TableCell className="hidden text-2xs text-muted-foreground lg:table-cell">
                  <div className="truncate">{r.createdByName ?? "—"}</div>
                  <div className="num">{timeAgo(new Date(r.createdAt), now)}</div>
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center justify-end gap-1.5">
                    {r.status === "done" && (
                      <Button asChild variant="outline" size="xs">
                        <a href={`/api/rfps/${rfpId}/exports/${r.id}/download`} download={r.fileName ?? undefined} aria-label={`Download ${r.fileName ?? EXPORT_FORMAT_META[r.format].label}`}>
                          <Download />
                          Download
                        </a>
                      </Button>
                    )}
                    {canManage && (r.status === "done" || r.status === "failed" || stale) && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon-xs" aria-label={`Delete ${r.fileName ?? "export"}`} disabled={deleting === r.id}>
                            {deleting === r.id ? <Spinner className="size-3" /> : <Trash2 />}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this export?</AlertDialogTitle>
                            <AlertDialogDescription>{r.fileName ?? "The file"} is removed from storage. You can build it again at any time.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(r)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
