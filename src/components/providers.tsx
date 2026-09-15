"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { useState } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Client-side providers for the whole app.
 *
 * - next-themes writes the `dark` class on <html> from a blocking script before
 *   React hydrates, so there is no flash and no hydration mismatch (the root
 *   layout carries `suppressHydrationWarning` for exactly that attribute).
 * - One QueryClient per browser session. Only the RFP workspace uses TanStack
 *   Query (optimistic approve/flag/edit); every list page loads its data in a
 *   server component.
 * - nuqs keeps workspace filters and the selected row in the URL.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <NuqsAdapter>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        </NuqsAdapter>
      </QueryClientProvider>
      {/* Toasts are confirmations, never questions. */}
      <Toaster position="bottom-right" duration={5000} />
    </ThemeProvider>
  );
}
