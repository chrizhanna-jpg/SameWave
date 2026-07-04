/**
 * Camera session ownership — run from same-same:
 *   pnpm exec tsx scripts/test-camera-session.ts
 */
import {
  acquireCameraSession,
  bumpCameraSessionGeneration,
  getCameraSessionGeneration,
  isCameraSessionOwnedBy,
  releaseCameraSession,
  resetCameraSessionForTests,
} from "../utils/cameraSession";

function assert(label: string, ok: boolean): void {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
}

resetCameraSessionForTests();

assert("first acquire succeeds", acquireCameraSession("in-camera") === true);
assert("same owner re-acquire succeeds", acquireCameraSession("in-camera") === true);
assert("other owner blocked while held", acquireCameraSession("other") === false);
assert("generation bumped on first acquire", getCameraSessionGeneration() === 1);

releaseCameraSession("in-camera");
assert("released owner no longer holds session", isCameraSessionOwnedBy("in-camera") === false);
assert("new owner can acquire after release", acquireCameraSession("scanner") === true);
assert("generation bumped for new owner", getCameraSessionGeneration() === 2);

releaseCameraSession("wrong-id");
assert("wrong release id does not clear owner", isCameraSessionOwnedBy("scanner") === true);

releaseCameraSession("scanner");
assert("correct release clears owner", isCameraSessionOwnedBy("scanner") === false);

const before = getCameraSessionGeneration();
const bumped = bumpCameraSessionGeneration();
assert("bump increments generation", bumped === before + 1);

console.log("done", { generation: getCameraSessionGeneration() });
