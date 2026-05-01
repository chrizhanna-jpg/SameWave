import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db, pushTokensTable } from "@workspace/db";
import { resolveUserFromRequest } from "../lib/users";

const router: IRouter = Router();

// Expo push tokens look like: ExponentPushToken[xxxxxxxxxxxxx] (legacy
// "Expo" prefix is also valid). We accept anything in that shape and
// reject everything else outright so we don't fill the table with junk.
const EXPO_TOKEN_RE = /^Expo(?:nent)?PushToken\[[^\]]+\]$/;

// ---- POST /api/push-tokens ------------------------------------------------
// Body: { token: string; platform?: "ios" | "android" | "web" }
// Idempotent. The mobile app calls this on every cold start once the
// user has granted notification permission, so the same token from the
// same device just refreshes `updatedAt` (and rebinds to the new userId
// if the device's identity changed).
router.post("/push-tokens", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const body = (req.body ?? {}) as { token?: unknown; platform?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!EXPO_TOKEN_RE.test(token)) {
      res.status(400).json({ error: "invalid Expo push token" });
      return;
    }
    const platformRaw = typeof body.platform === "string" ? body.platform : "";
    const platform =
      platformRaw === "ios" || platformRaw === "android" || platformRaw === "web"
        ? platformRaw
        : "unknown";

    await db
      .insert(pushTokensTable)
      .values({
        userId: user.id,
        expoToken: token,
        platform,
      })
      .onConflictDoUpdate({
        target: pushTokensTable.expoToken,
        set: {
          userId: user.id,
          platform,
          updatedAt: sql`now()`,
        },
      });

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "push token register failed");
    res.status(500).json({ error: "register failed" });
  }
});

export default router;
