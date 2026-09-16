import { z } from "zod";

/**
 * Brand is a setting, not a code change: colours, font and footer live in
 * brand_templates and drive the app chrome (and, later, the exports). Pure
 * pieces only — what counts as a colour, what the form accepts, and the CSS
 * the layout emits.
 */

export const BRAND_FONTS = ["Inter", "Poppins", "system"] as const;
export type BrandFont = (typeof BRAND_FONTS)[number];

export const BRAND_FONT_LABEL: Record<BrandFont, string> = {
  Inter: "Inter (default)",
  Poppins: "Poppins",
  system: "System UI",
};

/** Body text only; headings keep Poppins whatever this says. */
export const BRAND_FONT_STACK: Record<BrandFont, string> = {
  Inter: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  Poppins: "var(--font-poppins), var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  system: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
};

export interface BrandLike {
  primaryColor: string;
  accentColor: string;
  successColor: string;
  fontFamily: string;
}

/** The Kognoz values baked into globals.css. A template equal to these emits no CSS at all. */
export const BRAND_DEFAULTS = {
  primaryColor: "#005184",
  accentColor: "#2b9e85",
  successColor: "#71a247",
  fontFamily: "Inter",
} as const satisfies BrandLike;

/** "#RRGGBB" in any case, with or without the hash → "#rrggbb"; anything else → null. Never trusts stored text. */
export function normaliseHex(input: string | null | undefined): string | null {
  if (typeof input !== "string") return null;
  const bare = input.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(bare) ? `#${bare.toLowerCase()}` : null;
}

/** The darker companion of a colour (each channel at three quarters) — how the seeded deep blue relates to the primary. */
export function deepenHex(hex: string, factor = 0.75): string {
  const h = normaliseHex(hex);
  if (!h) return hex;
  const n = parseInt(h.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((n >> shift) & 0xff) * factor)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

export const hexColorSchema = z.string().transform((value, ctx) => {
  const hex = normaliseHex(value);
  if (!hex) {
    ctx.addIssue({ code: "custom", message: "Use a six-digit hex colour like #005184." });
    return z.NEVER;
  }
  return hex;
});

const logoUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || v.startsWith("/") || /^https?:\/\//i.test(v), { message: "Use a path like /brand/logo.png or an https:// address." });

export const brandFormSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name.").max(80),
  primaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  successColor: hexColorSchema,
  logoUrl: logoUrlSchema,
  fontFamily: z.enum(BRAND_FONTS),
  footerText: z.string().trim().max(200),
});
export type BrandInput = z.infer<typeof brandFormSchema>;

function fontStack(font: string): string | null {
  return (BRAND_FONTS as readonly string[]).includes(font) ? BRAND_FONT_STACK[font as BrandFont] : null;
}

const TOKENS: ReadonlyArray<[cssVar: string, key: keyof Omit<BrandLike, "fontFamily">]> = [
  ["--brand-blue", "primaryColor"],
  ["--brand-teal", "accentColor"],
  ["--brand-green", "successColor"],
];

/**
 * The inline <style> the signed-in layout emits. Only tokens that differ from
 * the defaults, only values that survived `normaliseHex`, and the body font
 * when it is not Inter — so the seeded template renders nothing and a bad
 * value in the database can never reach the page as raw text.
 */
export function renderBrandCss(brand: BrandLike): string {
  const vars: string[] = [];
  for (const [cssVar, key] of TOKENS) {
    const hex = normaliseHex(brand[key]);
    if (hex && hex !== BRAND_DEFAULTS[key]) {
      vars.push(`${cssVar}:${hex}`);
      // The sidebar's active item and secondary text use the deeper shade; derive it so they follow.
      if (key === "primaryColor") vars.push(`--brand-blue-deep:${deepenHex(hex)}`);
    }
  }
  const parts: string[] = [];
  if (vars.length) parts.push(`:root{${vars.join(";")}}`);
  const stack = fontStack(brand.fontFamily);
  if (stack && brand.fontFamily !== BRAND_DEFAULTS.fontFamily) parts.push(`body{font-family:${stack}}`);
  return parts.join("");
}

/**
 * Inline style for the live preview card. `--primary`, `--ring` and friends
 * resolve at :root, so overriding `--brand-blue` on a card alone would not
 * move them; the preview sets both layers.
 */
export function brandPreviewVars(draft: BrandLike): Record<string, string> {
  const blue = normaliseHex(draft.primaryColor) ?? BRAND_DEFAULTS.primaryColor;
  const teal = normaliseHex(draft.accentColor) ?? BRAND_DEFAULTS.accentColor;
  const green = normaliseHex(draft.successColor) ?? BRAND_DEFAULTS.successColor;
  const deep = deepenHex(blue);
  return {
    "--brand-blue": blue,
    "--brand-blue-deep": deep,
    "--brand-teal": teal,
    "--brand-green": green,
    "--primary": blue,
    "--secondary-foreground": deep,
    "--accent-foreground": deep,
    "--sidebar-accent-foreground": deep,
    "--ring": blue,
    "--sidebar-primary": blue,
    "--chart-1": blue,
    "--chart-2": teal,
    "--chart-3": green,
    fontFamily: fontStack(draft.fontFamily) ?? BRAND_FONT_STACK.Inter,
  };
}
