import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import jwt from "jsonwebtoken";
import config from "../config";
import { getRedisClient } from "./redis.util";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userType?: "USER" | "DRIVER" | "ADMIN";
}

let io: Server | null = null;

/**
 * Initialize Socket.io with Redis adapter for scaling
 */
export const initSocket = async (httpServer: HttpServer): Promise<Server> => {
  io = new Server(httpServer, {
    cors: {
      origin: config.cors.origin || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 5000,
    transports: ["websocket", "polling"],
  });

  // Use Redis adapter for horizontal scaling
  try {
    const redisClient = getRedisClient();
    const pubClient = redisClient.duplicate();
    const subClient = redisClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log("Socket.io: Redis adapter initialized");
  } catch (error) {
    console.warn(
      "Socket.io: Running without Redis adapter (single instance mode)",
    );
  }

  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;

    // Public (anonymous) clients are allowed to connect WITHOUT a token — the
    // marketing website uses this to watch live SOS status for the submission
    // it just created. They get no user room and can only subscribe to
    // `sos-submission:<id>` (a room we only push non-sensitive status to), and
    // privileged events (driver:location, etc.) are gated by userType below.
    if (!token) {
      return next();
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      // Token id key differs per role: patient { userId }, driver { driverId },
      // ambulance-staff { staffId }, admin { adminId }. emitToUser() targets
      // `user:<thatId>`, so the socket must join the room for whichever id the
      // token carries — otherwise dispatch:incoming / booking:request never
      // reach the crew.
      socket.userId =
        decoded._id ||
        decoded.userId ||
        decoded.driverId ||
        decoded.staffId ||
        decoded.adminId;
      socket.userType =
        decoded.userType ||
        (decoded.driverId ? "DRIVER" : decoded.adminId ? "ADMIN" : "USER");
      next();
    } catch (error) {
      next(new Error("Invalid token"));
    }
  });

  // Connection handler
  io.on("connection", (socket: AuthenticatedSocket) => {
    console.log(`Socket connected: ${socket.userId} (${socket.userType})`);

    // Join user-specific room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);

      if (socket.userType === "DRIVER") {
        socket.join("drivers");
      }
      if (socket.userType === "ADMIN") {
        socket.join("admin");
      }
    }

    // Admin web clients explicitly opt into the "admin" broadcast room (their
    // JWT may not carry userType=ADMIN), so they receive sos/dispatch events.
    socket.on("join:admin", () => socket.join("admin"));

    // Public website caller watches their own SOS submission's live status.
    socket.on("sos:subscribe", (data) => {
      const id = data?.id || data?.submissionId;
      if (id) socket.join(`sos-submission:${id}`);
    });
    socket.on("sos:unsubscribe", (data) => {
      const id = data?.id || data?.submissionId;
      if (id) socket.leave(`sos-submission:${id}`);
    });

    // Handle driver location updates
    socket.on("driver:location:update", async (data) => {
      if (socket.userType !== "DRIVER" || !socket.userId) return;

      const { lat, lng, heading, speed } = data;

      // Cache driver location in Redis
      const locationData = {
        driverId: socket.userId,
        lat,
        lng,
        heading,
        speed,
        timestamp: Date.now(),
      };

      try {
        const redis = getRedisClient();
        await redis.setEx(
          `driver:location:${socket.userId}`,
          30, // 30 second TTL
          JSON.stringify(locationData),
        );

        // Add to geospatial index for nearby driver queries
        await redis.geoAdd("driver:locations", {
          longitude: lng,
          latitude: lat,
          member: socket.userId,
        });
      } catch (error) {
        console.error("Error updating driver location:", error);
      }

      // Emit to tracking users (those tracking this driver's booking)
      socket
        .to(`tracking:driver:${socket.userId}`)
        .emit("driver:location", locationData);
    });

    // Handle driver going online/offline
    socket.on("driver:status", async (data) => {
      if (socket.userType !== "DRIVER" || !socket.userId) return;

      const { isOnline } = data;

      if (isOnline) {
        socket.join("drivers:online");
      } else {
        socket.leave("drivers:online");
        // Remove from geospatial index
        try {
          const redis = getRedisClient();
          await redis.zRem("driver:locations", socket.userId);
        } catch (error) {
          console.error("Error removing driver location:", error);
        }
      }
    });

    // User starts tracking a booking
    socket.on("booking:track:start", (data) => {
      const { bookingId, driverId } = data;
      if (bookingId) socket.join(`booking:${bookingId}`);
      if (driverId) socket.join(`tracking:driver:${driverId}`);
    });

    // User stops tracking
    socket.on("booking:track:stop", (data) => {
      const { bookingId, driverId } = data;
      if (bookingId) socket.leave(`booking:${bookingId}`);
      if (driverId) socket.leave(`tracking:driver:${driverId}`);
    });

    // Handle chat messages (support or booking chat)
    socket.on("chat:message", async (data) => {
      const { ticketId, bookingId, message, messageType } = data;

      const room = ticketId ? `support:${ticketId}` : `booking:${bookingId}`;

      // Broadcast to room
      socket.to(room).emit("chat:message", {
        senderId: socket.userId,
        senderType: socket.userType,
        message,
        messageType: messageType || "TEXT",
        timestamp: new Date().toISOString(),
      });
    });

    // Join chat room
    socket.on("chat:join", (data) => {
      const { ticketId, bookingId } = data;
      if (ticketId) socket.join(`support:${ticketId}`);
      if (bookingId) socket.join(`booking:${bookingId}`);
    });

    // Disconnect handler
    socket.on("disconnect", async () => {
      console.log(`Socket disconnected: ${socket.userId}`);

      // If driver, remove from online drivers
      if (socket.userType === "DRIVER" && socket.userId) {
        try {
          const redis = getRedisClient();
          await redis.zRem("driver:locations", socket.userId);
        } catch (error) {
          console.error("Error removing driver on disconnect:", error);
        }
      }
    });
  });

  return io;
};

/**
 * Get Socket.io instance
 */
export const getIO = (): Server => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};

/**
 * Emit to specific user
 */
export const emitToUser = (userId: string, event: string, data: any): void => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

/** Broadcast to all connected admin web clients (the "admin" room). */
export const emitToAdmin = (event: string, data: any): void => {
  if (io) {
    io.to("admin").emit(event, data);
  }
};

/**
 * Push live status to the public caller watching a SOS submission (website).
 * Only non-sensitive lifecycle status is sent here.
 */
export const emitToSosSubmission = (
  submissionId: string,
  status: string,
  data: any = {},
): void => {
  if (io && submissionId) {
    io.to(`sos-submission:${submissionId}`).emit("sos:status", {
      submissionId: String(submissionId),
      status,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
};

/**
 * Emit to booking room
 */
export const emitToBooking = (
  bookingId: string,
  event: string,
  data: any,
): void => {
  if (io) {
    io.to(`booking:${bookingId}`).emit(event, data);
  }
};

/**
 * Emit to nearby drivers
 */
export const emitToNearbyDrivers = async (
  location: { lat: number; lng: number },
  radiusKm: number,
  event: string,
  data: any,
): Promise<void> => {
  try {
    const redis = getRedisClient();

    // Find drivers within radius
    const nearbyDrivers = await redis.geoSearch(
      "driver:locations",
      { longitude: location.lng, latitude: location.lat },
      { radius: radiusKm, unit: "km" },
    );

    if (io && nearbyDrivers.length > 0) {
      nearbyDrivers.forEach((driverId) => {
        io!.to(`user:${driverId}`).emit(event, data);
      });
    }
  } catch (error) {
    console.error("Error emitting to nearby drivers:", error);
  }
};

/**
 * Emit booking status update
 */
export const emitBookingUpdate = (
  bookingId: string,
  userId: string,
  driverId: string | null,
  status: string,
  data?: any,
): void => {
  const updateData = {
    bookingId,
    status,
    timestamp: new Date().toISOString(),
    ...data,
  };

  // Emit to booking room
  emitToBooking(bookingId, "booking:status", updateData);

  // Emit to user directly
  emitToUser(userId, "booking:status", updateData);

  // Emit to driver if assigned
  if (driverId) {
    emitToUser(driverId, "booking:status", updateData);
  }
};

export default {
  initSocket,
  getIO,
  emitToUser,
  emitToBooking,
  emitToNearbyDrivers,
  emitBookingUpdate,
};
