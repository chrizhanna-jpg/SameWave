/** Server copy of the Wave name rule. Stored on the echo when it becomes mutual. */

function readableVibe(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().replace(/^#/, "");
  if (!t) return "";
  const spaced = t.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export function waveNameFromVibes(
  vibeA: string | null | undefined,
  vibeB: string | null | undefined,
): string {
  const left = readableVibe(vibeA);
  const right = readableVibe(vibeB);
  if (!left && !right) return "The Quiet Wave";
  if (!left || !right || left.toLowerCase() === right.toLowerCase()) {
    return `The ${left || right} Wave`;
  }
  return `The ${left} ${right} Wave`;
}

export { readableVibe };
