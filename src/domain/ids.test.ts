import { describe, expect, it } from "vitest";

import { isUuid } from "./ids";

/**
 * Every id in a URL reaches a uuid column. Postgres rejects malformed text
 * with an error, which surfaced as a 500; the queries must treat it as
 * "not found" instead.
 */
describe("isUuid", () => {
  it("accepts canonical uuids in either case", () => {
    expect(isUuid("dce70ec8-f92d-5b60-95b0-eb865002e637")).toBe(true);
    expect(isUuid("DCE70EC8-F92D-5B60-95B0-EB865002E637")).toBe(true);
  });

  it("rejects anything Postgres would refuse", () => {
    for (const bad of ["not-a-uuid", "", "dce70ec8f92d5b6095b0eb865002e637", "dce70ec8-f92d-5b60-95b0-eb865002e63", "dce70ec8-f92d-5b60-95b0-eb865002e637x", " dce70ec8-f92d-5b60-95b0-eb865002e637"]) {
      expect(isUuid(bad), bad).toBe(false);
    }
  });
});
