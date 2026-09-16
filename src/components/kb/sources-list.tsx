"use client";

import { FileStack, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { reingestKbSource } from "@/app/actions/kb";
import { Chip, type ChipTone } from "@/components/chips/chips";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { KbSourceRow } from "@/db/queries/kb";
import { timeAgo } from "@/domain/dates";
import { KB_SOURCE_KIND_LABEL, type JobStatus } from "@/domain/enums";
import { tabForEntryType } from "@/domain/kb";

import { IngestDialog } from "./ingest-dialog";

const STATUS_TONE: Record<JobStatus, ChipTone> = { queued: "neutral", running: "teal", done: "outline", failed: "red", cancelled: "neutral" };
const STATUS_LABEL: Record<JobStatus, string> = { queued: "Queued", running: "Reading", done: "Ingested", failed: "Failed", cancelled: "Cancelled" };

/**
 * Where entries came from, with the ingest job's state on each row. While a
 * document is queued or being read the list re-fetches every 2 s — the
 * server render is the poll, like the upload step's document list.
 */
export function SourcesList({ rows, filtered, canEdit, now }: { rows: KbSourceRow[]; filtered: boolean; canEdit: boolean; now: Date }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState<string | null>(null);
  const busy = rows.some((s) => s.status === "queued" || s.status === "running");

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [busy, router]);

  async function retry(s: KbSourceRow) {
    setRetrying(s.id);
    const result = await reingestKbSource(s.id);
    setRetrying(null);
    if (!result.ok) return void toast.error(result.error);
    toast.success("Reading again", { description: s.name });
    router.refresh();
  }

  if (!rows.length) {
    return (
      <EmptyState
        icon={FileStack}
        title={filtered ? "No source matches" : "No documents ingested yet"}
        description={
          filtered
            ? "Try a shorter search."
            : "Ingest a Darwinbox manual or an internal document and its capabilities become entries, each tagged with the file it came from."
        }
        action={canEdit && !filtered ? <IngestDialog /> : undefined}
      />
    );
  }

  return (
    <div className="p-6">
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table className="table-fixed min-w-[720px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[36%]">Document</TableHead>
              <TableHead className="w-48">Kind</TableHead>
              <TableHead className="w-44">Status</TableHead>
              <TableHead className="w-20 text-right">Entries</TableHead>
              <TableHead className="hidden w-24 lg:table-cell">Updated</TableHead>
              <TableHead className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="py-2.5">
                  <div className="truncate text-ui font-medium">{s.name}</div>
                  {s.status === "failed" && s.error && <div className="mt-0.5 line-clamp-2 text-2xs text-meaning-red-text">{s.error}</div>}
                  {s.status === "queued" && process.env.NODE_ENV !== "production" && <div className="mt-0.5 text-2xs text-muted-foreground">Waiting for a worker — locally, run pnpm inngest:dev.</div>}
                </TableCell>
                <TableCell>
                  <Chip tone="outline">{KB_SOURCE_KIND_LABEL[s.kind]}</Chip>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5">
                    <Chip tone={STATUS_TONE[s.status]} dot={s.status !== "done"}>
                      {s.status === "running" && <Spinner className="size-3" />}
                      {STATUS_LABEL[s.status]}
                    </Chip>
                    {s.status === "running" && s.progressTotal > 0 && (
                      <span className="num text-2xs text-muted-foreground">
                        {s.progressDone} / {s.progressTotal} chunks
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="num text-right text-ui text-muted-foreground">
                  {s.activeCount}
                  {s.activeCount !== s.entryCount ? <span className="text-faint-ink"> / {s.entryCount}</span> : null}
                </TableCell>
                <TableCell className="hidden text-2xs text-muted-foreground lg:table-cell">{timeAgo(new Date(s.ingestedAt), now)}</TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    {canEdit && (s.status === "failed" || s.status === "done") && s.fileUrl && (
                      <Button variant="ghost" size="xs" onClick={() => retry(s)} disabled={retrying === s.id} aria-label={`Read ${s.name} again`}>
                        {retrying === s.id ? <Spinner className="size-3" /> : <RotateCcw />}
                        {s.status === "failed" ? "Retry" : "Re-read"}
                      </Button>
                    )}
                    {s.entryCount > 0 && (
                      <Link href={`/kb?tab=${tabForEntryType(s.dominantType ?? "darwinbox_capability")}&source=${s.id}`} className="text-2xs text-brand-blue hover:underline dark:text-sidebar-primary">
                        View entries
                      </Link>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
