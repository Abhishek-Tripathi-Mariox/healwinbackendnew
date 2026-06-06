import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";

const run =
  (checks: any[]) =>
  async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(checks.map((c) => c.run(req)));
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        rCode: 0,
        rMsg: "validation_failed",
        rData: { errors: errors.array() },
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
    body("role").isIn(["driver", "attendant"]),
  ]),
  validateUnassign: run([body("role").isIn(["driver", "attendant"])]),
});
