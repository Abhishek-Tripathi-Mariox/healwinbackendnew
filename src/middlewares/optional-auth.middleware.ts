import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

import config from "../config";
import * as UserService from "../services/user.service";

/**
 * Best-effort auth: attaches `req.user` if a valid Bearer token is present,
 * otherwise lets the request continue anonymously. Use on endpoints that
 * accept both anonymous and authenticated callers (e.g. device-token
 * registration that runs both before and after login).
 */
export const optionalUserAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();
  try {
    const [, token] = authHeader.split(" ");
    if (!token) return next();
    const payload = jwt.verify(token, config.auth.jwtSecret) as {
      userId: string;
    };
    const user = await UserService.fetchByQuery({ _id: payload.userId });
    if (user && user.isActive) {
      (req as any).user = user;
      (req as any).userId = user._id;
    }
  } catch {
    // ignore — proceed unauthenticated
  }
  next();
};
