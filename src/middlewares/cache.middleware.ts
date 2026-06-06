import { Request, Response, NextFunction } from "express";
import { cache } from "../utils/redis.util";

const CACHE_PREFIX = "api:";

/**
 * Build a cache key from request path + sorted query params.
 * e.g. GET /services?category=health => "api:/services?category=health"
 */
const buildKey = (req: Request): string => {
  const params = new URLSearchParams(
    req.query as Record<string, string>,
  ).toString();
  return `${CACHE_PREFIX}${req.baseUrl}${req.path}${params ? `?${params}` : ""}`;
};

/**
 * Redis cache middleware.
 * - On cache HIT → responds immediately with cached JSON.
 * - On cache MISS → lets the controller run, then caches `res.locals.data`.
 *
 * @param ttl  Time-to-live in seconds (default 300 = 5 min)
 */
export const cacheResponse = (ttl = 300) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== "GET") return next();

    const key = buildKey(req);

    try {
      const cached = await cache.get<any>(key);
      if (cached !== null) {
        res.set("X-Cache", "HIT");
        return res.json({ success: true, data: cached });
      }
    } catch {
      // Redis down → skip cache, let controller handle it
    }

    // Store original json to intercept the response
    const originalJson = res.json.bind(res);
    res.json = ((body: any) => {
      // Cache only successful responses
      if (body?.success && body?.data !== undefined) {
        cache
          .set(key, body.data, ttl)
          .catch(() => {}); // fire-and-forget
      }
      res.set("X-Cache", "MISS");
      return originalJson(body);
    }) as any;

    next();
  };
};

/**
 * Invalidate all cached keys for given route prefixes.
 * Call this after admin create/update/delete operations.
 *
 * Usage: await invalidateCache("/services", "/home-content")
 */
export const invalidateCache = async (...prefixes: string[]): Promise<void> => {
  try {
    for (const prefix of prefixes) {
      await cache.delPattern(`${CACHE_PREFIX}${prefix}*`);
    }
  } catch {
    // Redis down → ignore, cache will expire naturally via TTL
  }
};
