import { BookOpen } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Knowledge base" };

export default function KnowledgeBasePage() {
  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="Darwinbox capabilities, Kognoz services, approved answers and their sources — what every draft is allowed to cite."
      />
      <EmptyState
        icon={BookOpen}
        milestone="Milestone 2"
        title="Managing the corpus lands next"
        description="The seeded knowledge base is already live and drives drafting. Browsing by module, editing entries, promoting approved answers and ingesting sources arrive in milestone 2."
      />
    </>
  );
}
