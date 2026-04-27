import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import legalRouter from "./routes/legal";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

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

app.use(cors());
// 12 MB lets users send a base64-encoded photo (max ~8 MB binary).
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));

// Populate req.auth from the Bearer token sent by the Expo client.
// Routes use resolveUserFromRequest() to translate auth.userId → users row.
app.use(clerkMiddleware());

app.use("/api", router);
app.use("/api", legalRouter);

export default app;
