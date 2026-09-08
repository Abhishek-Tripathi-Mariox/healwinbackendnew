import mongoose, { Schema, Types } from "mongoose";

/**
 * Telephony call log — every call that MyOperator handles for us.
 *
 * One document per call. Rows are created two ways:
 *  • click-to-call from the panel, created the moment the bridge is requested
 *    so the attempt exists even if the provider never calls back; and
 *  • the MyOperator webhook, for inbound / IVR / missed calls that started at
 *    the caller's end and which we would otherwise never see.
 *
 * The webhook fires several times for one call (ringing → answered →
 * completed, then again when the recording is ready), so writes are upserts
 * keyed on the provider's call id — see `providerCallId`.
 */

export type CallDirection = "inbound" | "outbound" | "click_to_call";
export type CallStatus =
  | "initiated"
  | "ringing"
  | "answered"
  | "completed"
  | "missed"
  | "busy"
  | "failed"
  | "no_answer"
  | "cancelled";

/** What this call was about, when it was placed from a record in the panel. */
export type CallSubject =
  | "sos_submission"
  | "ambulance_request"
  | "emergency_dispatch"
  | "patient"
  | "hospital_patient"
  | "application"
  | "employee"
  | "other";

export interface ICallLog {
  _id: Types.ObjectId;
  provider: string;
  /** MyOperator's own call id — the key the webhook upserts on. */
  providerCallId?: string;
  /**
   * Our id, handed to the provider when placing a call. Providers that do not
   * echo their own call id back on the first webhook still return this, so a
   * callback can always be matched to the attempt that caused it.
   */
  refId?: string;

  direction: CallDirection;
  status: CallStatus;

  /** The number the customer/patient is on. */
  customerNumber: string;
  /** The agent/control-room number that was bridged to them. */
  agentNumber?: string;
  /** The DID / IVR number the caller dialled, for inbound. */
  didNumber?: string;

  /** Which IVR node or department handled it, when MyOperator reports one. */
  ivrFlow?: string;
  ivrInput?: string;
  agentName?: string;

  startedAt?: Date;
  answeredAt?: Date;
  endedAt?: Date;
  /** Seconds of conversation. */
  durationSeconds: number;
  /** Seconds spent ringing before it was answered (or abandoned). */
  ringSeconds: number;

  recordingUrl?: string;
  recordingDurationSeconds?: number;

  /** Who clicked the call button, for click-to-call. */
  placedByAdminId?: Types.ObjectId;
  subjectType?: CallSubject;
  subjectId?: Types.ObjectId;
  /** Denormalised so the log reads without four populates. */
  subjectLabel?: string;

  notes?: string;
  /** Everything the provider sent, kept verbatim for support and debugging. */
  rawPayloads: any[];

  createdAt: Date;
  updatedAt: Date;
}

const CallLogSchema = new Schema<ICallLog>(
  {
    provider: { type: String, default: "myoperator", index: true },
    // No `index: true` here — the partial unique index below covers it.
    providerCallId: { type: String, trim: true },
    refId: { type: String, trim: true, index: true },

    direction: {
      type: String,
      enum: ["inbound", "outbound", "click_to_call"],
      default: "inbound",
      index: true,
    },
    status: {
      type: String,
      enum: [
        "initiated",
        "ringing",
        "answered",
        "completed",
        "missed",
        "busy",
        "failed",
        "no_answer",
        "cancelled",
      ],
      default: "initiated",
      index: true,
    },

    customerNumber: { type: String, required: true, trim: true, index: true },
    agentNumber: { type: String, trim: true },
    didNumber: { type: String, trim: true },

    ivrFlow: { type: String, trim: true },
    ivrInput: { type: String, trim: true },
    agentName: { type: String, trim: true },

    startedAt: Date,
    answeredAt: Date,
    endedAt: Date,
    durationSeconds: { type: Number, default: 0 },
    ringSeconds: { type: Number, default: 0 },

    recordingUrl: { type: String, trim: true },
    recordingDurationSeconds: { type: Number, default: 0 },

    placedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    subjectType: {
      type: String,
      enum: [
        "sos_submission",
        "ambulance_request",
        "emergency_dispatch",
        "patient",
        "hospital_patient",
        "application",
        "employee",
        "other",
      ],
    },
    subjectId: { type: Schema.Types.ObjectId },
    subjectLabel: { type: String, trim: true },

    notes: { type: String, trim: true },
    rawPayloads: { type: [Schema.Types.Mixed] as any, default: [] },
  },
  { timestamps: true },
);

// The webhook fires repeatedly for one call, so the provider's id has to be
// unique — but only where it is actually present, since a click-to-call row
// exists before the provider has told us its id. Partial, not sparse: a null
// is still indexed by a sparse index and the second such row would collide.
CallLogSchema.index(
  { providerCallId: 1 },
  {
    unique: true,
    partialFilterExpression: { providerCallId: { $type: "string" } },
  },
);
CallLogSchema.index({ createdAt: -1 });
CallLogSchema.index({ subjectType: 1, subjectId: 1 });
CallLogSchema.index({ status: 1, createdAt: -1 });

export const CallLog = mongoose.model<ICallLog>("CallLog", CallLogSchema);

export default CallLog;
