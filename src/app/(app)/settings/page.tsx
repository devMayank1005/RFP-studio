import type { Metadata } from "next";

import { BrandForm } from "@/components/settings/brand-form";
import { loadSettingsParams } from "@/components/settings/params";
import { SettingsTabs } from "@/components/settings/settings-tabs";
import { TeamTable } from "@/components/settings/team-table";
import { VoiceForm } from "@/components/settings/voice-form";
import { PageHeader } from "@/components/shell/page-header";
import { getActiveBrand } from "@/db/queries/brand";
import { listMembers } from "@/db/queries/team";
import { can } from "@/domain/access";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

/** Team and roles, the brand template with a live preview, and the voice guide behind every draft. */
export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const [session] = await Promise.all([requireSession(), loadSettingsParams(searchParams)]);
  const [members, brand] = await Promise.all([listMembers(session.workspaceId, session.email), getActiveBrand(session.workspaceId)]);
  const now = new Date();
  const canManageTeam = can(session.role, "team.manage");
  const canManageSettings = can(session.role, "settings.manage");
  // Separate from settings.manage on purpose: the people who notice the voice is wrong
  // are the ones writing with it, and they should not need workspace admin to fix a
  // paragraph. The brand template above stays admin-only.
  const canEditVoice = can(session.role, "voice.edit");

  return (
    <>
      <PageHeader title="Settings" description="Team and roles, the brand template, and the voice guide behind every draft." compact />
      <SettingsTabs
        panels={{
          team: <TeamTable members={members} meId={session.userId} canManage={canManageTeam} now={now} />,
          brand: (
            <BrandForm
              initial={{
                name: brand.name,
                primaryColor: brand.primaryColor,
                accentColor: brand.accentColor,
                successColor: brand.successColor,
                logoUrl: brand.logoUrl ?? "",
                fontFamily: brand.fontFamily,
                footerText: brand.footerText ?? "",
              }}
              canEdit={canManageSettings}
            />
          ),
          voice: <VoiceForm initial={brand.voiceGuide} canEdit={canEditVoice} version={brand.version} />,
        }}
      />
    </>
  );
}
