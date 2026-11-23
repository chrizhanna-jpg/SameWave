/** Prefix for bundled Match fixtures — only referenced when test photos are on. */
export const SAMPLE_PHOTO_ID_PREFIX = "test_sample_";
/** Prefix for synthetic Waves-map fixtures — only referenced when test photos are on. */
export const SAMPLE_WAVE_ID_PREFIX = "test_wave_";

export function isSamplePhotoId(id: string): boolean {
  return id.startsWith(SAMPLE_PHOTO_ID_PREFIX);
}

export function isSampleWaveId(id: string): boolean {
  return id.startsWith(SAMPLE_WAVE_ID_PREFIX);
}
