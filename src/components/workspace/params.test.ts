import { describe, expect, it } from "vitest";

import { COMPLIANCE_LEVELS } from "@/domain/enums";

import { serializeWorkspace, workspaceParsers } from "./params";

describe("workspace URL parsers", () => {
  it("reads any spelling of a facet as its canonical form", () => {
    expect(workspaceParsers.compliance.parse("")).toEqual([]);
    expect(workspaceParsers.compliance.parse("fully,fully,bogus")).toEqual(["fully"]);
    expect(workspaceParsers.compliance.parse([...COMPLIANCE_LEVELS].reverse().join(","))).toEqual([]);
    // A pasted-together value: the junk items go, the good ones stay.
    expect(workspaceParsers.owner.parse("kognoz,darwinbox,not_applicable=fully,na")).toEqual(["kognoz", "darwinbox"]);
  });

  it("writes one canonical URL: enum order, and no key at all for 'everything'", () => {
    expect(serializeWorkspace({ compliance: [...COMPLIANCE_LEVELS] })).toBe("");
    expect(serializeWorkspace({ owner: ["darwinbox", "kognoz"] })).toBe("?owner=kognoz,darwinbox");
    expect(serializeWorkspace({ status: ["undrafted"], row: "q1" })).toBe("?status=undrafted&row=q1");
  });
});
