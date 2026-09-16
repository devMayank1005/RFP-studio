import type { Metadata } from "next";

import { AnswerEditor } from "@/components/kb/answer-editor";
import { AnswersList } from "@/components/kb/answers-list";
import { EntryEditor } from "@/components/kb/entry-editor";
import { EntryList } from "@/components/kb/entry-list";
import { IngestDialog } from "@/components/kb/ingest-dialog";
import { KbTabs } from "@/components/kb/kb-tabs";
import { KbToolbar } from "@/components/kb/kb-toolbar";
import { NewEntryButton } from "@/components/kb/new-entry-button";
import { loadKbParams } from "@/components/kb/params";
import { SourcesList } from "@/components/kb/sources-list";
import { PageHeader } from "@/components/shell/page-header";
import { getApprovedAnswer, getKbEntry, getKbSource, kbTabCounts, listApprovedAnswers, listKbEntries, listKbSources } from "@/db/queries/kb";
import { can } from "@/domain/access";
import { entryTypesForTab } from "@/domain/kb";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Knowledge base" };

/**
 * The corpus every draft cites from, in four tabs. Lists are server-rendered
 * from the URL; the toolbar and rows change the URL. Editing happens in a
 * side sheet keyed by `entry`.
 */
export default async function KnowledgeBasePage({ searchParams }: PageProps<"/kb">) {
  const [session, params] = await Promise.all([requireSession(), loadKbParams(searchParams)]);
  const canEdit = can(session.role, "kb.edit");
  const moduleFilter = params.module ?? null;
  const tab = params.tab;
  const entryTab = tab === "capabilities" || tab === "services";

  // Deep link with an id: the row may be hidden by the current filters, so fetch it for the editor.
  const deepLinkId = params.entry && params.entry !== "new" ? params.entry : null;
  const [counts, source, editorEntry, editorAnswer] = await Promise.all([
    kbTabCounts(session.workspaceId),
    params.source ? getKbSource(session.workspaceId, params.source) : null,
    entryTab && deepLinkId ? getKbEntry(session.workspaceId, deepLinkId) : null,
    tab === "answers" && deepLinkId ? getApprovedAnswer(session.workspaceId, deepLinkId) : null,
  ]);

  let content: React.ReactNode;
  let shown = 0;
  let total = 0;
  if (tab === "capabilities" || tab === "services") {
    const rows = await listKbEntries(session.workspaceId, {
      types: entryTypesForTab(tab),
      module: moduleFilter,
      q: params.q,
      sourceId: params.source || null,
      includeInactive: params.inactive,
    });
    shown = rows.length;
    total = counts[tab];
    const filtered = Boolean(params.q || moduleFilter || params.source || params.inactive);
    content = (
      <>
        <EntryList rows={rows} tab={tab} grouped={!moduleFilter} canEdit={canEdit} filtered={filtered} />
        <EntryEditor rows={rows} fallbackEntry={editorEntry} tab={tab} canEdit={canEdit} />
      </>
    );
  } else if (tab === "answers") {
    const rows = await listApprovedAnswers(session.workspaceId, { q: params.q, module: moduleFilter });
    shown = rows.length;
    total = counts.answers;
    content = (
      <>
        <AnswersList rows={rows} filtered={Boolean(params.q || moduleFilter)} />
        <AnswerEditor rows={rows} fallbackAnswer={editorAnswer} canEdit={canEdit} />
      </>
    );
  } else {
    const all = await listKbSources(session.workspaceId);
    const rows = params.q ? all.filter((s) => s.name.toLowerCase().includes(params.q.toLowerCase())) : all;
    shown = rows.length;
    total = counts.sources;
    content = <SourcesList rows={rows} filtered={Boolean(params.q)} canEdit={canEdit} />;
  }

  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="Darwinbox capabilities, Kognoz services, approved answers and their sources — what every draft is allowed to cite."
        actions={canEdit ? (entryTab ? <NewEntryButton /> : tab === "sources" ? <IngestDialog /> : undefined) : undefined}
      >
        <KbTabs tab={tab} counts={counts} q={params.q} module={moduleFilter} />
      </PageHeader>
      <KbToolbar tab={tab} sourceName={source?.name ?? null} shown={shown} total={total} />
      <div className="flex min-h-0 flex-1 flex-col">{content}</div>
    </>
  );
}

