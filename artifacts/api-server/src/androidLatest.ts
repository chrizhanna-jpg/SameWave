import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type AndroidLatestFile = {
  versionCode?: unknown;
  versionName?: unknown;
  updateMessage?: unknown;
};

export type ResolvedAndroidLatest = {
  latestVersionCode: number;
  latestVersionName: string;
  updateMessage?: string;
};

const DEFAULT_VERSION_CODE = 28;
const DEFAULT_VERSION_NAME = "1.3.1";

function parseVersionCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return null;
}

function parseVersionName(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function loadAndroidLatestFile(): AndroidLatestFile | null {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const apiServerRoot = path.resolve(here, "..");
    const configPath = path.join(apiServerRoot, "config", "android-latest.json");
    const raw = readFileSync(configPath, "utf8");
    return JSON.parse(raw) as AndroidLatestFile;
  } catch {
    return null;
  }
}

let cachedFile: AndroidLatestFile | null | undefined;

function getFileConfig(): AndroidLatestFile | null {
  if (cachedFile === undefined) {
    cachedFile = loadAndroidLatestFile();
  }
  return cachedFile;
}

export function resolveAndroidLatest(): ResolvedAndroidLatest {
  const envCode = parseVersionCode(process.env.ANDROID_LATEST_VERSION_CODE);
  const envName = parseVersionName(process.env.ANDROID_LATEST_VERSION_NAME);
  const envMessage = process.env.ANDROID_UPDATE_MESSAGE?.trim() || undefined;

  const file = getFileConfig();
  const fileCode = file ? parseVersionCode(file.versionCode) : null;
  const fileName = file ? parseVersionName(file.versionName) : null;
  const fileMessage =
    file && typeof file.updateMessage === "string" && file.updateMessage.trim().length > 0
      ? file.updateMessage.trim()
      : undefined;

  let latestVersionCode: number;
  if (envCode != null && fileCode != null) {
    latestVersionCode = Math.max(envCode, fileCode);
  } else if (fileCode != null) {
    latestVersionCode = fileCode;
  } else if (envCode != null) {
    latestVersionCode = envCode;
  } else {
    latestVersionCode = DEFAULT_VERSION_CODE;
  }

  const fileCodeWins =
    fileCode != null && latestVersionCode === fileCode;
  const latestVersionName = fileCodeWins
    ? (fileName ?? envName ?? DEFAULT_VERSION_NAME)
    : (envName ?? fileName ?? DEFAULT_VERSION_NAME);

  const updateMessage = envMessage ?? fileMessage;

  return {
    latestVersionCode,
    latestVersionName,
    ...(updateMessage ? { updateMessage } : {}),
  };
}
