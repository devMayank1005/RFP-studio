"use client";

import { KanbanSquare, Rows3 } from "lucide-react";
import { useQueryState } from "nuqs";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

import { dashboardViewParser, type DashboardView } from "./view-params";

/** Table or kanban, kept in the URL so the choice survives a refresh and can be shared. */
export function ViewToggle() {
  const [view, setView] = useQueryState("view", dashboardViewParser.withOptions({ shallow: false }));

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={view}
      onValueChange={(v) => v && setView(v as DashboardView)}
      aria-label="Dashboard view"
    >
      <ToggleGroupItem value="table" aria-label="Table view" className="gap-1.5 px-2.5">
        <Rows3 className="size-3.5" />
        Table
      </ToggleGroupItem>
      <ToggleGroupItem value="kanban" aria-label="Kanban view" className="gap-1.5 px-2.5">
        <KanbanSquare className="size-3.5" />
        Board
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
