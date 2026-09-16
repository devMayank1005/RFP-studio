const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every id that arrives in a URL is compared against a uuid column. Postgres
 * throws on malformed text, which surfaced as a 500 page; a query guarded by
 * this returns "not found" instead.
 */
export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value);
}
