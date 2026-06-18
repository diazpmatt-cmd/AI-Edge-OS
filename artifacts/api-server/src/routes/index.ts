import { Router, type IRouter } from "express";
import healthRouter from "./health";
import keywordsRouter from "./keywords";
import articlesRouter from "./articles";
import articleAssetsRouter from "./article-assets";
import aiRouter from "./ai";

const router: IRouter = Router();

router.use(healthRouter);
router.use(keywordsRouter);
router.use(articlesRouter);
router.use(articleAssetsRouter);
router.use(aiRouter);

export default router;
