import mammoth from "mammoth";
import { describe, expect, it } from "vitest";

import { CHRO_APPENDIX_TITLE } from "@/domain/export";

import { renderDocx } from "./docx";
import { sampleBrand, sampleModel } from "./fixtures";
import { embeddedLogo } from "./logo";

/** Render and read the body text back with mammoth (headers and footers are not extracted). */
async function text(buf: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer: buf });
  return value;
}

describe("renderDocx", () => {
  it("writes the cover, summary, overview, sections, answers and appendix", async () => {
    const buf = await renderDocx(sampleModel(), sampleBrand, { paragraphs: ["Apex wants one platform across 40 plants.", "We propose Darwinbox with Kognoz leading change."], highlights: ["Live in nine months"] }, null);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const body = await text(buf);
    expect(body).toContain("Apex Manufacturing — HRMS implementation RFP");
    expect(body).toContain("Prepared for Apex Manufacturing");
    expect(body).toContain("Executive summary");
    expect(body).toContain("We propose Darwinbox with Kognoz leading change.");
    expect(body).toContain("Live in nine months");
    expect(body).toContain("Response overview");
    expect(body).toContain("Core HR & organisation");
    expect(body).toContain("Time, attendance & payroll");
    expect(body).toContain("A1");
    expect(body).toContain("Single sign-on with Azure AD for all employees");
    expect(body).toContain("Darwinbox supports SAML 2.0 single sign-on");
    expect(body).toContain("Devices post punches over HTTPS");
    expect(body).toContain("Sources: [1] SSO and identity");
    expect(body).toContain("Open points");
    expect(body).toContain("Confirm the device vendor at the Pune plant");
    expect(body).toContain("No response drafted.");
    expect(body).toContain("Flagged: Needs the Kognoz change lead's input");
    expect(body).toContain(CHRO_APPENDIX_TITLE);
    expect(body).toContain("Mandate & vision");
    expect(body).toContain("Who owns HR data governance across the plants?");
    expect(body).not.toContain("Dropped");
  });

  it("embeds the logo on the cover", async () => {
    const buf = await renderDocx(sampleModel(), sampleBrand, null, embeddedLogo());
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    expect(buf.length).toBeGreaterThan(embeddedLogo().data.length);
    expect(await text(buf)).toContain("Prepared by Kognoz Consulting");
  });

  it("says when there is no summary and skips the appendix without kept questions", async () => {
    const model = sampleModel();
    const body = await text(await renderDocx({ ...model, chro: [] }, sampleBrand, null, null));
    expect(body).toContain("An executive summary was not generated for this export.");
    expect(body).not.toContain(CHRO_APPENDIX_TITLE);
  });
});
