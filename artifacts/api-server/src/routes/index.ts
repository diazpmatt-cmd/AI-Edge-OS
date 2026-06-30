import { Router, type IRouter } from "express";
import healthRouter from "./health";
import keywordsRouter from "./keywords";
import articlesRouter from "./articles";
import articleAssetsRouter from "./article-assets";
import aiRouter from "./ai";
import contentPackagesRouter from "./content-packages";
import socialConnectionsRouter from "./social-connections";
import oauthCallbacksRouter from "./oauth-callbacks";
import leadsRouter from "./leads";
import socialPostsRouter from "./social-posts";
import autoContentRouter from "./auto-content";
import diagnosticsRouter from "./diagnostics";
import storageRouter from "./storage";
import imageAssetsRouter from "./image-assets";

const router: IRouter = Router();

router.use(healthRouter);
router.use(keywordsRouter);
router.use(articlesRouter);
router.use(articleAssetsRouter);
router.use(aiRouter);
router.use(contentPackagesRouter);
router.use(socialConnectionsRouter);
router.use(oauthCallbacksRouter);
router.use(leadsRouter);
router.use(socialPostsRouter);
router.use(autoContentRouter);
router.use(diagnosticsRouter);
router.use(storageRouter);
router.use(imageAssetsRouter);

export default router;
