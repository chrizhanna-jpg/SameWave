import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { createHash, randomUUID } from "node:crypto";

/**
 * Photo bytes live in Cloudflare R2 only when every variable is set.
 * A partial set keeps today's Postgres base64 path so a deploy can land
 * before the bucket and keys exist.
 */
export const R2_ENV_VARS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

export type R2EnvVar = (typeof R2_ENV_VARS)[number];

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

export type PhotoObjectKind = "original" | "display" | "deck-preview" | "audio";

export type StoredPhotoObjects = {
  originalKey: string;
  displayKey: string | null;
  deckPreviewKey: string | null;
  audioKey: string | null;
};

type ObjectBody = {
  body: Buffer;
  contentType: string;
};

/**
 * Minimal send surface so tests can stand in for S3Client without network.
 * AWS command objects expose `input` and a constructor name.
 */
export type R2CommandSender = {
  send(command: { constructor: { name: string }; input?: unknown }): Promise<unknown>;
};

const PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";

let senderOverride: R2CommandSender | null = null;
let cachedClient: { signature: string; client: S3Client } | null = null;

function envValue(name: R2EnvVar): string {
  return process.env[name]?.trim() ?? "";
}

export function readR2Config(): R2Config | null {
  const accountId = envValue("R2_ACCOUNT_ID");
  const accessKeyId = envValue("R2_ACCESS_KEY_ID");
  const secretAccessKey = envValue("R2_SECRET_ACCESS_KEY");
  const bucket = envValue("R2_BUCKET");
  const publicBaseUrl = envValue("R2_PUBLIC_BASE_URL").replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

export function isR2Enabled(): boolean {
  return readR2Config() != null;
}

/** Set when some but not all R2 variables are present (a typo would silently stay on Postgres). */
export function r2ConfigWarning(): string | null {
  const present = R2_ENV_VARS.filter((name) => envValue(name).length > 0);
  if (present.length === 0 || present.length === R2_ENV_VARS.length) return null;
  const missing = R2_ENV_VARS.filter((name) => !present.includes(name));
  return `R2 photo storage is off until all of ${R2_ENV_VARS.join(", ")} are set. Missing: ${missing.join(", ")}.`;
}

export function setR2SenderForTests(sender: R2CommandSender | null): void {
  senderOverride = sender;
}

export function resetR2ForTests(): void {
  senderOverride = null;
  cachedClient = null;
}

export function newPhotoId(): string {
  return randomUUID();
}

export function photoObjectKey(photoId: string, kind: PhotoObjectKind): string {
  return `photos/${photoId}/${kind}`;
}

/** Public read URL. Null when R2 is not configured or the key is empty. */
export function publicObjectUrl(objectKey: string | null | undefined): string | null {
  const key = objectKey?.trim() ?? "";
  const cfg = readR2Config();
  if (!key || !cfg) return null;
  const encoded = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${cfg.publicBaseUrl}/${encoded}`;
}

/**
 * md5 of the first 4096 characters of the stored base64 text.
 * Matches Postgres `md5(substring(bytes_base64 from 1 for 4096))` for the
 * ASCII base64 we persist, so R2 rows dedupe against legacy byte rows.
 */
export function contentPrefixMd5(base64: string): string {
  const stripped = base64.replace(/^data:[^;]+;base64,/, "");
  return createHash("md5").update(stripped.slice(0, 4096), "utf8").digest("hex");
}

function clientSignature(cfg: R2Config): string {
  return `${cfg.accountId}\n${cfg.accessKeyId}\n${cfg.bucket}`;
}

function realClient(cfg: R2Config): S3Client {
  const signature = clientSignature(cfg);
  if (cachedClient && cachedClient.signature === signature) return cachedClient.client;
  const config: S3ClientConfig = {
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    // Account endpoint is path-style: https://<accountid>.r2.cloudflarestorage.com/<bucket>/<key>
    forcePathStyle: true,
    // SDK default CRC32 checksums are rejected by R2.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  };
  const client = new S3Client(config);
  cachedClient = { signature, client };
  return client;
}

async function sender(): Promise<R2CommandSender> {
  if (senderOverride) return senderOverride;
  const cfg = readR2Config();
  if (!cfg) {
    throw new Error("R2 is not configured");
  }
  return realClient(cfg);
}

function requireConfig(): R2Config {
  const cfg = readR2Config();
  if (!cfg) throw new Error("R2 is not configured");
  return cfg;
}

export async function putPhotoObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const cfg = requireConfig();
  const client = await sender();
  await client.send(
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: PUBLIC_CACHE_CONTROL,
    }),
  );
}

function isMissingObject(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  if (name === "NoSuchKey" || name === "NotFound") return true;
  const meta = "$metadata" in err ? err.$metadata : undefined;
  if (meta && typeof meta === "object" && "httpStatusCode" in meta) {
    return meta.httpStatusCode === 404;
  }
  return false;
}

export async function getPhotoObject(key: string): Promise<ObjectBody | null> {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const cfg = requireConfig();
  const client = await sender();
  try {
    const out = (await client.send(
      new GetObjectCommand({ Bucket: cfg.bucket, Key: trimmed }),
    )) as {
      Body?: { transformToByteArray?: () => Promise<Uint8Array> };
      ContentType?: string;
    };
    const bytes = await out.Body?.transformToByteArray?.();
    if (!bytes) return null;
    return {
      body: Buffer.from(bytes),
      contentType: out.ContentType?.trim() || "application/octet-stream",
    };
  } catch (err) {
    if (isMissingObject(err)) return null;
    throw err;
  }
}

export async function loadObjectBase64(key: string): Promise<string | null> {
  const obj = await getPhotoObject(key);
  if (!obj || obj.body.length === 0) return null;
  return obj.body.toString("base64");
}

export async function deletePhotoObjects(
  keys: Array<string | null | undefined>,
): Promise<void> {
  const objects = [
    ...new Set(keys.map((key) => key?.trim() ?? "").filter((key) => key.length > 0)),
  ];
  if (objects.length === 0 || !isR2Enabled()) return;
  const cfg = requireConfig();
  const client = await sender();
  await client.send(
    new DeleteObjectsCommand({
      Bucket: cfg.bucket,
      Delete: {
        Objects: objects.map((Key) => ({ Key })),
        Quiet: true,
      },
    }),
  );
}

export async function storeUploadedPhotoObjects(input: {
  photoId: string;
  original: { body: Buffer; contentType: string };
  display?: { body: Buffer; contentType: string } | null;
  deckPreview?: { body: Buffer; contentType: string } | null;
  audio?: { body: Buffer; contentType: string } | null;
}): Promise<StoredPhotoObjects> {
  const stored: StoredPhotoObjects = {
    originalKey: photoObjectKey(input.photoId, "original"),
    displayKey: input.display ? photoObjectKey(input.photoId, "display") : null,
    deckPreviewKey: input.deckPreview
      ? photoObjectKey(input.photoId, "deck-preview")
      : null,
    audioKey: input.audio ? photoObjectKey(input.photoId, "audio") : null,
  };
  const uploaded: string[] = [];
  const queue: Array<{ key: string; body: Buffer; contentType: string }> = [
    { key: stored.originalKey, ...input.original },
  ];
  if (input.display && stored.displayKey) {
    queue.push({ key: stored.displayKey, ...input.display });
  }
  if (input.deckPreview && stored.deckPreviewKey) {
    queue.push({ key: stored.deckPreviewKey, ...input.deckPreview });
  }
  if (input.audio && stored.audioKey) {
    queue.push({ key: stored.audioKey, ...input.audio });
  }
  try {
    for (const item of queue) {
      await putPhotoObject(item.key, item.body, item.contentType);
      uploaded.push(item.key);
    }
  } catch (err) {
    await deletePhotoObjects(uploaded).catch(() => undefined);
    throw err;
  }
  return stored;
}

/**
 * Image `uri` for clients that already accept either a data URI or an https URL.
 * Public R2 URL wins when a key is stored and R2 is configured. Otherwise the
 * Postgres bytes stay a data URI, which is what echo screens render today.
 */
export function resolveServedImageUri(input: {
  objectKey?: string | null;
  bytesBase64?: string | null;
  mimeType?: string | null;
}): string {
  const pub = publicObjectUrl(input.objectKey);
  if (pub) return pub;
  const b64 = input.bytesBase64?.trim() ?? "";
  if (!b64) return "";
  const mime = input.mimeType?.trim() || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

/**
 * `customAudioUrl` on candidates / atlas. expo-av plays both https and data URIs.
 * Echo theme and pair still need raw base64 fields — see `loadEchoAudioFields`.
 */
export function resolveServedAudioUrl(input: {
  objectKey?: string | null;
  bytesBase64?: string | null;
  mimeType?: string | null;
}): string | null {
  const pub = publicObjectUrl(input.objectKey);
  if (pub) return pub;
  const b64 = input.bytesBase64?.trim() ?? "";
  const mime = input.mimeType?.trim() ?? "";
  if (!b64 || !mime) return null;
  return `data:${mime};base64,${b64}`;
}

/**
 * Echo JSON still exposes customAudioBase64 + customAudioMime. The shipped app
 * builds `data:${mime};base64,${bytes}` from those two fields and ignores a URL.
 */
export async function loadEchoAudioFields(input: {
  bytesBase64?: string | null;
  mimeType?: string | null;
  objectKey?: string | null;
}): Promise<{ customAudioBase64: string | null; customAudioMime: string | null }> {
  const mime = input.mimeType?.trim() ?? "";
  const inline = input.bytesBase64?.trim() ?? "";
  if (inline && mime) {
    return { customAudioBase64: inline, customAudioMime: mime };
  }
  const key = input.objectKey?.trim() ?? "";
  if (key && mime) {
    try {
      const loaded = await loadObjectBase64(key);
      if (loaded) return { customAudioBase64: loaded, customAudioMime: mime };
    } catch {
      return { customAudioBase64: null, customAudioMime: null };
    }
  }
  return { customAudioBase64: null, customAudioMime: null };
}

export async function loadOriginalBase64(input: {
  bytesBase64?: string | null;
  originalKey?: string | null;
}): Promise<string | null> {
  const inline = input.bytesBase64?.replace(/^data:[^;]+;base64,/, "").trim() ?? "";
  if (inline) return inline;
  const key = input.originalKey?.trim() ?? "";
  if (!key) return null;
  return loadObjectBase64(key);
}

export function preferredImageKey(
  displayKey: string | null | undefined,
  originalKey: string | null | undefined,
): string | null {
  const display = displayKey?.trim() ?? "";
  if (display) return display;
  const original = originalKey?.trim() ?? "";
  return original || null;
}
