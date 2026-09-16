import type { Metadata } from "next";
import { AlertCircle, ShieldCheck } from "lucide-react";

import { FeatureShowcase } from "@/components/auth/feature-showcase";
import { SignInButton } from "@/components/auth/sign-in-button";
import { AppLockup, KognozMark, KognozWordmark } from "@/components/brand/logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Kognoz RFP Studio with your Microsoft account.",
};

/** Only same-origin relative paths may be used as the post-sign-in destination. */
function safeNext(next: string | string[] | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

/** Translates OAuth and access control errors into human-readable alerts. */
function getAuthError(error: string | string[] | undefined): { title: string; description: string } | null {
  const code = Array.isArray(error) ? error[0] : error;
  if (!code) return null;

  switch (code.toLowerCase()) {
    case "domain_not_allowed":
      return {
        title: "Access Restricted to Kognoz Accounts",
        description:
          "RFP Studio is limited to authorized @kognozconsulting.com accounts. External accounts or guest users cannot access this workspace.",
      };
    case "access_denied":
      return {
        title: "Sign-In Canceled or Denied",
        description:
          "The Microsoft authentication request was canceled or directory permissions were denied.",
      };
    case "invalid_code":
    case "oauth_error":
    case "state_mismatch":
      return {
        title: "Session Expired",
        description:
          "The authentication session timed out or could not be validated. Please try signing in again.",
      };
    case "configuration_error":
      return {
        title: "SSO Service Misconfigured",
        description:
          "Single sign-on environment settings are missing or misconfigured. Please notify IT administration.",
      };
    case "no-access":
      return {
        title: "No Active Workspace Assigned",
        description:
          "Your Microsoft account is authenticated, but you are not assigned to an active Kognoz workspace.",
      };
    default:
      return {
        title: "Sign-In Failed",
        description:
          "Could not complete authentication. Please try again, or reach out to the Kognoz IT helpdesk.",
      };
  }
}

interface SignInPageProps {
  searchParams: Promise<{
    next?: string | string[];
    error?: string | string[];
  }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const destination = safeNext(params?.next);
  const authError = getAuthError(params?.error);

  return (
    <div className="relative min-h-screen w-full lg:grid lg:grid-cols-12 bg-background">
      {/* Left Column: Rich Enterprise Capability Showcase (Desktop) */}
      <FeatureShowcase />

      {/* Right Column: Authentication Portal */}
      <main className="relative flex flex-1 flex-col items-center justify-center p-6 sm:p-10 lg:col-span-5 lg:p-12 overflow-hidden">
        {/* Ambient brand color wash behind the card */}
        <div
          aria-hidden="true"
          className="brand-gradient pointer-events-none absolute -top-40 left-1/2 size-[500px] -translate-x-1/2 rounded-full opacity-[0.10] blur-3xl dark:opacity-[0.16]"
        />

        <div className="w-full max-w-sm space-y-6">
          {/* Mobile/Tablet Brand Lockup (Shown when hero is hidden) */}
          <div className="flex flex-col items-center text-center lg:hidden space-y-2">
            <AppLockup />
            <p className="text-xs text-muted-foreground max-w-xs">
              Internal AI response studio for Kognoz Consulting &amp; Research
            </p>
          </div>

          {/* Elevated Sign-In Card */}
          <Card className="relative overflow-hidden border-border/80 bg-card/95 shadow-[0_4px_24px_-4px_rgba(0,81,132,0.10)] dark:shadow-[0_4px_32px_-4px_rgba(0,0,0,0.45)] backdrop-blur-xs">
            <CardHeader className="gap-3 pb-4">
              <div className="flex size-11 items-center justify-center rounded-xl bg-secondary/80 border border-border/80 shadow-2xs">
                <KognozMark size={26} />
              </div>
              <div className="space-y-1">
                <CardTitle className="font-heading text-xl font-semibold tracking-tight text-foreground">
                  Sign in to RFP Studio
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed text-muted-foreground">
                  Draft, review, and approve RFP responses with the Kognoz knowledge base. Use your
                  corporate Microsoft account.
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Contextual Auth Error Alert */}
              {authError && (
                <Alert variant="destructive" className="border-destructive/40 bg-destructive/10 text-destructive text-xs">
                  <AlertCircle className="size-4 shrink-0 text-destructive" />
                  <div className="space-y-0.5 ml-1">
                    <AlertTitle className="text-xs font-semibold text-destructive">{authError.title}</AlertTitle>
                    <AlertDescription className="text-2xs leading-normal opacity-90">{authError.description}</AlertDescription>
                  </div>
                </Alert>
              )}

              {/* Microsoft Entra SSO Button */}
              <SignInButton next={destination} />

              {/* Tenant Security Badge */}
              <div className="rounded-lg border border-border/70 bg-panel/70 p-3 text-2xs text-muted-foreground flex items-start gap-2.5">
                <ShieldCheck className="size-4 shrink-0 text-brand-teal mt-0.5" />
                <span className="leading-normal">
                  Protected by Kognoz Entra directory SSO. Access is strictly limited to verified organization members.
                </span>
              </div>
            </CardContent>

            <CardFooter className="justify-between border-t border-border/70 bg-panel/40 px-6 py-3.5 text-2xs text-muted-foreground">
              <span>Internal tool · Kognoz Consulting</span>
              <KognozWordmark width={60} className="opacity-75" />
            </CardFooter>
          </Card>

          {/* Support / Admin Footnote */}
          <p className="text-center text-2xs text-muted-foreground px-4">
            Trouble signing in? Contact the{" "}
            <span className="font-medium text-foreground">Kognoz IT &amp; Ops Helpdesk</span>.
          </p>
        </div>
      </main>
    </div>
  );
}
