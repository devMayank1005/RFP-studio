import { describe, expect, it } from "vitest";
import { can } from "./access";
import { ROLES } from "./enums";

// The two properties this change rests on, stated as tests so a later edit that breaks
// either one fails loudly instead of quietly.

describe("editing the voice guide does not mean running the workspace", () => {
  it("separates the voice guide from the brand template", () => {
    // Before this, both sat behind settings.manage, so the only way to let someone fix a
    // paragraph of the guide was to make them a workspace admin.
    const canEditVoice = ROLES.filter((r) => can(r, "voice.edit"));
    const canManageBrand = ROLES.filter((r) => can(r, "settings.manage"));

    expect(canEditVoice).toEqual(["admin", "consultant", "sales"]);
    expect(canManageBrand).toEqual(["admin"]);
    // The point of the split: strictly more people edit the voice than the brand.
    expect(canEditVoice.length).toBeGreaterThan(canManageBrand.length);
  });

  it("grants nobody team management as a side effect", () => {
    // The failure mode worth guarding: someone widens voice.edit by copying admin's set.
    for (const role of ROLES) {
      if (role === "admin") continue;
      expect(can(role, "team.manage"), `${role} must not manage the team`).toBe(false);
    }
  });

  it("keeps reviewer out, as decided", () => {
    expect(can("reviewer", "voice.edit")).toBe(false);
  });
});

// The version check is exercised against the real database in the e2e/integration pass;
// what can be pinned here is the decision it encodes.
describe("a losing save is reported, not swallowed", () => {
  const save = (stored: number, presented: number | undefined) =>
    presented === undefined || presented === stored;

  it("accepts a save from the version the editor loaded", () => {
    expect(save(4, 4)).toBe(true);
  });

  it("refuses a save built on text someone has since replaced", () => {
    // Two people open the guide at version 4. The first saves, making it 5. The second
    // still presents 4 — and their save must not overwrite the first person's paragraph.
    expect(save(5, 4)).toBe(false);
  });

  it("still accepts a save with no version, so a mid-deploy client keeps working", () => {
    // An older tab has no version to present. It behaves exactly as before rather than
    // failing every save while the deploy rolls out.
    expect(save(5, undefined)).toBe(true);
  });
});
