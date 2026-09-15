import type { Metadata } from "next";
import Link from "next/link";

import { AppLockup } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "No access" };

/** Signed in with a real Microsoft account, but not one that may use this workspace. */
export default function NoAccessPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="gap-3">
          <AppLockup />
          <div className="space-y-1.5 pt-1">
            <CardTitle className="text-xl">This account has no workspace</CardTitle>
            <CardDescription>
              RFP Studio is limited to Kognoz accounts. If you should have access, ask an admin to add you, then
              sign in again.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link href="/sign-in">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
