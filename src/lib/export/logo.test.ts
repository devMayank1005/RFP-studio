import { describe, expect, it } from "vitest";

import { embeddedLogo, imageSize, resolveLogo } from "./logo";

describe("logo", () => {
  it("embeds the Kognoz mark with its real dimensions", () => {
    const logo = embeddedLogo();
    expect(logo.type).toBe("png");
    expect(logo.data.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(imageSize(logo.data)).toEqual({ type: "png", width: logo.width, height: logo.height });
    expect(logo.width).toBeGreaterThan(logo.height);
  });

  it("reads JPEG frame sizes and rejects other bytes", () => {
    // SOI, APP0 (empty), SOF0 with 8-bit, height 10, width 20, 3 components.
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x0a, 0x00, 0x14, 0x03, 0x01, 0x11, 0x00]);
    expect(imageSize(jpg)).toEqual({ type: "jpg", width: 20, height: 10 });
    expect(imageSize(Buffer.from("GIF89a"))).toBeNull();
  });

  it("uses the embedded logo for the default path and nothing for other local paths", async () => {
    expect(await resolveLogo(null)).not.toBeNull();
    expect(await resolveLogo("/brand/kognoz-logo.png")).not.toBeNull();
    expect(await resolveLogo("/brand/other.png")).toBeNull();
  });

  it("fetches an https logo and never throws", async () => {
    const png = embeddedLogo().data;
    const ok: typeof fetch = async () => new Response(new Uint8Array(png), { status: 200 });
    const fetched = await resolveLogo("https://example.com/logo.png", ok);
    expect(fetched?.width).toBe(embeddedLogo().width);
    const notFound: typeof fetch = async () => new Response("nope", { status: 404 });
    expect(await resolveLogo("https://example.com/missing.png", notFound)).toBeNull();
    const boom: typeof fetch = async () => {
      throw new Error("network down");
    };
    expect(await resolveLogo("https://example.com/logo.png", boom)).toBeNull();
    const text: typeof fetch = async () => new Response("<svg/>", { status: 200 });
    expect(await resolveLogo("https://example.com/logo.svg", text)).toBeNull();
  });
});
