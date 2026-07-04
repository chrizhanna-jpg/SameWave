/**
 * Match deck carousel — centralize programmatic candidate transitions and
 * request-id gating so background seen-ledger / prefetch work cannot
 * overwrite the visible card.
 */

import { postDebugSessionLog } from "@/utils/debugSessionLog";
import { photoKey } from "@/utils/photoKey";
import { IMAGE_LOAD_V2 } from "@/constants/imageLoading";

export const MATCH_CAROUSEL_GATING =
  IMAGE_LOAD_V2 ||
  process.env.EXPO_PUBLIC_MATCH_CAROUSEL_GATING === "true" ||
  process.env.EXPO_PUBLIC_MATCH_CAROUSEL_GATING === "1";

export type CarouselTransitionReason =
  | "user_swipe"
  | "upload_reset"
  | "stuck_recovery"
  | "object_match"
  | "focus_advance"
  | "flash_dismiss"
  | "initial_mount";

export type CarouselTelemetryEvent =
  | "carousel.programmaticTransition.requested"
  | "carousel.programmaticTransition.applied"
  | "carousel.programmaticTransition.blocked"
  | "image.response.applied"
  | "image.response.ignored"
  | "view.rebound.cancelledRequests";

type CarouselEventDetail = {
  event: CarouselTelemetryEvent;
  detail?: Record<string, unknown>;
};

let candidateRequestId = 0;
let transitionInFlight = false;
let ignoredLateResponses = 0;
let appliedTransitions = 0;

export function getCandidateRequestId(): number {
  return candidateRequestId;
}

export function isCarouselTransitionInFlight(): boolean {
  return transitionInFlight;
}

export function recordCarouselEvent(
  event: CarouselTelemetryEvent,
  detail?: Record<string, unknown>,
): void {
  const payload: CarouselEventDetail = {
    event,
    detail: {
      ...detail,
      requestId: candidateRequestId,
      at: Date.now(),
    },
  };
  if (event === "image.response.ignored") ignoredLateResponses += 1;
  if (event === "carousel.programmaticTransition.applied") appliedTransitions += 1;
  if (__DEV__) {
    postDebugSessionLog({
      hypothesisId: "H-carousel",
      location: "matchCarouselController",
      message: event,
      data: payload.detail ?? {},
    });
  }
}

/**
 * Register the candidate as intentionally displayed BEFORE React state
 * commits so seen-ledger effects cannot auto-advance on the same tick.
 */
export function commitDisplayedCandidate(
  sessionDisplayed: Set<string>,
  uri: string,
  reason: CarouselTransitionReason,
): { requestId: number; key: string | null } {
  candidateRequestId += 1;
  const key = photoKey(uri);
  if (key) sessionDisplayed.add(key);
  recordCarouselEvent("carousel.programmaticTransition.applied", {
    reason,
    key,
    uriLen: uri.length,
  });
  return { requestId: candidateRequestId, key };
}

export function beginCarouselTransition(): void {
  transitionInFlight = true;
  recordCarouselEvent("carousel.programmaticTransition.requested");
}

export function endCarouselTransition(): void {
  transitionInFlight = false;
}

/** Apply image-load callback only when generation still matches the bound card. */
export function shouldApplyCandidateImageResponse(
  boundRequestId: number,
  boundUri: string,
  currentRequestId: number,
  currentUri: string,
): boolean {
  const ok =
    boundRequestId === currentRequestId &&
    photoKey(boundUri) === photoKey(currentUri);
  if (!ok) {
    recordCarouselEvent("image.response.ignored", {
      boundRequestId,
      currentRequestId,
      boundKey: photoKey(boundUri),
      currentKey: photoKey(currentUri),
    });
  } else {
    recordCarouselEvent("image.response.applied", {
      requestId: currentRequestId,
      key: photoKey(currentUri),
    });
  }
  return ok;
}

export function getCarouselTelemetryCountersForTests(): {
  ignoredLateResponses: number;
  appliedTransitions: number;
} {
  return { ignoredLateResponses, appliedTransitions };
}

export function resetCarouselControllerForTests(): void {
  candidateRequestId = 0;
  transitionInFlight = false;
  ignoredLateResponses = 0;
  appliedTransitions = 0;
}
