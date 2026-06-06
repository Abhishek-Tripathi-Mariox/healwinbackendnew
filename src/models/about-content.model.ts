import mongoose, { Schema, Types, Document } from "mongoose";

// Sub-document interfaces
interface IStat {
  icon: string; // lucide icon name: Heart, MapPin, Users, Shield
  value: string; // display value like "50+" or "100+"
  label: string; // "Ambulances", "Health Centres", etc.
  useRealCount: boolean; // if true, override value with live DB count
  countSource: string; // "centres", "states", "drivers", "" (empty = manual)
}

interface ICoreValue {
  icon: string; // lucide icon name
  title: string;
  description: string;
}

export interface IAboutContent extends Document {
  _id: Types.ObjectId;

  // Hero Section
  heroBadge: string;
  heroTitle: string;
  heroHighlight: string; // gradient-colored text
  heroSubtitle: string;

  // Stats
  stats: IStat[];

  // Mission & Vision
  missionTitle: string;
  missionText: string;
  visionTitle: string;
  visionText: string;

  // Core Values
  valuesHeading: string;
  valuesSubheading: string;
  coreValues: ICoreValue[];

  // Our Story
  storyTitle: string;
  storyParagraphs: string[];

  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StatSchema = new Schema(
  {
    icon: { type: String, default: "Heart" },
    value: { type: String, default: "0" },
    label: { type: String, default: "" },
    useRealCount: { type: Boolean, default: false },
    countSource: { type: String, default: "" },
  },
  { _id: false },
);

const CoreValueSchema = new Schema(
  {
    icon: { type: String, default: "Heart" },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
  },
  { _id: false },
);

const AboutContentSchema = new Schema<IAboutContent>(
  {
    // Hero
    heroBadge: { type: String, default: "About HealWin" },
    heroTitle: {
      type: String,
      default: "Transforming Healthcare in",
    },
    heroHighlight: { type: String, default: "Northeast India" },
    heroSubtitle: {
      type: String,
      default:
        "HealWin is Northeast India's pioneering healthcare emergency response platform, dedicated to making quality healthcare accessible to every family in the region.",
    },

    // Stats
    stats: {
      type: [StatSchema],
      default: [
        {
          icon: "Heart",
          value: "50+",
          label: "Ambulances",
          useRealCount: false,
          countSource: "",
        },
        {
          icon: "MapPin",
          value: "100+",
          label: "Health Centres",
          useRealCount: true,
          countSource: "centres",
        },
        {
          icon: "Users",
          value: "50K+",
          label: "Families Served",
          useRealCount: false,
          countSource: "",
        },
        {
          icon: "Shield",
          value: "8",
          label: "States Covered",
          useRealCount: true,
          countSource: "states",
        },
      ],
    },

    // Mission & Vision
    missionTitle: { type: String, default: "Our Mission" },
    missionText: {
      type: String,
      default:
        "To provide rapid, reliable, and affordable emergency healthcare services to every corner of Northeast India, ensuring that no life is lost due to lack of timely medical assistance.",
    },
    visionTitle: { type: String, default: "Our Vision" },
    visionText: {
      type: String,
      default:
        "To become the most trusted healthcare platform in India, setting new standards in emergency response and making quality healthcare a fundamental right for all.",
    },

    // Core Values
    valuesHeading: { type: String, default: "Our Core Values" },
    valuesSubheading: {
      type: String,
      default: "The principles that guide everything we do at HealWin.",
    },
    coreValues: {
      type: [CoreValueSchema],
      default: [
        {
          icon: "Heart",
          title: "Compassion First",
          description:
            "Every life matters. We treat every patient with empathy and care.",
        },
        {
          icon: "Clock",
          title: "Speed & Efficiency",
          description:
            "In emergencies, every second counts. We prioritize rapid response.",
        },
        {
          icon: "Shield",
          title: "Trust & Safety",
          description:
            "Verified partners, trained staff, and strict quality standards.",
        },
        {
          icon: "Award",
          title: "Excellence",
          description:
            "Continuously improving to deliver the best healthcare experience.",
        },
      ],
    },

    // Our Story
    storyTitle: { type: String, default: "Our Story" },
    storyParagraphs: {
      type: [String],
      default: [
        "HealWin was founded with a simple yet powerful vision: to ensure that no life in Northeast India is lost due to lack of timely medical assistance. Our journey began when our founders witnessed firsthand the challenges families face during medical emergencies in the region.",
        "From a single ambulance in Guwahati, we have grown into a comprehensive healthcare platform serving eight states. Today, we operate a fleet of GPS-tracked ambulances, partner with over 100 verified healthcare centres, and have served more than 50,000 families.",
        "Our commitment goes beyond emergency response. We are building an ecosystem that includes diagnostic services, healthcare financing, and preventive care—all designed to make quality healthcare accessible and affordable for every family in the region.",
      ],
    },

    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export const AboutContent = mongoose.model<IAboutContent>(
  "AboutContent",
  AboutContentSchema,
);
export default AboutContent;
