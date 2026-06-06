import { Request, Response, NextFunction } from "express";

/**
 * Request timeout middleware
 */
export const requestTimeout = (timeoutMs: number = 30000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(503).json({
          success: false,
          message: "Request timeout",
        });
      }
    }, timeoutMs);

    // Clear timeout on response finish
    res.on("finish", () => clearTimeout(timeout));
    res.on("close", () => clearTimeout(timeout));

    next();
  };
};

/**
 * Request ID middleware for tracing
 */
export const requestId = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.headers["x-request-id"] || generateRequestId();
    req.headers["x-request-id"] = id as string;
    res.setHeader("X-Request-ID", id);
    next();
  };
};

/**
 * Generate unique request ID
 */
const generateRequestId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
};

/**
 * Security headers middleware
 */
export const securityHeaders = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Prevent clickjacking
    res.setHeader("X-Frame-Options", "DENY");

    // Prevent MIME type sniffing
    res.setHeader("X-Content-Type-Options", "nosniff");

    // Enable XSS filter
    res.setHeader("X-XSS-Protection", "1; mode=block");

    // Referrer policy
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    // Content Security Policy (adjust as needed)
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' data: https:; script-src 'self'",
    );

    next();
  };
};

/**
 * Health check endpoint
 */
export const healthCheck = async (req: Request, res: Response) => {
  const health = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    checks: {} as Record<string, boolean>,
  };

  try {
    // Check MongoDB (basic check)
    const mongoose = require("mongoose");
    health.checks.mongodb = mongoose.connection.readyState === 1;
  } catch {
    health.checks.mongodb = false;
  }

  try {
    // Check Redis
    const { getRedisClient } = require("../utils/redis.util");
    const redis = getRedisClient();
    await redis.ping();
    health.checks.redis = true;
  } catch {
    health.checks.redis = false;
  }

  // Determine overall status
  const allHealthy = Object.values(health.checks).every((v) => v === true);
  if (!allHealthy) {
    health.status = "degraded";
  }

  const statusCode = health.status === "healthy" ? 200 : 503;
  res.status(statusCode).json(health);
};

/**
 * Graceful shutdown handler
 */
export const gracefulShutdown = (server: any) => {
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n${signal} received. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
      console.log("HTTP server closed");
    });

    // Give existing requests time to complete
    const shutdownTimeout = setTimeout(() => {
      console.log("Forcing shutdown after timeout");
      process.exit(1);
    }, 30000); // 30 second timeout

    try {
      // Close database connections
      const mongoose = require("mongoose");
      await mongoose.connection.close();
      console.log("MongoDB connection closed");

      // Close Redis connection
      try {
        const { getRedisClient } = require("../utils/redis.util");
        const redis = getRedisClient();
        await redis.quit();
        console.log("Redis connection closed");
      } catch {
        // Redis might not be initialized
      }

      clearTimeout(shutdownTimeout);
      console.log("Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  // Listen for shutdown signals
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

/**
 * Request logging middleware (optimized for production)
 */
export const requestLogger = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      const logLevel = res.statusCode >= 400 ? "error" : "info";

      const logData = {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        requestId: req.headers["x-request-id"],
        userAgent: req.get("user-agent"),
        ip: req.ip,
      };

      if (logLevel === "error") {
        console.error(JSON.stringify(logData));
      } else if (duration > 1000) {
        // Log slow requests
        console.warn("Slow request:", JSON.stringify(logData));
      }
    });

    next();
  };
};

export default {
  requestTimeout,
  requestId,
  securityHeaders,
  healthCheck,
  gracefulShutdown,
  requestLogger,
};
