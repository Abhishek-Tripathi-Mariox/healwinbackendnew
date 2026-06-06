import { createClient, RedisClientType } from "redis";
import config from "../config";

let client: RedisClientType | null = null;

/**
 * Initialize Redis connection
 */
export const initRedis = async (): Promise<RedisClientType> => {
  if (client) return client;

  client = createClient({
    url: config.redis.url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error("Redis: Max reconnection attempts reached");
          return new Error("Max retries reached");
        }
        return Math.min(retries * 100, 3000);
      },
    },
  });

  client.on("error", (err) => console.error("Redis Client Error:", err));
  client.on("connect", () => console.log("Redis: Connected"));
  client.on("reconnecting", () => console.log("Redis: Reconnecting..."));

  await client.connect();
  return client;
};

/**
 * Get Redis client
 */
export const getRedisClient = (): RedisClientType => {
  if (!client) {
    throw new Error("Redis client not initialized. Call initRedis first.");
  }
  return client;
};

/**
 * Cache utilities
 */
export const cache = {
  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedisClient();
    const value = await redis.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  },

  /**
   * Set cached value with optional TTL (in seconds)
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const redis = getRedisClient();
    const stringValue = typeof value === "string" ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await redis.setEx(key, ttlSeconds, stringValue);
    } else {
      await redis.set(key, stringValue);
    }
  },

  /**
   * Delete cached value
   */
  async del(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(key);
  },

  /**
   * Delete multiple keys by pattern
   */
  async delPattern(pattern: string): Promise<void> {
    const redis = getRedisClient();
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  },

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const redis = getRedisClient();
    return (await redis.exists(key)) === 1;
  },

  /**
   * Increment counter
   */
  async incr(key: string): Promise<number> {
    const redis = getRedisClient();
    return await redis.incr(key);
  },

  /**
   * Set expiry on existing key
   */
  async expire(key: string, seconds: number): Promise<void> {
    const redis = getRedisClient();
    await redis.expire(key, seconds);
  },
};

/**
 * Rate limiter using Redis
 */
export const rateLimiter = {
  /**
   * Check if request is allowed
   * @returns true if allowed, false if rate limited
   */
  async isAllowed(
    identifier: string,
    maxRequests: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
    const redis = getRedisClient();
    const key = `ratelimit:${identifier}`;

    const current = await redis.incr(key);
    
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const allowed = current <= maxRequests;
    const remaining = Math.max(0, maxRequests - current);

    return { allowed, remaining, resetIn: ttl };
  },
};

/**
 * Session store using Redis
 */
export const sessionStore = {
  async set(sessionId: string, data: any, ttlSeconds = 86400): Promise<void> {
    await cache.set(`session:${sessionId}`, data, ttlSeconds);
  },

  async get<T>(sessionId: string): Promise<T | null> {
    return await cache.get<T>(`session:${sessionId}`);
  },

  async delete(sessionId: string): Promise<void> {
    await cache.del(`session:${sessionId}`);
  },

  async extend(sessionId: string, ttlSeconds = 86400): Promise<void> {
    await cache.expire(`session:${sessionId}`, ttlSeconds);
  },
};

/**
 * Pub/Sub for real-time updates
 */
export const pubsub = {
  async publish(channel: string, message: any): Promise<void> {
    const redis = getRedisClient();
    await redis.publish(channel, JSON.stringify(message));
  },

  async subscribe(
    channel: string,
    callback: (message: any) => void
  ): Promise<void> {
    const subscriber = getRedisClient().duplicate();
    await subscriber.connect();
    
    await subscriber.subscribe(channel, (message) => {
      try {
        callback(JSON.parse(message));
      } catch {
        callback(message);
      }
    });
  },
};

export default {
  initRedis,
  getRedisClient,
  cache,
  rateLimiter,
  sessionStore,
  pubsub,
};
