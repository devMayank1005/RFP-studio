import { describe, expect, it } from "vitest";

import { isStaleQueuedJob, jobRunnerConfigMessage, progressLabel, STALE_QUEUE_MS } from "./jobs";

/**
 * Background jobs go through Inngest. Locally the dev server needs no key;
 * in production the client runs in cloud mode and a missing event key means
 * nothing is ever sent. The app must say so before it writes a row.
 */
describe("jobRunnerConfigMessage", () => {
  it("names the missing variable in cloud mode", () => {
    expect(jobRunnerConfigMessage({ cloudMode: true, hasEventKey: false })).toMatch(/INNGEST_EVENT_KEY/);
  });

  it("is silent in development, where the dev server needs no key, and in a configured cloud", () => {
    expect(jobRunnerConfigMessage({ cloudMode: false, hasEventKey: false })).toBeNull();
    expect(jobRunnerConfigMessage({ cloudMode: true, hasEventKey: true })).toBeNull();
  });
});

describe("isStaleQueuedJob", () => {
  const now = new Date("2026-09-16T10:00:00Z");
  it("treats a queued job or document older than the window as never picked up", () => {
    expect(STALE_QUEUE_MS).toBe(5 * 60 * 1000);
    expect(isStaleQueuedJob({ status: "queued", createdAt: "2026-09-16T09:50:00Z" }, now)).toBe(true);
    expect(isStaleQueuedJob({ status: "pending", createdAt: "2026-09-16T09:50:00Z" }, now)).toBe(true);
    expect(isStaleQueuedJob({ status: "queued", createdAt: "2026-09-16T09:58:00Z" }, now)).toBe(false);
    expect(isStaleQueuedJob({ status: "running", createdAt: "2026-09-16T09:00:00Z" }, now)).toBe(false);
    expect(isStaleQueuedJob(null, now)).toBe(false);
  });
});

describe("progressLabel", () => {
  it("never shows more done than the total, so a retried step cannot print 33 / 20", () => {
    expect(progressLabel(33, 20)).toBe("20 / 20");
    expect(progressLabel(3, 20)).toBe("3 / 20");
    expect(progressLabel(20, 20)).toBe("20 / 20");
  });

  it("is empty while the total is still unknown", () => {
    expect(progressLabel(0, 0)).toBe("");
    expect(progressLabel(5, 0)).toBe("");
  });
});
