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
    body("mobileNumber").matches(/^[6-9]\d{9}$/),
    body("countryCode").optional().isString(),
    body("role").isIn(["driver", "attendant"]),
    body("providerId").isMongoId(),
    body("fullName").isString().trim().notEmpty(),
    body("email").optional().isEmail(),
    body("gender").optional().isIn(["Male", "Female", "Other"]),
    body("dob").optional().isString(),
    body("profilePhoto").optional().isString(),
    body("licenseNumber").optional().isString(),
    body("licenseImage").optional().isString(),
    body("certifications").optional().isArray(),
    body("certificationImages").optional().isArray(),
  ]),
  validateUpdate: run([
    body("mobileNumber").optional().matches(/^[6-9]\d{9}$/),
    body("countryCode").optional().isString(),
    body("fullName").optional().isString().trim().notEmpty(),
    body("email").optional().isEmail(),
    body("gender").optional().isIn(["Male", "Female", "Other"]),
    body("dob").optional().isString(),
    body("profilePhoto").optional().isString(),
    body("licenseNumber").optional().isString(),
    body("licenseImage").optional().isString(),
    body("certifications").optional().isArray(),
    body("certificationImages").optional().isArray(),
    body("isActive").optional().isBoolean(),
  ]),
  validateLoginPhone: run([
    body("mobileNumber").matches(/^[6-9]\d{9}$/),
    body("countryCode").optional().isString(),
  ]),
  validateVerifyOtp: run([
    body("mobileNumber").matches(/^[6-9]\d{9}$/),
    body("otp").isString().isLength({ min: 4, max: 6 }),
    body("txnId").isString().notEmpty(),
    body("fcmToken").optional().isString(),
  ]),
  validateLocation: run([
    body("lat").isFloat({ min: -90, max: 90 }),
    body("lng").isFloat({ min: -180, max: 180 }),
    body("heading").optional().isFloat(),
    body("speed").optional().isFloat(),
  ]),
  // The off-duty *requirement* of `reasonId` is enforced in the controller
  // (so we can validate it points at an active row, not just a valid ObjectId).
  // Here we only typecheck the shape of any present fields.
  validateDuty: run([
    body("isDutyOn").isBoolean(),
    body("reasonId").optional().isMongoId(),
    body("notes").optional().isString().isLength({ max: 500 }),
  ]),
});
