import { Router } from "express";

import * as UserController from "../controllers/user.controller";
import * as GSTController from "../controllers/gst.controller";
import * as RewardController from "../controllers/reward.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import AuthMiddleware from "../middlewares/auth.middleware";
import UsersValidator from "../validators/users.validator";
import upload from "../middlewares/upload.middleware";

const userRouter = Router();

/**
 * Profile
 */
userRouter.get(
  "/profile",
  AuthMiddleware().verifyUserToken,
  ErrorHandlerMiddleware(UserController.getDetails),
  ResponseMiddleware
);

userRouter.put(
  "/profile",
  AuthMiddleware().verifyUserToken,
  upload.array("profileImage", 1),
  ErrorHandlerMiddleware(UserController.editUser),
  ResponseMiddleware
);

/**
 * Address
 */
userRouter.post(
  "/address",
  AuthMiddleware().verifyUserToken,
  UsersValidator().validateAddress,
  ErrorHandlerMiddleware(UserController.addUserAddress),
  ResponseMiddleware
);

userRouter.get(
  "/address",
  AuthMiddleware().verifyUserToken,
  ErrorHandlerMiddleware(UserController.getUserAddress),
  ResponseMiddleware
);

userRouter.get(
  "/address/:id",
  AuthMiddleware().verifyUserToken,
  UsersValidator().validateAddressId,
  ErrorHandlerMiddleware(UserController.getUserAddressDetail),
  ResponseMiddleware
);

userRouter.delete(
  "/address/:id",
  AuthMiddleware().verifyUserToken,
  UsersValidator().validateAddressId,
  ErrorHandlerMiddleware(UserController.deleteUserAddress),
  ResponseMiddleware
);

userRouter.put(
  "/address/:id",
  AuthMiddleware().verifyUserToken,
  UsersValidator().validateAddressId,
  ErrorHandlerMiddleware(UserController.updateUserAddress),
  ResponseMiddleware
);

/**
 * Notifications
 */
userRouter.get(
  "/notifications/switch",
  AuthMiddleware().verifyUserToken,
  ErrorHandlerMiddleware(UserController.activateDeactivateNotification),
  ResponseMiddleware
);

/**
 * GST
 */
userRouter.post(
  "/gst",
  AuthMiddleware().verifyUserToken,
  ErrorHandlerMiddleware(GSTController.addOrUpdateGST),
  ResponseMiddleware
);

userRouter.get(
  "/gst",
  AuthMiddleware().verifyUserToken,
  ErrorHandlerMiddleware(GSTController.getGST),
  ResponseMiddleware
);

/**
 * Referral Code
 */
userRouter.get(
  "/rewards",
  AuthMiddleware().verifyUserToken,
  ErrorHandlerMiddleware(RewardController.getRewards),
  ResponseMiddleware
);
export default userRouter;
