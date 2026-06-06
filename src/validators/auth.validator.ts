import { Validator } from "node-input-validator";
import { Request, Response, NextFunction } from "express";
import { validate, validations } from "./index";

const AuthValidator = () => {
  const validateLogin = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const v = new Validator(req.body, {
      // countryCode: validations.general.requiredString,
      mobileNumber: validations.general.requiredNumeric,
    });

    validate(v, res, next, req);
  };

  const validateEmailLogin = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const v = new Validator(req.body, {
      email: validations.general.requiredString,
      password: validations.general.requiredString,
    });

    validate(v, res, next, req);
  };

  const validateOtp = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const v = new Validator(req.body, {
      txnId: validations.general.requiredString,
      otp: validations.general.requiredInt,
    });

    validate(v, res, next, req);
  };

  return {
    validateLogin,
    validateEmailLogin,
    validateOtp,
  };
};

export default AuthValidator;
