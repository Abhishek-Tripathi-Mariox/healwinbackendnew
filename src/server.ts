import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import compression from "compression";
import path from "path";
import { createServer } from "http";
import swaggerUi from "swagger-ui-express";

import routes from "./routes";
import connectDB from "./models";
import config from "./config";
import swaggerSpec from "./config/swagger";
import { initRedis } from "./utils/redis.util";
import { initSocket } from "./utils/socket.util";
import { initMqtt, closeMqtt } from "./utils/mqtt.util";
import { initializeFirebase } from "./services/notification.service";
import { startShiftStateMachine } from "./services/shift-state-machine.service";
import { startHmsAlertScheduler } from "./services/hms-alerts.service";
import { botGuard } from "./middlewares/rate-limit.middleware";
import {
  requestTimeout,
  requestId,
  securityHeaders,
  healthCheck,
  gracefulShutdown,
  requestLogger,
} from "./middlewares/server.middleware";

const app = express();

// Trust the first proxy (nginx / ALB / Cloudflare) so req.ip reflects the real client
app.set("trust proxy", 1);

const httpServer = createServer(app);

/**
 * Connect MongoDB and Redis, then start server
 */
const startServer = async () => {
  try {
    // Connect MongoDB
    await connectDB();
    console.log("MongoDB connected");

    // Initialize Redis
    await initRedis();
    console.log("Redis connected");

    // Initialize Firebase Admin (push notifications). Non-fatal if missing.
    await initializeFirebase();

    // Shift state machine — transitions scheduled/active/completed and
    // maintains the ambulance's "current crew" cache. Must run AFTER the
    // DB connects so the first tick can actually read.
    startShiftStateMachine();

    // HMS operational alerts digest (low stock / expiring / due follow-ups).
    startHmsAlertScheduler();

    // Start listening only after all connections are ready
    const PORT = config.server.port;
    httpServer.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${config.env || "development"}`);
    });

    // Graceful shutdown
    gracefulShutdown(httpServer);
  } catch (error) {
    console.error("Failed to initialize connections:", error);
    process.exit(1);
  }
};

/**
 * Security & Performance Middleware
 */
app.use(compression()); // Compress responses
app.use(requestId()); // Add request ID for tracing
app.use(requestTimeout(30000)); // 30 second timeout
app.use(securityHeaders()); // Security headers
app.use(requestLogger()); // Request logging

/**
 * Body parser
 */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.text({ limit: "1mb" })); // For sendBeacon text/plain payloads

/**
 * CORS
 */
app.use(
  cors({
    origin: config.cors?.origin || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "x-user-data",
      "x-request-id",
    ],
    credentials: true,
  }),
);

/**
 * Bot / abuse guard — bans IPs showing scanner or high-velocity patterns.
 * Real users are never rate-limited generically; per-endpoint limiters
 * (OTP, auth, booking) handle targeted abuse.
 */
app.use(botGuard());

/**
 * Swagger API Documentation
 */
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    customSiteTitle: "HealWin API Documentation",
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info .title { color: #3b82f6 }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: "none",
      filter: true,
      showRequestDuration: true,
    },
  }),
);

// Swagger JSON endpoint
app.get("/api-docs.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(swaggerSpec);
});

/**
 * Static uploads — patient-app stubs (medical records) write here. Replaced
 * by S3/GCS-backed delivery once the real records pipeline lands.
 */
app.use(
  "/uploads",
  express.static(path.join(process.cwd(), "uploads"), {
    maxAge: "7d",
    fallthrough: false,
  })
);

/**
 * Routes
 */
app.use("/v1/api", routes);

/**
 * Health check endpoints
 */
app.get("/", (_req: Request, res: Response) => {
  res.send("Hello from HealWin backend!");
});

app.get("/health", healthCheck);

/**
 * 404 handler
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

/**
 * Global error handler
 */
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
    ...(config.env === "development" && { stack: err.stack }),
  });
});

startServer();
