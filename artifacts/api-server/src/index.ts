import "./loadEnv";
import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/** Default IPv4-any so phones on `http://192.168.x.x:PORT` reach this host on Windows. */
const listenHost = process.env["LISTEN_HOST"]?.trim() || "0.0.0.0";

const server = app.listen(port, listenHost, () => {
  logger.info({ port, listenHost }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
