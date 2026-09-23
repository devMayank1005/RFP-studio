import { KOGNOZ_LOGO } from "./assets/kognoz-logo";

/**
 * The logo the Word cover carries. The default Kognoz mark is embedded as a
 * module (Vercel functions cannot read public/ at runtime); a custom https
 * logo from the brand template is fetched with a short timeout. A logo is
 * never worth failing an export over — every path returns null on trouble.
 */

export interface LogoAsset {
  data: Buffer;
  type: "png" | "jpg";
  width: number;
  height: number;
}

export const DEFAULT_LOGO_PATH = "/brand/kognoz-logo.png";
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5_000;

/** The default Kognoz mark, decoded from the embedded module. */
export function embeddedLogo(): LogoAsset {
  return { data: Buffer.from(KOGNOZ_LOGO.base64, "base64"), type: KOGNOZ_LOGO.type, width: KOGNOZ_LOGO.width, height: KOGNOZ_LOGO.height };
}

/** Width and height of a PNG or JPEG from its header bytes; null for anything else. */
export function imageSize(buf: Buffer): { type: "png" | "jpg"; width: number; height: number } | null {
  if (buf.length >= 24 && buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return { type: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: "jpg", height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  }
  return null;
}

/**
 * The logo for a brand template's URL: the embedded mark for the default path,
 * a fetched https image when it is a real PNG or JPEG under 2 MB, otherwise null.
 */
export async function resolveLogo(logoUrl: string | null | undefined, fetchImpl: typeof fetch = fetch): Promise<LogoAsset | null> {
  const url = logoUrl?.trim();
  if (!url || url === DEFAULT_LOGO_PATH) return embeddedLogo();
  if (!/^https:\/\//i.test(url)) return null; // other in-app paths are not readable from a function
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) return null;
    const size = imageSize(bytes);
    if (!size || size.width === 0 || size.height === 0) return null;
    return { data: bytes, ...size };
  } catch (err) {
    console.warn("[export] logo fetch failed; continuing without a logo", err instanceof Error ? err.message : err);
    return null;
  }
}
