/** Canonical in-app camera entry for the general Ripple create flow. */
export const RIPPLE_CREATE_CAMERA_ROUTE = "/in-camera";
/** Canonical compose screen after capture (no daily-theme intent). */
export const RIPPLE_COMPOSE_ROUTE = "/camera";

/** Canonical Interests flow route id (query param `flow`). */
export const INTERESTS_MANAGE_FLOW = "interests.manage";

export type RippleNavigationSource =
  | "start_rippling"
  | "start_interests"
  | "play_theme_challenge"
  | "play_theme_interests";

export type RippleNavigationDestination =
  | "ripple.create"
  | "ripple.compose"
  | "interests_flow"
  | "play_theme.challenge"
  | "play_theme.interests";

export type InterestsTelemetryEvent =
  | "start_interests"
  | "interests_view"
  | "interests_header_rendered";

type NavigationEventPayload = {
  source: RippleNavigationSource;
  destination: RippleNavigationDestination;
  at: number;
};

type InterestsTelemetryPayload = {
  event: InterestsTelemetryEvent;
  detail?: Record<string, unknown>;
  at: number;
};

const navRing: NavigationEventPayload[] = [];
const interestsRing: InterestsTelemetryPayload[] = [];
const NAV_RING_MAX = 40;

function logNavigationDev(payload: NavigationEventPayload): void {
  try {
    const { postDebugSessionLog } =
      require("@/utils/debugSessionLog") as typeof import("@/utils/debugSessionLog");
    postDebugSessionLog({
      hypothesisId: "H-nav",
      location: "rippleNavigation",
      message: `${payload.source} -> ${payload.destination}`,
      data: payload,
    });
  } catch {
    /* ignore in tests / non-RN */
  }
}

/**
 * Roll back to the legacy home fast-path (skip compose, seed today's theme)
 * by setting EXPO_PUBLIC_RIPPLE_NAV_V2=false.
 */
export function isRippleNavFixEnabled(): boolean {
  return (
    process.env.EXPO_PUBLIC_RIPPLE_NAV_V2 !== "false" &&
    process.env.EXPO_PUBLIC_RIPPLE_NAV_V2 !== "0"
  );
}

/** Roll back Interests canonical routing via EXPO_PUBLIC_INTERESTS_FLOW_V2=false. */
export function isInterestsFlowV2Enabled(): boolean {
  return (
    process.env.EXPO_PUBLIC_INTERESTS_FLOW_V2 !== "false" &&
    process.env.EXPO_PUBLIC_INTERESTS_FLOW_V2 !== "0"
  );
}

export function rippleCreateCameraHref(): string {
  return `${RIPPLE_CREATE_CAMERA_ROUTE}?flow=ripple.create`;
}

export function interestsManageHref(): string {
  return `${RIPPLE_COMPOSE_ROUTE}?flow=${INTERESTS_MANAGE_FLOW}`;
}

export function interestsManageCameraHref(): string {
  return `${RIPPLE_CREATE_CAMERA_ROUTE}?flow=${INTERESTS_MANAGE_FLOW}`;
}

export function playThemeHref(intent: "challenge"): string {
  return `${RIPPLE_COMPOSE_ROUTE}?intent=${intent}`;
}

/** @deprecated Legacy deep link — prefer interestsManageHref(). */
export function legacyInterestsIntentHref(): string {
  return `${RIPPLE_COMPOSE_ROUTE}?intent=interests`;
}

export function isRippleCreateFlow(
  flow: string | string[] | undefined,
): boolean {
  const v = Array.isArray(flow) ? flow[0] : flow;
  return v === "ripple.create";
}

export function isPlayThemeIntent(
  intent: string | string[] | undefined,
): boolean {
  const v = Array.isArray(intent) ? intent[0] : intent;
  return v === "challenge";
}

export function isLegacyInterestsIntent(
  intent: string | string[] | undefined,
): boolean {
  const v = Array.isArray(intent) ? intent[0] : intent;
  return v === "interests";
}

export function isInterestsManageFlow(
  flow: string | string[] | undefined,
): boolean {
  const v = Array.isArray(flow) ? flow[0] : flow;
  return v === INTERESTS_MANAGE_FLOW;
}

export function isActiveInterestsFlow(params: {
  flow?: string | string[];
  intent?: string | string[];
}): boolean {
  if (isInterestsFlowV2Enabled()) {
    return (
      isInterestsManageFlow(params.flow) ||
      isLegacyInterestsIntent(params.intent)
    );
  }
  return isLegacyInterestsIntent(params.intent);
}

export function isLegacyHomeRippleStart(
  from: string | string[] | undefined,
): boolean {
  const v = Array.isArray(from) ? from[0] : from;
  return v === "home" || v === "start_rippling";
}

/**
 * After in-camera capture, where to land for compose. Returns null when the
 * caller should router.back() (e.g. opened from /camera retake).
 */
export function resolvePostCaptureComposeHref(params: {
  flow?: string | string[];
  intent?: string | string[];
  from?: string | string[];
}): string | null {
  if (isActiveInterestsFlow(params)) {
    return isInterestsFlowV2Enabled()
      ? interestsManageHref()
      : legacyInterestsIntentHref();
  }
  if (isPlayThemeIntent(params.intent)) {
    const intent = Array.isArray(params.intent)
      ? params.intent[0]!
      : params.intent!;
    return playThemeHref(intent as "challenge");
  }
  if (
    isRippleCreateFlow(params.flow) ||
    isLegacyHomeRippleStart(params.from)
  ) {
    return RIPPLE_COMPOSE_ROUTE;
  }
  return null;
}

export function resolveInCameraHref(params: {
  postIntent?: "challenge" | "interests" | null;
  flow?: string | string[];
}): string {
  if (params.postIntent === "challenge") {
    return `${RIPPLE_CREATE_CAMERA_ROUTE}?intent=challenge`;
  }
  if (isActiveInterestsFlow({ flow: params.flow, intent: params.postIntent ?? undefined })) {
    return isInterestsFlowV2Enabled()
      ? interestsManageCameraHref()
      : `${RIPPLE_CREATE_CAMERA_ROUTE}?intent=interests`;
  }
  return rippleCreateCameraHref();
}

export function recordRippleNavigation(
  source: RippleNavigationSource,
  destination: RippleNavigationDestination,
): void {
  const payload: NavigationEventPayload = {
    source,
    destination,
    at: Date.now(),
  };
  navRing.push(payload);
  if (navRing.length > NAV_RING_MAX) navRing.shift();
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    logNavigationDev(payload);
  }
}

export function getRippleNavigationRing(): NavigationEventPayload[] {
  return [...navRing];
}

export function resetRippleNavigationForTests(): void {
  navRing.length = 0;
  interestsRing.length = 0;
}

export function recordInterestsTelemetry(
  event: InterestsTelemetryEvent,
  detail?: Record<string, unknown>,
): void {
  const payload: InterestsTelemetryPayload = {
    event,
    detail: {
      ...detail,
      destination: "interests_flow",
    },
    at: Date.now(),
  };
  interestsRing.push(payload);
  if (interestsRing.length > NAV_RING_MAX) interestsRing.shift();
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    logNavigationDev({
      source: "start_interests",
      destination: "interests_flow",
      at: payload.at,
    });
  }
}

export function getInterestsTelemetryRing(): InterestsTelemetryPayload[] {
  return [...interestsRing];
}

type RouterPush = { push: (href: string) => void };

/** Home / match CTAs labeled "Start Rippling". */
export function navigateStartRippling(router: RouterPush): void {
  const href = rippleCreateCameraHref();
  if (href.includes("intent=challenge") || href.includes("intent=interests")) {
    throw new Error(
      "Start Rippling must not route to Play Today's Theme — use navigatePlayTheme",
    );
  }
  recordRippleNavigation("start_rippling", "ripple.create");
  router.push(href);
}

export function navigatePlayTheme(
  router: RouterPush,
  intent: "challenge",
): void {
  const destination = "play_theme.challenge";
  const source = "play_theme_challenge";
  recordRippleNavigation(source, destination);
  router.push(playThemeHref(intent));
}

/** Home / profile CTAs labeled "Your interests". */
export function navigateInterestsFlow(router: RouterPush): void {
  const href = isInterestsFlowV2Enabled()
    ? interestsManageHref()
    : legacyInterestsIntentHref();
  if (href.includes("intent=challenge")) {
    throw new Error(
      "Your Interests must not route to Play Today's Theme — use navigatePlayTheme",
    );
  }
  recordRippleNavigation("start_interests", "interests_flow");
  recordInterestsTelemetry("start_interests", { href });
  router.push(href);
}
