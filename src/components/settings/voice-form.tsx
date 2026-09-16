"use client";

import { RotateCcw, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { saveVoiceGuide } from "@/app/actions/settings";
import { Chip } from "@/components/chips/chips";
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
import { Textarea } from "@/components/ui/textarea";

import { DRAFT_PROMPT_VERSION } from "../../../prompts/draft";
import { DEFAULT_VOICE_GUIDE } from "../../../prompts/voice";

/** The first block of every draft's system prompt, editable. Whitespace and bullets matter, so it is set in mono. */
export function VoiceForm({ initial, canEdit }: { initial: string; canEdit: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [isSaving, startSave] = useTransition();
  const pristine = text.trim() === initial.trim();
  const customised = text.trim() !== DEFAULT_VOICE_GUIDE.trim();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  function save() {
    if (!canEdit || pristine) return;
    startSave(async () => {
      const result = await saveVoiceGuide(text);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Voice guide saved", { description: "The next draft opens with it; existing revisions keep the guide they were written under." });
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
        <Chip tone="teal">{DRAFT_PROMPT_VERSION}</Chip>
        {customised ? <Chip tone="blue">Customised</Chip> : <Chip tone="outline">Default guide</Chip>}
        <span className="num ml-auto">
          {text.length.toLocaleString()} characters · {words.toLocaleString()} words
        </span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!canEdit}
        aria-label="Voice guide"
        spellCheck={false}
        className="min-h-[520px] font-mono text-ui leading-relaxed"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            save();
          }
        }}
      />
      <p className="text-2xs text-muted-foreground">
        Every draft&apos;s system prompt begins with this guide, followed by the fixed answering rules in <code className="font-mono">prompts/draft.ts</code>. Each revision records the prompt version it was written under, so changing the guide never rewrites history.
      </p>
      {canEdit && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={isSaving || pristine}>
            {isSaving ? <Spinner className="size-3.5" /> : <Save />}
            Save guide
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setText(initial)} disabled={isSaving || pristine}>
            Discard changes
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="ml-auto" disabled={isSaving || !customised}>
                <RotateCcw />
                Reset to default
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset the voice guide?</AlertDialogTitle>
                <AlertDialogDescription>This puts the built-in Kognoz guide back into the editor. Nothing is saved until you click Save guide.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep my text</AlertDialogCancel>
                <AlertDialogAction onClick={() => setText(DEFAULT_VOICE_GUIDE)}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      {!canEdit && <p className="text-2xs text-muted-foreground">Read-only — only admins change the voice guide.</p>}
    </div>
  );
}
