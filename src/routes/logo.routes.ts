import { Router, Request, Response } from "express";
import { LogoSettings } from "../models/logo-settings.model";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

const logoRouter = Router();

logoRouter.get(
  "/",
  cacheResponse(600),
  ErrorHandlerMiddleware(async (_req: Request, res: Response) => {
    let settings = await LogoSettings.findOne();
    if (!settings) {
      settings = await LogoSettings.create({});
    }
    res.locals.data = settings;
  }),
  ResponseMiddleware,
);

export default logoRouter;
