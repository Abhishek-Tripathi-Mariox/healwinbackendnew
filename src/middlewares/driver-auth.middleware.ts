import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config";

export default () => {
  return {
    verifyDriverToken: async (
      req: Request,
      res: Response,
      next: NextFunction
    ) => {
      try {
        const token = req.headers.authorization?.replace("Bearer ", "");

        if (!token) {
          return res.status(401).json({
            rCode: 0,
            rMsg: "unauthorized",
            rData: {},
          });
        }

        const decoded: any = jwt.verify(token, config.auth.jwtSecret);

        if (!decoded.driverId) {
          return res.status(401).json({
            rCode: 0,
            rMsg: "invalid_token",
            rData: {},
          });
        }

        (req as any).driverId = decoded.driverId;
        next();
      } catch (error) {
        console.error("Driver Auth Middleware Error:", error);
        return res.status(401).json({
          rCode: 0,
          rMsg: "invalid_token",
          rData: {},
        });
      }
    },
  };
};
