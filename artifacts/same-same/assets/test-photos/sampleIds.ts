/** Prefix for bundled Match fixtures — only referenced when test photos are on. */
export const SAMPLE_PHOTO_ID_PREFIX = "test_sample_";

export function isSamplePhotoId(id: string): boolean {
  return id.startsWith(SAMPLE_PHOTO_ID_PREFIX);
}
