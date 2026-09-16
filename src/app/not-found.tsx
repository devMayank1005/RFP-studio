import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppLockup } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

/** Any URL that matches no route. Signed in or not, it should still look like the product. */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12 text-center">
      <AppLockup />
      <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-brand-blue dark:text-sidebar-primary">
        <Compass className="size-6" aria-hidden />
      </div>
      <div className="space-y-1.5">
        <h1 className="font-heading text-xl font-semibold">That page isn&apos;t here</h1>
        <p className="max-w-sm text-ui text-muted-foreground">The link may be old, or the address may have a typo. Everything in flight is on the pipeline.</p>
      </div>
      <Button asChild>
        <Link href="/dashboard">Back to the pipeline</Link>
      </Button>
    </main>
  );
}
