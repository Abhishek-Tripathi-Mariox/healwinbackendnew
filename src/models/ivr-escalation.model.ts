import mongoose, { Schema, Types } from "mongoose";

/**
 * IVR escalation — automated phone-tree escalation for an unacknowledged SOS.
 *
 * When an SOS isn't acknowledged, the system places automated voice calls
 * through an ordered chain of contacts (tiers): e.g. on-call dispatcher →
 * supervisor → backup control room. Each call attempt is journalled. The
 * actual call is placed by a pluggable provider adapter (Exotel/Twilio), with
 * a "log" fallback when no telephony provider is configured.
 */

export interface IIvrContact {
  tier: number;
  name?: string;
  phone: string;
  role?: string;
}

export interface IIvrAttempt {
  tier: number;
  phone: string;
  provider: string; // "exotel" | "mcube" | "myoperator" | "log"
  providerCallId?: string;
  // Unique ID we generate and hand to the provider as its "reference_id" /
  // "refid" when placing the call — providers that don't echo back their own
  // call ID in the status webhook still let us match the callback to this
  // attempt via this value.
  refId?: string;
  status: "placed" | "ringing" | "answered" | "no_answer" | "failed";
  note?: string;
  // Filled in later by the provider's status/recording webhook, once the
  // call finishes and a recording becomes available.
  recordingUrl?: string;
  at: Date;
}

export interface IIvrEscalation {
  _id: Types.ObjectId;
  sosSubmission?: Types.ObjectId;
  emergencyDispatch?: Types.ObjectId;
  triggerReason?: string;
  contacts: IIvrContact[];
  attempts: IIvrAttempt[];
  currentTier: number;
  status: "pending" | "in_progress" | "acknowledged" | "exhausted" | "cancelled";
  acknowledgedByPhone?: string;
  acknowledgedAt?: Date;
  startedByAdminId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<IIvrContact>(
  {
    tier: { type: Number, required: true },
    name: { type: String, trim: true },
    phone: { type: String, required: true, trim: true },
    role: { type: String, trim: true },
  },
  { _id: false },
);

const AttemptSchema = new Schema<IIvrAttempt>(
  {
    tier: { type: Number, required: true },
    phone: { type: String, required: true },
    provider: { type: String, required: true },
    providerCallId: { type: String },
    refId: { type: String, index: true },
    status: {
      type: String,
      enum: ["placed", "ringing", "answered", "no_answer", "failed"],
      default: "placed",
    },
    note: { type: String, trim: true },
    recordingUrl: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const IvrEscalationSchema = new Schema<IIvrEscalation>(
  {
    sosSubmission: {
      type: Schema.Types.ObjectId,
      ref: "SOSSubmission",
      index: true,
    },
    emergencyDispatch: {
      type: Schema.Types.ObjectId,
      ref: "EmergencyDispatch",
      index: true,
    },
    triggerReason: { type: String, trim: true },
    contacts: { type: [ContactSchema], default: [] },
    attempts: { type: [AttemptSchema], default: [] },
    currentTier: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["pending", "in_progress", "acknowledged", "exhausted", "cancelled"],
      default: "pending",
      index: true,
    },
    acknowledgedByPhone: String,
    acknowledgedAt: Date,
    startedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true },
);

IvrEscalationSchema.index({ status: 1, createdAt: -1 });

export const IvrEscalation = mongoose.model<IIvrEscalation>(
  "IvrEscalation",
  IvrEscalationSchema,
);

export default IvrEscalation;
