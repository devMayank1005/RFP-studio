import { MessageCircleQuestion } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shell/empty-state";

export const metadata: Metadata = { title: "CHRO questions" };

export default function ChroPage() {
  return (
    <EmptyState
      icon={MessageCircleQuestion}
      milestone="Milestone 2"
      title="CHRO discovery questions"
      description="Once most responses are approved, Claude proposes 12–16 discovery questions across six themes, each with its rationale. You keep, drop or edit them; the kept set goes into the proposal."
    />
  );
}
