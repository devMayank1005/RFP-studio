"use client";

import { ArrowRight, FileSpreadsheet, FileText, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteDocument, startExtraction } from "@/app/actions/documents";
import { Chip, type ChipTone } from "@/components/chips/chips";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { DocumentRow } from "@/db/queries/documents";
import { DOCUMENT_KIND_LABEL, type ParseStatus } from "@/domain/enums";

const PARSE_TONE: Record<ParseStatus, ChipTone> = { pending: "neutral", parsing: "teal", parsed: "green", failed: "red" };
const PARSE_LABEL: Record<ParseStatus, string> = { pending: "Queued", parsing: "Parsing", parsed: "Parsed", failed: "Failed" };

function formatBytes(n: number): string {
  return n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The uploaded files with live parse status. While any document is still
 * parsing the list re-fetches every 2 s (server-rendered, so a refresh is
 * the poll); once every question-bearing document is parsed, extraction
 * can start.
 */
export function DocumentList({ rfpId, documents, locked }: { rfpId: string; documents: DocumentRow[]; locked: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);

  const anyParsing = documents.some((d) => d.parseStatus === "pending" || d.parseStatus === "parsing");
  useEffect(() => {
    if (!anyParsing) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [anyParsing, router]);

  const questionDocs = documents.filter((d) => d.kind === "rfp_main" || d.kind === "appendix");
  const ready = questionDocs.length > 0 && questionDocs.every((d) => d.parseStatus === "parsed");

  function extract() {
    startTransition(async () => {
      const result = await startExtraction(rfpId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(`/rfps/${rfpId}/setup/questions`);
    });
  }

  async function remove(doc: DocumentRow) {
    setDeleting(doc.id);
    const result = await deleteDocument(rfpId, doc.id);
    setDeleting(null);
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  }

  if (!documents.length) return null;

  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-lg border bg-card">
        {documents.map((d) => (
          <li key={d.id} className="flex items-center gap-3 px-3 py-2.5">
            {/\.xls/i.test(d.fileName) ? <FileSpreadsheet className="size-4 text-meaning-green-text" /> : <FileText className="size-4 text-brand-blue dark:text-sidebar-primary" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-ui font-medium">{d.fileName}</div>
              <div className="text-2xs text-muted-foreground">
                {DOCUMENT_KIND_LABEL[d.kind]} · {formatBytes(d.sizeBytes)}
                {d.pageCount ? ` · ${d.pageCount} ${/\.xls/i.test(d.fileName) ? "rows" : "pages"}` : ""}
                {d.parseError ? ` · ${d.parseError}` : ""}
              </div>
            </div>
            <Chip tone={PARSE_TONE[d.parseStatus]} dot>
              {PARSE_LABEL[d.parseStatus]}
            </Chip>
            {!locked && (
              <Button variant="ghost" size="icon-xs" aria-label={`Delete ${d.fileName}`} onClick={() => remove(d)} disabled={deleting === d.id}>
                {deleting === d.id ? <Spinner className="size-3" /> : <Trash2 />}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!locked && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-2xs text-muted-foreground">
            {anyParsing ? "Parsing runs in the background — you can add more files meanwhile." : ready ? "Every RFP document is parsed." : "Add the main RFP (spreadsheet, PDF or Word) to continue."}
          </p>
          <Button onClick={extract} disabled={!ready || isPending}>
            {isPending ? <Spinner className="size-4" /> : null}
            Extract questions
            <ArrowRight />
          </Button>
        </div>
      )}
    </div>
  );
}
