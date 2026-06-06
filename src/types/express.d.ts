import "express";

declare global {
  namespace Express {
    interface Request {
      rData?: any;
      msg?: string;
      rCode?: number;
      files?: any;
      user?: any;
    }
  }
}

export {};
