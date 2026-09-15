import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createLoader } from "nuqs/server";

import { RfpKanban } from "@/components/dashboard/rfp-kanban";
import { RfpTable } from "@/components/dashboard/rfp-table";
import { StatTiles } from "@/components/dashboard/stat-tiles";
import { dashboardViewParser } from "@/components/dashboard/view-params";
import { ViewToggle } from "@/components/dashboard/view-toggle";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { listRfps } from "@/db/queries/rfps";
import { todayInKolkata } from "@/domain/dates";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Dashboard" };

const loadParams = createLoader({ view: dashboardViewParser });

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const [session, { view }] = await Promise.all([requireSession(), loadParams(searchParams)]);
  const rows = await listRfps(session.workspaceId);
  const now = new Date();
  const today = todayInKolkata(now);

  return (
    <>
      <PageHeader
        title="RFP pipeline"
        description="Every response in flight, ordered by what needs a human next."
        actions={
          <>
            <ViewToggle />
            <Button asChild size="sm">
              <Link href="/rfps/new">
                <Plus />
                New RFP
              </Link>
            </Button>
          </>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No RFPs yet"
          description="Upload a client's RFP and RFP Studio will extract the questions, draft answers from the knowledge base and hand you a review grid."
          action={
            <Button asChild>
              <Link href="/rfps/new">
                <Plus />
                Start the first RFP
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5 p-6">
          <StatTiles rows={rows} today={today} />
          {view === "kanban" ? <RfpKanban rows={rows} today={today} /> : <RfpTable rows={rows} today={today} now={now} />}
        </div>
      )}
    </>
  );
}
