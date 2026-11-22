/**
 * Everything the app asks of a server, in one interface.
 *
 * Two implementations exist: `http.ts` talks to the SameWave API, and
 * `sample.ts` is an in-memory stand-in used only by unit tests.
 * Every method either returns what it promises or throws a BackendError.
 * Nothing here returns null, [] or false to hide a failure.
 */
import type { CaptureCountrySource } from "../core/captureCountry";
import type { Candidate, Offer, Wave } from "../core/types";

export type BackendErrorKind =
  /** No connection, or the server did not answer in time. */
  | "unreachable"
  /** The session is missing or was refused. */
  | "signed-out"
  /** The thing asked for is not there. */
  | "not-found"
  /** The server understood and said no. */
  | "rejected"
  /** The server failed. */
  | "server";

export class BackendError extends Error {
  readonly kind: BackendErrorKind;
  readonly status: number | null;

  constructor(kind: BackendErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "BackendError";
    this.kind = kind;
    this.status = status;
  }
}

export function errorKind(error: unknown): BackendErrorKind {
  return error instanceof BackendError ? error.kind : "server";
}

export interface RippleUpload {
  /** JPEG, about 960 pixels wide, base64 without a data: prefix. */
  displayBase64: string;
  /** JPEG, about 480 pixels wide, base64 without a data: prefix. */
  previewBase64: string;
  /** The user's home country. */
  countryCode: string | null;
  /** Where the photo was taken, when the device could tell. */
  captureCountryCode: string | null;
  /** Provenance for captureCountryCode — persisted by the API when valid. */
  captureCountrySource?: CaptureCountrySource | null;
  /** When the photo was taken. ISO string. */
  capturedAt: string | null;
  /** Feeling id from data/emotions.ts — persisted as `emotion` on the server. */
  emotion: string | null;
  /**
   * Library mood / song id from data/vibes.ts → musicGenre on the server.
   * Drives Wave playback clips; never used as the Feeling chip.
   */
  song: string | null;
  /** Topic id from data/topics.ts → theme on the server. */
  topic: string | null;
  recording: { base64: string; mime: string } | null;
  /** The photo on this device. Test backends may read it; the HTTP API uploads the file. */
  localUri: string;
}

export interface SentRipple {
  photoId: string;
  theme: string;
  tags: string[];
  subjects: string[];
}

export interface CandidateQuery {
  theme: string;
  tags: string[];
  subjects: string[];
  /** Emotion id → musicGenre query on the server. */
  emotion: string | null;
  limit: number;
  /** Photos already looked at in this search. */
  excludeIds: string[];
  /**
   * The voter's own Ripple photo id — used so the server can flag candidates
   * who already have a pending offer aimed at this photo (`wavedAtYou`).
   */
  voterPhotoId?: string | null;
}

export type OfferResult = "waiting" | "wave" | "skipped";

export interface VibeDetail {
  vibe: string | null;
  /** A playable recording, when one was sent with the photo. */
  recordingUri: string | null;
  /** Emotion id when the pair payload includes one. */
  emotion?: string | null;
  /** Topic / theme id when the pair payload includes one. */
  topic?: string | null;
}

export interface WaveDetail {
  mine: VibeDetail;
  theirs: VibeDetail;
}

export interface ImageSource {
  uri: string;
  headers?: Record<string, string>;
}

export interface Backend {
  /** The user's saved home country. */
  getCountry(): Promise<string | null>;
  setCountry(countryCode: string): Promise<void>;

  sendRipple(upload: RippleUpload): Promise<SentRipple>;
  deletePhoto(photoId: string): Promise<void>;
  reportPhoto(photoId: string, reason: string): Promise<void>;

  /** Photos most like the one described, closest first. */
  findCandidates(query: CandidateQuery): Promise<Candidate[]>;
  /** Offers `myPhotoId` to `theirPhotoId`. "wave" means they had already offered. */
  offer(myPhotoId: string, theirPhotoId: string): Promise<OfferResult>;
  /** Match-screen pass (X): records verdict "different" so the photo stays out of the deck. */
  pass(photoId: string): Promise<void>;

  /** Offers from other people waiting on one of the user's photos. */
  listOffers(): Promise<Offer[]>;
  acceptOffer(offerId: string): Promise<void>;

  listWaves(): Promise<Wave[]>;
  /** The feeling and sound each side sent. */
  getWaveDetail(wave: Wave): Promise<WaveDetail>;

  registerPushToken(token: string, platform: "ios" | "android" | "web"): Promise<void>;
  /**
   * Remove this device token so the server stops pushing.
   * Older servers may not expose DELETE — callers should treat failure as
   * "local off only" and still stop registering.
   */
  unregisterPushToken(token: string): Promise<void>;

  /** How to load one of the user's own photos straight from the server. */
  photoSource(photoId: string): Promise<ImageSource>;
}
