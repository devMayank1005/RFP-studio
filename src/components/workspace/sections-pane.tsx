"use client";

import { Chip } from "@/components/chips/chips";
import { COMPLIANCE_TONE, RESPONSE_STATUS_TONE } from "@/components/chips/chips";
import type { WorkspaceRow, WorkspaceSection } from "@/db/queries/workspace";
import { COMPLIANCE_LABEL, COMPLIANCE_LEVELS, OWNERS, OWNER_LABEL, RESPONSE_STATUSES, RESPONSE_STATUS_LABEL, type Compliance, type Owner, type ResponseStatus } from "@/domain/enums";
import { cn } from "@/lib/utils";

export interface Filters {
  status: Array<ResponseStatus | "undrafted">;
  owner: Owner[];
  compliance: Compliance[];
  section: string;
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Left pane: sections with approval counts, then the filter facets. Everything here is one click and one URL change. */
export function SectionsPane({
  rows,
  sections,
  filters,
  onChange,
}: {
  rows: WorkspaceRow[];
  sections: WorkspaceSection[];
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  const bySection = new Map<string | null, { total: number; approved: number }>();
  for (const r of rows) {
    const s = bySection.get(r.sectionId) ?? { total: 0, approved: 0 };
    s.total++;
    if (r.status === "approved") s.approved++;
    bySection.set(r.sectionId, s);
  }
  const unsectioned = bySection.get(null);
  const count = (pred: (r: WorkspaceRow) => boolean) => rows.filter(pred).length;

  return (
    <div className="flex h-full flex-col overflow-y-auto scrollbar-thin">
      <div className="px-3 pt-3 pb-1 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Sections</div>
      <nav className="px-1.5">
        <SectionButton active={filters.section === ""} title="All sections" total={rows.length} approved={rows.filter((r) => r.status === "approved").length} onClick={() => onChange({ section: "" })} />
        {sections.map((s) => {
          const c = bySection.get(s.id) ?? { total: 0, approved: 0 };
          return <SectionButton key={s.id} active={filters.section === s.id} title={s.title} total={c.total} approved={c.approved} onClick={() => onChange({ section: filters.section === s.id ? "" : s.id })} />;
        })}
        {unsectioned && <SectionButton active={filters.section === "none"} title="Unsectioned" total={unsectioned.total} approved={unsectioned.approved} onClick={() => onChange({ section: filters.section === "none" ? "" : "none" })} />}
      </nav>

      <Facet title="Status">
        {(["undrafted", ...RESPONSE_STATUSES] as const).map((s) => (
          <FacetRow
            key={s}
            active={filters.status.includes(s)}
            onClick={() => onChange({ status: toggle(filters.status, s) })}
            count={count((r) => (s === "undrafted" ? r.status === null : r.status === s))}
          >
            {s === "undrafted" ? <Chip tone="outline">Not drafted</Chip> : <Chip tone={RESPONSE_STATUS_TONE[s]} dot>{RESPONSE_STATUS_LABEL[s]}</Chip>}
          </FacetRow>
        ))}
      </Facet>

      <Facet title="Compliance">
        {COMPLIANCE_LEVELS.map((c) => (
          <FacetRow key={c} active={filters.compliance.includes(c)} onClick={() => onChange({ compliance: toggle(filters.compliance, c) })} count={count((r) => r.compliance === c)}>
            <Chip tone={COMPLIANCE_TONE[c]}>{COMPLIANCE_LABEL[c]}</Chip>
          </FacetRow>
        ))}
      </Facet>

      <Facet title="Owner">
        {OWNERS.map((o) => (
          <FacetRow key={o} active={filters.owner.includes(o)} onClick={() => onChange({ owner: toggle(filters.owner, o) })} count={count((r) => r.owner === o)}>
            <span className="text-ui">{OWNER_LABEL[o]}</span>
          </FacetRow>
        ))}
      </Facet>
    </div>
  );
}

function SectionButton({ active, title, total, approved, onClick }: { active: boolean; title: string; total: number; approved: number; onClick: () => void }) {
  const pct = total ? Math.round((approved / total) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "group flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-secondary text-secondary-foreground hover:bg-secondary",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-ui">{title}</span>
        <span className="num shrink-0 text-2xs text-muted-foreground">
          {approved}/{total}
        </span>
      </span>
      <span className="h-0.5 w-full overflow-hidden rounded-full bg-meaning-green-bg">
        <span className="block h-full rounded-full bg-brand-green" style={{ width: `${pct}%` }} />
      </span>
    </button>
  );
}

function Facet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t pt-2">
      <div className="px-3 pb-1 text-2xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{title}</div>
      <div className="px-1.5">{children}</div>
    </div>
  );
}

function FacetRow({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-secondary hover:bg-secondary",
      )}
    >
      {children}
      <span className="num text-2xs text-muted-foreground">{count}</span>
    </button>
  );
}
