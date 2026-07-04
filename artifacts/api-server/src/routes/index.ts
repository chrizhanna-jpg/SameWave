import { Router, type IRouter } from "express";
import healthRouter from "./health";
import photosRouter from "./photos";
import echoesRouter from "./echoes";
import pushTokensRouter from "./pushTokens";
import usersRouter from "./users";
import catalogRouter from "./catalog";
import adminRouter from "./admin";
import telemetryRouter from "./telemetry";

const router: IRouter = Router();

router.use(healthRouter);
router.use(photosRouter);
router.use(echoesRouter);
router.use(pushTokensRouter);
router.use(usersRouter);
router.use(catalogRouter);
router.use(adminRouter);
router.use(telemetryRouter);

export default router;
