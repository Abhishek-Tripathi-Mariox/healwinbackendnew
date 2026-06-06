import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import messages, { MessageKey, Lang } from "./messages";
import { Response } from "express";
import config from "../config";

export default function helpers() {
  /**
   * Standard API response
   */
  const resp = (
    response: Response,
    lang: Lang,
    m: MessageKey = "success",
    data: any = {},
    code: number = 1,
  ) => {
    return response.send({
      message: messages(lang)[m],
      data,
      code,
    });
  };

  /**
   * Extract error message
   */
  const getErrorMessage = (errors: any): string => {
    try {
      for (const key in errors) {
        return errors[key]?.message;
      }
    } catch (ex: any) {
      return "Something is wrong, Please try again later !! " + ex.message;
    }
    return "Unknown error";
  };

  /**
   * Create JWT token
   */
  const createJWT = (payload: object): string => {
    return jwt.sign(payload, config.auth.jwtSecret);
  };

  /**
   * Hash password
   */
  const hashPassword = async (password: string): Promise<string> => {
    const salt = await bcrypt.genSalt();
    return await bcrypt.hash(password, salt);
  };

  /**
   * Generate OTP
   */
  const generateOTP = (length: number = 4): number => {
    return Math.floor(
      Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1),
    );
  };

  /**
   * Check password
   */
  const checkPassword = async (
    password: string,
    hash: string,
  ): Promise<boolean> => {
    return await bcrypt.compare(password, hash);
  };

  return {
    resp,
    getErrorMessage,
    createJWT,
    hashPassword,
    checkPassword,
    generateOTP,
  };
}
