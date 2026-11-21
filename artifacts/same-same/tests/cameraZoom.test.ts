import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PINCH_SCALE_FACTOR,
  ZOOM_1X,
  ZOOM_2X,
  clampCameraZoom,
  isZoomChipActive,
  nearestZoomChip,
  zoomFromPinch,
  zoomFromPinchScale,
} from "../core/cameraZoom";

test("clampCameraZoom keeps expo-camera zoom in 0–1", () => {
  assert.equal(clampCameraZoom(-0.2), 0);
  assert.equal(clampCameraZoom(0), 0);
  assert.equal(clampCameraZoom(0.5), 0.5);
  assert.equal(clampCameraZoom(1.4), 1);
});

test("1× and 2× shortcuts stay on the expo-camera range", () => {
  assert.equal(ZOOM_1X, 0);
  assert.equal(ZOOM_2X, 0.5);
  assert.equal(clampCameraZoom(ZOOM_2X), ZOOM_2X);
});

test("zoomFromPinchScale maps gesture-handler scale onto CameraView zoom 0–1", () => {
  assert.equal(zoomFromPinchScale(0, 1), 0);
  assert.equal(zoomFromPinchScale(ZOOM_2X, 1), ZOOM_2X);
  // scale 2 from 1× → about PINCH_SCALE_FACTOR toward max
  assert.equal(zoomFromPinchScale(0, 2), clampCameraZoom(PINCH_SCALE_FACTOR));
  assert.equal(zoomFromPinchScale(0.9, 2), 1);
  assert.equal(zoomFromPinchScale(0.5, 0.5), clampCameraZoom(0.5 + (0.5 - 1) * PINCH_SCALE_FACTOR));
  assert.equal(zoomFromPinchScale(0.2, 0), 0.2);
});

test("zoomFromPinch distance form matches scale form", () => {
  assert.equal(zoomFromPinch(0, 100, 100), zoomFromPinchScale(0, 1));
  assert.equal(zoomFromPinch(0, 100, 200), zoomFromPinchScale(0, 2));
  assert.equal(zoomFromPinch(0.4, 4, 40), 0.4);
});

test("isZoomChipActive and nearestZoomChip stay in sync with pinch values", () => {
  assert.equal(isZoomChipActive(0, ZOOM_1X), true);
  assert.equal(isZoomChipActive(0.5, ZOOM_2X), true);
  assert.equal(isZoomChipActive(0.2, ZOOM_1X), false);
  assert.equal(nearestZoomChip(0.1), ZOOM_1X);
  assert.equal(nearestZoomChip(0.4), ZOOM_2X);
});
