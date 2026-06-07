import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import { EmergencyDispatch } from "../models/emergency-dispatch.model";
import {
  rejectDispatch,
  transitionDispatch,
} from "../services/ambulance-dispatch.service";
import { emitToUser } from "../utils/socket.util";

const asId = (v: string) => new Types.ObjectId(v);

const errCodeMap: Record<string, number> = {
  forbidden: 403,
  dispatch_not_found: 404,
  invalid_status_transition: 409,
  dispatch_not_rejectable: 409,
};

export const accept = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  try {
    const d = await transitionDispatch(
      asId((req.params.id as string)),
      asId(staffId),
      "ACKNOWLEDGED",
    );
    if (d?.dispatchedBy) {
      emitToUser(String(d.dispatchedBy), "dispatch:status", {
        dispatchId: String(d._id),
        status: d.status,
      });
    }
    req.rData = { dispatch: d };
    req.msg = "accepted";
    next();
  } catch (e: any) {
    return res
      .status(errCodeMap[e.message] || 500)
      .json({ rCode: 0, rMsg: e.message, rData: {} });
  }
};

export const reject = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const staffId = (req as any).staffId;
  const { reason } = req.body || {};

  const existing = await EmergencyDispatch.findById((req.params.id as string));
  if (!existing) {
    return res
      .status(404)
      .json({ rCode: 0, rMsg: "dispatch_not_found", rData: {} });
  }
  if (String(existing.driverStaffId) !== String(staffId)) {
    return res
      .status(403)
      .json({ rCode: 0, rMsg: "forbidden", rData: {} });
  }

  try {
    const d = await rejectDispatch(asId((req.params.id as string)), reason);
    if (d?.dispatchedBy) {
      emitToUser(String(d.dispatchedBy), "dispatch:status", {
        dispatchId: String(d._id),
        status: d.status,
        sosId: String(d.sosSubmission),
      });
    }
    req.rData = { dispatch: d };
    req.msg = "rejected";
    next();
  } catch (e: any) {
    return res
      .status(errCodeMap[e.message] || 500)
      .json({ rCode: 0, rMsg: e.message, rData: {} });
  }
};

const makeTransition =
  (to: "EN_ROUTE" | "ON_SCENE" | "COMPLETED") =>
  async (req: Request, res: Response, next: NextFunction) => {
    const staffId = (req as any).staffId;
    try {
      const d = await transitionDispatch(
        asId((req.params.id as string)),
        asId(staffId),
        to,
      );
      if (d?.dispatchedBy) {
        emitToUser(String(d.dispatchedBy), "dispatch:status", {
          dispatchId: String(d._id),
          status: d.status,
        });
      }
      req.rData = { dispatch: d };
      req.msg = `status_${to.toLowerCase()}`;
      next();
    } catch (e: any) {
      return res
        .status(errCodeMap[e.message] || 500)
        .json({ rCode: 0, rMsg: e.message, rData: {} });
    }
  };

export const enRoute = makeTransition("EN_ROUTE");
export const onScene = makeTransition("ON_SCENE");
export const complete = makeTransition("COMPLETED");
