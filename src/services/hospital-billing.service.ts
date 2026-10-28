import { Types } from "mongoose";

import HospitalPatient, { toPhoneKey } from "../models/hospital-patient.model";
import { HospitalInvoice } from "../models/hospital-invoice.model";
import User from "../models/Users";
import { recomputeTotals } from "./billing-math";
import { emitToAdmin } from "../utils/socket.util";

/**
 * Paying a hospital bill from the patient app.
 *
 * The app `User` and the hospital's `HospitalPatient` are separate records,
 * joined on the last ten digits of the mobile — the hospital registers people
 * at a counter, long before (or without) them ever installing anything. So
 * "which bills are mine?" is a lookup, not a foreign key, and every payment
 * path has to answer it the same way or a patient ends up able to pay someone
 * else's bill.
 */

/**
 * Every hospital record the logged-in user may settle a bill for: their own,
 * plus the rest of their family group.
 *
 * The family scope is deliberate and matches what the app already shows —
 * members see each other's records, and a son paying his mother's hospital
 * bill is the ordinary case, not an edge one.
 */
export const hospitalPatientIdsForUser = async (
  userId: Types.ObjectId | string,
): Promise<Types.ObjectId[]> => {
  const me: any = await User.findById(userId).select("headUserId").lean();
  if (!me) return [];
  const headId = me.headUserId || userId;

  const group: any[] = await User.find({
    $or: [{ _id: headId }, { headUserId: headId }],
    isDeleted: { $ne: true },
  })
    .select("mobileNumber")
    .lean();

  const keys = [
    ...new Set(
      group.map((u) => toPhoneKey(u.mobileNumber)).filter((k) => k.length === 10),
    ),
  ];
  if (!keys.length) return [];

  const patients: any[] = await HospitalPatient.find({
    phoneKey: { $in: keys },
    isDeleted: { $ne: true },
  })
    .select("_id")
    .lean();
  return patients.map((p) => p._id);
};

/** What is actually left to pay on a bill, never below zero. */
export const invoiceOutstanding = (inv: any): number =>
  Math.max(0, Math.round(((inv?.total || 0) - (inv?.amountPaid || 0)) * 100) / 100);

/**
 * Append a settled gateway payment to a bill.
 *
 * Mirrors what the counter does (push a payment, recompute, save) so the two
 * routes to the same money cannot drift. The one difference is that there is
 * no `recordedByAdminId` — the patient paid it themselves.
 *
 * The retry matters here more than at the counter: a discharge-time bill is
 * exactly the moment a clerk is likely to be collecting a part-payment on the
 * same invoice, and a VersionError must not mean a captured payment goes
 * unrecorded.
 */
export const applyGatewayPayment = async (params: {
  invoiceId: Types.ObjectId | string;
  amount: number;
  reference?: string;
}): Promise<void> => {
  const { invoiceId, amount, reference } = params;

  for (let attempt = 0; attempt < 3; attempt++) {
    const invoice: any = await HospitalInvoice.findById(invoiceId);
    if (!invoice) return;

    // Already recorded — a webhook and a client confirm can both arrive for
    // one payment, and paying twice off one capture is worse than missing it.
    if (
      reference &&
      (invoice.payments || []).some((p: any) => p.reference === reference)
    ) {
      return;
    }

    invoice.payments.push({
      method: "online",
      amount,
      reference,
      paidAt: new Date(),
      isRefund: false,
    });
    recomputeTotals(invoice);

    try {
      await invoice.save();
    } catch (e: any) {
      // Someone wrote this invoice between our read and save. Re-read and
      // re-apply; the duplicate guard above makes a repeat harmless.
      if (e?.name === "VersionError" && attempt < 2) continue;
      throw e;
    }

    try {
      emitToAdmin("billing:updated", {
        invoiceId: String(invoice._id),
        invoiceNo: invoice.invoiceNo,
        patientId: String(invoice.patientId),
        admissionId: invoice.admissionId ? String(invoice.admissionId) : null,
        total: invoice.total,
        balanceDue: invoice.balanceDue,
      });
    } catch {
      /* non-fatal — the money is recorded either way */
    }
    return;
  }
};
