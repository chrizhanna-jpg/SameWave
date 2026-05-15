import { Router, type IRouter } from "express";
import healthRouter from "./health";
import photosRouter from "./photos";
import echoesRouter from "./echoes";
import pushTokensRouter from "./pushTokens";

const router: IRouter = Router();

router.use(healthRouter);
router.use(photosRouter);
router.use(echoesRouter);
router.use(pushTokensRouter);

export default router;
