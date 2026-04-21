import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeRouter from "./analyze";
import photosRouter from "./photos";
import echoesRouter from "./echoes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(analyzeRouter);
router.use(photosRouter);
router.use(echoesRouter);

export default router;
