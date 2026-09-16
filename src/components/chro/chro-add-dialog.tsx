"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { addChroQuestion } from "@/app/actions/chro";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { CHRO_THEMES, CHRO_THEME_LABEL, type ChroTheme } from "@/domain/enums";

/** A question the team wants to ask regardless of what the model proposed. Kept from the start. */
export function ChroAddDialog({ rfpId, defaultTheme, onAdded }: { rfpId: string; defaultTheme: ChroTheme; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ChroTheme>(defaultTheme);
  const [text, setText] = useState("");
  const [rationale, setRationale] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await addChroQuestion(rfpId, theme, text, rationale);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Question added and kept");
      setOpen(false);
      setText("");
      setRationale("");
      onAdded();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setTheme(defaultTheme);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <Plus />
          Add a question
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-base">Add a question</DialogTitle>
          <DialogDescription className="text-ui">Your own question for the CHRO. It is kept from the start and survives regeneration.</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="chro-theme">Theme</FieldLabel>
            <Select value={theme} onValueChange={(v) => setTheme(v as ChroTheme)}>
              <SelectTrigger id="chro-theme" className="w-full text-ui">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHRO_THEMES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CHRO_THEME_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="chro-text">Question</FieldLabel>
            <Textarea id="chro-text" value={text} onChange={(e) => setText(e.target.value)} autoFocus placeholder="How will…" className="min-h-20 text-ui leading-relaxed" />
          </Field>
          <Field>
            <FieldLabel htmlFor="chro-why">Why it matters (optional)</FieldLabel>
            <Input id="chro-why" value={rationale} onChange={(e) => setRationale(e.target.value)} className="text-ui" />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} disabled={isPending || !text.trim()}>
            {isPending ? <Spinner className="size-3.5" /> : <Plus />}
            Add and keep
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
