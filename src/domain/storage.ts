/**
 * What a file-storage failure means to the person who hit it. The S3 client
 * (Neon Object Storage) and, for files written before September 2026, the
 * Vercel Blob SDK throw typed errors; the operator can act on those, the
 * user cannot. So the message names the operator's fix and the app shows it
 * on the form instead of the crash screen. Pure: no I/O.
 */

const LEGACY_SUSPENDED = "This file is in the retired Vercel Blob store, which is suspended on Vercel (Storage → rfp-studio-uploads). Re-upload the file, or resume the store and run pnpm storage:migrate.";
const LEGACY_UNREACHABLE = "This file is in the retired Vercel Blob store and BLOB_READ_WRITE_TOKEN no longer reaches it. Re-upload the file.";
const UNREACHABLE = "File storage is not reachable from this server: check AWS_ENDPOINT_URL_S3, AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.";
const NO_BUCKET = "File storage bucket not found: STORAGE_BUCKET does not name a bucket on this Neon branch.";
const GONE = "That file is no longer in storage. Upload it again.";
const TOO_LARGE = "That file is larger than the storage limit.";
const NO_ANSWER = "File storage did not respond. Try again in a moment.";

const BY_NAME: Record<string, string> = {
  // Neon Object Storage / S3
  NoSuchKey: GONE,
  NotFound: GONE,
  NoSuchBucket: NO_BUCKET,
  AccessDenied: UNREACHABLE,
  InvalidAccessKeyId: UNREACHABLE,
  SignatureDoesNotMatch: UNREACHABLE,
  CredentialsProviderError: UNREACHABLE,
  EntityTooLarge: TOO_LARGE,
  SlowDown: NO_ANSWER,
  ServiceUnavailable: NO_ANSWER,
  InternalError: NO_ANSWER,
  RequestTimeout: NO_ANSWER,
  // Vercel Blob (legacy read path only)
  BlobStoreSuspendedError: LEGACY_SUSPENDED,
  BlobStoreNotFoundError: LEGACY_UNREACHABLE,
  BlobAccessError: LEGACY_UNREACHABLE,
  BlobClientTokenExpiredError: LEGACY_UNREACHABLE,
  BlobNotFoundError: GONE,
  BlobFileTooLargeError: TOO_LARGE,
  BlobRequestAbortedError: NO_ANSWER,
  BlobUnknownError: NO_ANSWER,
};

const NETWORK_CODES = new Set(["ENOTFOUND", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT"]);

/** A user-facing sentence for a storage error, or null when the error is not a storage failure at all. */
export function describeStorageFailure(error: { name?: string; message?: string; cause?: unknown }): string | null {
  if (error.name && BY_NAME[error.name]) return BY_NAME[error.name];
  const message = error.message ?? "";
  // Errors that crossed a job boundary arrive as plain Errors; the message still says what happened.
  if (/store has been suspended/i.test(message)) return LEGACY_SUSPENDED;
  if (/^Vercel Blob: /.test(message)) return NO_ANSWER;
  const code = (error.cause as { code?: string } | undefined)?.code;
  if (code && NETWORK_CODES.has(code)) return NO_ANSWER;
  if (/^fetch failed$/i.test(message)) return NO_ANSWER;
  return null;
}

const MISSING = new Set(["NoSuchKey", "NotFound", "BlobNotFoundError"]);

/** True when the error says the object does not exist, as opposed to storage being unreachable. */
export function isMissingObjectError(error: { name?: string }): boolean {
  return !!error.name && MISSING.has(error.name);
}

/** Files written before the move to Neon Object Storage are addressed by their Vercel Blob URL. */
export function isLegacyBlobUrl(handle: string): boolean {
  return /^https:\/\/[^/]+\.vercel-storage\.com\//.test(handle);
}

const KEY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * The object key for a logical pathname: a ten-character random suffix before
 * the extension, so two uploads of the same name never collide and a key can
 * never be guessed from the name alone (what Vercel Blob's addRandomSuffix did).
 */
export function storageKey(pathname: string, random: () => number = Math.random): string {
  let suffix = "";
  for (let i = 0; i < 10; i++) suffix += KEY_ALPHABET[Math.floor(random() * KEY_ALPHABET.length)];
  const slash = pathname.lastIndexOf("/");
  const dot = pathname.lastIndexOf(".");
  if (dot > slash + 1) return `${pathname.slice(0, dot)}-${suffix}${pathname.slice(dot)}`;
  return `${pathname}-${suffix}`;
}

/**
 * Thrown by the storage helpers in place of the SDK's error: the message is
 * safe to show as it stands, and the original error rides along as `cause`.
 * Actions return it to the form like an ActionError; jobs record it as the
 * job's failure reason.
 */
export class StorageUnavailableError extends Error {
  /** The object itself is gone (404 territory), rather than storage being down (503). */
  readonly missing: boolean;

  constructor(message: string, options?: { cause?: unknown; missing?: boolean }) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = "StorageUnavailableError";
    this.missing = options?.missing ?? false;
  }
}
