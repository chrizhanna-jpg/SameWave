import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { HealthCheckResponse } from "@workspace/api-zod";
import router from "./routes";
import analyzeRouter from "./routes/analyze";
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
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { getOpenAIEnv } from "./lib/openaiEnv";

const app: Express = express();

// Liveness only — registered before Clerk, logging, or DB so /api/healthz works
// on hosts (e.g. Render) even when CLERK_* is not set yet.
const sendHealthOk = (_req: Request, res: Response) => {
  res.json(HealthCheckResponse.parse({ status: "ok" }));
};
app.get("/healthz", sendHealthOk);
app.get("/api/healthz", sendHealthOk);
// Aliases for Play Console / ops docs that reference `/api/health`.
app.get("/health", sendHealthOk);
app.get("/api/health", sendHealthOk);
// Visiting `http://<lan-ip>:8787/` in a browser hits `/`; without this, the
// request falls through to `clerkMiddleware` and throws if `CLERK_SECRET_KEY`
// isn't set yet — misleading when you're only checking reachability / firewall.
app.get("/", (_req, res) => {
  res.redirect(302, "/api/healthz");
});

// Public read-only config — must run before clerkMiddleware so it still works
// when Clerk env is missing or misconfigured (middleware can return 500 otherwise).
app.get("/api/public/clerk-config", (_req, res) => {
  res.json({
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY ?? null,
  });
});

// DB + secret/key presence booleans — helps diagnose Atlas (SQL); no secrets in JSON.
// Mounted before clerkMiddleware like `/api/public/clerk-config`.
app.get("/api/public/backend-status", async (_req, res) => {
  try {
    const clerkSecretConfigured = !!process.env.CLERK_SECRET_KEY?.trim();
    const clerkPublishableConfigured = !!process.env.CLERK_PUBLISHABLE_KEY?.trim();
    const { apiKey } = getOpenAIEnv();

    let databaseReachable = false;
    let databaseError: string | null = null;
    try {
      await db.execute(sql`SELECT 1`);
      databaseReachable = true;
    } catch (err) {
      databaseError =
        err instanceof Error
          ? err.message.replace(/\s+/g, " ").trim().slice(0, 220)
          : "database check failed";
    }

    res.json({
      timestamp: Date.now(),
      databaseReachable,
      databaseError,
      clerkSecretConfigured,
      clerkPublishableConfigured,
      openAiConfigured: apiKey.length > 0,
    });
  } catch (err) {
    logger.error({ err }, "backend-status handler failed");
    res.status(200).json({
      timestamp: Date.now(),
      databaseReachable: false,
      databaseError:
        err instanceof Error
          ? err.message.replace(/\s+/g, " ").trim().slice(0, 220)
          : "status check failed",
      clerkSecretConfigured: !!process.env.CLERK_SECRET_KEY?.trim(),
      clerkPublishableConfigured: !!process.env.CLERK_PUBLISHABLE_KEY?.trim(),
      openAiConfigured: !!getOpenAIEnv().apiKey,
      degraded: true,
    });
  }
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

// Photo AI — no Clerk session required; must run before clerkMiddleware so a
// misconfigured Clerk host/key cannot turn analyze into a generic HTML 500.
app.use("/api", analyzeRouter);

// Resolve the publishable key from the incoming request host so the same
// server can serve multiple Clerk custom domains. Falls back to
// CLERK_PUBLISHABLE_KEY when the host doesn't map to a custom domain.
//
// getClerkProxyHost is shared with clerkProxyMiddleware so that both
// halves of the auth setup agree on which hostname is canonical.
//
// Without `CLERK_SECRET_KEY`, `@clerk/express` rejects every request (500).
// Locally you may omit it while testing Postgres + public reads (Atlas health).
// Bearer-protected handlers still gate via resolveUserFromRequest → 401.
const clerkSecretKey = process.env.CLERK_SECRET_KEY?.trim();
if (clerkSecretKey) {
  app.use(
    clerkMiddleware((req) => ({
      publishableKey: publishableKeyFromHost(
        getClerkProxyHost(req) ?? "",
        process.env.CLERK_PUBLISHABLE_KEY,
      ),
    })),
  );
} else {
  logger.warn(
    {
      clerkSecretConfigured: false,
      clerkPublishableConfigured: !!process.env.CLERK_PUBLISHABLE_KEY?.trim(),
    },
    "CLERK_SECRET_KEY unset — Clerk Express middleware skipped. Public Atlas/health work; uploads need the secret configured.",
  );
}

// Populate req.auth from the Bearer token sent by the Expo client.
// Routes use resolveUserFromRequest() to translate auth.userId → users row.

// Play / store policy pages — no auth; must stay before clerkMiddleware so a
// misconfigured Clerk secret does not turn /api/privacy into 500 for crawlers.
app.use("/api", legalRouter);
app.use("/api", router);

export default app;
