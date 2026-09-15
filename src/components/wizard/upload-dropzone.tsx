"use client";

import { FileSpreadsheet, FileText, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { uploadDocuments } from "@/app/actions/documents";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { DOCUMENT_KINDS, DOCUMENT_KIND_LABEL, type DocumentKind } from "@/domain/enums";
import { cn } from "@/lib/utils";

interface Pending {
  file: File;
  kind: DocumentKind;
}

const ACCEPT = ".xlsx,.xlsm,.pdf,.docx";

function guessKind(name: string): DocumentKind {
  const n = name.toLowerCase();
  if (/pointer|context|brief|background|note/.test(n)) return "client_pointers";
  if (/annex|appendix|schedule|attachment/.test(n)) return "appendix";
  if (/response|proposal|our /.test(n)) return "our_prior_response";
  return "rfp_main";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ name }: { name: string }) {
  return /\.xls/i.test(name) ? <FileSpreadsheet className="size-4 text-meaning-green-text" /> : <FileText className="size-4 text-brand-blue dark:text-sidebar-primary" />;
}

/**
 * Drag-drop (or pick) files, tag each with what it is, upload. The kind
 * matters: main RFP and appendices become questions; client pointers feed
 * the brief; our prior responses feed the brief too (and, later, the KB).
 */
export function UploadDropzone({ rfpId, onUploaded }: { rfpId: string; onUploaded?: (jobIds: string[]) => void }) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [isUploading, startUpload] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const add = useCallback((files: FileList | File[]) => {
    const next = Array.from(files)
      .filter((f) => /\.(xlsx|xlsm|pdf|docx)$/i.test(f.name))
      .map((file) => ({ file, kind: guessKind(file.name) }));
    if (!next.length) toast.error("Only .xlsx, .pdf and .docx files are supported.");
    setPending((p) => [...p, ...next]);
  }, []);

  function submit() {
    if (!pending.length) return;
    const fd = new FormData();
    for (const p of pending) {
      fd.append("files", p.file);
      fd.append("kinds", p.kind);
    }
    startUpload(async () => {
      const result = await uploadDocuments(rfpId, fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${pending.length} file${pending.length === 1 ? "" : "s"} uploaded — parsing`);
      setPending([]);
      onUploaded?.(result.data.jobIds);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        aria-label="Add RFP files"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-card px-6 py-10 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          dragging ? "border-brand-blue bg-secondary dark:border-sidebar-primary" : "border-line-strong hover:border-brand-blue/60 hover:bg-muted/50",
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-secondary text-brand-blue dark:text-sidebar-primary">
          <Upload className="size-5" />
        </span>
        <span className="text-ui font-medium">Drop the RFP files here, or click to choose</span>
        <span className="text-2xs text-muted-foreground">Excel questionnaires, PDF or Word RFPs, client pointers · up to 20 MB each</span>
        <input ref={inputRef} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => e.target.files && add(e.target.files)} />
      </div>

      {pending.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {pending.map((p, i) => (
            <li key={`${p.file.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
              <FileIcon name={p.file.name} />
              <span className="min-w-0 flex-1 truncate text-ui">{p.file.name}</span>
              <span className="num text-2xs text-muted-foreground">{formatBytes(p.file.size)}</span>
              <Select value={p.kind} onValueChange={(v) => setPending((list) => list.map((x, j) => (j === i ? { ...x, kind: v as DocumentKind } : x)))}>
                <SelectTrigger size="sm" className="w-44" aria-label="Document kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {DOCUMENT_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon-xs" aria-label={`Remove ${p.file.name}`} onClick={() => setPending((list) => list.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </li>
          ))}
          <li className="flex items-center justify-end gap-2 px-3 py-2">
            <Button variant="ghost" size="sm" onClick={() => setPending([])} disabled={isUploading}>
              Clear
            </Button>
            <Button size="sm" onClick={submit} disabled={isUploading}>
              {isUploading ? <Spinner className="size-3.5" /> : <Upload />}
              Upload {pending.length} {pending.length === 1 ? "file" : "files"}
            </Button>
          </li>
        </ul>
      )}
    </div>
  );
}
