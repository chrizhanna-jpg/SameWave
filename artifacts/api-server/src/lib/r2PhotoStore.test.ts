import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
  contentPrefixMd5,
  deletePhotoObjects,
  getPhotoObject,
  isR2Enabled,
  photoObjectKey,
  publicObjectUrl,
  r2ConfigWarning,
  readR2Config,
  resetR2ForTests,
  resolveServedAudioUrl,
  resolveServedImageUri,
  setR2SenderForTests,
  storeUploadedPhotoObjects,
  type R2CommandSender,
} from "./r2PhotoStore";

const ENV_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

const saved: Record<string, string | undefined> = {};

function rememberEnv(): void {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

function fillEnv(): void {
  process.env.R2_ACCOUNT_ID = "acct";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.R2_BUCKET = "samewave-photos";
  process.env.R2_PUBLIC_BASE_URL = "https://pub-example.r2.dev/";
}

class FakeS3 implements R2CommandSender {
  commands: Array<{ name: string; input: Record<string, unknown> }> = [];
  missing = false;

  async send(command: {
    constructor: { name: string };
    input?: unknown;
  }): Promise<unknown> {
    const input = (command.input ?? {}) as Record<string, unknown>;
    this.commands.push({ name: command.constructor.name, input });
    if (command instanceof GetObjectCommand || command.constructor.name === "GetObjectCommand") {
      if (this.missing) {
        const err = new Error("missing");
        err.name = "NoSuchKey";
        throw err;
      }
      return {
        Body: {
          transformToByteArray: async () => Uint8Array.from(Buffer.from("jpeg-bytes")),
        },
        ContentType: "image/jpeg",
      };
    }
    return {};
  }
}

describe("r2 photo store", () => {
  afterEach(() => {
    restoreEnv();
    resetR2ForTests();
  });

  it("stays disabled unless every env var is set", () => {
    rememberEnv();
    for (const key of ENV_KEYS) delete process.env[key];
    assert.equal(isR2Enabled(), false);
    assert.equal(r2ConfigWarning(), null);
    assert.equal(publicObjectUrl("photos/abc/display"), null);

    process.env.R2_BUCKET = "samewave-photos";
    process.env.R2_ACCOUNT_ID = "acct";
    assert.equal(isR2Enabled(), false);
    assert.match(r2ConfigWarning() ?? "", /Missing:.*R2_ACCESS_KEY_ID/);
    assert.equal(readR2Config(), null);
  });

  it("builds a public URL and prefers it over inline bytes", () => {
    rememberEnv();
    fillEnv();
    assert.equal(isR2Enabled(), true);
    assert.equal(r2ConfigWarning(), null);
    assert.equal(
      publicObjectUrl("photos/abc/display"),
      "https://pub-example.r2.dev/photos/abc/display",
    );
    assert.equal(
      resolveServedImageUri({
        objectKey: "photos/abc/display",
        bytesBase64: "AAAA",
        mimeType: "image/jpeg",
      }),
      "https://pub-example.r2.dev/photos/abc/display",
    );
    assert.equal(
      resolveServedAudioUrl({
        objectKey: "photos/abc/audio",
        mimeType: "audio/mp4",
        bytesBase64: "QQ==",
      }),
      "https://pub-example.r2.dev/photos/abc/audio",
    );
  });

  it("keeps data URIs when R2 is off, matching current clients", () => {
    rememberEnv();
    for (const key of ENV_KEYS) delete process.env[key];
    assert.equal(
      resolveServedImageUri({
        objectKey: "photos/abc/display",
        bytesBase64: "AAAA",
        mimeType: "image/jpeg",
      }),
      "data:image/jpeg;base64,AAAA",
    );
    assert.equal(
      resolveServedAudioUrl({
        bytesBase64: "QQ==",
        mimeType: "audio/mp4",
      }),
      "data:audio/mp4;base64,QQ==",
    );
    assert.equal(resolveServedImageUri({ bytesBase64: "  " }), "");
    assert.equal(resolveServedAudioUrl({ bytesBase64: "QQ==" }), null);
  });

  it("hashes only the first 4096 base64 characters", () => {
    const prefix = "a".repeat(4096);
    const longer = `${prefix}${"b".repeat(50)}`;
    assert.equal(contentPrefixMd5("abc"), "900150983cd24fb0d6963f7d28e17f72");
    assert.equal(contentPrefixMd5(longer), contentPrefixMd5(prefix));
    assert.notEqual(contentPrefixMd5(longer), contentPrefixMd5("b".repeat(4096)));
    assert.equal(
      contentPrefixMd5("data:image/jpeg;base64,abc"),
      contentPrefixMd5("abc"),
    );
  });

  it("writes, reads, and deletes objects through the S3 client", async () => {
    rememberEnv();
    fillEnv();
    const fake = new FakeS3();
    setR2SenderForTests(fake);

    const stored = await storeUploadedPhotoObjects({
      photoId: "11111111-1111-1111-1111-111111111111",
      original: { body: Buffer.from("original"), contentType: "image/jpeg" },
      display: { body: Buffer.from("display"), contentType: "image/jpeg" },
      deckPreview: { body: Buffer.from("preview"), contentType: "image/jpeg" },
      audio: { body: Buffer.from("audio"), contentType: "audio/mp4" },
    });
    assert.equal(
      stored.originalKey,
      photoObjectKey("11111111-1111-1111-1111-111111111111", "original"),
    );
    assert.equal(stored.displayKey, "photos/11111111-1111-1111-1111-111111111111/display");
    assert.equal(
      stored.deckPreviewKey,
      "photos/11111111-1111-1111-1111-111111111111/deck-preview",
    );
    assert.equal(stored.audioKey, "photos/11111111-1111-1111-1111-111111111111/audio");
    assert.equal(fake.commands.length, 4);
    assert.ok(fake.commands.every((cmd) => cmd.name === "PutObjectCommand"));
    const put = fake.commands[0]!;
    assert.equal(put.input.Bucket, "samewave-photos");
    assert.equal(put.input.Key, stored.originalKey);
    assert.equal(put.input.ContentType, "image/jpeg");
    assert.equal(put.input.CacheControl, "public, max-age=31536000, immutable");
    assert.ok(Buffer.isBuffer(put.input.Body));

    const got = await getPhotoObject(stored.displayKey!);
    assert.equal(got?.body.toString(), "jpeg-bytes");
    assert.equal(got?.contentType, "image/jpeg");
    assert.ok(fake.commands.at(-1)?.name === "GetObjectCommand");

    fake.missing = true;
    assert.equal(await getPhotoObject(stored.originalKey), null);

    fake.missing = false;
    await deletePhotoObjects([stored.originalKey, null, "", stored.audioKey, stored.originalKey]);
    const deleted = fake.commands.at(-1)!;
    assert.equal(deleted.name, "DeleteObjectsCommand");
    const payload = deleted.input.Delete as {
      Objects: Array<{ Key: string }>;
      Quiet: boolean;
    };
    assert.equal(payload.Quiet, true);
    assert.deepEqual(
      payload.Objects.map((obj) => obj.Key).sort(),
      [stored.audioKey, stored.originalKey].sort(),
    );
    assert.ok(new PutObjectCommand({ Bucket: "b", Key: "k" }));
    assert.ok(new DeleteObjectsCommand({ Bucket: "b", Delete: { Objects: [] } }));
  });

  it("does not call S3 when deleting with R2 disabled", async () => {
    rememberEnv();
    for (const key of ENV_KEYS) delete process.env[key];
    const fake = new FakeS3();
    setR2SenderForTests(fake);
    await deletePhotoObjects(["photos/abc/original"]);
    assert.equal(fake.commands.length, 0);
  });

  it("removes objects already uploaded when a later put fails", async () => {
    rememberEnv();
    fillEnv();
    const fake = new FakeS3();
    const realSend = fake.send.bind(fake);
    let puts = 0;
    fake.send = async (command) => {
      if (command.constructor.name === "PutObjectCommand") {
        puts += 1;
        if (puts === 2) throw new Error("r2 down");
      }
      return realSend(command);
    };
    setR2SenderForTests(fake);
    await assert.rejects(() =>
      storeUploadedPhotoObjects({
        photoId: "photo-1",
        original: { body: Buffer.from("o"), contentType: "image/jpeg" },
        display: { body: Buffer.from("d"), contentType: "image/jpeg" },
      }),
    );
    assert.ok(fake.commands.some((cmd) => cmd.name === "DeleteObjectsCommand"));
  });
});
