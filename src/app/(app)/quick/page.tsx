import type { Metadata } from "next";

import { QuickNewForm } from "@/components/quick/quick-new-form";
import { QuickSessionList } from "@/components/quick/quick-session-list";
import { PageHeader } from "@/components/shell/page-header";
import { listQuickSessions } from "@/db/queries/quick";
import { listClients } from "@/db/queries/rfps";
import { QUICK_CLIENT_NAME, quickPermissions } from "@/domain/quick";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Quick Q&A" };

/** Paste or upload a client's questions, add context, draft — without the wizard. */
export default async function QuickPage() {
  const session = await requireSession();
  const [sessions, clients] = await Promise.all([listQuickSessions(session.workspaceId), listClients(session.workspaceId)]);
  const permissions = quickPermissions(session.role);

  return (
    <div className="flex flex-col gap-5 p-6">
      <PageHeader title="Quick Q&A" description="Paste questions or drop a questionnaire, say what the deal is about, and get drafted answers with citations in about a minute." />
      {permissions.create ? (
        <QuickNewForm clients={clients.filter((c) => c.name !== QUICK_CLIENT_NAME).map((c) => ({ id: c.id, name: c.name }))} />
      ) : (
        <p className="rounded-lg border bg-card px-4 py-3 text-ui text-muted-foreground">Your role can review Quick Q&A sessions but not start them.</p>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Sessions</h2>
        <QuickSessionList sessions={sessions} now={new Date()} />
      </section>
    </div>
  );
}
