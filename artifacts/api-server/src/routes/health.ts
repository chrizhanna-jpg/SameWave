import { Router, type IRouter } from "express";

const router: IRouter = Router();

// GET /api/healthz is handled in app.ts (before Clerk) for reliable health checks.

// Returns the Clerk publishable key the deployed server reads from env.
// The publishable key is client-visible by design. The corresponding
// secret key (`CLERK_SECRET_KEY`) is never returned here.
router.get("/public/clerk-config", (_req, res) => {
  res.json({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? null,
  });
});

export default router;
