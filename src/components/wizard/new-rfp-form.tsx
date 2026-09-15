"use client";

import { ArrowRight } from "lucide-react";
import { useActionState, useState } from "react";

import { createDraftRfp, type CreateRfpState } from "@/app/actions/rfps";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { BIDDERS, ENGAGEMENT_TYPES, ENGAGEMENT_TYPE_LABEL } from "@/domain/enums";

export interface ClientOption {
  id: string;
  name: string;
  industry: string | null;
  headcount: number | null;
}

const NEW_CLIENT = "__new__";

const BIDDER_LABEL: Record<(typeof BIDDERS)[number], string> = {
  joint: "Joint — Kognoz + Darwinbox",
  kognoz: "Kognoz",
  darwinbox: "Darwinbox",
};

export function NewRfpForm({ clients }: { clients: ClientOption[] }) {
  const [state, formAction, pending] = useActionState<CreateRfpState, FormData>(createDraftRfp, null);
  const [clientChoice, setClientChoice] = useState<string>(clients[0]?.id ?? NEW_CLIENT);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const isNew = clientChoice === NEW_CLIENT;

  return (
    <form action={formAction} className="mx-auto w-full max-w-2xl p-6">
      <FieldGroup className="gap-6">
        <FieldSet className="gap-4 rounded-lg border bg-card p-5">
          <div>
            <h2 className="font-heading text-base font-semibold">Client</h2>
            <p className="text-ui text-muted-foreground">Who issued the RFP. The brief and every draft lean on this profile.</p>
          </div>
          <Field>
            <FieldLabel htmlFor="clientChoice">Client</FieldLabel>
            <Select value={clientChoice} onValueChange={setClientChoice}>
              <SelectTrigger id="clientChoice" className="w-full">
                <SelectValue placeholder="Choose a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.industry ? <span className="text-muted-foreground"> · {c.industry}</span> : null}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_CLIENT}>+ New client…</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="clientId" value={isNew ? "" : clientChoice} />
            {errors.clientId && <FieldError>{errors.clientId.join(" ")}</FieldError>}
          </Field>
          {isNew && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field className="sm:col-span-1">
                <FieldLabel htmlFor="newClientName">Name</FieldLabel>
                <Input id="newClientName" name="newClientName" placeholder="Acme Industries" required={isNew} />
                {errors.newClientName && <FieldError>{errors.newClientName.join(" ")}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="newClientIndustry">Industry</FieldLabel>
                <Input id="newClientIndustry" name="newClientIndustry" placeholder="Manufacturing" />
              </Field>
              <Field>
                <FieldLabel htmlFor="newClientHeadcount">Headcount</FieldLabel>
                <Input id="newClientHeadcount" name="newClientHeadcount" inputMode="numeric" placeholder="8,200" />
              </Field>
            </div>
          )}
        </FieldSet>

        <FieldSet className="gap-4 rounded-lg border bg-card p-5">
          <div>
            <h2 className="font-heading text-base font-semibold">The RFP</h2>
            <p className="text-ui text-muted-foreground">A title you will recognise on the pipeline, and how we are bidding.</p>
          </div>
          <Field>
            <FieldLabel htmlFor="title">Title</FieldLabel>
            <Input id="title" name="title" placeholder="Acme — HRMS implementation RFP" required minLength={3} autoFocus />
            {errors.title && <FieldError>{errors.title.join(" ")}</FieldError>}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="engagementType">Engagement</FieldLabel>
              <Select name="engagementType" defaultValue="hris_implementation">
                <SelectTrigger id="engagementType" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENGAGEMENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ENGAGEMENT_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="bidderOfRecord">Bidder of record</FieldLabel>
              <Select name="bidderOfRecord" defaultValue="joint">
                <SelectTrigger id="bidderOfRecord" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BIDDERS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {BIDDER_LABEL[b]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="dueDate">Due date</FieldLabel>
              <Input id="dueDate" name="dueDate" type="date" />
              <FieldDescription>Drives the urgency on the pipeline.</FieldDescription>
              {errors.dueDate && <FieldError>{errors.dueDate.join(" ")}</FieldError>}
            </Field>
          </div>
        </FieldSet>

        {state && !state.ok && !Object.keys(errors).length && (
          <p className="text-ui text-meaning-red-text" role="alert">
            {state.error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner className="size-4" /> : null}
            Create and upload files
            <ArrowRight />
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
