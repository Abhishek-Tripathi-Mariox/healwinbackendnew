/**
 * Dev-only: list every key currently in this Redis DB (non-blocking SCAN).
 * Usage:  npx ts-node scripts/list-redis-keys.ts
 */
import { initRedis, getRedisClient } from "../src/utils/redis.util";

const main = async () => {
  await initRedis();
  const client = getRedisClient();
  let cursor: string = "0";
  const keys: string[] = [];
  do {
    const res = await (client as any).scan(cursor, { MATCH: "*", COUNT: 500 });
    cursor = String(res.cursor);
    keys.push(...res.keys);
  } while (cursor !== "0");
  console.log(`Total keys: ${keys.length}`);
  for (const k of keys.sort()) console.log(k);
  await client.quit();
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
