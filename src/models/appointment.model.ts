import mongoose, { Schema, Types } from "mongoose";

/**
 * Doctor Panel / HMS — OPD appointment.
 *
 * Patients book a slot with a doctor; a per-doctor, per-day queue token is
 * minted at booking time. The status machine drives the OPD queue board:
 *   booked → checked_in → in_consultation → completed   (or → cancelled / no_show)
 */

export interface IAppointment {
  _id: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId; // Admin with Doctor role
  scheduledAt: Date;
  tokenNumber: number; // queue token for the doctor's day
  status:
    | "booked"
    | "checked_in"
    | "in_consultation"
    | "completed"
    | "cancelled"
    | "no_show";
  reason?: string;
  notes?: string;
  encounterId?: Types.ObjectId; // EMR encounter created during consultation
  // Consultation invoice raised automatically at booking time, priced from the
  // doctor's configured fee. Null when the doctor has no fee on file (nothing
  // to bill) or if invoice creation failed — booking never blocks on billing.
  invoiceId?: Types.ObjectId;
  // Vitals taken by the nurse / front desk at check-in. The doctor's encounter
  // form reads these rather than asking the doctor to type them — in a real
  // clinic triage records vitals before the consult starts.
  vitals?: {
    bloodPressure?: string;
    pulse?: number;
    temperature?: number;
    spo2?: number;
    respiratoryRate?: number;
    height?: number;
    weight?: number;
  };
  vitalsRecordedByAdminId?: Types.ObjectId;
  vitalsRecordedAt?: Date;
  followUpAt?: Date;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AppointmentSchema = new Schema<IAppointment>(
  {
    patientId: {
      type: Schema.Types.ObjectId,
      ref: "HospitalPatient",
      required: true,
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    scheduledAt: { type: Date, required: true, index: true },
    tokenNumber: { type: Number, required: true },
    status: {
      type: String,
      enum: [
        "booked",
        "checked_in",
        "in_consultation",
        "completed",
        "cancelled",
        "no_show",
      ],
      default: "booked",
      index: true,
    },
    reason: { type: String, trim: true },
    notes: { type: String, trim: true },
    encounterId: {
      type: Schema.Types.ObjectId,
      ref: "EmrEncounter",
      default: null,
    },
    invoiceId: {
      type: Schema.Types.ObjectId,
      ref: "HospitalInvoice",
      default: null,
      index: true,
    },
    vitals: {
      type: new Schema(
        {
          bloodPressure: String,
          pulse: Number,
          temperature: Number,
          spo2: Number,
          respiratoryRate: Number,
          height: Number,
          weight: Number,
        },
        { _id: false },
      ),
      default: undefined,
    },
    vitalsRecordedByAdminId: { type: Schema.Types.ObjectId, ref: "Admin" },
    vitalsRecordedAt: Date,
    followUpAt: Date,
    createdByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  { timestamps: true },
);

// Queue board: doctor's appointments for a given day, ordered by token.
AppointmentSchema.index({ doctorId: 1, scheduledAt: 1, tokenNumber: 1 });

export const Appointment = mongoose.model<IAppointment>(
  "Appointment",
  AppointmentSchema,
);

export default Appointment;
