import { FileOutput } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shell/empty-state";

export const metadata: Metadata = { title: "Exports" };

export default function ExportsPage() {
  return (
    <EmptyState
      icon={FileOutput}
      milestone="Milestone 3"
      title="Branded exports"
      description="Excel mirroring the client's own columns with ours appended, a Word document grouped by section with an executive summary, and a joint value-proposition deck — all from the brand template."
    />
  );
}
