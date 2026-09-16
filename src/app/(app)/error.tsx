"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * The boundary for anything signed-in. A crash in one screen (or one dialog)
 * used to blank the whole app; now it shows what broke and offers a retry,
 * with the shell still around it.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] client error", error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-xl bg-meaning-red-bg text-meaning-red-text">
        <TriangleAlert className="size-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h1 className="font-heading text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-md text-ui text-muted-foreground">{error.message || "An unexpected error stopped this screen."}</p>
        {error.digest ? <p className="num text-2xs text-faint-ink">Reference {error.digest}</p> : null}
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to the pipeline</Link>
        </Button>
      </div>
    </main>
  );
}
