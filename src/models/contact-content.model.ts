import mongoose, { Schema, Types, Document } from "mongoose";

// Sub-document interfaces
interface IContactDirectory {
  icon: string; // lucide icon name
  title: string;
  name: string;
  email: string;
  phone: string;
  description: string;
  gradient: string; // CSS gradient classes
}

export interface IContactContent extends Document {
  _id: Types.ObjectId;

  // Company Info
  companyName: string;
  companyTagline: string;

  // Head Office
  officeAddress: string;

  // Emergency Helpline
  emergencyHelpline: string;

  // Support Email
  supportEmail: string;

  // Working Hours
  workingHoursEmergency: string;
  workingHoursOffice: string;

  // Contact Directories (Grievance, General, Business)
  contactDirectories: IContactDirectory[];

  // Footer
  footerDescription: string;
  footerOfficeLabel: string;

  // Page Hero
  heroTitle: string;
  heroHighlight: string;
  heroSubtitle: string;

  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ContactDirectorySchema = new Schema(
  {
    icon: { type: String, default: "MessageSquare" },
    title: { type: String, default: "" },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    phone: { type: String, default: "" },
    description: { type: String, default: "" },
    gradient: { type: String, default: "from-hw-primary to-hw-primary-dark" },
  },
  { _id: false },
);

const ContactContentSchema = new Schema<IContactContent>(
  {
    // Company Info
    companyName: { type: String, default: "HealWin Healthcare" },
    companyTagline: {
      type: String,
      default: "Emergency Healthcare Platform",
    },

    // Head Office
    officeAddress: {
      type: String,
      default: "123 Healthcare Complex, GS Road, Guwahati, Assam 781001",
    },

    // Emergency Helpline
    emergencyHelpline: { type: String, default: "1800-XXX-XXXX (Toll Free)" },

    // Support Email
    supportEmail: { type: String, default: "support@healwin.in" },

    // Working Hours
    workingHoursEmergency: {
      type: String,
      default: "24/7 Emergency Services",
    },
    workingHoursOffice: { type: String, default: "Office: Mon-Sat 9AM-6PM" },

    // Contact Directories
    contactDirectories: {
      type: [ContactDirectorySchema],
      default: [
        {
          icon: "AlertCircle",
          title: "Grievance Officer",
          name: "Mr. Rajiv Das",
          email: "grievance@healwin.in",
          phone: "+91 9876543290",
          description: "For complaints and grievances",
          gradient: "from-hw-sos to-red-600",
        },
        {
          icon: "MessageSquare",
          title: "General Inquiry",
          name: "Customer Support",
          email: "info@healwin.in",
          phone: "+91 9876543291",
          description: "For general questions and support",
          gradient: "from-hw-primary to-hw-primary-dark",
        },
        {
          icon: "Briefcase",
          title: "Business Inquiry",
          name: "Business Development",
          email: "business@healwin.in",
          phone: "+91 9876543292",
          description: "For partnerships and business queries",
          gradient: "from-hw-accent to-cyan-600",
        },
      ],
    },

    // Footer
    footerDescription: {
      type: String,
      default:
        "Your trusted healthcare partner in Northeast India. Providing emergency medical services, ambulance booking, and comprehensive healthcare solutions.",
    },
    footerOfficeLabel: {
      type: String,
      default: "Northeast India Regional Office",
    },

    // Page Hero
    heroTitle: { type: String, default: "Contact" },
    heroHighlight: { type: String, default: "Us" },
    heroSubtitle: {
      type: String,
      default:
        "We're here to help. Reach out to us for any questions, support, or business inquiries.",
    },

    updatedBy: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

export const ContactContent = mongoose.model<IContactContent>(
  "ContactContent",
  ContactContentSchema,
);
