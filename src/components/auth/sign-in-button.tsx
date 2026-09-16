"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { signIn } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 21 21" aria-hidden="true" className={cn("size-4 shrink-0", className)}>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/** Starts the Microsoft Entra flow; Better Auth redirects back to `next` after the callback. */
export function SignInButton({
  next = "/dashboard",
  className,
}: {
  next?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);

  async function start() {
    setPending(true);
    try {
      const { error } = await signIn.social({
        provider: "microsoft",
        callbackURL: next,
        errorCallbackURL: "/sign-in",
      });
      // On success the browser has already navigated away; only failures land here.
      if (error) {
        setPending(false);
        toast.error(error.message || "Failed to initiate Microsoft sign-in. Please try again.");
      }
    } catch {
      setPending(false);
      toast.error("Network or connection error while reaching the authentication service.");
    }
  }

  return (
    <Button
      type="button"
      size="lg"
      className={cn(
        "relative w-full h-11 justify-center gap-3 text-sm font-medium transition-all shadow-xs hover:shadow-md cursor-pointer",
        className,
      )}
      onClick={start}
      disabled={pending}
    >
      {pending ? <Spinner className="size-4" /> : <MicrosoftIcon />}
      <span>{pending ? "Connecting to Microsoft Entra…" : "Continue with Microsoft"}</span>
    </Button>
  );
}
