import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { describe, it } from "node:test";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_DAY,
  PHOTO_DAILY_CAP_ERROR,
  PHOTO_TOO_LARGE_ERROR,
  PHOTO_UPLOAD_BODY_LIMIT_BYTES,
  isSystemGeneratedPhotoId,
  originalPhotoByteLength,
  photoExceedsByteCap,
  photoUploadBodyParser,
} from "./photoLimits";

describe("photo upload limits", () => {
  it("names the caps Chris asked for", () => {
    assert.equal(MAX_PHOTO_BYTES, 5 * 1024 * 1024);
    assert.equal(MAX_PHOTOS_PER_DAY, 10);
    assert.equal(PHOTO_TOO_LARGE_ERROR, "Photo is too large (max 5 MB).");
    assert.equal(
      PHOTO_DAILY_CAP_ERROR,
      "You can send up to 10 photos a day. Try again later.",
    );
  });

  it("measures decoded bytes and allows exactly 5 MB", () => {
    const exact = Buffer.alloc(MAX_PHOTO_BYTES, 7);
    const over = Buffer.alloc(MAX_PHOTO_BYTES + 1, 7);
    assert.equal(originalPhotoByteLength(exact.toString("base64")), MAX_PHOTO_BYTES);
    assert.equal(photoExceedsByteCap(exact.toString("base64")), false);
    assert.equal(photoExceedsByteCap(over.toString("base64")), true);
    assert.equal(
      originalPhotoByteLength(`data:image/jpeg;base64,${exact.toString("base64")}`),
      MAX_PHOTO_BYTES,
    );
    assert.equal(originalPhotoByteLength(""), 0);
  });

  it("leaves headroom above the base64 size of a 5 MB original", () => {
    const originalBase64 = Math.ceil(MAX_PHOTO_BYTES / 3) * 4;
    assert.ok(PHOTO_UPLOAD_BODY_LIMIT_BYTES > originalBase64);
    assert.ok(PHOTO_UPLOAD_BODY_LIMIT_BYTES > originalBase64 + 4 * 1024 * 1024);
  });

  it("does not treat stock or atlas seed ids as user sends", () => {
    assert.equal(isSystemGeneratedPhotoId("stock_pool_v1_p_1"), true);
    assert.equal(isSystemGeneratedPhotoId("stock_coffee_v2_p_3"), true);
    assert.equal(isSystemGeneratedPhotoId("atlas_global_seed_p_us"), true);
    assert.equal(isSystemGeneratedPhotoId("11111111-1111-1111-1111-111111111111"), false);
  });

  it("returns 413 JSON for an oversized upload body and accepts a small one", async () => {
    const app = express();
    app.use(photoUploadBodyParser);
    app.post("/api/photos", (req, res) => {
      const body = req.body as { imageBase64?: string };
      res.status(201).json({ ok: body.imageBase64 === "YQ==" });
    });
    app.post("/api/analyze-photo", express.json({ limit: "12mb" }), (_req, res) => {
      res.status(200).json({ ok: true });
    });
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    try {
      const small = await fetch(`http://127.0.0.1:${port}/api/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: "YQ==" }),
      });
      assert.equal(small.status, 201);
      assert.deepEqual(await small.json(), { ok: true });

      const over = await fetch(`http://127.0.0.1:${port}/api/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: `{"imageBase64":"${"A".repeat(PHOTO_UPLOAD_BODY_LIMIT_BYTES)}"}`,
      });
      assert.equal(over.status, 413);
      assert.deepEqual(await over.json(), { error: PHOTO_TOO_LARGE_ERROR });

      const other = await fetch(`http://127.0.0.1:${port}/api/analyze-photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: "YQ==" }),
      });
      assert.equal(other.status, 200);
    } finally {
      server.close();
      await once(server, "close");
    }
  });
});
