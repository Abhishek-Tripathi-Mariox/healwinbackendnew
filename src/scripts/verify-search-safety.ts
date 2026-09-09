/**
 * Search terms with regex metacharacters must behave as literal text — not
 * throw, not match everything, and not hang the database.
 *
 * Usage: npx ts-node src/scripts/verify-search-safety.ts
 */
import mongoose from "mongoose";
import config from "../config";
import User from "../models/Users";
import { escapeRegex } from "../utils/helpers";

const TAG = "E2E-SEARCH";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};

const run = async () => {
  await mongoose.connect(config.database.url);
  await User.deleteMany({ fullName: new RegExp(`^${TAG}`) });

  const mk = (fullName: string) =>
    User.create({
      fullName,
      countryCode: "+91",
      mobileNumber: `9${String(Date.now() + Math.floor(Math.random() * 1000)).slice(-9)}`,
      role: "user",
      isDeleted: false,
    });

  await mk(`${TAG} Ravi (ICU)`);
  await mk(`${TAG} Sunita C++`);
  await mk(`${TAG} Plain Name`);

  const find = async (term: string) =>
    User.countDocuments({
      isDeleted: false,
      fullName: { $regex: escapeRegex(term), $options: "i" },
    });

  ok("ordinary term still matches", (await find(`${TAG} Plain`)) === 1);
  ok("parentheses are literal", (await find("(ICU)")) === 1, String(await find("(ICU)")));
  ok("plus signs are literal", (await find("C++")) === 1, String(await find("C++")));
  // Unescaped, "." matches any character and would return all three.
  ok("a dot does not act as a wildcard", (await find(`${TAG} Ravi .ICU.`)) === 0);

  // The classic catastrophic-backtracking pattern must be inert and fast.
  const started = Date.now();
  const evil = await find("(a+)+$");
  const took = Date.now() - started;
  ok("a ReDoS pattern is treated as text", evil === 0);
  ok(`ReDoS pattern returns promptly (${took}ms)`, took < 2000, `${took}ms`);

  // Unescaped, this throws — proving the escape is what makes it safe.
  let threwRaw = false;
  try {
    await User.countDocuments({ fullName: { $regex: "(ICU", $options: "i" } });
  } catch {
    threwRaw = true;
  }
  ok("the same term unescaped would have errored", threwRaw);

  await User.deleteMany({ fullName: new RegExp(`^${TAG}`) });
  await mongoose.disconnect();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
};

run().catch(async (e) => {
  console.error("💥", e);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
