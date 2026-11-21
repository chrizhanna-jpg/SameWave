/**
 * Pull a human-readable message out of a Clerk / unknown throw.
 * Future and legacy Clerk errors both expose `errors[]` or `message`.
 */
export function clerkErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;
  const record = err as {
    message?: string;
    longMessage?: string;
    errors?: Array<{ longMessage?: string; message?: string; code?: string }>;
    clerkError?: boolean;
  };
  const first = record.errors?.[0];
  const detail = first?.longMessage || first?.message || record.longMessage || record.message;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  return fallback;
}

export function clerkErrorCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const errors = (err as { errors?: Array<{ code?: string }> }).errors;
  return errors?.[0]?.code;
}
