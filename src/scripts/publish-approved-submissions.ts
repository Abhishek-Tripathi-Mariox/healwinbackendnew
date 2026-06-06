/**
 * Backfill: publish submissions that were approved BEFORE the auto-publish
 * fix landed. Such rows have status="approved" but no publishedRefId, so they
 * never appeared in the public News / Gallery. This finds them and publishes
 * each one (article → NewsArticle, gallery → GalleryImage), then stamps
 * publishedRefId so the publish stays idempotent.
 *
 * Run once: cd backend && npx ts-node src/scripts/publish-approved-submissions.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import config from "../config";
import { ArticleSubmission } from "../models/article-submission.model";
import { publishSubmission } from "../controllers/admin/article-submission-admin.controller";

const run = async () => {
  await mongoose.connect(config.database.url);

  const pending = await ArticleSubmission.find({
    status: "approved",
    $or: [{ publishedRefId: { $exists: false } }, { publishedRefId: null }],
  });

  console.log(`\nFound ${pending.length} approved-but-unpublished submission(s)\n`);

  let ok = 0;
  for (const sub of pending) {
    try {
      const refId = await publishSubmission(sub, sub.reviewedBy);
      sub.publishedRefId = refId;
      await sub.save();
      ok++;
      console.log(
        `  ✓ published "${sub.title}" (${sub.submissionType}) → ${refId}`,
      );
    } catch (err) {
      console.error(`  ✗ failed "${sub.title}":`, (err as Error).message);
    }
  }

  console.log(`\nDone. Published ${ok}/${pending.length}.\n`);
  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
