import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Returns the Clerk publishable key the deployed server is currently
// wired to. Replit's secret manager auto-swaps CLERK_PUBLISHABLE_KEY
// from the test value to the live value at publish time, so reading
// it back from the *deployed* server is the only reliable way to
// know what the live key actually is for a Replit-managed Clerk
// tenant (there is no Clerk Dashboard for managed tenants). The
// publishable key is, by Clerk's design, safe to expose publicly —
// "publishable" literally means client-visible. The corresponding
// secret key (CLERK_SECRET_KEY) is NEVER returned by this endpoint.
//
// This unblocks the v1.2.5 ship cycle: the AAB needs to embed the
// correct pk_live_* as a hardcoded fallback, and the only way to
// learn that value (without external Clerk dashboard access) is to
// hit this endpoint on a deployed server whose Replit env has
// already been swapped.
router.get("/public/clerk-config", (_req, res) => {
  res.json({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? null,
  });
});

export default router;
