import { Request, Response, NextFunction } from "express";
import { rateLimiter } from "../utils/redis.util";

interface RateLimitOptions {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix?: string;
  keyGenerator?: (req: Request) => string;
  message?: string;
  /**
   * If true, the limiter is skipped when no key can be derived
   * (e.g. phone-based limiter with no phone in body). Useful when
   * another limiter will cover the anonymous path.
   */
  skipIfNoKey?: boolean;
}

const getClientIp = (req: Request): string => {
  return req.ip || req.socket.remoteAddress || "unknown";
};

/**
 * Rate limiting middleware using Redis.
 *
 * Philosophy: key by the *thing being attacked* (phone, email, account)
 * rather than IP, so shared NAT (offices, hospitals, mobile carriers)
 * doesn't cause real users to block each other.
 */
export const rateLimit = (options: RateLimitOptions) => {
  const {
    windowSeconds,
    maxRequests,
    keyPrefix = "rl",
    keyGenerator,
    message = "Too many requests, please try again later",
    skipIfNoKey = false,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let key: string | null;
      if (keyGenerator) {
        key = keyGenerator(req);
        if (!key) {
          if (skipIfNoKey) return next();
          key = `${keyPrefix}:ip:${getClientIp(req)}`;
        }
      } else {
        key = `${keyPrefix}:ip:${getClientIp(req)}`;
      }

      const result = await rateLimiter.isAllowed(
        key,
        maxRequests,
        windowSeconds,
      );

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", result.remaining);
      res.setHeader(
        "X-RateLimit-Reset",
        Math.ceil(Date.now() / 1000) + result.resetIn,
      );

      if (!result.allowed) {
        res.setHeader("Retry-After", result.resetIn);
        return res.status(429).json({
          success: false,
          message,
          retryAfter: result.resetIn,
        });
      }

      next();
    } catch (error) {
      console.error("Rate limiter error:", error);
      // Fail open — never block real users because Redis is down
      next();
    }
  };
};

export const botGuard = () => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Temporarily disabled: velocity-bans were firing on normal SPA navigation.
    // Re-enable once client-side refetch throttling is in place.
    return next();
  };
};

/**
 * Helper: extract phone/mobile from request body for keying.
 */
const phoneFromBody = (req: Request): string => {
  const b: any = req.body || {};
  const phone =
    b.mobileNumber || b.mobile || b.phone || b.phoneNumber || b.email;
  return phone ? String(phone).trim().toLowerCase() : "";
};

/**
 * Predefined rate limiters.
 *
 * All limits target abuse vectors, not normal usage:
 *   - OTP / auth: keyed by phone/email (the thing under attack)
 *   - Booking / upload: keyed by authenticated user
 *   - Search: keyed by user when logged in, else IP
 */
export const rateLimiters = {
  /**
   * OTP send / resend — keyed by phone number.
   * 3 sends per 10 minutes per phone. Protects users from SMS-bombing
   * and protects us from SMS gateway costs.
   */
  otpSend: rateLimit({
    windowSeconds: 600,
    maxRequests: 3,
    keyPrefix: "rl:otp:send",
    keyGenerator: (req) => {
      const phone = phoneFromBody(req);
      return phone ? `rl:otp:send:phone:${phone}` : "";
    },
    message: "Too many OTP requests for this number. Try again in 10 minutes.",
  }),

  /**
   * OTP verify — keyed by txnId when available, else IP.
   * 10 verification attempts per 10 minutes. Stops OTP brute-force.
   */
  otpVerify: rateLimit({
    windowSeconds: 600,
    maxRequests: 10,
    keyPrefix: "rl:otp:verify",
    keyGenerator: (req) => {
      const txn = (req.body && (req.body.txnId || req.body.transactionId)) as
        | string
        | undefined;
      return txn ? `rl:otp:verify:txn:${txn}` : "";
    },
    message: "Too many OTP attempts. Please request a new OTP.",
  }),

  /**
   * Login — keyed by username/email/phone.
   * 10 attempts per 5 min per account. Stops credential stuffing
   * without blocking shared-NAT users.
   */
  auth: rateLimit({
    windowSeconds: 300,
    maxRequests: 10,
    keyPrefix: "rl:auth",
    keyGenerator: (req) => {
      const b: any = req.body || {};
      const id = b.email || b.mobileNumber || b.phone || b.username;
      return id ? `rl:auth:id:${String(id).trim().toLowerCase()}` : "";
    },
    message: "Too many login attempts for this account. Try again in 5 minutes.",
  }),

  /**
   * Booking creation — keyed by user id when authenticated.
   * 20 per minute per user (generous; protects runaway client bugs).
   */
  booking: rateLimit({
    windowSeconds: 60,
    maxRequests: 20,
    keyPrefix: "rl:booking",
    keyGenerator: (req) => {
      const userId =
        (req as any).user?.id ||
        (req as any).user?._id ||
        (req as any).userId;
      return userId ? `rl:booking:u:${userId}` : "";
    },
  }),

  /**
   * Search / fare-estimate — keyed by user when authenticated, else IP.
   * 60 per minute.
   */
  search: rateLimit({
    windowSeconds: 60,
    maxRequests: 60,
    keyPrefix: "rl:search",
    keyGenerator: (req) => {
      const userId =
        (req as any).user?.id ||
        (req as any).user?._id ||
        (req as any).userId;
      if (userId) return `rl:search:u:${userId}`;
      return `rl:search:ip:${getClientIp(req)}`;
    },
  }),

  /**
   * File upload — keyed by user id.
   * 30 per minute per user.
   */
  upload: rateLimit({
    windowSeconds: 60,
    maxRequests: 30,
    keyPrefix: "rl:upload",
    keyGenerator: (req) => {
      const userId =
        (req as any).user?.id ||
        (req as any).user?._id ||
        (req as any).userId;
      if (userId) return `rl:upload:u:${userId}`;
      return `rl:upload:ip:${getClientIp(req)}`;
    },
  }),
};

export default rateLimiters;
