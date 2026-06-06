import { body, validationResult } from "express-validator";
import { Request, Response, NextFunction } from "express";

export default () => {
  return {
    validateLogin: [
      body("mobileNumber")
        .notEmpty()
        .withMessage("Mobile number is required")
        .matches(/^[6-9]\d{9}$/)
        .withMessage("Invalid mobile number"),
      body("countryCode")
        .optional()
        .isString()
        .withMessage("Country code must be a string"),
      (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            rCode: 0,
            rMsg: "validation_error",
            rData: { errors: errors.array() },
          });
        }
        next();
      },
    ],

    validateOtp: [
      body("otp")
        .notEmpty()
        .withMessage("OTP is required")
        .isLength({ min: 4, max: 6 })
        .withMessage("OTP must be 4-6 digits"),
      body("txnId").notEmpty().withMessage("Transaction ID is required"),
      (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            rCode: 0,
            rMsg: "validation_error",
            rData: { errors: errors.array() },
          });
        }
        next();
      },
    ],

    validatePersonalInfo: [
      body("fullName")
        .notEmpty()
        .withMessage("Full name is required")
        .isLength({ min: 2 })
        .withMessage("Full name must be at least 2 characters"),
      body("email").optional().isEmail().withMessage("Invalid email address"),
      body("gender")
        .optional()
        .isIn(["Male", "Female", "Other"])
        .withMessage("Gender must be Male, Female, or Other"),
      body("dob")
        .optional()
        .isString()
        .withMessage("Date of birth must be a string"),
      body("district").notEmpty().withMessage("District is required"),
      body("state").notEmpty().withMessage("State is required"),
      (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            rCode: 0,
            rMsg: "validation_error",
            rData: { errors: errors.array() },
          });
        }
        next();
      },
    ],

    validateAadhaar: [
      body("aadhaarNumber")
        .notEmpty()
        .withMessage("Aadhaar number is required")
        .matches(/^\d{12}$/)
        .withMessage("Aadhaar number must be 12 digits"),

      (req: Request, res: Response, next: NextFunction) => {
        if (!req.files || !(req.files as any).frontImage) {
          return res.status(400).json({
            rCode: 0,
            rMsg: "validation_error",
            rData: { errors: [{ msg: "Front image is required" }] },
          });
        }

        if (!req.files || !(req.files as any).backImage) {
          return res.status(400).json({
            rCode: 0,
            rMsg: "validation_error",
            rData: { errors: [{ msg: "Back image is required" }] },
          });
        }

        next();
      },
    ],

    validatePan: [
      body("panNumber")
        .notEmpty()
        .matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
        .withMessage("Invalid PAN number format"),

      (req: Request, res: Response, next: NextFunction) => {
        const files = req.files as any;

        if (!files?.frontImage?.length) {
          return res.status(400).json({
            rCode: 0,
            rMsg: "validation_error",
            rData: { errors: [{ msg: "PAN front image is required" }] },
          });
        }

        next();
      },
    ],

    validateDrivingLicense: [
      body("licenseNumber").notEmpty(),
      body("expiryDate").notEmpty(),

      (req: Request, res: Response, next: NextFunction) => {
        const files = req.files as any;

        if (!files?.frontImage?.length || !files?.backImage?.length) {
          return res.status(400).json({
            rCode: 0,
            rMsg: "validation_error",
            rData: {
              errors: [{ msg: "Driving license front & back images required" }],
            },
          });
        }

        next();
      },
    ],

    validateSelfie: [
      (req: Request, res: Response, next: NextFunction) => {
        const files = req.files as any;

        if (!files?.selfieImage?.length) {
          return res.status(400).json({
            rCode: 0,
            rMsg: "validation_error",
            rData: { errors: [{ msg: "Selfie image is required" }] },
          });
        }

        next();
      },
    ],

    validateRC: [
      (req: Request, res: Response, next: NextFunction) => {
        // Check for files from upload.any(), upload.fields(), or upload.single()
        const hasFile =
          req.file ||
          (Array.isArray(req.files) && req.files.length > 0) ||
          (req.files &&
            typeof req.files === "object" &&
            Object.keys(req.files).length > 0);

        if (!hasFile) {
          return res.status(400).json({
            rCode: 0,
            rMsg: "validation_error",
            rData: { errors: [{ msg: "RC image is required" }] },
          });
        }
        next();
      },
    ],

    validateVehicle: [
      body("vehicleTypeId")
        .notEmpty()
        .withMessage("Vehicle type is required")
        .isMongoId()
        .withMessage("Invalid vehicle type ID"),
      body("registrationNumber")
        .notEmpty()
        .withMessage("Registration number is required")
        .isLength({ min: 6, max: 15 })
        .withMessage("Registration number must be 6-15 characters"),
      (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({
            rCode: 0,
            rMsg: "validation_error",
            rData: { errors: errors.array() },
          });
        }
        next();
      },
    ],
  };
};
