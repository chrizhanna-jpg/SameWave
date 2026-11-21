import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ZOOM_1X,
  ZOOM_2X,
  clampCameraZoom,
  isZoomChipActive,
  zoomFromPinch,
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

test("zoomFromPinch scales from the pinch start and clamps", () => {
  assert.equal(zoomFromPinch(0, 100, 100), 0);
  assert.ok(zoomFromPinch(0, 100, 200) > 0.5);
  assert.equal(zoomFromPinch(0.9, 100, 200), 1);
  assert.equal(zoomFromPinch(0.4, 4, 40), 0.4);
});

test("isZoomChipActive matches nearby pinch values to a chip", () => {
  assert.equal(isZoomChipActive(0, ZOOM_1X), true);
  assert.equal(isZoomChipActive(0.5, ZOOM_2X), true);
  assert.equal(isZoomChipActive(0.2, ZOOM_1X), false);
});
