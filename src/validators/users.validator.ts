import { Validator } from "node-input-validator";
import { Request, Response, NextFunction } from "express";
import { validate, validations } from "./index";

const UsersValidator = () => {
  const validateUserLogin = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const v = new Validator(req.body, {
      username: validations.user.existsUsername,
      password: validations.general.requiredString,
    });

    validate(v, res, next, req);
  };

  const validateAddUser = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const v = new Validator(req.body, {
      username: validations.user.username,
      password: validations.general.requiredString,
      fullName: validations.general.requiredString,
      isAdmin: validations.general.requiredBoolean,
    });

    validate(v, res, next, req);
  };

  const validateAddAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const v = new Validator(req.body, {
      username: validations.general.requiredString,
      password: validations.general.requiredString,
      fullName: validations.general.requiredString,
      isAdmin: validations.general.requiredBoolean,
    });

    validate(v, res, next, req);
  };

  const validateUserId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    if (req.body.username) {
      await validateUserName(req, res, next);
    }

    const v = new Validator(req.params, {
      id: validations.user.id,
    });

    validate(v, res, next, req);
  };

  const validateUserName = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const v = new Validator(req.body, {
      username: validations.user.username,
    });

    validate(v, res, next, req);
  };

  const validateAddressId = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const v = new Validator(req.params, {
      id: validations.address.id,
    });

    validate(v, res, next, req);
  };

  const validateAddress = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const v = new Validator(req.body, {
      fullName: validations.general.requiredString,

      houseNo: validations.general.requiredString, // NEW
      area: validations.general.requiredString, // NEW

      mobileNumber: validations.general.requiredNumeric, // NEW

      district: validations.general.requiredString,
      state: validations.general.requiredString,
      pinCode: validations.general.requiredInt,

      addressType: validations.general.requiredString, // Home / Work / Other
    });

    validate(v, res, next, req);
  };

  return {
    validateUserLogin,
    validateAddUser,
    validateAddAdmin,
    validateUserId,
    validateUserName,
    validateAddress,
    validateAddressId,
  };
};

export default UsersValidator;
