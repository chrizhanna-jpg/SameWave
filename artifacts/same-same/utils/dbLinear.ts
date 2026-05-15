/** Convert decibels (20·log10) to linear amplitude (0..1+). */
export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}
