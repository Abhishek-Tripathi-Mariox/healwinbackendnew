import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";

const run =
  (checks: any[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(checks.map((c) => c.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const arr = errors.array();
      // Human-readable summary so the admin UI can show a real message
      // instead of a generic "Request failed".
      const message =
        arr
          .map((e: any) => `${e.path || e.param}: ${e.msg}`)
          .join(", ") || "Validation failed";
      return res.status(400).json({
        code: 0,
        message,
        rCode: 0,
        rMsg: "validation_failed",
        data: { errors: arr },
        rData: { errors: arr },
      });
    }
    next();
  };

export default () => ({
  validateCreate: run([
    body("providerId").isMongoId(),
    body("registrationNumber").isString().trim().notEmpty(),
    body("ambulanceType").isString().trim().notEmpty(),
    body("equipment").optional().isArray(),
    body("fuelType").optional().isIn(["Petrol", "Diesel", "CNG", "EV"]),
    body("rcFrontImage").optional().isString(),
    body("rcBackImage").optional().isString(),
  ]),
  validateUpdate: run([
    body("registrationNumber").optional().isString().trim().notEmpty(),
    body("ambulanceType").optional().isString().trim().notEmpty(),
    body("equipment").optional().isArray(),
    body("fuelType").optional().isIn(["Petrol", "Diesel", "CNG", "EV"]),
    body("rcFrontImage").optional().isString(),
    body("rcBackImage").optional().isString(),
    body("isActive").optional().isBoolean(),
  ]),
  validateAssign: run([
    body("staffId").isMongoId(),
    // role is OPTIONAL — the backend derives it from the staff record itself
    // (the staff doc is the source of truth). The client only sends staffId.
    body("role").optional().isIn(["driver", "attendant"]),
  ]),
  validateUnassign: run([body("role").isIn(["driver", "attendant"])]),
});
