"use client";

import { Plus } from "lucide-react";
import { useQueryStates } from "nuqs";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

import { kbParsers } from "./params";

export function NewEntryButton() {
  const [, setParams] = useQueryStates(kbParsers, { shallow: true, history: "push" });
  return (
    <Button size="sm" onClick={() => void setParams({ entry: "new" })}>
      <Plus />
      New entry
      <Kbd className="ml-1">N</Kbd>
    </Button>
  );
}
