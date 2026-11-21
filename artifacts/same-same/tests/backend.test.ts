import assert from "node:assert/strict";
import { test } from "node:test";

import { matchBonuses } from "../core/bonuses";
import { createHttpBackend } from "../backend/http";
import { createSampleBackend, SAMPLE_TRAVEL_MS } from "../backend/sample";
import { BackendError, type RippleUpload } from "../backend/types";

const PIXELS = "A".repeat(200);
const DATA_URI = `data:image/jpeg;base64,${PIXELS}`;

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function fakeServer(
  respond: (call: Call, attempt: number) => { status: number; body?: unknown } | Error,
) {
  const calls: Call[] = [];
  const tokens: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? "GET",
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const result = respond(call, calls.length);
    if (result instanceof Error) throw result;
    return new Response(result.body === undefined ? "" : JSON.stringify(result.body), {
      status: result.status,
    });
  }) as typeof fetch;
  const backend = createHttpBackend({
    origin: "https://api.example/",
    fetchImpl,
    getToken: async (options) => {
      const token = options?.fresh ? "fresh-token" : "cached-token";
      tokens.push(token);
      return token;
    },
    getDeviceId: async () => "legacy-device-1",
  });
  return { backend, calls, tokens };
}

const upload: RippleUpload = {
  displayBase64: "DISPLAY",
  previewBase64: "PREVIEW",
  countryCode: "GB",
  captureCountryCode: null,
  capturedAt: "2026-11-01T10:00:00.000Z",
  emotion: "calm",
  song: "calm",
  topic: "nature",
  recording: null,
  localUri: "file:///photo.jpg",
};

test("sending a Ripple posts the photo in the shape the server stores", async () => {
  const { backend, calls } = fakeServer(() => ({
    status: 201,
    body: { id: "p1", theme: "coffee", tags: ["morning"], subjects: ["cup"], musicGenre: "calm" },
  }));
  const sent = await backend.sendRipple(upload);
  assert.deepEqual(sent, { photoId: "p1", theme: "coffee", tags: ["morning"], subjects: ["cup"] });
  const call = calls[0]!;
  assert.equal(call.method, "POST");
  assert.equal(call.url, "https://api.example/api/photos");
  assert.equal(call.headers.Authorization, "Bearer cached-token");
  assert.equal(call.headers["X-Device-Id"], "legacy-device-1");
  assert.deepEqual(call.body, {
    imageBase64: "DISPLAY",
    mimeType: "image/jpeg",
    displayBase64: "DISPLAY",
    deckPreviewBase64: "PREVIEW",
    countryCode: "GB",
    capturedAt: "2026-11-01T10:00:00.000Z",
    musicGenre: "calm",
    theme: "nature",
  });
});

test("a failed upload is reported, never swallowed, and never sent twice", async () => {
  const { backend, calls } = fakeServer(() => ({ status: 500, body: { error: "upload failed" } }));
  await assert.rejects(backend.sendRipple(upload), (error: unknown) => {
    assert.ok(error instanceof BackendError);
    assert.equal(error.kind, "server");
    return true;
  });
  assert.equal(calls.length, 1);
});

test("an expired session token is refreshed once and the request repeated", async () => {
  const { backend, calls, tokens } = fakeServer((_call, attempt) =>
    attempt === 1 ? { status: 401, body: { error: "authentication required" } } : { status: 200, body: { countryCode: "gb" } },
  );
  assert.equal(await backend.getCountry(), "GB");
  assert.equal(calls.length, 2);
  assert.deepEqual(tokens, ["cached-token", "fresh-token"]);
  assert.equal(calls[1]!.headers.Authorization, "Bearer fresh-token");
});

test("a session the server keeps refusing surfaces as signed out", async () => {
  const { backend } = fakeServer(() => ({ status: 401, body: { error: "authentication required" } }));
  await assert.rejects(backend.listWaves(), (error: unknown) => {
    assert.ok(error instanceof BackendError);
    assert.equal(error.kind, "signed-out");
    return true;
  });
});

test("reads are retried once when the server is asleep, then reported", async () => {
  const asleep = fakeServer((_call, attempt) =>
    attempt === 1 ? new TypeError("Network request failed") : { status: 200, body: { echoes: [] } },
  );
  assert.deepEqual(await asleep.backend.listWaves(), []);
  assert.equal(asleep.calls.length, 2);

  const down = fakeServer(() => new TypeError("Network request failed"));
  await assert.rejects(down.backend.listWaves(), (error: unknown) => {
    assert.ok(error instanceof BackendError);
    assert.equal(error.kind, "unreachable");
    return true;
  });
  assert.equal(down.calls.length, 2);
});

test("Waves come back with my photo and theirs, and capture country wins", async () => {
  const { backend } = fakeServer(() => ({
    status: 200,
    body: {
      echoes: [
        {
          id: 42,
          state: "mutual",
          createdAt: "2026-10-01T00:00:00.000Z",
          mutualAt: "2026-10-02T08:00:00.000Z",
          mine: {
            id: "mine-1",
            uri: DATA_URI,
            countryCode: "GB",
            captureCountryCode: "fr",
            capturedAt: "2026-10-01T09:00:00.000Z",
            createdAt: "2026-10-01T10:00:00.000Z",
          },
          theirs: {
            id: "theirs-1",
            uri: "data:null;base64,null",
            countryCode: null,
            captureCountryCode: null,
            capturedAt: null,
            createdAt: "2026-10-01T12:00:00.000Z",
          },
        },
        { id: "broken", mine: null, theirs: null },
      ],
    },
  }));
  const waves = await backend.listWaves();
  assert.equal(waves.length, 1);
  assert.deepEqual(waves[0], {
    id: "42",
    formedAt: "2026-10-02T08:00:00.000Z",
    mine: {
      photoId: "mine-1",
      uri: DATA_URI,
      countryCode: "FR",
      takenAt: "2026-10-01T09:00:00.000Z",
    },
    theirs: {
      photoId: "theirs-1",
      uri: null,
      countryCode: null,
      takenAt: "2026-10-01T12:00:00.000Z",
    },
  });
});

test("looking for matches sends the photo's labels and never its feeling", async () => {
  const { backend, calls } = fakeServer(() => ({
    status: 200,
    body: {
      photos: [
        { id: "a", uri: "/api/photos/a/image", score: 23, createdAt: "2026-10-01T00:00:00Z" },
        { id: "s", uri: "https://images.unsplash.com/photo-1?w=960", score: "31" },
        { uri: "/api/photos/missing-id/image" },
      ],
    },
  }));
  const found = await backend.findCandidates({
    theme: "coffee",
    tags: ["morning", "cozy"],
    subjects: ["cup"],
    emotion: "calm",
    limit: 50,
    excludeIds: ["x1", "x2"],
  });
  assert.deepEqual(found.map((c) => [c.id, c.score]), [["a", 23], ["s", 31]]);
  const url = new URL(calls[0]!.url);
  assert.equal(url.pathname, "/api/photos/candidates");
  assert.equal(url.searchParams.get("theme"), "coffee");
  assert.equal(url.searchParams.get("tags"), "morning,cozy");
  assert.equal(url.searchParams.get("subjects"), "cup");
  assert.equal(url.searchParams.get("excludeIds"), "x1,x2");
  assert.equal(url.searchParams.get("musicGenre"), "calm");
});

test("an offer is a 'same' vote made on behalf of my photo", async () => {
  const { backend, calls } = fakeServer((call) => ({
    status: 200,
    body: { ok: true, echo: call.url.endsWith("/photos/first/vote") ? "pending" : "mutual" },
  }));
  assert.equal(await backend.offer("mine-1", "first"), "waiting");
  assert.equal(await backend.offer("mine-1", "second"), "wave");
  assert.deepEqual(calls[0]!.body, { verdict: "same", voterPhotoId: "mine-1" });
});

test("incoming offers are read from the inbox and accepted with 'same'", async () => {
  const { backend, calls } = fakeServer((call) =>
    call.method === "GET"
      ? {
          status: 200,
          body: {
            echoes: [
              {
                id: "e9",
                createdAt: "2026-10-03T00:00:00Z",
                mine: { id: "mine-1" },
                theirs: { id: "theirs-9" },
              },
            ],
          },
        }
      : { status: 200, body: { ok: true, state: "mutual" } },
  );
  const offers = await backend.listOffers();
  assert.deepEqual(offers, [
    { id: "e9", myPhotoId: "mine-1", theirPhotoId: "theirs-9", createdAt: "2026-10-03T00:00:00.000Z" },
  ]);
  await backend.acceptOffer("e9");
  assert.equal(calls[1]!.url, "https://api.example/api/echoes/e9/respond");
  assert.deepEqual(calls[1]!.body, { verdict: "same" });
});

test("a Wave's feelings are read with my photo first", async () => {
  const { backend, calls } = fakeServer(() => ({
    status: 200,
    body: {
      a: { id: "mine-1", musicGenre: "calm", customAudioBase64: null, customAudioMime: null },
      b: { id: "theirs-1", musicGenre: null, customAudioBase64: "QUJD", customAudioMime: "audio/mp4" },
    },
  }));
  const detail = await backend.getWaveDetail({
    id: "w",
    formedAt: null,
    mine: { photoId: "mine-1", uri: null, countryCode: null, takenAt: null },
    theirs: { photoId: "theirs-1", uri: null, countryCode: null, takenAt: null },
  });
  assert.equal(calls[0]!.url, "https://api.example/api/echoes/pair?a=mine-1&b=theirs-1");
  assert.deepEqual(detail, {
    mine: { vibe: "calm", recordingUri: null },
    theirs: { vibe: null, recordingUri: "data:audio/mp4;base64,QUJD" },
  });
});

function memoryStore() {
  let value: string | null = null;
  return {
    read: async () => value,
    write: async (next: string) => {
      value = next;
    },
  };
}

test("sample mode seeds a Wave for every bonus level", async () => {
  const sample = createSampleBackend(memoryStore(), () => Date.parse("2026-11-21T09:00:00Z"));
  const headlines = (await sample.listWaves()).map(
    (w) =>
      matchBonuses(
        { takenAt: w.mine.takenAt, countryCode: w.mine.countryCode },
        { takenAt: w.theirs.takenAt, countryCode: w.theirs.countryCode },
      ).headline,
  );
  for (const expected of [
    "Same hour, same country",
    "Same day, same continent",
    "Same week",
    "Same month, same country",
    "Same continent",
    "Same day, same country",
    "Same hour",
    null,
  ]) {
    assert.ok(headlines.includes(expected), String(expected));
  }
});

test("sample mode has several Waves inside one country", async () => {
  const sample = createSampleBackend(memoryStore());
  const waves = await sample.listWaves();
  const sameCountry = waves.filter(
    (w) => w.mine.countryCode === "GB" && w.theirs.countryCode === "GB",
  );
  assert.ok(sameCountry.length >= 3);
});

test("a sample Ripple is answered by a Wave after it has travelled", async () => {
  let now = Date.parse("2026-11-21T09:00:00Z");
  const store = memoryStore();
  const sample = createSampleBackend(store, () => now);
  const before = (await sample.listWaves()).length;
  const sent = await sample.sendRipple(upload);

  assert.equal((await sample.listWaves()).length, before);
  now += SAMPLE_TRAVEL_MS;
  const waves = await sample.listWaves();
  assert.equal(waves.length, before + 1);
  assert.equal(waves[0]?.mine.photoId, sent.photoId);
  assert.equal(waves[0]?.mine.uri, "file:///photo.jpg");

  // It survives a restart of the app.
  const reopened = createSampleBackend(store, () => now);
  assert.equal((await reopened.listWaves()).length, before + 1);
  assert.equal((await reopened.getWaveDetail(waves[0]!)).mine.vibe, "calm");
});

test("sample tools can bring a Wave in at once and start again", async () => {
  const now = Date.parse("2026-11-21T09:00:00Z");
  const sample = createSampleBackend(memoryStore(), () => now);
  const before = (await sample.listWaves()).length;
  await sample.sendRipple(upload);
  await sample.arriveNow();
  assert.equal((await sample.listWaves()).length, before + 1);
  await sample.reset();
  assert.equal((await sample.listWaves()).length, before);
});
