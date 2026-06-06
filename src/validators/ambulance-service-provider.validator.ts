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
    body("name").isString().trim().notEmpty(),
    body("contactPersonName").isString().trim().notEmpty(),
    body("phone").matches(/^[6-9]\d{9}$/),
    body("email").optional().isEmail(),
    body("address").optional().isString(),
    body("state").isMongoId(),
    body("district").isMongoId(),
    body("gstin").optional().isString(),
  ]),
  validateUpdate: run([
    body("name").optional().isString().trim().notEmpty(),
    body("contactPersonName").optional().isString().trim().notEmpty(),
    body("phone").optional().matches(/^[6-9]\d{9}$/),
    body("email").optional().isEmail(),
    body("address").optional().isString(),
    body("state").optional().isMongoId(),
    body("district").optional().isMongoId(),
    body("gstin").optional().isString(),
    body("isActive").optional().isBoolean(),
  ]),
});
