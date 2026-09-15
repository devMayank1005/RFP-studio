import { Settings2 } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Team and roles, the brand template, and the voice guide behind every draft." />
      <EmptyState
        icon={Settings2}
        milestone="Milestone 2"
        title="Team, brand and voice settings land next"
        description="Roles are granted on first sign-in for now (first person in is admin, everyone else a consultant). The Kognoz brand template and voice guide are seeded and already in use."
      />
    </>
  );
}
