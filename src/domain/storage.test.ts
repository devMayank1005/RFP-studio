import { describe, expect, it } from "vitest";

import { describeStorageFailure } from "./storage";

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
