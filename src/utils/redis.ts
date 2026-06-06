import { createClient, RedisClientType } from "redis";
import config from "../config";

let client: RedisClientType;

const initRedis = () => {
  if (!client) {
    client = createClient({
      url: config.redis.url,
    });

    client.on("connect", () => {
      console.log("Connected to Redis server");
    });

    client.on("error", (err: Error) => {
      console.error("Redis error:", err.message);
    });

    client.connect().catch((err: Error) => {
      console.error("Redis connect failed:", err.message);
    });
  }

  return client;
};

export default function redis() {
  const redisClient = initRedis();

  const SetRedis = async (
    key: string,
    val: unknown,
    expireTime?: number
  ): Promise<string> => {
    if (!redisClient.isOpen) {
      throw new Error("Redis client is not connected");
    }

    await redisClient.set(key, JSON.stringify(val));

    if (expireTime) {
      await redisClient.expire(key, expireTime);
    }

    return "Value set in Redis";
  };

  const GetKeys = async (key: string): Promise<string[]> => {
    if (!redisClient.isOpen) {
      throw new Error("Redis client is not connected");
    }

    const exists = await redisClient.exists(key);
    return exists ? [key] : [];
  };

  const GetKeyRedis = async <T = unknown>(key: string): Promise<T | false> => {
    if (!redisClient.isOpen) return false;

    const reply = await redisClient.get(key);
    return reply ? (JSON.parse(reply) as T) : false;
  };

  const GetRedis = async <T = unknown>(key: string): Promise<T[]> => {
    if (!redisClient.isOpen) {
      throw new Error("Redis client is not connected");
    }

    const reply = await redisClient.mGet([key]);
    return reply
      .filter(Boolean)
      .map((v: string | null) => JSON.parse(v as string)) as T[];
  };

  const DeleteRedis = async (key: string): Promise<number> => {
    if (!redisClient.isOpen) {
      return 0;
    }
    return await redisClient.del(key);
  };

  return {
    SetRedis,
    GetKeys,
    GetKeyRedis,
    GetRedis,
    DeleteRedis,
  };
}
