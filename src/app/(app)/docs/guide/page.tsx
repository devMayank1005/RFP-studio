import { readFile } from "node:fs/promises";
import path from "node:path";

import { marked } from "marked";
import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "User guide" };

/**
 * docs/user-guide.md, rendered. The guide is the acceptance spec for every
 * screen, so it ships inside the app rather than living in the repo alone.
 * Read at request time; next.config.ts traces docs/ into this route's bundle.
 */
export default async function UserGuidePage() {
  await requireSession();
  let html = "";
  try {
    const md = await readFile(path.join(process.cwd(), "docs", "user-guide.md"), "utf8");
    html = await marked.parse(md, { gfm: true });
  } catch {
    html = "<p>The user guide has not been added to this build yet (docs/user-guide.md).</p>";
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="User guide" description="Every screen, role, status and shortcut in RFP Studio." />
      <article className="prose-docs mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 pb-16" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
