"use client";

import { Sparkles } from "lucide-react";
import { useActionState, useState } from "react";

import { createQuickSession, type QuickCreateState } from "@/app/actions/quick";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { QUICK_CONTEXT_MAX, QUICK_TEXT_MAX, type QuickSource } from "@/domain/quick";

export interface ClientOption {
  id: string;
  name: string;
}

const NO_CLIENT = "__none__";

/**
 * Start a session: paste the questions or drop the client's file, say what
 * the deal is about, pick a client if there is one, and draft. Validation
 * errors come back per field from the action, like the New RFP form.
 */
export function QuickNewForm({ clients }: { clients: ClientOption[] }) {
  const [state, formAction, pending] = useActionState<QuickCreateState, FormData>(createQuickSession, null);
  const [source, setSource] = useState<QuickSource>("paste");
  const [client, setClient] = useState<string>(NO_CLIENT);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const formError = state && !state.ok && !state.fieldErrors ? state.error : null;

  return (
    <form action={formAction} className="w-full">
      <input type="hidden" name="source" value={source} />
      <input type="hidden" name="clientId" value={client === NO_CLIENT ? "" : client} />
      <FieldGroup className="gap-5 rounded-lg border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-base font-semibold">New session</h2>
            <p className="text-ui text-muted-foreground">Questions in, drafted answers out — with citations from the knowledge base.</p>
          </div>
          <Tabs value={source} onValueChange={(v) => setSource(v as QuickSource)}>
            <TabsList variant="line" aria-label="Where the questions come from">
              <TabsTrigger value="paste">Paste questions</TabsTrigger>
              <TabsTrigger value="document">Upload a file</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <FieldSet className="gap-4">
          {source === "paste" ? (
            <Field>
              <FieldLabel htmlFor="quick-text">Questions</FieldLabel>
              <Textarea
                id="quick-text"
                name="text"
                rows={10}
                maxLength={QUICK_TEXT_MAX}
                placeholder={"One question per line, or paste the whole section — Claude sorts it out.\n\nDoes the platform support shift rostering across multiple plants?\nHow is payroll reconciled at month end?"}
                className="text-ui leading-relaxed"
                aria-invalid={errors.text ? true : undefined}
              />
              {errors.text ? <FieldError>{errors.text.join(" ")}</FieldError> : <FieldDescription>Numbering and bullets are fine.</FieldDescription>}
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="quick-file">Client file</FieldLabel>
              <Input id="quick-file" name="file" type="file" accept=".xlsx,.xlsm,.pdf,.docx" aria-invalid={errors.file ? true : undefined} />
              {errors.file ? <FieldError>{errors.file.join(" ")}</FieldError> : <FieldDescription>An Excel questionnaire, or a PDF or Word RFP · up to 20 MB.</FieldDescription>}
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="quick-context">Deal context</FieldLabel>
            <Textarea
              id="quick-context"
              name="context"
              rows={4}
              maxLength={QUICK_CONTEXT_MAX}
              placeholder="Who the client is, what they run today, what matters to them. The first line names the session."
              className="text-ui leading-relaxed"
              aria-invalid={errors.context ? true : undefined}
            />
            {errors.context ? <FieldError>{errors.context.join(" ")}</FieldError> : <FieldDescription>Optional, but every draft leans on it.</FieldDescription>}
          </Field>
          <Field className="max-w-sm">
            <FieldLabel htmlFor="quick-client">Client</FieldLabel>
            <Select value={client} onValueChange={setClient}>
              <SelectTrigger id="quick-client" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CLIENT}>No client — keep it generic</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.clientId && <FieldError>{errors.clientId.join(" ")}</FieldError>}
          </Field>
        </FieldSet>

        {formError && (
          <p className="text-ui text-meaning-red-text" role="alert">
            {formError}
          </p>
        )}
        <div className="flex items-center justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner className="size-4" /> : <Sparkles />}
            Extract questions
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
