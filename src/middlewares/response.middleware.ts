import { Request, Response, NextFunction } from "express";
import messages, { MessageKey } from "../utils/messages";

const ResponseMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
  customMsg: string = ""
) => {
  console.log("ResponseMiddleware => called");

  const data = req.rData ?? {};
  const code = req.rCode ?? 1;

  const message = customMsg
    ? customMsg
    : req.msg
    ? messages()[req.msg as MessageKey]
    : "success";

  switch (code) {
    case 3:
      return res.status(401).json({ code, message, data });
    case 4:
      return res.status(403).json({ code, message, data });
    case 0:
      return res.status(400).json({ code, message, data });
    case 5:
      return res.status(404).json({ code, message, data });
    default:
      return res.json({ code, message, data });
  }
};

export default ResponseMiddleware;
