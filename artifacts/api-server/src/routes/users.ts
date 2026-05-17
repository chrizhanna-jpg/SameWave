import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { resolveUserFromRequest } from "../lib/users";

const router: IRouter = Router();

// GET /api/users/me — home country saved at onboarding / profile.
router.get("/users/me", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const rows = await db
      .select({ countryCode: usersTable.countryCode })
      .from(usersTable)
      .where(eq(usersTable.id, user.id))
      .limit(1);
    res.json({ countryCode: rows[0]?.countryCode ?? null });
  } catch (err) {
    console.error("[GET /api/users/me]", err);
    res.status(500).json({ error: "failed to load profile" });
  }
});

// PATCH /api/users/me — persist country from onboarding or profile picker.
router.patch("/users/me", async (req, res) => {
  try {
    const user = await resolveUserFromRequest(req);
    if (!user) {
      res.status(401).json({ error: "authentication required" });
      return;
    }
    const body = (req.body ?? {}) as { countryCode?: unknown };
    const countryCode =
      typeof body.countryCode === "string" && body.countryCode.length === 2
        ? body.countryCode.toUpperCase()
        : null;
    if (!countryCode) {
      res.status(400).json({ error: "countryCode must be a 2-letter ISO code" });
      return;
    }
    await db
      .update(usersTable)
      .set({ countryCode })
      .where(eq(usersTable.id, user.id));
    res.json({ countryCode });
  } catch (err) {
    console.error("[PATCH /api/users/me]", err);
    res.status(500).json({ error: "failed to update profile" });
  }
});

export default router;
