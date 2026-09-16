"use client";

import { RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveBrand } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { BRAND_FONTS, BRAND_FONT_LABEL, normaliseHex, type BrandFont } from "@/domain/brand";

import { BrandPreview } from "./brand-preview";

export interface BrandFormValues {
  name: string;
  primaryColor: string;
  accentColor: string;
  successColor: string;
  logoUrl: string;
  fontFamily: string;
  footerText: string;
}

const COLOURS: Array<{ key: "primaryColor" | "accentColor" | "successColor"; label: string; hint: string }> = [
  { key: "primaryColor", label: "Primary", hint: "Human action: buttons, active nav, focus, selection." },
  { key: "accentColor", label: "Accent", hint: "Machine signal: drafts, citations, confidence." },
  { key: "successColor", label: "Success", hint: "Only approved and fully compliant." },
];

/** The brand template, edited with a live preview beside it. Save applies to the whole app on the next render. */
export function BrandForm({ initial, canEdit }: { initial: BrandFormValues; canEdit: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<BrandFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isSaving, startSave] = useTransition();
  const pristine = JSON.stringify(draft) === JSON.stringify(initial);
  const set = <K extends keyof BrandFormValues>(key: K, value: BrandFormValues[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function save() {
    if (!canEdit || pristine) return;
    startSave(async () => {
      const result = await saveBrand(draft);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        toast.error(result.error);
        return;
      }
      setErrors({});
      toast.success("Brand saved", { description: "The chrome follows the new colours from here on." });
      router.refresh();
    });
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-6 lg:grid-cols-[1fr_380px]">
      <FieldGroup className="gap-5">
        <Field>
          <FieldLabel htmlFor="brand-name">Template name</FieldLabel>
          <Input id="brand-name" value={draft.name} onChange={(e) => set("name", e.target.value)} disabled={!canEdit} className="max-w-sm text-ui" />
          {errors.name && <FieldError>{errors.name.join(" ")}</FieldError>}
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          {COLOURS.map(({ key, label, hint }) => {
            const hex = normaliseHex(draft[key]);
            return (
              <Field key={key}>
                <FieldLabel htmlFor={`brand-${key}`}>{label}</FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <label className="relative block size-5 cursor-pointer overflow-hidden rounded border" style={{ backgroundColor: hex ?? "transparent" }} aria-label={`${label} colour picker`}>
                      <input type="color" value={hex ?? "#000000"} onChange={(e) => set(key, e.target.value)} disabled={!canEdit} className="absolute inset-0 size-full cursor-pointer opacity-0" />
                    </label>
                    <InputGroupText>#</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput id={`brand-${key}`} value={draft[key].replace(/^#/, "")} onChange={(e) => set(key, e.target.value)} disabled={!canEdit} spellCheck={false} maxLength={6} className="num font-mono text-ui" aria-invalid={!hex} />
                </InputGroup>
                <FieldDescription className="text-2xs">{hint}</FieldDescription>
                {errors[key] && <FieldError>{errors[key].join(" ")}</FieldError>}
                {!errors[key] && !hex && <FieldError>Six hex digits, like 005184.</FieldError>}
              </Field>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="brand-font">Body font</FieldLabel>
            <Select value={draft.fontFamily} onValueChange={(v) => set("fontFamily", v as BrandFont)} disabled={!canEdit}>
              <SelectTrigger id="brand-font" className="w-full text-ui">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BRAND_FONTS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {BRAND_FONT_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription className="text-2xs">Headings keep Poppins; dark mode keeps its own, lighter primary for contrast.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="brand-logo">Logo</FieldLabel>
            <Input id="brand-logo" value={draft.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} disabled={!canEdit} placeholder="/brand/kognoz-logo.png or https://…" className="text-ui" />
            <FieldDescription className="text-2xs">A path in this app or an https address. Used in exports; the sidebar keeps the product mark.</FieldDescription>
            {errors.logoUrl && <FieldError>{errors.logoUrl.join(" ")}</FieldError>}
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="brand-footer">Footer text</FieldLabel>
          <Input id="brand-footer" value={draft.footerText} onChange={(e) => set("footerText", e.target.value)} disabled={!canEdit} placeholder="Kognoz Consulting & Research Pvt. Ltd. · Confidential" className="text-ui" />
          {errors.footerText && <FieldError>{errors.footerText.join(" ")}</FieldError>}
        </Field>

        <div className="flex items-center gap-2">
          {canEdit ? (
            <>
              <Button size="sm" onClick={save} disabled={isSaving || pristine}>
                {isSaving ? <Spinner className="size-3.5" /> : <Save />}
                Save brand
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(initial)} disabled={isSaving || pristine}>
                <RotateCcw />
                Discard changes
              </Button>
            </>
          ) : (
            <span className="text-2xs text-muted-foreground">Read-only — only admins change the brand.</span>
          )}
        </div>
      </FieldGroup>

      <BrandPreview draft={draft} logoUrl={draft.logoUrl} footerText={draft.footerText} name={draft.name} />
    </div>
  );
}
