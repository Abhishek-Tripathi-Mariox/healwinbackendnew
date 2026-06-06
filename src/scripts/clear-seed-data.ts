/**
 * Script to clear sample/seed data from the database
 * Removes default placeholder content while keeping admin users and roles
 *
 * Usage: cd backend && npx tsx src/scripts/clear-seed-data.ts
 */

import mongoose from "mongoose";
import config from "../config";

// Import models that have seed data
import VehicleCategory from "../models/vehicle-category.model";
import VehicleType from "../models/vehicle-type.model";
import ServiceType from "../models/service-type.model";
import AddonService from "../models/addon-service.model";
import GoodsType from "../models/goods-type.model";
import CancellationReason from "../models/cancellation-reason.model";
import { TimeSlot } from "../models/time-slot.model";
import { AppConfig, FareConfig } from "../models/app-config.model";
import { FAQ, Content } from "../models/content.model";

// Content models (frontend website data)
import AboutContent from "../models/about-content.model";
import HomeContent from "../models/home-content.model";
import { ContactContent } from "../models/contact-content.model";
import { ContactMessage } from "../models/contact-message.model";
import NewsArticle from "../models/news-article.model";
import GalleryImage from "../models/gallery-image.model";
import ArticleSubmission from "../models/article-submission.model";
import { TeamMember } from "../models/team-member.model";
import { Career } from "../models/career.model";
import { CareerApplication } from "../models/career-application.model";
import CmsPage from "../models/cms-page.model";

const clearSeedData = async () => {
  try {
    console.log("🗑️  Starting seed data cleanup...");
    await mongoose.connect(config.database.url);
    console.log("✅ Connected to MongoDB\n");

    // === SEED DATA (from seeds/index.ts) ===

    // Clear Vehicle Categories
    const vcCount = await VehicleCategory.countDocuments();
    if (vcCount > 0) {
      await VehicleCategory.deleteMany({});
      console.log(`🗑️  Cleared ${vcCount} vehicle categories`);
    }

    // Clear Vehicle Types
    const vtCount = await VehicleType.countDocuments();
    if (vtCount > 0) {
      await VehicleType.deleteMany({});
      console.log(`🗑️  Cleared ${vtCount} vehicle types`);
    }

    // Clear Service Types
    const stCount = await ServiceType.countDocuments();
    if (stCount > 0) {
      await ServiceType.deleteMany({});
      console.log(`🗑️  Cleared ${stCount} service types`);
    }

    // Clear Addon Services
    const asCount = await AddonService.countDocuments();
    if (asCount > 0) {
      await AddonService.deleteMany({});
      console.log(`🗑️  Cleared ${asCount} addon services`);
    }

    // Clear Goods Types
    const gtCount = await GoodsType.countDocuments();
    if (gtCount > 0) {
      await GoodsType.deleteMany({});
      console.log(`🗑️  Cleared ${gtCount} goods types`);
    }

    // Clear Cancellation Reasons
    const crCount = await CancellationReason.countDocuments();
    if (crCount > 0) {
      await CancellationReason.deleteMany({});
      console.log(`🗑️  Cleared ${crCount} cancellation reasons`);
    }

    // Clear Time Slots
    const tsCount = await TimeSlot.countDocuments();
    if (tsCount > 0) {
      await TimeSlot.deleteMany({});
      console.log(`🗑️  Cleared ${tsCount} time slots`);
    }

    // Clear App Config
    const acCount = await AppConfig.countDocuments();
    if (acCount > 0) {
      await AppConfig.deleteMany({});
      console.log(`🗑️  Cleared ${acCount} app config entries`);
    }

    // Clear Fare Config
    const fcCount = await FareConfig.countDocuments();
    if (fcCount > 0) {
      await FareConfig.deleteMany({});
      console.log(`🗑️  Cleared ${fcCount} fare config entries`);
    }

    // Clear FAQs
    const faqCount = await FAQ.countDocuments();
    if (faqCount > 0) {
      await FAQ.deleteMany({});
      console.log(`🗑️  Cleared ${faqCount} FAQs`);
    }

    // Clear placeholder Content (Terms, Privacy Policy)
    const contentCount = await Content.countDocuments();
    if (contentCount > 0) {
      await Content.deleteMany({});
      console.log(`🗑️  Cleared ${contentCount} content entries`);
    }

    // === WEBSITE CONTENT DATA ===

    // Clear About page content
    const aboutCount = await AboutContent.countDocuments();
    if (aboutCount > 0) {
      await AboutContent.deleteMany({});
      console.log(`🗑️  Cleared ${aboutCount} about content entries`);
    }

    // Clear Home page content
    const homeCount = await HomeContent.countDocuments();
    if (homeCount > 0) {
      await HomeContent.deleteMany({});
      console.log(`🗑️  Cleared ${homeCount} home content entries`);
    }

    // Clear Contact page content
    const contactCount = await ContactContent.countDocuments();
    if (contactCount > 0) {
      await ContactContent.deleteMany({});
      console.log(`🗑️  Cleared ${contactCount} contact content entries`);
    }

    // Clear Contact Messages
    const msgCount = await ContactMessage.countDocuments();
    if (msgCount > 0) {
      await ContactMessage.deleteMany({});
      console.log(`🗑️  Cleared ${msgCount} contact messages`);
    }

    // Clear News Articles
    const newsCount = await NewsArticle.countDocuments();
    if (newsCount > 0) {
      await NewsArticle.deleteMany({});
      console.log(`🗑️  Cleared ${newsCount} news articles`);
    }

    // Clear Gallery Images
    const galleryCount = await GalleryImage.countDocuments();
    if (galleryCount > 0) {
      await GalleryImage.deleteMany({});
      console.log(`🗑️  Cleared ${galleryCount} gallery images`);
    }

    // Clear Article Submissions
    const articleCount = await ArticleSubmission.countDocuments();
    if (articleCount > 0) {
      await ArticleSubmission.deleteMany({});
      console.log(`🗑️  Cleared ${articleCount} article submissions`);
    }

    // Clear Team Members
    const teamCount = await TeamMember.countDocuments();
    if (teamCount > 0) {
      await TeamMember.deleteMany({});
      console.log(`🗑️  Cleared ${teamCount} team members`);
    }

    // Clear Careers
    const careerCount = await Career.countDocuments();
    if (careerCount > 0) {
      await Career.deleteMany({});
      console.log(`🗑️  Cleared ${careerCount} career listings`);
    }

    // Clear Career Applications
    const appCount = await CareerApplication.countDocuments();
    if (appCount > 0) {
      await CareerApplication.deleteMany({});
      console.log(`🗑️  Cleared ${appCount} career applications`);
    }

    // Clear CMS Pages
    const cmsCount = await CmsPage.countDocuments();
    if (cmsCount > 0) {
      await CmsPage.deleteMany({});
      console.log(`🗑️  Cleared ${cmsCount} CMS pages`);
    }

    console.log("\n✅ All sample/seed data has been cleared!");
    console.log("ℹ️  Admin users and roles were preserved.");
    console.log("ℹ️  You can now add real data through the admin panel.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Cleanup failed:", error);
    process.exit(1);
  }
};

clearSeedData();
