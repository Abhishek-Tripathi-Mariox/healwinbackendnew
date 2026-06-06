import mongoose, { Schema, Types, Document } from "mongoose";

/* ─────────────── Sub-document interfaces ─────────────── */

interface IHeroStat {
  value: string; // "50+", "100+", "24/7"
  label: string; // "Ambulances", "Centres", "Available"
  color: string; // tailwind class e.g. "text-hw-primary"
}

interface ICtaButton {
  label: string;
  icon: string; // lucide icon name
  link: string; // route path or external URL
  variant: "primary" | "outline";
}

interface IFloatingCard {
  icon: string;
  label: string;
  value: string;
}

interface IActionScene {
  icon: string;
  title: string;
  description: string;
  stat: string;
  statLabel: string;
  gradient: string; // "from-hw-sos to-red-600"
  bgColor: string; // "bg-red-50"
}

interface IAppFeature {
  icon: string;
  title: string;
  position: "left" | "right";
}

interface IWhyReason {
  icon: string;
  title: string;
  description: string;
  stat: string;
  gradient: string;
  bgColor: string;
}

interface ITrustIndicator {
  text: string;
  color: string; // dot color class
}

/* ─────────────── Main document interface ─────────────── */

export interface IHomeContent extends Document {
  _id: Types.ObjectId;

  // ── Hero Section ──
  heroBadge: string;
  heroTitle: string;
  heroHighlight: string;
  heroSubtitle: string;
  heroImage: string;
  heroStats: IHeroStat[];
  heroCtaButtons: ICtaButton[];
  heroFloatingCards: IFloatingCard[];

  // ── Services Section ──
  servicesBadge: string;
  servicesTitle: string;
  servicesHighlight: string;
  servicesSubtitle: string;
  servicesCount: number; // how many top services to show (default 4)

  // ── Actions Section (HealWin in Action) ──
  actionsBadge: string;
  actionsTitle: string;
  actionsHighlight: string;
  actionsSubtitle: string;
  actionsScenes: IActionScene[];
  actionsBottomText: string;

  // ── Mobile App Section ──
  appBadge: string;
  appTitle: string;
  appHighlight: string;
  appSubtitle: string;
  appFeatures: IAppFeature[];
  appMockupImage: string;
  appStoreUrl: string;
  playStoreUrl: string;

  // ── Why HealWin Section ──
  whyBadge: string;
  whyTitle: string;
  whyHighlight: string;
  whySubtitle: string;
  whyReasons: IWhyReason[];

  // ── CTA Section ──
  ctaBadge: string;
  ctaTitle: string;
  ctaHighlight: string;
  ctaSubtitle: string;
  ctaButtons: ICtaButton[];
  ctaTrustIndicators: ITrustIndicator[];

  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/* ─────────────── Sub-schemas ─────────────── */

const HeroStatSchema = new Schema(
  {
    value: { type: String, default: "" },
    label: { type: String, default: "" },
    color: { type: String, default: "text-hw-primary" },
  },
  { _id: false },
);

const CtaButtonSchema = new Schema(
  {
    label: { type: String, default: "" },
    icon: { type: String, default: "" },
    link: { type: String, default: "" },
    variant: {
      type: String,
      enum: ["primary", "outline"],
      default: "primary",
    },
  },
  { _id: false },
);

const FloatingCardSchema = new Schema(
  {
    icon: { type: String, default: "" },
    label: { type: String, default: "" },
    value: { type: String, default: "" },
  },
  { _id: false },
);

const ActionSceneSchema = new Schema(
  {
    icon: { type: String, default: "Ambulance" },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    stat: { type: String, default: "" },
    statLabel: { type: String, default: "" },
    gradient: { type: String, default: "from-hw-primary to-hw-primary-dark" },
    bgColor: { type: String, default: "bg-blue-50" },
  },
  { _id: false },
);

const AppFeatureSchema = new Schema(
  {
    icon: { type: String, default: "Heart" },
    title: { type: String, default: "" },
    position: { type: String, enum: ["left", "right"], default: "left" },
  },
  { _id: false },
);

const WhyReasonSchema = new Schema(
  {
    icon: { type: String, default: "Heart" },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    stat: { type: String, default: "" },
    gradient: { type: String, default: "from-hw-primary to-hw-primary-dark" },
    bgColor: { type: String, default: "bg-blue-50" },
  },
  { _id: false },
);

const TrustIndicatorSchema = new Schema(
  {
    text: { type: String, default: "" },
    color: { type: String, default: "bg-green-500" },
  },
  { _id: false },
);

/* ─────────────── Main schema ─────────────── */

const HomeContentSchema = new Schema<IHomeContent>(
  {
    // ── Hero ──
    heroBadge: { type: String, default: "Trusted by 50,000+ families" },
    heroTitle: { type: String, default: "Your Emergency," },
    heroHighlight: { type: String, default: "Our Priority" },
    heroSubtitle: {
      type: String,
      default:
        "Northeast India's most trusted healthcare emergency response platform. 24/7 ambulance services, emergency centres, and comprehensive healthcare solutions.",
    },
    heroImage: {
      type: String,
      default:
        "https://images.unsplash.com/photo-1766325693423-69e9fe20605b?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzF8MHwxfHNlYXJjaHwxfHxhbWJ1bGFuY2UlMjBlbWVyZ2VuY3klMjBtZWRpY2FsJTIwaGVhbHRoY2FyZXxlbnwwfHx8fDE3NzAwMjEwMjd8MA&ixlib=rb-4.1.0&q=85",
    },
    heroStats: {
      type: [HeroStatSchema],
      default: [
        { value: "50+", label: "Ambulances", color: "text-hw-primary" },
        { value: "100+", label: "Centres", color: "text-hw-accent" },
        { value: "24/7", label: "Available", color: "text-hw-highlight" },
      ],
    },
    heroCtaButtons: {
      type: [CtaButtonSchema],
      default: [
        {
          label: "Book Ambulance",
          icon: "Ambulance",
          link: "/services#ambulance",
          variant: "primary",
        },
        {
          label: "Find Emergency Centre",
          icon: "MapPin",
          link: "/centre-locator",
          variant: "outline",
        },
      ],
    },
    heroFloatingCards: {
      type: [FloatingCardSchema],
      default: [
        { icon: "Phone", label: "Emergency", value: "24/7 SOS" },
        { icon: "MapPin", label: "Coverage", value: "8 States" },
      ],
    },

    // ── Services Section ──
    servicesBadge: { type: String, default: "All Services" },
    servicesTitle: {
      type: String,
      default: "Comprehensive Healthcare",
    },
    servicesHighlight: { type: String, default: "Solutions" },
    servicesSubtitle: {
      type: String,
      default:
        "From emergency response to preventive care, we provide end-to-end healthcare services designed for the people of Northeast India.",
    },
    servicesCount: { type: Number, default: 4 },

    // ── Actions Section ──
    actionsBadge: { type: String, default: "HealWin in Action" },
    actionsTitle: { type: String, default: "One Platform," },
    actionsHighlight: { type: String, default: "Complete Care" },
    actionsSubtitle: {
      type: String,
      default:
        "From the moment of emergency to complete recovery, HealWin is with you at every step.",
    },
    actionsScenes: {
      type: [ActionSceneSchema],
      default: [
        {
          icon: "Ambulance",
          title: "Emergency Response",
          description:
            "When every second counts, our GPS-tracked ambulances reach you within minutes.",
          stat: "< 15 min",
          statLabel: "Response Time",
          gradient: "from-hw-sos to-red-600",
          bgColor: "bg-red-50",
        },
        {
          icon: "Building2",
          title: "Healthcare Access",
          description:
            "Connect with verified hospitals and healthcare centres across all Northeast states.",
          stat: "100+",
          statLabel: "Verified Centres",
          gradient: "from-hw-primary to-hw-primary-dark",
          bgColor: "bg-blue-50",
        },
        {
          icon: "FlaskConical",
          title: "Diagnostic Services",
          description:
            "NABL certified labs with home sample collection and quick digital reports.",
          stat: "500+",
          statLabel: "Tests Available",
          gradient: "from-hw-accent to-cyan-600",
          bgColor: "bg-cyan-50",
        },
        {
          icon: "Wallet",
          title: "Financial Support",
          description:
            "Healthcare financing options to ensure money never comes in the way of health.",
          stat: "0%",
          statLabel: "Interest EMI",
          gradient: "from-hw-highlight to-purple-600",
          bgColor: "bg-purple-50",
        },
      ],
    },
    actionsBottomText: {
      type: String,
      default: "",
    },

    // ── Mobile App Section ──
    appBadge: { type: String, default: "Mobile App" },
    appTitle: { type: String, default: "Healthcare at Your" },
    appHighlight: { type: String, default: "Fingertips" },
    appSubtitle: {
      type: String,
      default:
        "Download the HealWin app for instant access to emergency services, health records, and more.",
    },
    appFeatures: {
      type: [AppFeatureSchema],
      default: [
        { icon: "MapPin", title: "Real-time Tracking", position: "left" },
        { icon: "Bell", title: "Instant Alerts", position: "left" },
        { icon: "Clock", title: "Quick Response", position: "right" },
        { icon: "Shield", title: "Secure Records", position: "right" },
      ],
    },
    appMockupImage: { type: String, default: "" },
    appStoreUrl: { type: String, default: "" },
    playStoreUrl: { type: String, default: "" },

    // ── Why HealWin Section ──
    whyBadge: { type: String, default: "Why HealWin" },
    whyTitle: { type: String, default: "Trust Built on" },
    whyHighlight: { type: String, default: "Excellence" },
    whySubtitle: {
      type: String,
      default:
        "Every second counts in an emergency. Here's why thousands trust HealWin for their healthcare needs.",
    },
    whyReasons: {
      type: [WhyReasonSchema],
      default: [
        {
          icon: "Zap",
          title: "Rapid Response",
          description: "Average response time under 15 minutes",
          stat: "< 15 min",
          gradient: "from-hw-sos to-red-600",
          bgColor: "bg-red-50",
        },
        {
          icon: "Shield",
          title: "Verified Partners",
          description: "All healthcare providers are thoroughly vetted",
          stat: "100%",
          gradient: "from-hw-primary to-hw-primary-dark",
          bgColor: "bg-blue-50",
        },
        {
          icon: "MapPin",
          title: "Wide Coverage",
          description: "Present across all Northeast states",
          stat: "8 States",
          gradient: "from-hw-accent to-cyan-600",
          bgColor: "bg-cyan-50",
        },
        {
          icon: "Users",
          title: "Trained Staff",
          description: "Professional paramedics and drivers",
          stat: "500+",
          gradient: "from-hw-highlight to-purple-600",
          bgColor: "bg-purple-50",
        },
        {
          icon: "Clock",
          title: "24/7 Available",
          description: "Round the clock emergency services",
          stat: "24/7",
          gradient: "from-orange-500 to-orange-600",
          bgColor: "bg-orange-50",
        },
        {
          icon: "Award",
          title: "Trusted Service",
          description: "Serving 50,000+ families successfully",
          stat: "50K+",
          gradient: "from-green-500 to-green-600",
          bgColor: "bg-green-50",
        },
      ],
    },

    // ── CTA Section ──
    ctaBadge: { type: String, default: "Get Started Today" },
    ctaTitle: { type: String, default: "Ready to Experience" },
    ctaHighlight: { type: String, default: "Better Healthcare?" },
    ctaSubtitle: {
      type: String,
      default:
        "Join thousands of families who trust HealWin for their emergency and healthcare needs.",
    },
    ctaButtons: {
      type: [CtaButtonSchema],
      default: [
        {
          label: "Get in Touch",
          icon: "Phone",
          link: "/contact",
          variant: "primary",
        },
        {
          label: "Download App",
          icon: "Download",
          link: "",
          variant: "outline",
        },
      ],
    },
    ctaTrustIndicators: {
      type: [TrustIndicatorSchema],
      default: [
        { text: "No hidden fees", color: "bg-green-500" },
        { text: "24/7 Support", color: "bg-hw-primary" },
        { text: "Verified Partners", color: "bg-hw-accent" },
      ],
    },

    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export const HomeContent = mongoose.model<IHomeContent>(
  "HomeContent",
  HomeContentSchema,
);
export default HomeContent;
