import type { Metadata } from "next";

import { SignInButton } from "@/components/auth/sign-in-button";
import { AppLockup, KognozWordmark } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

/** Only same-origin paths may be used as the post-sign-in destination. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  const destination = safeNext(Array.isArray(next) ? next[0] : next);
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      {/* One quiet wash of the brand gradient behind the card — the only decorative use of it. */}
      <div
        aria-hidden
        className="brand-gradient pointer-events-none absolute -top-40 left-1/2 size-[560px] -translate-x-1/2 rounded-full opacity-[0.12] blur-3xl dark:opacity-[0.18]"
      />

      <Card className="relative w-full max-w-sm shadow-[0_1px_2px_rgba(35,38,40,0.04),0_12px_32px_-12px_rgba(0,81,132,0.18)]">
        <CardHeader className="gap-3">
          <AppLockup />
          <div className="space-y-1.5 pt-1">
            <CardTitle className="text-xl">Sign in to RFP Studio</CardTitle>
            <CardDescription>
              Draft, review and approve RFP responses with the Kognoz knowledge base. Use your Kognoz
              Microsoft account.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SignInButton next={destination} />
        </CardContent>
        <CardFooter className="justify-between border-t pt-4 text-2xs text-muted-foreground">
          <span>Internal tool · Kognoz Consulting &amp; Research</span>
          <KognozWordmark width={64} className="opacity-70" />
        </CardFooter>
      </Card>
    </main>
  );
}
