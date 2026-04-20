import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";

// MVP identity model: clients send a stable, client-generated UUID via
// the X-Device-Id header. We find-or-create a row in `users` for it.
// Phase 2 swaps this for Clerk auth + merges device IDs onto auth IDs.
const HEADER = "x-device-id";
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export async function resolveUserFromRequest(
  req: Request,
  opts?: { countryCode?: string | null },
): Promise<{ id: string; deviceId: string } | null> {
  const raw = req.header(HEADER);
  if (!raw || !DEVICE_ID_RE.test(raw)) return null;

  const existing = await db
    .select({ id: usersTable.id, deviceId: usersTable.deviceId })
    .from(usersTable)
    .where(eq(usersTable.deviceId, raw))
    .limit(1);

  if (existing.length > 0 && existing[0].deviceId) {
    return { id: existing[0].id, deviceId: existing[0].deviceId };
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      deviceId: raw,
      countryCode: opts?.countryCode ?? null,
    })
    .returning({ id: usersTable.id, deviceId: usersTable.deviceId });
  return { id: created.id, deviceId: created.deviceId! };
}
