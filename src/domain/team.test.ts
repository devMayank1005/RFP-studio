import { describe, expect, it } from "vitest";

import { adminCount, canChangeRole } from "./team";

/** Roles are changed in Settings. The one invariant: a workspace always keeps an admin. */
const members = [
  { userId: "u1", role: "admin" },
  { userId: "u2", role: "consultant" },
  { userId: "u3", role: "reviewer" },
];

describe("canChangeRole", () => {
  it("allows ordinary changes", () => {
    expect(canChangeRole(members, "u2", "reviewer")).toEqual({ ok: true });
    expect(canChangeRole(members, "u2", "admin")).toEqual({ ok: true });
  });

  it("refuses to demote the only admin, even themselves", () => {
    expect(canChangeRole(members, "u1", "consultant")).toEqual({ ok: false, reason: "The workspace needs at least one admin." });
  });

  it("lets an admin step down once there is another", () => {
    expect(canChangeRole([...members, { userId: "u4", role: "admin" }], "u1", "reviewer")).toEqual({ ok: true });
  });

  it("refuses unknown people and unknown roles", () => {
    expect(canChangeRole(members, "u9", "admin").ok).toBe(false);
    expect(canChangeRole(members, "u2", "owner").ok).toBe(false);
  });

  it("treats an unchanged role as a no-op", () => {
    expect(canChangeRole(members, "u2", "consultant")).toEqual({ ok: true, unchanged: true });
  });
});

describe("adminCount", () => {
  it("counts admins", () => {
    expect(adminCount(members)).toBe(1);
    expect(adminCount([])).toBe(0);
  });
});
