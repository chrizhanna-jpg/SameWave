/** Canonical in-app camera entry for the general Ripple create flow. */
export const RIPPLE_CREATE_CAMERA_ROUTE = "/in-camera";
/** Canonical compose screen after capture (no daily-theme intent). */
export const RIPPLE_COMPOSE_ROUTE = "/camera";

export type RippleNavigationSource =
  | "start_rippling"
  | "play_theme_challenge"
  | "play_theme_interests";

export type RippleNavigationDestination =
  | "ripple.create"
  | "ripple.compose"
  | "play_theme.challenge"
  | "play_theme.interests";

type NavigationEventPayload = {
  source: RippleNavigationSource;
  destination: RippleNavigationDestination;
  at: number;
};

const navRing: NavigationEventPayload[] = [];
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

export function rippleCreateCameraHref(): string {
  return `${RIPPLE_CREATE_CAMERA_ROUTE}?flow=ripple.create`;
}

export function playThemeHref(intent: "challenge" | "interests"): string {
  return `${RIPPLE_COMPOSE_ROUTE}?intent=${intent}`;
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
  return v === "challenge" || v === "interests";
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
  if (isPlayThemeIntent(params.intent)) {
    const intent = Array.isArray(params.intent)
      ? params.intent[0]!
      : params.intent!;
    return playThemeHref(intent as "challenge" | "interests");
  }
  if (
    isRippleCreateFlow(params.flow) ||
    isLegacyHomeRippleStart(params.from)
  ) {
    return RIPPLE_COMPOSE_ROUTE;
  }
  return null;
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
  intent: "challenge" | "interests",
): void {
  const destination =
    intent === "challenge" ? "play_theme.challenge" : "play_theme.interests";
  const source =
    intent === "challenge" ? "play_theme_challenge" : "play_theme_interests";
  recordRippleNavigation(source, destination);
  router.push(playThemeHref(intent));
}
