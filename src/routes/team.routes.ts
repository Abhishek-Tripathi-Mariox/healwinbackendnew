import { Router } from "express";
import * as TeamController from "../controllers/team.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

const teamRouter = Router();

teamRouter.get(
  "/",
  cacheResponse(300),
  ErrorHandlerMiddleware(TeamController.listTeamMembers),
  ResponseMiddleware,
);

/* Public profile by uniqueId — for QR code verification */
teamRouter.get(
  "/verify/:uniqueId",
  ErrorHandlerMiddleware(TeamController.getTeamMemberByUniqueId),
  ResponseMiddleware,
);

teamRouter.get(
  "/:id",
  ErrorHandlerMiddleware(TeamController.getTeamMember),
  ResponseMiddleware,
);

export default teamRouter;
