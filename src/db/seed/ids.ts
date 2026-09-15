import { createHash } from "node:crypto";

/**
 * Deterministic ids for seed rows (UUID v5 over SHA-1, RFC 4122 §4.3).
 *
 * `pnpm db:seed` must be re-runnable: every seeded row is an upsert on an id
 * derived from a stable slug, so re-seeding updates in place instead of
 * duplicating, and the demo RFP keeps the same URL across resets.
 */
const NAMESPACE = "6f1c0e2a-5d2b-4e6b-9a1f-2f9d3c7e8b10";

function uuidBytes(uuid: string): Buffer {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

export function stableId(kind: string, slug: string): string {
  const hash = createHash("sha1")
    .update(uuidBytes(NAMESPACE))
    .update(`${kind}:${slug}`)
    .digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
