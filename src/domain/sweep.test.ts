import { describe, expect, it } from "vitest";

import { ORPHAN_GRACE_MS, REAP_REASONS, STALE_RUN_MS, classifyJobs, orphanBlobs } from "./sweep";
import { STALE_QUEUE_MS } from "./jobs";

const now = new Date("2026-09-17T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("classifyJobs", () => {
  it("reaps a queued job nobody picked up, but not a fresh one", () => {
    const rows = [
      { id: "old", status: "queued", createdAt: ago(STALE_QUEUE_MS + 1000), startedAt: null },
      { id: "new", status: "queued", createdAt: ago(1000), startedAt: null },
    ];
    expect(classifyJobs(rows, now)).toEqual([{ id: "old", reason: REAP_REASONS.neverPickedUp }]);
  });

  it("reaps a run that has gone on too long, measured from when it started", () => {
    const rows = [
      { id: "stuck", status: "running", createdAt: ago(STALE_RUN_MS * 3), startedAt: ago(STALE_RUN_MS + 1) },
      { id: "busy", status: "running", createdAt: ago(STALE_RUN_MS * 3), startedAt: ago(60_000) },
      { id: "no-start", status: "running", createdAt: ago(STALE_RUN_MS + 1), startedAt: null },
    ];
    expect(classifyJobs(rows, now).map((d) => d.id)).toEqual(["stuck", "no-start"]);
  });

  it("leaves finished jobs alone", () => {
    expect(classifyJobs([{ id: "d", status: "done", createdAt: ago(1e9), startedAt: null }], now)).toEqual([]);
  });
});

describe("orphanBlobs", () => {
  const live = "11111111-1111-1111-1111-111111111111";
  const gone = "22222222-2222-2222-2222-222222222222";
  const file = (pathname: string, ageMs: number) => ({ pathname, url: `https://blob/${pathname}`, uploadedAt: ago(ageMs) });

  it("deletes everything under an RFP that no longer exists, whatever its age", () => {
    const files = [file(`rfps/${gone}/uploads/a.xlsx`, 1000), file(`rfps/${gone}/exports/b.docx`, ORPHAN_GRACE_MS * 2)];
    const out = orphanBlobs({ files, rfpIds: new Set([live]), referencedUrls: new Set(), now });
    expect(out.map((f) => f.pathname)).toEqual(files.map((f) => f.pathname));
  });

  it("keeps a live RFP's referenced files and its recent unreferenced ones", () => {
    const referenced = file(`rfps/${live}/uploads/a.xlsx`, ORPHAN_GRACE_MS * 2);
    const recent = file(`rfps/${live}/exports/fresh.xlsx`, 1000);
    const stale = file(`rfps/${live}/exports/old.xlsx`, ORPHAN_GRACE_MS + 1);
    const out = orphanBlobs({ files: [referenced, recent, stale], rfpIds: new Set([live]), referencedUrls: new Set([referenced.url]), now });
    expect(out.map((f) => f.pathname)).toEqual([stale.pathname]);
  });

  it("applies the same grace to KB sources and ignores unknown prefixes", () => {
    const kbStale = file("kb/ws1/sources/old.pdf", ORPHAN_GRACE_MS + 1);
    const kbRecent = file("kb/ws1/sources/new.pdf", 1000);
    const other = file("brand/logo.png", ORPHAN_GRACE_MS * 5);
    const out = orphanBlobs({ files: [kbStale, kbRecent, other], rfpIds: new Set(), referencedUrls: new Set(), now });
    expect(out.map((f) => f.pathname)).toEqual([kbStale.pathname]);
  });
});
