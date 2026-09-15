"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { signIn } from "@/lib/auth-client";

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 21 21" aria-hidden className="size-4">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/** Starts the Microsoft Entra flow; Better Auth redirects back to `next` after the callback. */
export function SignInButton({ next = "/dashboard" }: { next?: string }) {
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    const { error } = await signIn.social({ provider: "microsoft", callbackURL: next });
    // On success the browser has already navigated away; only failures land here.
    if (error) setPending(false);
  }

  return (
    <Button type="button" size="lg" className="w-full justify-center gap-2.5" onClick={start} disabled={pending}>
      {pending ? <Spinner className="size-4" /> : <MicrosoftIcon />}
      {pending ? "Redirecting to Microsoft…" : "Continue with Microsoft"}
    </Button>
  );
}
