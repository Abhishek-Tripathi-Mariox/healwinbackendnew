import HospitalPatient from "../models/hospital-patient.model";
import User from "../models/Users";
import { sendToUser } from "./notification.service";

/**
 * Notify the app user behind an HMS HospitalPatient (linked by phone). Used to
 * push lab-report-ready / bill-generated / discharge events to the patient app.
 * Best-effort: silently no-ops if the patient has no matching app account.
 */
export const notifyHospitalPatient = async (
  patientId: any,
  title: string,
  body: string,
  data: Record<string, any> = {},
): Promise<void> => {
  try {
    const hp: any = await HospitalPatient.findById(patientId).select("phone").lean();
    const last10 = String(hp?.phone || "").replace(/\D/g, "").slice(-10);
    if (last10.length !== 10) return;
    const user: any = await User.findOne({
      mobileNumber: { $regex: `${last10}$` },
      isDeleted: { $ne: true },
    })
      .select("_id")
      .lean();
    if (!user) return;
    await sendToUser(user._id, "SYSTEM", title, body, { screen: "HospitalRecords", ...data });
  } catch {
    /* best-effort */
  }
};

export default { notifyHospitalPatient };
