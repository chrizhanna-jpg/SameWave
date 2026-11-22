/**
 * Metro substitutes this module for the test-photo catalog / fixtures / JPEGs
 * whenever EXPO_PUBLIC_TEST_PHOTOS is not exactly "1". Keeps production and
 * EAS preview/production exports free of sample assets and fixture metadata.
 *
 * Intentionally avoids the real fixture identifiers (TEST_PHOTO_META, etc.)
 * so those strings never appear in production bundles.
 */
function emptyList() {
  return [];
}

function SamplePhotosToggleRow() {
  return null;
}

function isSamplePhotoId() {
  return false;
}

function isSampleWaveId() {
  return false;
}

function LocationDiagPanel() {
  return null;
}

function LocationDiagScreenInner() {
  return null;
}

function LocationDiagAccountRow() {
  return null;
}

function buildLocationDiagRows() {
  return [];
}

function RippleMarkShotInner() {
  return null;
}
function MatchBlurShotInner() {
  return null;
}
function WavesListShotInner() {
  return null;
}
function WaveSheetShotInner() {
  return null;
}

module.exports = {
  getTestPhotoCandidates: emptyList,
  getSampleWaves: emptyList,
  SamplePhotosToggleRow,
  LocationDiagPanel,
  LocationDiagScreenInner,
  LocationDiagAccountRow,
  buildLocationDiagRows,
  RippleMarkShotInner,
  MatchBlurShotInner,
  WavesListShotInner,
  WaveSheetShotInner,
  isSamplePhotoId,
  isSampleWaveId,
  SAMPLE_PHOTO_ID_PREFIX: "",
  SAMPLE_WAVE_ID_PREFIX: "",
};
