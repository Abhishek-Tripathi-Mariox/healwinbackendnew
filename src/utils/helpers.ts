import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import messages, { MessageKey, Lang } from "./messages";
import { Response } from "express";
import config from "../config";

/**
 * How many digits every OTP in the system has — login (patient, driver,
 * ambulance staff), careers verification and the ambulance pickup code.
 * Single source of truth: the generators, the request validators and the
 * apps' OTP input boxes all derive their length from this, so the backend
 * and the four front-ends cannot drift out of step again.
 */
export const OTP_LENGTH = 4;

/**
 * Make a user-typed search term safe to drop into a `$regex`.
 *
 * Two problems, both of which get worse with data volume:
 *
 *  • Correctness — a search for "C++" or "(ICU)" is not a valid pattern, so it
 *    either throws or quietly matches the wrong things.
 *  • Denial of service — a crafted term such as "(a+)+$" backtracks
 *    catastrophically. Against a hundred thousand documents that is enough to
 *    tie up the database from a single unauthenticated search box.
 *
 * Escaping every metacharacter makes the term literal, which is what a search
 * box means anyway.
 */
export const escapeRegex = (input: unknown): string =>
  String(input ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
  const generateOTP = (length: number = OTP_LENGTH): number => {
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
