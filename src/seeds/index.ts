import mongoose from "mongoose";
import config from "../config";

// Import models
import VehicleCategory from "../models/vehicle-category.model";
import VehicleType from "../models/vehicle-type.model";
import ServiceType from "../models/service-type.model";
import AddonService from "../models/addon-service.model";
import GoodsType from "../models/goods-type.model";
import CancellationReason from "../models/cancellation-reason.model";
import { TimeSlot } from "../models/time-slot.model";
import { AppConfig, FareConfig } from "../models/app-config.model";
import { Admin } from "../models/admin.model";
import { FAQ, Content } from "../models/content.model";
import bcrypt from "bcryptjs";

const seedDatabase = async () => {
  try {
    console.log("🌱 Starting database seeding...");
    await mongoose.connect(config.database.url);
    console.log("✅ Connected to MongoDB");

    // Seed Vehicle Categories
    console.log("📦 Seeding Vehicle Categories...");
    const categories = [
      {
        name: "2 Wheeler",
        code: "2W",
        description: "Two wheelers for small packages",
        sortOrder: 1,
      },
      {
        name: "3 Wheeler",
        code: "3W",
        description: "Auto rickshaws and tempos",
        sortOrder: 2,
      },
      {
        name: "4 Wheeler",
        code: "4W",
        description: "Cars, vans, and small trucks",
        sortOrder: 3,
      },
      {
        name: "Heavy Vehicle",
        code: "HV",
        description: "Trucks and large vehicles",
        sortOrder: 4,
      },
    ];

    for (const cat of categories) {
      await VehicleCategory.findOneAndUpdate({ code: cat.code }, cat, {
        upsert: true,
        returnDocument: "after",
      });
    }

    // Seed Vehicle Types
    console.log("🚗 Seeding Vehicle Types...");
    const twoWheelerCat = await VehicleCategory.findOne({ code: "2W" });
    const threeWheelerCat = await VehicleCategory.findOne({ code: "3W" });
    const fourWheelerCat = await VehicleCategory.findOne({ code: "4W" });
    const heavyCat = await VehicleCategory.findOne({ code: "HV" });

    const vehicleTypes = [
      {
        name: "Bike",
        code: "BIKE",
        categoryId: twoWheelerCat?._id,
        capacity: 10,
        capacityUnit: "kg",
        dimensions: { length: 0.5, width: 0.3, height: 0.3 },
        baseFare: 30,
        perKmRate: 8,
        perMinuteRate: 1,
        description: "For small documents and parcels up to 10kg",
        icon: "🏍️",
        sortOrder: 1,
      },
      {
        name: "Auto",
        code: "AUTO",
        categoryId: threeWheelerCat?._id,
        capacity: 50,
        capacityUnit: "kg",
        dimensions: { length: 1.2, width: 0.8, height: 0.8 },
        baseFare: 50,
        perKmRate: 12,
        perMinuteRate: 1.5,
        description: "For medium packages up to 50kg",
        icon: "🛺",
        sortOrder: 2,
      },
      {
        name: "Tata Ace",
        code: "TATA_ACE",
        categoryId: fourWheelerCat?._id,
        capacity: 750,
        capacityUnit: "kg",
        dimensions: { length: 2.1, width: 1.5, height: 1.5 },
        baseFare: 149,
        perKmRate: 18,
        perMinuteRate: 2,
        description: "Mini truck for house shifting and bulk goods",
        icon: "🚚",
        sortOrder: 3,
      },
      {
        name: "Pickup 8ft",
        code: "PICKUP_8FT",
        categoryId: fourWheelerCat?._id,
        capacity: 1000,
        capacityUnit: "kg",
        dimensions: { length: 2.4, width: 1.5, height: 1.5 },
        baseFare: 199,
        perKmRate: 22,
        perMinuteRate: 2.5,
        description: "8ft open pickup for furniture and appliances",
        icon: "🛻",
        sortOrder: 4,
      },
      {
        name: "Eeco",
        code: "EECO",
        categoryId: fourWheelerCat?._id,
        capacity: 500,
        capacityUnit: "kg",
        dimensions: { length: 1.8, width: 1.2, height: 1.0 },
        baseFare: 129,
        perKmRate: 16,
        perMinuteRate: 2,
        description: "Closed van for weather protection",
        icon: "🚐",
        sortOrder: 5,
      },
      {
        name: "14ft Truck",
        code: "TRUCK_14FT",
        categoryId: heavyCat?._id,
        capacity: 4000,
        capacityUnit: "kg",
        dimensions: { length: 4.3, width: 2.0, height: 2.0 },
        baseFare: 499,
        perKmRate: 35,
        perMinuteRate: 4,
        description: "For office shifting and large consignments",
        icon: "🚛",
        sortOrder: 6,
      },
    ];

    for (const vt of vehicleTypes) {
      await VehicleType.findOneAndUpdate({ code: vt.code }, vt, {
        upsert: true,
        returnDocument: "after",
      });
    }

    // Seed Service Types
    console.log("📋 Seeding Service Types...");
    const serviceTypes = [
      {
        name: "Within City",
        code: "WITHIN_CITY",
        description: "Delivery within the same city",
        isActive: true,
        sortOrder: 1,
      },
      {
        name: "Outstation",
        code: "OUTSTATION",
        description: "Inter-city delivery",
        priceMultiplier: 1.5,
        minDistance: 50,
        isActive: true,
        sortOrder: 2,
      },
    ];

    for (const st of serviceTypes) {
      await ServiceType.findOneAndUpdate({ code: st.code } as any, st as any, {
        upsert: true,
        returnDocument: "after",
      });
    }

    // Seed Addon Services
    console.log("➕ Seeding Addon Services...");
    const addons = [
      {
        name: "Loading Help",
        code: "LOADING",
        description: "Our partner will help load your goods",
        pricingType: "PER_FLOOR",
        price: 50,
        icon: "📦⬆️",
        category: "LOADING_UNLOADING",
        sortOrder: 1,
      },
      {
        name: "Unloading Help",
        code: "UNLOADING",
        description: "Our partner will help unload your goods",
        pricingType: "PER_FLOOR",
        price: 50,
        icon: "📦⬇️",
        category: "LOADING_UNLOADING",
        sortOrder: 2,
      },
      {
        name: "Packing Material",
        code: "PACKING",
        description: "Bubble wrap and packaging material",
        pricingType: "FIXED",
        price: 200,
        icon: "📦",
        category: "PACKING",
        sortOrder: 3,
      },
      {
        name: "Insurance",
        code: "INSURANCE",
        description: "Coverage for goods damage",
        pricingType: "PERCENTAGE",
        price: 2, // 2% of order value
        icon: "🛡️",
        category: "INSURANCE",
        sortOrder: 4,
      },
    ];

    for (const addon of addons) {
      await AddonService.findOneAndUpdate({ code: addon.code }, addon, {
        upsert: true,
        returnDocument: "after",
      });
    }

    // Seed Goods Types
    console.log("📦 Seeding Goods Types...");
    const goodsTypes = [
      {
        name: "Documents",
        code: "DOCUMENTS",
        category: "PERSONAL",
        icon: "📄",
        sortOrder: 1,
      },
      {
        name: "Electronics",
        code: "ELECTRONICS",
        category: "PERSONAL",
        icon: "📱",
        sortOrder: 2,
      },
      {
        name: "Furniture",
        code: "FURNITURE",
        category: "PERSONAL",
        icon: "🪑",
        sortOrder: 3,
      },
      {
        name: "Clothing",
        code: "CLOTHING",
        category: "PERSONAL",
        icon: "👕",
        sortOrder: 4,
      },
      {
        name: "Food Items",
        code: "FOOD",
        category: "BUSINESS",
        icon: "🍔",
        sortOrder: 5,
      },
      {
        name: "Medical Supplies",
        code: "MEDICAL",
        category: "BUSINESS",
        icon: "💊",
        sortOrder: 6,
      },
      {
        name: "Machinery Parts",
        code: "MACHINERY",
        category: "BUSINESS",
        icon: "⚙️",
        sortOrder: 7,
      },
      {
        name: "Fragile Items",
        code: "FRAGILE",
        category: "PERSONAL",
        icon: "🥛",
        sortOrder: 8,
      },
      {
        name: "Others",
        code: "OTHERS",
        category: "PERSONAL",
        icon: "📦",
        sortOrder: 99,
      },
    ];

    for (const gt of goodsTypes) {
      await GoodsType.findOneAndUpdate({ code: gt.code }, gt, {
        upsert: true,
        returnDocument: "after",
      });
    }

    // Seed Cancellation Reasons
    console.log("❌ Seeding Cancellation Reasons...");
    const cancellationReasons = [
      {
        reason: "Changed my mind",
        code: "CHANGED_MIND",
        applicableTo: "BOTH",
        refundPercentage: 100,
        penaltyAmount: 0,
        sortOrder: 1,
      },
      {
        reason: "Driver taking too long",
        code: "DRIVER_DELAY",
        applicableTo: "USER",
        refundPercentage: 100,
        penaltyAmount: 0,
        sortOrder: 2,
      },
      {
        reason: "Wrong pickup/drop location",
        code: "WRONG_LOCATION",
        applicableTo: "BOTH",
        refundPercentage: 100,
        penaltyAmount: 0,
        sortOrder: 3,
      },
      {
        reason: "Price too high",
        code: "HIGH_PRICE",
        applicableTo: "USER",
        refundPercentage: 100,
        penaltyAmount: 0,
        sortOrder: 4,
      },
      {
        reason: "Customer not responding",
        code: "CUSTOMER_UNRESPONSIVE",
        applicableTo: "DRIVER",
        refundPercentage: 80,
        penaltyAmount: 0,
        sortOrder: 5,
      },
      {
        reason: "Vehicle breakdown",
        code: "VEHICLE_ISSUE",
        applicableTo: "DRIVER",
        refundPercentage: 100,
        penaltyAmount: 0,
        sortOrder: 6,
      },
      {
        reason: "Other reason",
        code: "OTHER",
        applicableTo: "BOTH",
        requiresNote: true,
        refundPercentage: 90,
        penaltyAmount: 0,
        sortOrder: 99,
      },
    ];

    for (const cr of cancellationReasons) {
      await CancellationReason.findOneAndUpdate({ code: cr.code }, cr, {
        upsert: true,
        returnDocument: "after",
      });
    }

    // Seed Time Slots
    console.log("⏰ Seeding Time Slots...");
    const timeSlots = [
      {
        name: "Early Morning",
        startTime: "06:00",
        endTime: "09:00",
        sortOrder: 1,
      },
      { name: "Morning", startTime: "09:00", endTime: "12:00", sortOrder: 2 },
      { name: "Afternoon", startTime: "12:00", endTime: "15:00", sortOrder: 3 },
      { name: "Evening", startTime: "15:00", endTime: "18:00", sortOrder: 4 },
      { name: "Night", startTime: "18:00", endTime: "21:00", sortOrder: 5 },
    ];

    for (const ts of timeSlots) {
      await TimeSlot.findOneAndUpdate(
        { name: ts.name },
        {
          ...ts,
          daysAvailable: [
            "MONDAY",
            "TUESDAY",
            "WEDNESDAY",
            "THURSDAY",
            "FRIDAY",
            "SATURDAY",
            "SUNDAY",
          ],
        },
        { upsert: true, returnDocument: "after" },
      );
    }

    // Seed App Config
    console.log("⚙️ Seeding App Config...");
    await AppConfig.findOneAndUpdate(
      { key: "general" },
      {
        key: "general",
        value: {
          appName: "HealWin",
          supportEmail: "support@healwin.in",
          supportPhone: "+91-9876543210",
          currency: "INR",
          currencySymbol: "₹",
          minAppVersion: "1.0.0",
          maintenanceMode: false,
        },
        description: "General app configuration",
      },
      { upsert: true },
    );

    // Seed Fare Config
    console.log("💰 Seeding Fare Config...");
    await FareConfig.findOneAndUpdate(
      { name: "Default" },
      {
        name: "Default",
        isDefault: true,
        baseFare: 50,
        perKmRate: 15,
        perMinuteRate: 2,
        minimumFare: 50,
        gstPercentage: 18,
        surgeConfig: {
          enabled: true,
          thresholds: [
            { utilization: 0.7, multiplier: 1.2 },
            { utilization: 0.8, multiplier: 1.5 },
            { utilization: 0.9, multiplier: 2.0 },
          ],
          maxMultiplier: 2.5,
        },
        waitingCharges: {
          freeMinutes: 5,
          chargePerMinute: 3,
        },
        nightCharges: {
          enabled: true,
          startTime: "22:00",
          endTime: "06:00",
          multiplier: 1.25,
        },
        peakHoursConfig: {
          enabled: true,
          slots: [
            { startTime: "08:00", endTime: "10:00", multiplier: 1.2 },
            { startTime: "17:00", endTime: "20:00", multiplier: 1.2 },
          ],
        },
      },
      { upsert: true },
    );

    // Seed Admin User
    console.log("👤 Seeding Admin User...");
    const hashedPassword = await bcrypt.hash("Admin@123", 10);
    await Admin.findOneAndUpdate(
      { email: "admin@healwin.in" },
      {
        email: "admin@healwin.in",
        password: hashedPassword,
        name: "Super Admin",
        role: "SUPER_ADMIN",
        permissions: ["all"],
        isActive: true,
      },
      { upsert: true },
    );

    // Seed FAQs
    console.log("❓ Seeding FAQs...");
    const faqs = [
      {
        question: "How do I book a delivery?",
        answer:
          "Open the app, enter pickup and drop locations, select vehicle type, and confirm booking.",
        category: "BOOKING",
        sortOrder: 1,
      },
      {
        question: "What payment methods are accepted?",
        answer: "We accept Cash, UPI, Credit/Debit Cards, and Wallet payments.",
        category: "PAYMENT",
        sortOrder: 2,
      },
      {
        question: "How can I track my delivery?",
        answer:
          "Go to My Bookings, tap on the active booking to see real-time tracking.",
        category: "DELIVERY",
        sortOrder: 3,
      },
      {
        question: "How do I cancel a booking?",
        answer:
          "Go to My Bookings, select the booking, and tap Cancel. Note that cancellation charges may apply.",
        category: "BOOKING",
        sortOrder: 4,
      },
      {
        question: "How do coins work?",
        answer:
          "You earn 2 coins for every ₹100 spent. Coins can be used for discounts or transferred to wallet/bank.",
        category: "PROMO",
        sortOrder: 5,
      },
    ];

    for (const faq of faqs) {
      await FAQ.findOneAndUpdate({ question: faq.question }, faq, {
        upsert: true,
      });
    }

    // Seed Content
    console.log("📝 Seeding Content...");
    await Content.findOneAndUpdate(
      { key: "terms_and_conditions" },
      {
        key: "terms_and_conditions",
        title: "Terms and Conditions",
        content:
          "<h1>Terms and Conditions</h1><p>Please read these terms carefully...</p>",
        contentType: "LEGAL",
      },
      { upsert: true },
    );

    await Content.findOneAndUpdate(
      { key: "privacy_policy" },
      {
        key: "privacy_policy",
        title: "Privacy Policy",
        content:
          "<h1>Privacy Policy</h1><p>Your privacy is important to us...</p>",
        contentType: "LEGAL",
      },
      { upsert: true },
    );

    console.log("✅ Database seeding completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding database:", error);
    process.exit(1);
  }
};

seedDatabase();
