/**
 * One-shot Redis cleanup for dev.
 *
 * Usage (run from backend/):
 *   npx ts-node scripts/flush-redis.ts              # clear rate-limit keys only (safe default)
 *   npx ts-node scripts/flush-redis.ts otp          # also clear pending OTP entries
 *   npx ts-node scripts/flush-redis.ts all          # flush EVERYTHING in this Redis DB (danger)
 *
 * Walks keys with SCAN (not KEYS) so it works on Upstash without a blocking op.
 */
import { initRedis, getRedisClient } from "../src/utils/redis.util";

type Scope = "rate-limit" | "otp" | "all";

const scopeArg = (process.argv[2] || "rate-limit").toLowerCase();
const scope: Scope =
  scopeArg === "otp" ? "otp" : scopeArg === "all" ? "all" : "rate-limit";

// Note: rate-limit keys are stored under the prefixed form "ratelimit:rl:*"
// because rateLimiter.isAllowed in redis.util.ts adds its own "ratelimit:"
// namespace on top of the keyPrefix we pass in rate-limit.middleware.ts.
const PATTERNS: Record<Exclude<Scope, "all">, string[]> = {
  "rate-limit": ["ratelimit:*", "rl:*"],
  otp: ["ratelimit:*", "rl:*", "USER|txnId:*", "USER_Mob_*"],
};

const main = async () => {
  await initRedis();
  const client = getRedisClient();

  if (scope === "all") {
    const reply = await client.flushDb();
    console.log(`[flush-redis] FLUSHDB -> ${reply}`);
    await client.quit();
    return;
  }

  const patterns = PATTERNS[scope];
  let total = 0;

  for (const pattern of patterns) {
    let cursor: string = "0";
    const matched: string[] = [];
    do {
      const res = await (client as any).scan(cursor, {
        MATCH: pattern,
        COUNT: 200,
      });
      cursor = String(res.cursor);
      matched.push(...res.keys);
    } while (cursor !== "0");

    if (matched.length === 0) {
      console.log(`[flush-redis] no keys for "${pattern}"`);
      continue;
    }
    // Delete in batches (UNLINK is non-blocking on Redis 4+; Upstash supports it).
    const batchSize = 100;
    for (let i = 0; i < matched.length; i += batchSize) {
      const slice = matched.slice(i, i + batchSize);
      await client.unlink(slice);
    }
    console.log(`[flush-redis] "${pattern}": deleted ${matched.length} keys`);
    total += matched.length;
  }

  console.log(`[flush-redis] done. scope="${scope}" totalDeleted=${total}`);
  await client.quit();
};

main().catch((err) => {
  console.error("[flush-redis] failed:", err);
  process.exit(1);
});
