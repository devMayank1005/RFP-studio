import { describe, expect, it } from "vitest";

import { stableId } from "./ids";

const UUID_V5 = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("stableId", () => {
  it("is deterministic for the same kind and slug", () => {
    expect(stableId("rfp", "apex")).toBe(stableId("rfp", "apex"));
  });

  it("differs by kind and by slug", () => {
    expect(stableId("rfp", "apex")).not.toBe(stableId("client", "apex"));
    expect(stableId("rfp", "apex")).not.toBe(stableId("rfp", "apex-2"));
  });

  it("is a well-formed RFC 4122 version-5 UUID", () => {
    expect(stableId("kb_entry", "core-employee-master")).toMatch(UUID_V5);
  });
});
