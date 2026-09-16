import { describe, expect, it } from "vitest";

import { chordKey, chordTarget } from "./nav";

describe("navigation chords", () => {
  const items = [
    { title: "Dashboard", href: "/dashboard", shortcut: "G D" },
    { title: "Quick Q&A", href: "/quick", shortcut: "G Q" },
    { title: "Settings", href: "/settings" },
  ];

  it("reads the second key of a G chord", () => {
    expect(chordKey("G D")).toBe("d");
    expect(chordKey(" g  q ")).toBe("q");
    expect(chordKey("⌘K")).toBeNull();
    expect(chordKey("G DD")).toBeNull();
    expect(chordKey(undefined)).toBeNull();
  });

  it("finds the item for a completed chord, case-insensitively", () => {
    expect(chordTarget(items, "d")?.href).toBe("/dashboard");
    expect(chordTarget(items, "Q")?.href).toBe("/quick");
    expect(chordTarget(items, "s")).toBeNull();
  });
});
