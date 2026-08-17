/**
 * Launch breadcrumbs + last-error capture for production AABs that sit on
 * splash / a blank screen. Lives outside React so it still records if a
 * provider never mounts. Persists the last report so the next cold start
 * can show what died.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as SplashScreen from "expo-splash-screen";
import { Platform } from "react-native";

const STORAGE_KEY = "samewave_boot_diagnostics_v1";
const MAX_EVENTS = 80;

export type BootEvent = {
  t: number;
  step: string;
  detail?: string;
};

export type BootErrorRecord = {
  name: string;
  message: string;
  stack?: string;
  at: number;
  kind: "fatal" | "nonfatal" | "rejection" | "boundary";
};

export type BootSnapshot = {
  startedAt: number;
  readyAt: number | null;
  events: BootEvent[];
  lastError: BootErrorRecord | null;
  previousLaunchError: BootErrorRecord | null;
};

type Listener = () => void;

const startedAt = Date.now();
const snapshot: BootSnapshot = {
  startedAt,
  readyAt: null,
  events: [],
  lastError: null,
  previousLaunchError: null,
};
const listeners = new Set<Listener>();
let handlersInstalled = false;
let previousHydrated = false;

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* ignore */
    }
  }
}

function persistSoon(): void {
  void AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      lastError: snapshot.lastError,
      events: snapshot.events.slice(-40),
      readyAt: snapshot.readyAt,
      startedAt: snapshot.startedAt,
    }),
  ).catch(() => {});
}

export function subscribeBootDiagnostics(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBootSnapshot(): BootSnapshot {
  return snapshot;
}

export function isBootReady(): boolean {
  return snapshot.readyAt != null;
}

export function recordBootStep(step: string, detail?: string): void {
  snapshot.events.push({
    t: Date.now() - snapshot.startedAt,
    step,
    detail: detail?.slice(0, 400),
  });
  if (snapshot.events.length > MAX_EVENTS) {
    snapshot.events.splice(0, snapshot.events.length - MAX_EVENTS);
  }
  notify();
  persistSoon();
}

export function recordBootError(
  error: unknown,
  kind: BootErrorRecord["kind"],
): void {
  const err = error instanceof Error ? error : new Error(String(error ?? "Unknown"));
  snapshot.lastError = {
    name: err.name || "Error",
    message: err.message || String(error),
    stack: err.stack?.slice(0, 2500),
    at: Date.now(),
    kind,
  };
  recordBootStep(`error:${kind}`, `${err.name}: ${err.message}`);
}

export function markBootReady(reason: string): void {
  if (snapshot.readyAt != null) return;
  snapshot.readyAt = Date.now();
  recordBootStep("boot-ready", reason);
}

export function hideSplashSafe(): void {
  SplashScreen.hideAsync().catch(() => {});
}

export function collectEnvLines(): string[] {
  const version =
    Constants.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    "?";
  const nativeBuild = Constants.nativeBuildVersion;
  const expoVc = Constants.expoConfig?.android?.versionCode;
  const vc =
    nativeBuild != null && String(nativeBuild) !== ""
      ? String(nativeBuild)
      : typeof expoVc === "number"
        ? String(expoVc)
        : "?";
  const hermes = typeof (globalThis as { HermesInternal?: unknown }).HermesInternal !== "undefined";
  const fabric = typeof (globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager !== "undefined";
  const clerkKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? "";
  const api = process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.EXPO_PUBLIC_DOMAIN?.trim() || "";
  return [
    `version ${version} (build ${vc})`,
    `platform ${Platform.OS} ${Platform.Version}`,
    `dev ${String(__DEV__)}`,
    `hermes ${hermes ? "yes" : "no"}`,
    `newArch/fabric ${fabric ? "yes" : "no"}`,
    `clerkKey ${clerkKey ? `${clerkKey.slice(0, 8)}…${clerkKey.slice(-4)} (${clerkKey.length} chars)` : "MISSING"}`,
    `apiEnv ${api || "(unset)"}`,
    `elapsed ${Date.now() - snapshot.startedAt}ms`,
    `ready ${snapshot.readyAt != null ? `${snapshot.readyAt - snapshot.startedAt}ms` : "NO"}`,
  ];
}

export function formatBootReport(): string {
  const env = collectEnvLines();
  const events = snapshot.events
    .map((e) => `+${e.t}ms  ${e.step}${e.detail ? `  ${e.detail}` : ""}`)
    .join("\n");
  const err = snapshot.lastError
    ? `${snapshot.lastError.kind} ${snapshot.lastError.name}: ${snapshot.lastError.message}\n${snapshot.lastError.stack ?? ""}`
    : "(none this launch)";
  const prev = snapshot.previousLaunchError
    ? `${snapshot.previousLaunchError.kind} ${snapshot.previousLaunchError.name}: ${snapshot.previousLaunchError.message}`
    : "(none)";
  return [
    "SameWave launch diagnostics",
    ...env,
    "",
    "This launch errors:",
    err,
    "",
    "Previous launch error:",
    prev,
    "",
    "Boot steps:",
    events || "(none)",
  ].join("\n");
}

async function hydratePrevious(): Promise<void> {
  if (previousHydrated) return;
  previousHydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      lastError?: BootErrorRecord | null;
    };
    if (parsed.lastError) snapshot.previousLaunchError = parsed.lastError;
    notify();
  } catch {
    /* ignore */
  }
}

type GlobalErrorHandler = (error: Error, isFatal?: boolean) => void;
type ErrorUtilsLike = {
  getGlobalHandler?: () => GlobalErrorHandler | undefined;
  setGlobalHandler?: (handler: GlobalErrorHandler) => void;
};

export function installBootDiagnostics(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;
  recordBootStep("js-start", "bootDiagnostics installed");
  void hydratePrevious();

  const errorUtils: ErrorUtilsLike | undefined = (
    globalThis as unknown as { ErrorUtils?: ErrorUtilsLike }
  ).ErrorUtils;
  if (errorUtils?.setGlobalHandler && errorUtils?.getGlobalHandler) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      recordBootError(error, isFatal ? "fatal" : "nonfatal");
      hideSplashSafe();
      console.error(
        "[SameWave uncaught]",
        isFatal ? "(fatal)" : "(non-fatal)",
        error?.message ?? error,
        "\n",
        error?.stack ?? "",
      );
      // Do NOT Alert.alert during boot — on some Android AABs an Alert
      // before the Activity is ready freezes the process on splash.
      if (typeof previous === "function") previous(error, isFatal);
    });
  }

  const g = globalThis as unknown as {
    onunhandledrejection?: (ev: { reason?: unknown }) => void;
  };
  const prevRejection = g.onunhandledrejection;
  g.onunhandledrejection = (ev) => {
    recordBootError(ev?.reason, "rejection");
    hideSplashSafe();
    if (typeof prevRejection === "function") prevRejection(ev);
  };
}
