"use client";

import { ArrowRight, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { confirmQuestions } from "@/app/actions/questions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

export function ConfirmPanel({ rfpId, withExisting, total }: { rfpId: string; withExisting: number; total: number }) {
  const router = useRouter();
  const [importExisting, setImportExisting] = useState(withExisting > 0);
  const [isPending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await confirmQuestions(rfpId, { importExisting });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data.imported
          ? `${result.data.total} questions confirmed · ${result.data.imported} earlier answers imported`
          : `${result.data.total} questions confirmed`,
      );
      router.push(`/rfps/${rfpId}/workspace`);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-5">
      {withExisting > 0 && (
        <label className="flex items-start gap-3">
          <Switch checked={importExisting} onCheckedChange={setImportExisting} aria-label="Import existing answers" />
          <span className="text-ui">
            <span className="font-medium">Import the sheet&apos;s existing answers</span>
            <span className="block text-2xs text-muted-foreground">
              {withExisting} of {total} rows already carry a feasibility or solution column. They become revision 1 of each response (marked
              &ldquo;edited&rdquo;, not AI-drafted) so nothing the team already wrote is lost.
            </span>
          </span>
        </label>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-2xs text-muted-foreground">Confirming locks the question list. Drafting starts from the workspace.</p>
        <Button onClick={confirm} disabled={isPending || total === 0}>
          {isPending ? <Spinner className="size-4" /> : <Check />}
          Confirm {total} questions
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
