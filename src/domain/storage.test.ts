import { describe, expect, it } from "vitest";

import { StorageUnavailableError, describeStorageFailure, isLegacyBlobUrl, isMissingObjectError, storageKey } from "./storage";

/**
 * Vercel Blob failures are the operator's problem, not the user's: a
 * suspended store or a bad token must read as one plain sentence on the
 * form that tried to upload, never as the crash screen.
 */
describe("describeStorageFailure", () => {
  it("names a suspended store by the SDK's error class", () => {
    expect(describeStorageFailure({ name: "BlobStoreSuspendedError", message: "Vercel Blob: This store has been suspended." })).toMatch(/suspended on Vercel/);
  });

  it("recognises a suspended store from the message alone, as it arrives across a job boundary", () => {
    expect(describeStorageFailure({ name: "Error", message: "Vercel Blob: This store has been suspended." })).toMatch(/suspended on Vercel/);
  });

  it("explains a missing or wrong token", () => {
    expect(describeStorageFailure({ name: "BlobAccessError", message: "Vercel Blob: Access denied" })).toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(describeStorageFailure({ name: "BlobStoreNotFoundError", message: "" })).toMatch(/BLOB_READ_WRITE_TOKEN/);
  });

  it("says when a file is too large or the service did not answer", () => {
    expect(describeStorageFailure({ name: "BlobFileTooLargeError", message: "" })).toMatch(/larger/);
    expect(describeStorageFailure({ name: "BlobRequestAbortedError", message: "" })).toMatch(/did not respond/);
  });

  it("returns null for anything that is not a storage failure", () => {
    expect(describeStorageFailure({ name: "TypeError", message: "x is not a function" })).toBeNull();
    expect(describeStorageFailure({})).toBeNull();
  });
});

describe("describeStorageFailure · S3-compatible storage (Neon Object Storage)", () => {
  it("says when a file is gone, when the credentials are wrong, and when the service is busy", () => {
    expect(describeStorageFailure({ name: "NoSuchKey", message: "The specified key does not exist." })).toMatch(/no longer in storage/);
    expect(describeStorageFailure({ name: "NotFound", message: "" })).toMatch(/no longer in storage/);
    expect(describeStorageFailure({ name: "AccessDenied", message: "Access Denied" })).toMatch(/AWS_ACCESS_KEY_ID/);
    expect(describeStorageFailure({ name: "InvalidAccessKeyId", message: "" })).toMatch(/AWS_ACCESS_KEY_ID/);
    expect(describeStorageFailure({ name: "NoSuchBucket", message: "" })).toMatch(/STORAGE_BUCKET/);
    expect(describeStorageFailure({ name: "SlowDown", message: "" })).toMatch(/did not respond/);
    expect(describeStorageFailure({ name: "TypeError", message: "fetch failed", cause: { code: "ENOTFOUND" } } as { name: string; message: string })).toMatch(/did not respond/);
  });

  it("still recognises the retired Vercel Blob store and says so", () => {
    expect(describeStorageFailure({ name: "BlobStoreSuspendedError", message: "Vercel Blob: This store has been suspended." })).toMatch(/retired Vercel Blob store/);
  });
});

describe("storage handles", () => {
  it("tells a legacy Vercel Blob URL from an object key", () => {
    expect(isLegacyBlobUrl("https://omcex3iudyplseft.private.blob.vercel-storage.com/rfps/a/uploads/x-abc.xlsx")).toBe(true);
    expect(isLegacyBlobUrl("rfps/a/uploads/x-abc.xlsx")).toBe(false);
    expect(isLegacyBlobUrl("https://example.com/file.pdf")).toBe(false);
  });

  it("keys keep the folder and extension and never collide", () => {
    const a = storageKey("rfps/r1/uploads/Book_2.xlsx");
    const b = storageKey("rfps/r1/uploads/Book_2.xlsx");
    expect(a).toMatch(/^rfps\/r1\/uploads\/Book_2-[A-Za-z0-9]{10}\.xlsx$/);
    expect(a).not.toBe(b);
    expect(storageKey("rfps/r1/parsed/paste.json")).toMatch(/^rfps\/r1\/parsed\/paste-[A-Za-z0-9]{10}\.json$/);
    expect(storageKey("kb/w/sources/README")).toMatch(/^kb\/w\/sources\/README-[A-Za-z0-9]{10}$/);
  });
});

describe("StorageUnavailableError", () => {
  it("knows when the object is simply gone, so a download can answer 404 instead of 503", () => {
    expect(isMissingObjectError({ name: "NoSuchKey" })).toBe(true);
    expect(isMissingObjectError({ name: "NotFound" })).toBe(true);
    expect(isMissingObjectError({ name: "BlobNotFoundError" })).toBe(true);
    expect(isMissingObjectError({ name: "AccessDenied" })).toBe(false);
    expect(new StorageUnavailableError("gone", { missing: true }).missing).toBe(true);
    expect(new StorageUnavailableError("down").missing).toBe(false);
  });
});
