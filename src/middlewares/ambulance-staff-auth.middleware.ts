import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import config from "../config";
import AmbulanceStaff from "../models/ambulance-staff.model";

export interface AmbulanceStaffRequest extends Request {
  staffId?: string;
  staffRole?: "driver" | "attendant";
  providerId?: string;
}

export default () => ({
  verifyStaffToken: async (
    req: AmbulanceStaffRequest,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        return res
          .status(401)
          .json({ rCode: 0, rMsg: "unauthorized", rData: {} });
      }

      const decoded: any = jwt.verify(token, config.auth.jwtSecret);
      if (!decoded.staffId || !decoded.role) {
        return res
          .status(401)
          .json({ rCode: 0, rMsg: "invalid_token", rData: {} });
      }

      const staff = await AmbulanceStaff.findById(decoded.staffId).select(
        "isActive isDeleted role providerId",
      );
      if (!staff || !staff.isActive || staff.isDeleted) {
        return res
          .status(401)
          .json({ rCode: 0, rMsg: "account_inactive", rData: {} });
      }

      req.staffId = decoded.staffId;
      req.staffRole = staff.role;
      req.providerId = String(staff.providerId);

      // Fire-and-forget heartbeat. Updating lastSeenAt here (vs only in
      // updateLocation / setDuty) gives an honest "active now" signal on
      // the admin detail page — otherwise an attendant who can't ping
      // location appears idle even while actively using the app.
      AmbulanceStaff.updateOne(
        { _id: decoded.staffId },
        { $set: { lastSeenAt: new Date() } },
      ).catch((e) => {
        console.warn("[staff-auth] lastSeenAt heartbeat failed:", e?.message);
      });

      next();
    } catch (error) {
      console.error("Ambulance Staff Auth Middleware Error:", error);
      return res
        .status(401)
        .json({ rCode: 0, rMsg: "invalid_token", rData: {} });
    }
  },

  requireDriver: (
    req: AmbulanceStaffRequest,
    res: Response,
    next: NextFunction,
  ) => {
    if (req.staffRole !== "driver") {
      return res
        .status(403)
        .json({ rCode: 0, rMsg: "forbidden_role", rData: {} });
    }
    next();
  },
});
