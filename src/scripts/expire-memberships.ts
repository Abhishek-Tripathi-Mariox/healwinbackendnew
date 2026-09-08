/**
 * Sweep lapsed memberships to "expired".
 *
 * Reads already self-correct (see membership.service), so this is for the
 * reporting side: an admin counting "active members" should not be counting
 * rows that merely have not been opened lately.
 *
 * Safe to run on a schedule — daily is plenty.
 *
 * Usage: npm run expire:memberships
 */
import mongoose from "mongoose";
import config from "../config";
import { expireLapsedMemberships } from "../services/membership.service";

(async () => {
  try {
    await mongoose.connect(config.database.url);
    const n = await expireLapsedMemberships();
    console.log(
      n > 0
        ? `✅ Expired ${n} lapsed membership(s).`
        : "✅ Nothing to expire — every active membership is still valid.",
    );
  } catch (e) {
    console.error("❌ expire failed:", e);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
