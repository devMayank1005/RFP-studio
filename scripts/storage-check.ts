/**
 * Proves the storage bucket is reachable with the configured credentials:
 * put a probe object, read it back byte-equal, list it under its prefix,
 * delete it, confirm the listing is empty. Touches only `probe/`, which the
 * sweeper never looks at. Run it after setting the AWS_* variables anywhere.
 *
 *   pnpm storage:check
 */
import "@/lib/load-env";

import { randomBytes } from "node:crypto";

import { deletePrivate, listPrivate, readPrivate, storageConfigError, uploadPrivate } from "@/lib/storage";

async function main() {
  const config = storageConfigError();
  if (config) throw new Error(config);

  const body = randomBytes(4096);
  const { url: key } = await uploadPrivate("probe/storage-check.bin", body, "application/octet-stream");
  console.log(`[storage] put ${key}`);

  const back = await readPrivate(key);
  if (!back.equals(body)) throw new Error("read back differs from what was written");
  console.log(`[storage] get ${back.byteLength} bytes, byte-equal`);

  const listed = await listPrivate("probe/");
  if (!listed.blobs.some((b) => b.url === key)) throw new Error("probe object missing from the listing");
  console.log(`[storage] list probe/ → ${listed.blobs.length} object(s)`);

  await deletePrivate([key]);
  const after = await listPrivate("probe/");
  if (after.blobs.some((b) => b.url === key)) throw new Error("probe object still listed after delete");
  console.log("[storage] delete ok · bucket is healthy");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[storage] FAILED", err instanceof Error ? err.message : err);
    process.exit(1);
  });
