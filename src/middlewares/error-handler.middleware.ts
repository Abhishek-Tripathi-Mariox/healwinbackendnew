import { Request, Response, NextFunction } from "express";
import ResponseMiddleware from "./response.middleware";

const ErrorHandlerMiddleware =
  (handler: Function) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res, next);

      // If response not sent and res.locals.data is set, send success response
      if (!res.headersSent && res.locals.data !== undefined) {
        return res.json({
          success: true,
          data: res.locals.data,
          // Optional; carries things like "this export was truncated", which
          // the caller must be told about rather than left to assume.
          ...(res.locals.meta !== undefined ? { meta: res.locals.meta } : {}),
        });
      }
    } catch (ex: any) {
      console.error("ErrorHandlerMiddleware =>", ex);

      req.rCode = 0;
      const message = `Something went wrong -> ${ex.message}`;

      return ResponseMiddleware(req, res, next, message);
    }
  };

export default ErrorHandlerMiddleware;
