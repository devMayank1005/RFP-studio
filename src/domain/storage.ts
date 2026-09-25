/**
 * What a Vercel Blob failure means to the person who hit it. The SDK throws
 * typed errors (BlobStoreSuspendedError, BlobAccessError, …); the operator can
 * act on those, the user cannot. So the message names the operator's fix and
 * the app shows it on the form instead of the crash screen. Pure: no I/O.
 */

const SUSPENDED = "File storage is suspended on Vercel (Storage → rfp-studio-uploads). Uploads, Quick Q&A, document ingest and exports are paused until it is resumed.";
const UNREACHABLE = "File storage is not reachable from this server: the BLOB_READ_WRITE_TOKEN is missing, expired or belongs to another store.";
const TOO_LARGE = "That file is larger than the storage limit.";
const NO_ANSWER = "File storage did not respond. Try again in a moment.";

const BY_NAME: Record<string, string> = {
  BlobStoreSuspendedError: SUSPENDED,
  BlobStoreNotFoundError: UNREACHABLE,
  BlobAccessError: UNREACHABLE,
  BlobClientTokenExpiredError: UNREACHABLE,
  BlobFileTooLargeError: TOO_LARGE,
  BlobRequestAbortedError: NO_ANSWER,
  BlobUnknownError: NO_ANSWER,
};

/** A user-facing sentence for a Blob SDK error, or null when the error is not a storage failure at all. */
export function describeStorageFailure(error: { name?: string; message?: string }): string | null {
  if (error.name && BY_NAME[error.name]) return BY_NAME[error.name];
  const message = error.message ?? "";
  // Errors that crossed a job boundary arrive as plain Errors; the message still says what happened.
  if (/store has been suspended/i.test(message)) return SUSPENDED;
  if (/^Vercel Blob: /.test(message)) return NO_ANSWER;
  return null;
}

/**
 * Thrown by the storage helpers in place of the SDK's error: the message is
 * safe to show as it stands, and the original error rides along as `cause`.
 * Actions return it to the form like an ActionError; jobs record it as the
 * job's failure reason.
 */
export class StorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StorageUnavailableError";
  }
}
