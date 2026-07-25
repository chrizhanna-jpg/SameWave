/**
 * Capture → Match transition contract.
 * Keep navigation off the network and heavy base64 work; register local
 * display URIs in the image cache before routing to Ripple.
 */

import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";
import {
  FEED_THUMB_WIDTH,
  IMAGE_LOAD_V2,
  UPLOAD_THUMB_JPEG_QUALITY,
} from "@/constants/imageLoading";
import type { MusicGenre } from "@/data/musicLibrary";
import { prepareUploadImages } from "@/utils/uploadImageProcessing";
import { uploadPhoto } from "@/utils/api";
import { postDebugSessionLog } from "@/utils/debugSessionLog";
import {
  prioritizeHeroPrefetch,
  recordImageLoadComplete,
} from "@/utils/imageLoadCache";
import type { MyPhotoUploadAck } from "@/context/AppContext";
import {
  persistLocalPhotoCapture,
  resolveCaptureSourceUri,
} from "@/utils/localPhotoCache";

export const CAPTURE_FAST_MATCH =
  IMAGE_LOAD_V2 ||
  process.env.EXPO_PUBLIC_CAPTURE_FAST_MATCH === "true" ||
  process.env.EXPO_PUBLIC_CAPTURE_FAST_MATCH === "1";

export type CaptureTransitionEvent =
  | "capture.time"
  | "thumbnail.write.time"
  | "navigate.to.match.start"
  | "navigate.to.match.complete"
  | "upload.start"
  | "upload.complete"
  | "cache.write.success"
  | "cache.write.failure"
  | "decode.time"
  | "request.cancelled";

type CaptureTransitionPayload = {
  event: CaptureTransitionEvent;
  detail?: Record<string, unknown>;
};

let activeRequestId: string | null = null;
let transitionInProgress = false;
let requestCounter = 0;

export function nextCaptureRequestId(): string {
  requestCounter += 1;
  const id = `cap-${Date.now()}-${requestCounter}`;
  activeRequestId = id;
  return id;
}

export function getActiveCaptureRequestId(): string | null {
  return activeRequestId;
}

export function isCaptureRequestCurrent(requestId: string): boolean {
  return activeRequestId === requestId;
}

export function beginCaptureTransition(requestId: string): void {
  activeRequestId = requestId;
  transitionInProgress = true;
}

export function endCaptureTransition(): void {
  transitionInProgress = false;
}

export function isCaptureTransitionInProgress(): boolean {
  return transitionInProgress;
}

export function recordCaptureTransitionEvent(
  event: CaptureTransitionEvent,
  detail?: Record<string, unknown>,
): void {
  const payload: CaptureTransitionPayload = {
    event,
    detail: { ...detail, at: Date.now(), requestId: activeRequestId ?? undefined },
  };
  if (__DEV__) {
    postDebugSessionLog({
      hypothesisId: "H-capture-match",
      location: "captureTransition",
      message: event,
      data: payload.detail ?? {},
    });
  }
}

/** Immediate in-memory + hero prefetch so Ripple paints file:// without waiting. */
export function registerCaptureDisplayUri(uri: string, requestId: string): void {
  const normalized = uri.trim();
  if (!normalized) return;
  try {
    recordImageLoadComplete(normalized, 0);
    prioritizeHeroPrefetch(normalized);
    recordCaptureTransitionEvent("cache.write.success", { uriLen: normalized.length, requestId });
  } catch {
    recordCaptureTransitionEvent("cache.write.failure", { requestId });
  }
}

/**
 * Small JPEG beside the display crop — written before navigation when fast
 * match is enabled so decode stays within display size on low-end devices.
 */
export async function writeCaptureThumbnail(
  sourceUri: string,
  requestId: string,
): Promise<string> {
  const started = Date.now();
  const out = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: FEED_THUMB_WIDTH } }],
    {
      compress: UPLOAD_THUMB_JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: false,
    },
  );
  const thumbUri = out.uri?.trim() ?? "";
  if (thumbUri) {
    registerCaptureDisplayUri(thumbUri, requestId);
  }
  recordCaptureTransitionEvent("thumbnail.write.time", {
    ms: Date.now() - started,
    requestId,
  });
  return thumbUri || sourceUri;
}

async function readBase64FromUri(uri: string): Promise<string | null> {
  try {
    const raw = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return raw?.trim() ? raw : null;
  } catch {
    return null;
  }
}

export type BackgroundPhotoUploadInput = {
  requestId: string;
  localUri: string;
  /** Stable row id from addMyPhoto — used to read durable copy if cache is purged. */
  localId?: string;
  theme: string;
  tags: string[];
  musicGenre?: MusicGenre;
  captureCountryCode?: string;
  capturedAt?: string;
  myCountryCode?: string;
  subjects?: string[];
  customAudioBase64?: string;
  customAudioMime?: string;
};

export function startBackgroundPhotoUpload(
  input: BackgroundPhotoUploadInput,
  handlers: {
    setMyPhotoBackendId: (uri: string, ack: MyPhotoUploadAck, localId?: string) => void;
    setMyPhotoUploadState: (
      uri: string,
      state: "ok" | "failed" | "pending",
      localId?: string,
    ) => void;
    requestAtlasRefresh?: () => void;
  },
): void {
  const { requestId, localUri, localId } = input;
  if (!localUri.trim()) return;
  recordCaptureTransitionEvent("upload.start", { requestId });
  void (async () => {
    if (!isCaptureRequestCurrent(requestId)) {
      recordCaptureTransitionEvent("request.cancelled", { phase: "upload", requestId });
      return;
    }
    try {
      const persisted = localId
        ? await persistLocalPhotoCapture(localUri, localId)
        : null;
      const sourceUri = await resolveCaptureSourceUri(
        persisted?.fullUri ?? localUri,
        localId,
      );
      const rawBase64 = await readBase64FromUri(sourceUri);
      if (!rawBase64) {
        handlers.setMyPhotoUploadState(localUri, "failed", localId);
        return;
      }
      const prepared = await prepareUploadImages({
        base64: rawBase64,
        uri: sourceUri,
        mimeType: "image/jpeg",
      });
      if (!isCaptureRequestCurrent(requestId)) {
        recordCaptureTransitionEvent("request.cancelled", { phase: "upload-prepared", requestId });
        return;
      }
      const res = await uploadPhoto({
        imageBase64: prepared?.imageBase64 ?? rawBase64,
        mimeType: prepared?.mimeType ?? "image/jpeg",
        displayBase64: prepared?.displayBase64,
        deckPreviewBase64: prepared?.deckPreviewBase64,
        countryCode: input.myCountryCode,
        captureCountryCode: input.captureCountryCode,
        capturedAt: input.capturedAt,
        musicGenre: input.musicGenre,
        customAudioBase64: input.customAudioBase64,
        customAudioMime: input.customAudioMime,
        theme: input.theme,
        tags: input.tags,
        subjects: input.subjects?.length ? input.subjects : undefined,
      });
      if (!isCaptureRequestCurrent(requestId)) {
        recordCaptureTransitionEvent("request.cancelled", { phase: "upload-ack", requestId });
        return;
      }
      if (res?.id) {
        handlers.setMyPhotoBackendId(sourceUri, {
          backendId: res.id,
          subjects: res.subjects,
          theme: res.theme,
          tags: res.tags,
          musicGenre: res.musicGenre,
          suggestedTheme: res.suggestedTheme,
        }, localId);
        handlers.requestAtlasRefresh?.();
        recordCaptureTransitionEvent("upload.complete", { requestId, ok: true });
      } else {
        handlers.setMyPhotoUploadState(localUri, "failed", localId);
        recordCaptureTransitionEvent("upload.complete", { requestId, ok: false });
      }
    } catch {
      if (isCaptureRequestCurrent(requestId)) {
        handlers.setMyPhotoUploadState(localUri, "failed", localId);
      }
      recordCaptureTransitionEvent("upload.complete", { requestId, ok: false });
    }
  })();
}

/** Test-only reset for module singleton state. */
export function resetCaptureTransitionForTests(): void {
  activeRequestId = null;
  transitionInProgress = false;
  requestCounter = 0;
}
