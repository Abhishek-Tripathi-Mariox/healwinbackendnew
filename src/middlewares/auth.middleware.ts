import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import config from "../config";
import * as UserService from "../services/user.service";
import ResponseMiddleware from "./response.middleware";

interface JwtPayload {
  userId: string;
}

const AuthMiddleware = () => {
  const verifyUserToken = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    console.log("AuthMiddleware => verifyUserToken");

    const authHeader = req.headers.authorization;

    try {
      if (!authHeader) {
        throw new Error("invalid_token");
      }

      const [, token] = authHeader.split(" ");

      const payload = jwt.verify(token, config.auth.jwtSecret) as JwtPayload;

      const user = await UserService.fetchByQuery({
        _id: payload.userId,
      });

      if (!user) {
        throw new Error("invalid_token");
      }

      if (!user.isActive) {
        throw new Error("ac_deactivated");
      }

      // attach userId to request body
      (req as any).userId = user._id;
      (req as any).user = user;
      next();
    } catch (ex: any) {
      req.rCode = 3;
      req.msg =
        ex.message === "ac_deactivated" ? "ac_deactivated" : "invalid_token";

      return ResponseMiddleware(req, res, next);
    }
  };

  return {
    verifyUserToken,
  };
};

export default AuthMiddleware;
