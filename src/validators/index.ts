import validator from "node-input-validator";
import { Request, Response, NextFunction } from "express";
import { Model } from "mongoose";

import ResponseMiddleware from "../middlewares/response.middleware";
import helpers from "../utils/helpers";
import { models, ModelName } from "../models";

/**
 * Helper to safely get model
 */
const getModel = (name: ModelName): Model<any> => {
  return models[name];
};

/**
 * Custom rule: unique
 */
validator.extend("unique", async ({ value, args }: any) => {
  const modelName = args[0] as ModelName;
  const field = args[1];
  const Model = getModel(modelName);

  let result;

  if (args.length > 2) {
    result = await Model.findOne({
      [field]: value,
      [args[2]]: { $ne: args[3] },
    });
  } else {
    result = await Model.find({ [field]: value });
  }

  return !result || (Array.isArray(result) && result.length === 0);
});

/**
 * Custom rule: exists
 */
validator.extend("exists", async ({ value, args }: any) => {
  const modelName = args[0] as ModelName;
  const field = args[1];
  const Model = getModel(modelName);

  const result = await Model.find({ [field]: value });
  return result.length > 0;
});

/**
 * Custom rule: allowedValues
 */
validator.extend("allowedValues", ({ value, args }: any) => {
  return args.includes(value);
});

/**
 * Common validate handler
 */
export const validate = async (
  v: any,
  res: Response,
  next: NextFunction,
  req: Request
) => {
  const matched = await v.check();

  if (!matched) {
    req.rCode = 0;
    const message = helpers().getErrorMessage(v.errors);
    return ResponseMiddleware(req, res, next, message);
  }

  next();
};

/**
 * Validation rules
 */
export const validations = {
  general: {
    requiredNumeric: "required|numeric",
    requiredBoolean: "required|boolean",
    requiredInt: "required|integer",
    requiredString: "required|string|maxLength:255",
    requiredStrings: "required|string",
  },
  user: {
    id: "required|string|exists:User,_id|maxLength:250",
    username: "required|string|unique:User,username|maxLength:50",
    uniqMobile:
      "required|numeric|unique:User,mobileNumber|minLength:10|maxLength:10",
    existsUsername: "required|string|exists:User,username|maxLength:50",
    existsmobile: "required|string|exists:User,mobileNumber|maxLength:50",
  },
  address: {
    id: "required|string|exists:UserAddress,_id|maxLength:250",
  },
};
