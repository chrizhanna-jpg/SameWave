import { Platform } from "react-native";
import { postDebugSessionLog } from "@/utils/debugSessionLog";

export type CameraTelemetryEvent =
  | "camera.permission.pending"
  | "camera.permission.granted"
  | "camera.permission.denied"
  | "camera.open.start"
  | "camera.surface.ready"
  | "camera.open.success"
  | "camera.open.failure"
  | "camera.capture.start"
  | "camera.capture.success"
  | "camera.capture.failure"
  | "camera.release"
  | "camera.retry";

type CameraEventPayload = {
  event: CameraTelemetryEvent;
  detail?: Record<string, unknown>;
};

const ring: CameraEventPayload[] = [];
const RING_MAX = 40;

export function recordCameraEvent(
  event: CameraTelemetryEvent,
  detail?: Record<string, unknown>,
): void {
  const payload: CameraEventPayload = {
    event,
    detail: {
      ...detail,
      platform: Platform.OS,
      at: Date.now(),
    },
  };
  ring.push(payload);
  if (ring.length > RING_MAX) ring.shift();
  if (__DEV__) {
    postDebugSessionLog({
      hypothesisId: "H-camera",
      location: "cameraTelemetry",
      message: event,
      data: payload.detail ?? {},
    }).catch(() => {});
  }
}

export function getCameraTelemetryRing(): CameraEventPayload[] {
  return [...ring];
}
