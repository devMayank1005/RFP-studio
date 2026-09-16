"use client";

import { Check } from "lucide-react";
import type { CSSProperties } from "react";

import { Chip, ComplianceChip, ResponseStatusChip } from "@/components/chips/chips";
import { ApprovalMeter } from "@/components/dashboard/approval-meter";
import { Button } from "@/components/ui/button";
import { brandPreviewVars, type BrandLike } from "@/domain/brand";

/** What the draft brand will do to the chrome — and what it will not (chip tints stay fixed for contrast). */
export function BrandPreview({ draft, logoUrl, footerText, name }: { draft: BrandLike; logoUrl: string; footerText: string; name: string }) {
  return (
    <div className="sticky top-4 rounded-lg border bg-card p-5 shadow-[0_1px_2px_rgba(35,38,40,0.04)]" style={brandPreviewVars(draft) as CSSProperties} aria-label="Live preview">
      <div className="mb-4 flex items-center justify-between gap-3">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary URL from the template; sized, never optimised
          <img src={logoUrl} alt="" className="h-7 max-w-40 object-contain object-left" />
        ) : (
          <span className="text-2xs text-faint-ink">No logo</span>
        )}
        <span className="text-2xs text-muted-foreground">{name || "Brand template"}</span>
      </div>
      <h3 className="font-heading text-base font-semibold" style={{ color: "var(--brand-blue)" }}>
        Vedanta — HR transformation
      </h3>
      <p className="mt-1 text-ui text-muted-foreground">Body text follows the font setting; headings keep Poppins.</p>

      <div className="mt-4 flex items-center gap-1 border-b">
        <span className="border-b-2 px-3 py-1.5 text-ui font-medium" style={{ borderColor: "var(--brand-blue)" }}>
          Workspace
        </span>
        <span className="px-3 py-1.5 text-ui text-muted-foreground">Setup</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button size="sm">
          <Check />
          Approve
        </Button>
        <Button size="sm" variant="outline">
          Edit
        </Button>
        <ResponseStatusChip status="approved" />
        <ComplianceChip compliance="partial" />
      </div>

      <div className="mt-4">
        <div className="mb-1 flex justify-between text-2xs text-muted-foreground">
          <span>Approved</span>
          <span className="num">7 / 24</span>
        </div>
        <ApprovalMeter approved={7} drafted={17} total={24} showLabel={false} />
      </div>

      <div className="engine-hairline mt-4 rounded-md border bg-background p-3 pl-4 text-ui leading-relaxed">
        <span style={{ color: "var(--brand-teal)" }}>[1]</span> A drafted answer carries the accent colour on its hairline and citations.
      </div>

      <p className="mt-4 text-2xs text-muted-foreground">
        Buttons, focus rings, tab underlines, the sidebar&apos;s active item and the approval meter follow these colours. Status and compliance chips keep their fixed tints so they stay readable.
      </p>
      {footerText && <p className="mt-3 border-t pt-2 text-2xs text-faint-ink">{footerText}</p>}
      <Chip tone="outline" className="mt-3">
        Preview
      </Chip>
    </div>
  );
}
