import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { HealthCheckResponse } from "@workspace/api-zod";
import router from "./routes";
import legalRouter, {
  sendCsaePage,
  sendDataDeletionPage,
  sendPrivacyPage,
  sendTermsPage,
} from "./routes/legal";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

// Liveness only — registered before Clerk, logging, or DB so /api/healthz works
// on hosts (e.g. Render) even when CLERK_* is not set yet.
const sendHealthOk = (_req: Request, res: Response) => {
  res.json(HealthCheckResponse.parse({ status: "ok" }));
};
app.get("/healthz", sendHealthOk);
app.get("/api/healthz", sendHealthOk);

// Public read-only config — must run before clerkMiddleware so it still works
// when Clerk env is missing or misconfigured (middleware can return 500 otherwise).
app.get("/api/public/clerk-config", (_req, res) => {
  res.json({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? null,
  });
});

// Play / store crawlers often use paths without the /api prefix — serve the same
// HTML here so declared URLs never 404 (fixes "privacy policy page not found").
app.get("/privacy", (_req, res) => {
  sendPrivacyPage(res);
});
app.get("/data-deletion", (_req, res) => {
  sendDataDeletionPage(res);
});
app.get("/terms", (_req, res) => {
  sendTermsPage(res);
});
app.get("/csae", (_req, res) => {
  sendCsaePage(res);
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk Frontend API proxy — must run BEFORE the JSON body parser so the
// proxy can stream raw bytes to Clerk. No-op in dev (Clerk dev instances
// don't go through the proxy).
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
// 12 MB lets users send a base64-encoded photo (max ~8 MB binary).
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

// Resolve the publishable key from the incoming request host so the same
// server can serve multiple Clerk custom domains. Falls back to
// CLERK_PUBLISHABLE_KEY when the host doesn't map to a custom domain.
//
// getClerkProxyHost is shared with clerkProxyMiddleware so that both
// halves of the auth setup agree on which hostname is canonical.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

// Populate req.auth from the Bearer token sent by the Expo client.
// Routes use resolveUserFromRequest() to translate auth.userId → users row.

app.use("/api", router);
app.use("/api", legalRouter);

export default app;
