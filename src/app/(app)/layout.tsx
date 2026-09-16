import { BrandStyle } from "@/components/brand/brand-style";
import { AppShell } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/session";

/**
 * Everything under (app) is signed-in only. proxy.ts bounces cookie-less
 * visitors cheaply; this is the authoritative check, and it resolves the
 * workspace and role every page and action beneath it runs as.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  return (
    <>
      <BrandStyle workspaceId={session.workspaceId} />
      <AppShell
      user={{
        name: session.name,
        email: session.email,
        image: session.image,
        role: session.role,
        workspaceName: session.workspaceName,
      }}
    >
        {children}
      </AppShell>
    </>
  );
}
