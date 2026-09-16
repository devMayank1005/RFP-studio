"use client";

import { Archive, ArchiveRestore, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveKbEntry, setKbEntryActive } from "@/app/actions/kb";
import { Chip } from "@/components/chips/chips";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { KbEntryRow } from "@/db/queries/kb";
import { timeAgo } from "@/domain/dates";
import { AVAILABILITIES, AVAILABILITY_LABEL, KB_ENTRY_TYPE_LABEL, MODULES, MODULE_LABEL, type Availability, type KbEntryType, type Module } from "@/domain/enums";
import { MIN_BODY_CHARS } from "@/domain/ingest";
import { entryTypesForTab, type KbEntryTab } from "@/domain/kb";

import { kbParsers } from "./params";

const MAX_BODY_CHARS = 6_000;

const AVAILABILITY_HINT: Record<Availability, string> = {
  standard: "ships with the product",
  configurable: "needs setup, a partner or a customisation",
  roadmap: "announced, not yet shipped",
  not_available: "the product does not do this",
};

interface Draft {
  featureName: string;
  product: string;
  entryType: KbEntryType;
  module: Module;
  availability: Availability;
  body: string;
  tags: string;
}

function draftFrom(entry: KbEntryRow | null, tab: KbEntryTab): Draft {
  if (entry) return { featureName: entry.featureName, product: entry.product, entryType: entry.entryType, module: entry.module, availability: entry.availability, body: entry.body, tags: entry.tags.join(", ") };
  return { featureName: "", product: tab === "capabilities" ? "Darwinbox" : "Kognoz", entryType: entryTypesForTab(tab)[0], module: "general", availability: "standard", body: "", tags: "" };
}

/**
 * The right-hand sheet for one entry. Open state is the `entry` URL param
 * ("new" or an id), read here on the client so N and a row click open it
 * without a server round trip; the row comes from the list already on
 * screen, or from the server when the URL was opened directly with filters
 * that hide it. The form is keyed by id so moving between entries never
 * carries a half-typed field across.
 */
export function EntryEditor({ rows, fallbackEntry, tab, canEdit, now }: { rows: KbEntryRow[]; fallbackEntry: KbEntryRow | null; tab: KbEntryTab; canEdit: boolean; now: Date }) {
  const [params, setParams] = useQueryStates(kbParsers, { shallow: true, history: "replace" });
  const entry = params.entry && params.entry !== "new" ? (rows.find((r) => r.id === params.entry) ?? (fallbackEntry?.id === params.entry ? fallbackEntry : null)) : null;
  const open = params.entry === "new" || entry !== null;
  const close = () => void setParams({ entry: "" });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
        {open && <EntryForm key={entry?.id ?? "new"} entry={entry} tab={tab} canEdit={canEdit} now={now} onClose={close} />}
      </SheetContent>
    </Sheet>
  );
}

function EntryForm({ entry, tab, canEdit, now, onClose }: { entry: KbEntryRow | null; tab: KbEntryTab; canEdit: boolean; now: Date; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(entry, tab));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isSaving, startSave] = useTransition();
  const [isToggling, startToggle] = useTransition();
  const typeOptions = entryTypesForTab(tab);
  const pristine = JSON.stringify(draft) === JSON.stringify(draftFrom(entry, tab));
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function save() {
    if (!canEdit || isSaving) return;
    startSave(async () => {
      const result = await saveKbEntry({ ...draft, id: entry?.id, isActive: entry?.isActive ?? true });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setErrors({});
      if (result.data.warning) toast.warning(entry ? "Entry saved" : "Entry added", { description: result.data.warning, duration: 8000 });
      else toast.success(entry ? "Entry saved" : "Entry added", { description: draft.featureName });
      router.refresh();
      onClose();
    });
  }

  function toggleActive() {
    if (!entry || !canEdit) return;
    startToggle(async () => {
      const result = await setKbEntryActive(entry.id, !entry.isActive);
      if (!result.ok) return void toast.error(result.error);
      toast.success(result.data.isActive ? "Entry reactivated" : "Entry deactivated", {
        description: result.data.isActive ? "Drafts can cite it again." : "Kept for existing citations; drafts will no longer see it.",
      });
      router.refresh();
      onClose();
    });
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle className="font-heading text-base">{entry ? "Edit entry" : tab === "capabilities" ? "New Darwinbox capability" : "New Kognoz entry"}</SheetTitle>
        <SheetDescription className="text-2xs">
          {entry ? (
            <span className="flex flex-wrap items-center gap-1.5">
              Updated {timeAgo(new Date(entry.updatedAt), now)}
              {entry.sourceName ? <> · from {entry.sourceName}</> : null}
              {entry.embedded ? <Chip tone="teal">Embedded</Chip> : <Chip tone="amber">Not embedded</Chip>}
              {!entry.isActive && <Chip tone="outline">Inactive</Chip>}
            </span>
          ) : (
            "What is possible, how it is configured, and where the boundary is. This text is what an answer cites."
          )}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="kb-featureName">Feature or service</FieldLabel>
            <Input id="kb-featureName" value={draft.featureName} onChange={(e) => set("featureName", e.target.value)} placeholder="e.g. Multi-entity payroll" disabled={!canEdit} autoFocus={!entry} className="text-ui" />
            {errors.featureName && <FieldError>{errors.featureName.join(" ")}</FieldError>}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="kb-type">Type</FieldLabel>
              <Select value={draft.entryType} onValueChange={(v) => set("entryType", v as KbEntryType)} disabled={!canEdit || typeOptions.length === 1}>
                <SelectTrigger id="kb-type" className="w-full text-ui">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {KB_ENTRY_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="kb-product">Product</FieldLabel>
              <Input id="kb-product" value={draft.product} onChange={(e) => set("product", e.target.value)} disabled={!canEdit} className="text-ui" />
              {errors.product && <FieldError>{errors.product.join(" ")}</FieldError>}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="kb-module">Module</FieldLabel>
              <Select value={draft.module} onValueChange={(v) => set("module", v as Module)} disabled={!canEdit}>
                <SelectTrigger id="kb-module" className="w-full text-ui">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {MODULES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MODULE_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.module && <FieldError>{errors.module.join(" ")}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="kb-availability">Availability</FieldLabel>
              <Select value={draft.availability} onValueChange={(v) => set("availability", v as Availability)} disabled={!canEdit}>
                <SelectTrigger id="kb-availability" className="w-full text-ui">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABILITIES.map((a) => (
                    <SelectItem key={a} value={a}>
                      {AVAILABILITY_LABEL[a]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription className="text-2xs">{AVAILABILITY_HINT[draft.availability]}</FieldDescription>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="kb-body">Passage</FieldLabel>
            <Textarea
              id="kb-body"
              value={draft.body}
              onChange={(e) => set("body", e.target.value)}
              disabled={!canEdit}
              placeholder="Two to six sentences: what is possible, how it is configured or delivered, and the boundary — prerequisites, limits, what is not covered."
              className="min-h-56 text-ui leading-relaxed"
            />
            <FieldDescription className="num flex justify-between text-2xs">
              <span>At least {MIN_BODY_CHARS} characters. Facts only — this is quoted to the client.</span>
              <span className={draft.body.trim().length > MAX_BODY_CHARS ? "text-meaning-red-text" : undefined}>
                {draft.body.trim().length} / {MAX_BODY_CHARS}
              </span>
            </FieldDescription>
            {errors.body && <FieldError>{errors.body.join(" ")}</FieldError>}
          </Field>

          <Field>
            <FieldLabel htmlFor="kb-tags">Tags</FieldLabel>
            <Input id="kb-tags" value={draft.tags} onChange={(e) => set("tags", e.target.value)} placeholder="payroll, statutory, multi-entity" disabled={!canEdit} className="text-ui" />
            <FieldDescription className="text-2xs">Comma-separated. Searched, and part of what retrieval matches on.</FieldDescription>
          </Field>
        </FieldGroup>
      </div>

      <SheetFooter className="flex-row items-center gap-2 border-t px-5 py-3">
        {entry && canEdit && (
          <Button variant="outline" size="sm" onClick={toggleActive} disabled={isToggling || isSaving} className="mr-auto">
            {isToggling ? <Spinner className="size-3.5" /> : entry.isActive ? <Archive /> : <ArchiveRestore />}
            {entry.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        )}
        {!canEdit && <span className="mr-auto text-2xs text-muted-foreground">Read-only — your role cannot edit the knowledge base.</span>}
        <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
          {canEdit ? "Cancel" : "Close"}
        </Button>
        {canEdit && (
          <Button size="sm" onClick={save} disabled={isSaving || pristine}>
            {isSaving ? <Spinner className="size-3.5" /> : <Save />}
            {entry ? "Save" : "Add entry"}
            <Kbd className="ml-1">⌘↵</Kbd>
          </Button>
        )}
      </SheetFooter>
    </div>
  );
}
