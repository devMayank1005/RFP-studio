/**
 * Delete storage objects by handle (object keys, or Vercel Blob URLs for
 * files from before September 2026) from a script that is not TypeScript:
 * `scripts/e2e-cleanup.mjs` pipes the handles it collected as a JSON array.
 *
 *   echo '["rfps/x/exports/a-XXXXXXXXXX.xlsx"]' | pnpm storage:delete
 *   pnpm storage:delete rfps/x/exports/a-XXXXXXXXXX.xlsx
 */
import "@/lib/load-env";

import { StorageUnavailableError } from "@/domain/storage";
import { deletePrivate } from "@/lib/storage";

async function readStdin(): Promise<string> {
  let text = "";
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function main() {
  const raw = process.argv.length > 2 ? JSON.stringify(process.argv.slice(2)) : await readStdin();
  const handles = (JSON.parse(raw.trim() || "[]") as unknown[]).filter((h): h is string => typeof h === "string" && h.length > 0);
  if (!handles.length) {
    console.log("[storage] nothing to delete");
    return;
  }
  try {
    await deletePrivate(handles);
    console.log(`[storage] deleted ${handles.length} object(s)`);
  } catch (err) {
    if (!(err instanceof StorageUnavailableError)) throw err;
    console.warn(`[storage] could not delete ${handles.length} object(s): ${err.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[storage] FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  });
