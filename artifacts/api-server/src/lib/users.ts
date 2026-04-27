import { db, usersTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import type { Request } from "express";

// Identity model: every authenticated request carries a Clerk Bearer token.
// We translate the Clerk authId → a row in `users`. On the FIRST signed-in
// request from an existing install, the client may also send the legacy
// X-Device-Id header — when we find a matching device-id row that has no
// authId yet, we link the Clerk identity onto it (so the user keeps every
// photo they took before signing in).
//
// Edge cases this function explicitly handles, all of which can race when
// the app fires several first-load requests in parallel:
//
//   • Two concurrent requests for the same brand-new authId both want to
//     INSERT — we use ON CONFLICT (auth_id) DO NOTHING and re-select.
//   • Linking a device row uses a guarded UPDATE (... AND auth_id IS NULL
//     RETURNING) so a parallel request can't silently overwrite ownership.
//   • Device row is already linked to a *different* Clerk user (e.g. the
//     user signed out then signed in with a second account on the same
//     phone): we never overwrite — we create a fresh row for the new auth
//     user with deviceId=null, leaving the original account intact.
const DEVICE_HEADER = "x-device-id";
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

export async function resolveUserFromRequest(
  req: Request,
  opts?: { countryCode?: string | null },
): Promise<{ id: string; authId: string } | null> {
  const auth = getAuth(req);
  const authId = auth?.userId;
  if (!authId) return null;

  // Fast path: this Clerk user already has a row.
  const existing = await selectByAuthId(authId);
  if (existing) return { id: existing, authId };

  // Slow path. Try to link the existing device-id row first, only if it
  // is currently unowned (auth_id IS NULL). The conditional UPDATE makes
  // this a single atomic step — concurrent first-requests can't both
  // claim the same device row.
  const rawDevice = req.header(DEVICE_HEADER);
  const deviceId =
    rawDevice && DEVICE_ID_RE.test(rawDevice) ? rawDevice : null;

  if (deviceId) {
    const linked = await db
      .update(usersTable)
      .set({ authId })
      .where(
        and(eq(usersTable.deviceId, deviceId), isNull(usersTable.authId)),
      )
      .returning({ id: usersTable.id });
    if (linked.length > 0) {
      return { id: linked[0].id, authId };
    }
  }

  // Either no device-id was sent, or the device row already belongs to
  // someone else (different signed-in account on the same phone). Create
  // a fresh row for this Clerk user — without claiming the device-id, so
  // we never collide with the unique(device_id) constraint.
  //
  // ON CONFLICT (auth_id) DO NOTHING handles the race where two parallel
  // first-requests both reach this point: one wins the insert, the other
  // gets zero rows back and we re-read.
  const inserted = await db
    .insert(usersTable)
    .values({
      authId,
      deviceId: null,
      countryCode: opts?.countryCode ?? null,
    })
    .onConflictDoNothing({ target: usersTable.authId })
    .returning({ id: usersTable.id });

  if (inserted.length > 0) {
    return { id: inserted[0].id, authId };
  }

  // The insert was a no-op because a parallel request created the row
  // first. Re-select; if even that fails, surface a real error.
  const racedId = await selectByAuthId(authId);
  if (racedId) return { id: racedId, authId };

  throw new Error(
    `resolveUserFromRequest: failed to materialize user row for authId=${authId}`,
  );
}

async function selectByAuthId(authId: string): Promise<string | null> {
  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.authId, authId))
    .limit(1);
  return rows.length > 0 ? rows[0].id : null;
}

// Suppress unused import warning if a future refactor drops sql usage.
void sql;
