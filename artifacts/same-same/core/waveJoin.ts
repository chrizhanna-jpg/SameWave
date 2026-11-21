/**
 * The soft join between the two full-screen photographs on a Wave.
 * The curve echoes the SameWave logo: taller crest left, trough, lower crest right.
 */

/** Approximates the logo's ribbon as one continuous cubic path. */
export function logoWavePath(width: number, height: number): string {
  const mid = height / 2;
  const amp = height * 0.38;
  const y = (n: number) => mid - amp * n;
  const x = (n: number) => width * n;
  return [
    `M ${x(0)} ${y(-0.15)}`,
    `C ${x(0.08)} ${y(-0.05)} ${x(0.16)} ${y(0.85)} ${x(0.32)} ${y(1)}`,
    `C ${x(0.42)} ${y(1)} ${x(0.48)} ${y(0.15)} ${x(0.58)} ${y(-0.35)}`,
    `C ${x(0.66)} ${y(-0.7)} ${x(0.72)} ${y(0.35)} ${x(0.78)} ${y(0.55)}`,
    `C ${x(0.86)} ${y(0.75)} ${x(0.94)} ${y(0.05)} ${x(1)} ${y(-0.2)}`,
  ].join(" ");
}
