"use client";

import { FileUp, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { ingestKbDocument } from "@/app/actions/kb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { KB_ENTRY_TYPES, KB_ENTRY_TYPE_LABEL, KB_SOURCE_KINDS, KB_SOURCE_KIND_LABEL, type KbEntryType, type KbSourceKind } from "@/domain/enums";
import { formatBytes } from "@/domain/format";


/** Pick a PDF or DOCX, say what it is, and hand it to the ingest job. */
export function IngestDialog({ variant = "default" }: { variant?: "default" | "outline" }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<KbSourceKind>("darwinbox_docs");
  const [entryType, setEntryType] = useState<KbEntryType>("darwinbox_capability");
  const [product, setProduct] = useState("Darwinbox");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    fd.set("entryType", entryType);
    fd.set("product", product);
    startTransition(async () => {
      const result = await ingestKbDocument(fd);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Document queued", { description: `Claude is reading ${file.name}. Entries appear here as it finishes.` });
      setOpen(false);
      setFile(null);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}>
          <FileUp />
          Ingest a document
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-base">Ingest a document</DialogTitle>
          <DialogDescription className="text-ui">
            A product manual or internal document becomes knowledge-base entries, one per capability, each tagged with this file. Re-ingesting the same file updates them in place.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="ingest-file">Document</FieldLabel>
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
              className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong bg-card px-3 py-3 text-ui outline-none hover:border-brand-blue/60 hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Upload className="size-4 shrink-0 text-brand-blue dark:text-sidebar-primary" />
              {file ? (
                <span className="min-w-0 flex-1 truncate">
                  {file.name} <span className="num text-2xs text-muted-foreground">· {formatBytes(file.size)}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Choose a PDF or DOCX, up to 20 MB</span>
              )}
              <input ref={inputRef} id="ingest-file" type="file" accept=".pdf,.docx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="ingest-kind">Source kind</FieldLabel>
              <Select value={kind} onValueChange={(v) => setKind(v as KbSourceKind)}>
                <SelectTrigger id="ingest-kind" className="w-full text-ui">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KB_SOURCE_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KB_SOURCE_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ingest-type">Entries become</FieldLabel>
              <Select value={entryType} onValueChange={(v) => setEntryType(v as KbEntryType)}>
                <SelectTrigger id="ingest-type" className="w-full text-ui">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KB_ENTRY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {KB_ENTRY_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="ingest-product">Product</FieldLabel>
            <Input id="ingest-product" value={product} onChange={(e) => setProduct(e.target.value)} className="text-ui" />
            <FieldDescription className="text-2xs">Shown on every entry from this document.</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={!file || isPending}>
            {isPending ? <Spinner className="size-3.5" /> : <FileUp />}
            Upload and read
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
