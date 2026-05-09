import { Router, type IRouter } from "express";

const router: IRouter = Router();

// GET /api/healthz and GET /api/public/clerk-config are handled in app.ts
// (before Clerk middleware) for reliable responses on hosts like Render.

export default router;
