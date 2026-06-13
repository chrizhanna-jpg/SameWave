/**
 * Tutorial runs once. Respect explicit `false` (replay from Home). For legacy
 * rows missing the flag, infer completion from prior usage so updates do not
 * send returning users back through onboarding.
 */
export function resolveOnboardingComplete(
  parsed: Record<string, unknown>,
  priorOpenCount: number,
  cachedMutualEchoCount: number,
): boolean {
  if (parsed.onboardingComplete === true) return true;
  if (parsed.onboardingComplete === false) return false;

  if (priorOpenCount > 1) return true;
  const matches = parsed.matches;
  if (Array.isArray(matches) && matches.length > 0) return true;
  if (cachedMutualEchoCount > 0) return true;
  const myPhotos = parsed.myPhotos;
  if (Array.isArray(myPhotos) && myPhotos.length > 0) return true;
  return false;
}
