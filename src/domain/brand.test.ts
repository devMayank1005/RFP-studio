import { describe, expect, it } from "vitest";

import { BRAND_DEFAULTS, brandFormSchema, brandPreviewVars, normaliseHex, renderBrandCss } from "./brand";

/**
 * Brand is a setting: colours, font and footer live in brand_templates and
 * drive the app chrome. These are the pure parts — what counts as a colour,
 * what the form accepts, and the CSS the layout emits (nothing for defaults,
 * never unvalidated text).
 */
describe("normaliseHex", () => {
  it("accepts six-digit hex with or without the hash, in any case, and lower-cases it", () => {
    expect(normaliseHex("#005184")).toBe("#005184");
    expect(normaliseHex("005184")).toBe("#005184");
    expect(normaliseHex(" #ABCDEF ")).toBe("#abcdef");
  });

  it("rejects everything else", () => {
    for (const bad of ["#abc", "#12345678", "blue", "", "#00518g", null, undefined]) expect(normaliseHex(bad), String(bad)).toBeNull();
  });
});

describe("brandFormSchema", () => {
  const valid = { name: "Kognoz default", primaryColor: "8B1E3F", accentColor: "#2b9e85", successColor: "#71a247", logoUrl: "/brand/kognoz-logo.png", fontFamily: "Inter", footerText: "Confidential" };

  it("accepts a valid template and normalises the colours", () => {
    const result = brandFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.primaryColor).toBe("#8b1e3f");
  });

  it("names the field when a colour is not a colour", () => {
    const result = brandFormSchema.safeParse({ ...valid, primaryColor: "navy" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["primaryColor"]);
  });

  it("allows an empty, path or https logo and refuses other schemes", () => {
    expect(brandFormSchema.safeParse({ ...valid, logoUrl: "" }).success).toBe(true);
    expect(brandFormSchema.safeParse({ ...valid, logoUrl: "https://kognozconsulting.com/logo.png" }).success).toBe(true);
    expect(brandFormSchema.safeParse({ ...valid, logoUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(brandFormSchema.safeParse({ ...valid, logoUrl: "ftp://x/y.png" }).success).toBe(false);
  });
});

describe("renderBrandCss", () => {
  it("emits nothing when everything is the default, so the seeded template changes no pixel", () => {
    expect(renderBrandCss({ ...BRAND_DEFAULTS })).toBe("");
    expect(renderBrandCss({ ...BRAND_DEFAULTS, primaryColor: "#005184" })).toBe("");
  });

  it("overrides only the tokens that differ", () => {
    const css = renderBrandCss({ ...BRAND_DEFAULTS, primaryColor: "#8b1e3f" });
    expect(css).toContain("--brand-blue:#8b1e3f");
    expect(css).not.toContain("--brand-teal");
    expect(css).not.toContain("body{");
  });

  it("never emits a stored value that is not a colour", () => {
    const css = renderBrandCss({ ...BRAND_DEFAULTS, primaryColor: "url(evil)", accentColor: "#111111" });
    expect(css).toBe(":root{--brand-teal:#111111}");
  });

  it("changes the body font, never the heading font", () => {
    expect(renderBrandCss({ ...BRAND_DEFAULTS, fontFamily: "system" })).toMatch(/^body\{font-family:ui-sans-serif/);
    expect(renderBrandCss({ ...BRAND_DEFAULTS, fontFamily: "Poppins" })).toContain("var(--font-poppins)");
  });
});

describe("brandPreviewVars", () => {
  it("scopes the brand and the shadcn aliases that resolve at :root, so a preview card follows the draft", () => {
    const vars = brandPreviewVars({ ...BRAND_DEFAULTS, primaryColor: "#8b1e3f", fontFamily: "system" });
    expect(vars["--brand-blue"]).toBe("#8b1e3f");
    expect(vars["--primary"]).toBe("#8b1e3f");
    expect(vars["--ring"]).toBe("#8b1e3f");
    expect(vars["--sidebar-primary"]).toBe("#8b1e3f");
    expect(vars["--chart-2"]).toBe(BRAND_DEFAULTS.accentColor);
    expect(vars.fontFamily).toMatch(/^ui-sans-serif/);
  });

  it("falls back to the default for an invalid draft colour instead of emitting it", () => {
    expect(brandPreviewVars({ ...BRAND_DEFAULTS, primaryColor: "nope" })["--brand-blue"]).toBe(BRAND_DEFAULTS.primaryColor);
  });
});

import { deepenHex } from "./brand";

describe("deepenHex and the deep-blue token", () => {
  it("derives the darker shade the sidebar and secondary text use, matching the seeded ratio", () => {
    // #003d63 is the seeded deep blue for #005184: every channel at three quarters.
    expect(deepenHex("#005184")).toBe("#003d63");
    expect(deepenHex("#ffffff")).toBe("#bfbfbf");
  });

  it("emits --brand-blue-deep alongside a custom primary, so the active nav follows too", () => {
    const css = renderBrandCss({ ...BRAND_DEFAULTS, primaryColor: "#8b1e3f" });
    expect(css).toBe(":root{--brand-blue:#8b1e3f;--brand-blue-deep:#68172f}");
    expect(brandPreviewVars({ ...BRAND_DEFAULTS, primaryColor: "#8b1e3f" })["--brand-blue-deep"]).toBe("#68172f");
  });
});
