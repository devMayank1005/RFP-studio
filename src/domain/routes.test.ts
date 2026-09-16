import { describe, expect, it } from "vitest";

import { rfpLandingPath, setupStepFor, setupStepPath } from "./routes";

/**
 * Where a click on an RFP should land. Intake RFPs (nothing confirmed yet)
 * belong in the setup wizard, not an empty review grid; and the wizard's own
 * entry point must resolve to a real step — /setup alone has no page.
 */
describe("rfpLandingPath", () => {
  it("sends draft and parsing RFPs to setup, everything else to the workspace", () => {
    expect(rfpLandingPath("r1", "draft")).toBe("/rfps/r1/setup");
    expect(rfpLandingPath("r1", "parsing")).toBe("/rfps/r1/setup");
    for (const status of ["questions_ready", "drafting", "in_review", "approved", "submitted", "won", "lost"] as const) {
      expect(rfpLandingPath("r1", status)).toBe("/rfps/r1/workspace");
    }
  });
});

describe("setupStepFor", () => {
  it("starts at upload when nothing has been uploaded or extracted", () => {
    expect(setupStepFor({ status: "draft", questionCount: 0, hasExtractionJob: false })).toBe("upload");
  });

  it("goes to questions once extraction has started, even before any question exists", () => {
    expect(setupStepFor({ status: "draft", questionCount: 0, hasExtractionJob: true })).toBe("questions");
  });

  it("goes to questions when questions exist, and stays there after confirmation", () => {
    expect(setupStepFor({ status: "draft", questionCount: 12, hasExtractionJob: true })).toBe("questions");
    expect(setupStepFor({ status: "in_review", questionCount: 249, hasExtractionJob: false })).toBe("questions");
  });
});

describe("setupStepPath", () => {
  it("builds the step URL under the RFP", () => {
    expect(setupStepPath("r1", "upload")).toBe("/rfps/r1/setup/upload");
  });
});
