import { Request, Response } from "express";
import { CareerApplication } from "../../models/career-application.model";
import {
  sendApplicationAcknowledgement,
  sendApplicationStatusUpdate,
  sendInterviewInvite,
  sendOfferLetter,
  sendAppointmentLetter,
} from "../../services/email.service";
import {
  generateOfferLetterPDF,
  generateAppointmentLetterPDF,
  generateApplicationPDF,
} from "../../services/pdf.service";
import { uploadBufferToAws } from "../../utils/s3";
import config from "../../config";
import { paginate } from "../../utils/paginate.util";
import { escapeRegex } from "../../utils/helpers";

export const getAllApplications = async (req: Request, res: Response) => {
  const { status, careerId, q, gender, department, dateFrom, dateTo } =
    req.query as {
      status?: string;
      careerId?: string;
      q?: string;
      gender?: string;
      department?: string;
      dateFrom?: string;
      dateTo?: string;
    };

  const filter: Record<string, any> = {};
  if (status) filter.status = status;
  if (careerId) filter.careerId = careerId;
  if (gender) filter.gender = gender;
  if (department) filter.department = department;

  if (dateFrom || dateTo) {
    filter.appliedAt = {};
    if (dateFrom) filter.appliedAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.appliedAt.$lte = end;
    }
  }

  if (q) {
    filter.$or = [
      { name: { $regex: escapeRegex(q), $options: "i" } },
      { email: { $regex: escapeRegex(q), $options: "i" } },
      { phone: { $regex: escapeRegex(q), $options: "i" } },
    ];
  }

  const result = await paginate(
    CareerApplication,
    filter,
    req,
    { appliedAt: -1 },
    [
      { path: "careerId", select: "title department location" },
      { path: "selectedStates", select: "name" },
      { path: "selectedDistricts", select: "name" },
    ],
  );

  res.locals.data = result;
};

export const getApplicationById = async (req: Request, res: Response) => {
  const application = await CareerApplication.findById(req.params.id)
    .populate("careerId", "title department location")
    .populate("selectedStates", "name")
    .populate("selectedDistricts", "name");

  if (!application) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }

  res.locals.data = application;
};

export const updateApplicationStatus = async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };
  if (!status) {
    return res
      .status(400)
      .json({ success: false, message: "Status is required" });
  }

  // Get old status before updating
  const existingApp = await CareerApplication.findById(req.params.id);
  if (!existingApp) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }
  const oldStatus = existingApp.status;

  const application = await CareerApplication.findByIdAndUpdate(
    (req.params.id as string),
    { status },
    { returnDocument: "after" },
  )
    .populate("careerId", "title department location")
    .populate("selectedStates", "name")
    .populate("selectedDistricts", "name");

  if (!application) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }

  // Send status update email to candidate (non-blocking)
  if (oldStatus !== status) {
    sendApplicationStatusUpdate({
      candidateName: application.name,
      candidateEmail: application.email,
      position:
        application.position || (application.careerId as any)?.title || "",
      department:
        application.department ||
        (application.careerId as any)?.department ||
        "",
      applicationId: application._id.toString(),
      applicationNumber: application.applicationNumber || "",
      oldStatus,
      newStatus: status,
    }).catch((err) =>
      console.error("Failed to send status update email:", err),
    );
  }

  res.locals.data = application;
};

export const exportApplications = async (req: Request, res: Response) => {
  const { status, careerId, q, gender, department, dateFrom, dateTo } =
    req.query as {
      status?: string;
      careerId?: string;
      q?: string;
      gender?: string;
      department?: string;
      dateFrom?: string;
      dateTo?: string;
    };

  const filter: Record<string, any> = {};
  if (status) filter.status = status;
  if (careerId) filter.careerId = careerId;
  if (gender) filter.gender = gender;
  if (department) filter.department = department;

  if (dateFrom || dateTo) {
    filter.appliedAt = {};
    if (dateFrom) filter.appliedAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.appliedAt.$lte = end;
    }
  }

  if (q) {
    filter.$or = [
      { name: { $regex: escapeRegex(q), $options: "i" } },
      { email: { $regex: escapeRegex(q), $options: "i" } },
      { phone: { $regex: escapeRegex(q), $options: "i" } },
    ];
  }

  /**
   * Exports are legitimately bulk, but not unbounded.
   *
   * This read every matching application as a hydrated Mongoose document with
   * three populates and built the full row array in memory. At a hundred
   * thousand applications that exhausts the process before it writes a byte.
   *
   * `.lean()` removes the hydration cost, and a hard ceiling keeps a single
   * click from taking the API down — an operator exporting a hundred thousand
   * rows wants a date range, not a spreadsheet no tool will open. When the cap
   * bites, the response says so rather than silently handing back a truncated
   * file that looks complete.
   */
  const EXPORT_LIMIT = 20000;
  const total = await CareerApplication.countDocuments(filter);
  const applications = await CareerApplication.find(filter)
    .populate("careerId", "title department location")
    .populate("selectedStates", "name")
    .populate("selectedDistricts", "name")
    .sort({ appliedAt: -1 })
    .limit(EXPORT_LIMIT)
    .lean();

  // Build CSV/JSON export data with S3 URLs for documents
  const rows = applications.map((app: any) => ({
    Name: app.name,
    Email: app.email,
    Phone: app.phone,
    DOB: app.dob ? new Date(app.dob).toLocaleDateString("en-IN") : "",
    Gender: app.gender || "",
    "Marital Status": app.maritalStatus || "",
    Address: app.address || "",
    Department: app.department || app.careerId?.department || "",
    Position: app.position || app.careerId?.title || "",
    Status: app.status,
    "Applied On": new Date(app.appliedAt).toLocaleDateString("en-IN"),
    "Resume URL": app.resumeUrl || "",
    "Passport Photo URL": app.passportPhotoUrl || "",
    "ID Proof URL": app.idProofUrl || "",
    "Educational Certificates URL": app.educationalCertificatesUrl || "",
    "Professional Registration URL": app.professionalRegistrationUrl || "",
    "Experience Certificates URL": app.experienceCertificatesUrl || "",
    "Other Documents URL": app.otherDocumentsUrl || "",
    "Selected States": (app.selectedStates || [])
      .map((s: any) => s.name)
      .join(", "),
    "Selected Districts": (app.selectedDistricts || [])
      .map((d: any) => d.name)
      .join(", "),
  }));

  res.locals.data = rows;
  if (total > EXPORT_LIMIT) {
    res.locals.meta = {
      truncated: true,
      exported: rows.length,
      total,
      hint: `Only the ${EXPORT_LIMIT.toLocaleString("en-IN")} most recent of ${total.toLocaleString("en-IN")} applications were exported. Narrow the date range to get the rest.`,
    };
  }
};


/**
 * POST /admin/applications/:id/interview
 *
 * Schedule (or reschedule) an interview and tell the candidate. The previous
 * interview, if any, is pushed to `interviewHistory` — HR needs to be able to
 * see what the candidate was told before, especially after a reschedule.
 *
 * The email is what makes this real, so a send failure is reported rather than
 * swallowed: an interview the candidate never heard about is worse than a
 * visible error the recruiter can retry.
 */
export const scheduleInterview = async (req: Request, res: Response) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const mode = String(b.mode || "").toUpperCase();

  if (mode !== "ONLINE" && mode !== "WALK_IN") {
    return res.status(400).json({
      success: false,
      message: "mode must be ONLINE or WALK_IN",
    });
  }
  const scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null;
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return res
      .status(400)
      .json({ success: false, message: "A valid scheduledAt is required" });
  }
  // Each mode has one field the candidate genuinely cannot do without.
  if (mode === "ONLINE" && !String(b.meetingLink || "").trim()) {
    return res.status(400).json({
      success: false,
      message: "meetingLink is required for an online interview",
    });
  }
  if (mode === "WALK_IN" && !String(b.venueAddress || "").trim()) {
    return res.status(400).json({
      success: false,
      message: "venueAddress is required for a walk-in interview",
    });
  }

  const application: any = await CareerApplication.findById(
    req.params.id as string,
  ).populate("careerId", "title department location");
  if (!application) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }

  const interview = {
    mode,
    scheduledAt,
    durationMinutes: Number(b.durationMinutes) || 30,
    roundName: b.roundName,
    meetingLink: mode === "ONLINE" ? String(b.meetingLink).trim() : undefined,
    venueName: mode === "WALK_IN" ? b.venueName : undefined,
    venueAddress: mode === "WALK_IN" ? String(b.venueAddress).trim() : undefined,
    contactPerson: mode === "WALK_IN" ? b.contactPerson : undefined,
    contactPhone: mode === "WALK_IN" ? b.contactPhone : undefined,
    instructions: b.instructions,
    scheduledByAdminId: adminId,
    scheduledAt_recordedAt: new Date(),
  };

  if (application.interview) {
    application.interviewHistory = [
      ...(application.interviewHistory || []),
      application.interview,
    ];
  }
  application.interview = interview;
  application.status = "INTERVIEW_SCHEDULED";
  await application.save();

  const mail = await sendInterviewInvite({
    candidateName: application.name,
    candidateEmail: application.email,
    position: application.position || application.careerId?.title || "",
    department: application.department || application.careerId?.department,
    applicationNumber: application.applicationNumber,
    mode: mode as "ONLINE" | "WALK_IN",
    scheduledAt,
    durationMinutes: interview.durationMinutes,
    roundName: interview.roundName,
    meetingLink: interview.meetingLink,
    venueName: interview.venueName,
    venueAddress: interview.venueAddress,
    contactPerson: interview.contactPerson,
    contactPhone: interview.contactPhone,
    instructions: interview.instructions,
  });

  res.locals.data = {
    application,
    emailSent: mail.success,
    emailError: mail.success ? undefined : mail.error,
  };
};

/**
 * POST /admin/applications/:id/offer
 *
 * Hire the candidate: record the terms, render the offer letter, archive it to
 * S3 and email it to them. The archived PDF is the same buffer that was sent,
 * so the copy on file is exactly what the candidate received.
 */
export const issueOffer = async (req: Request, res: Response) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};

  const designation = String(b.designation || "").trim();
  const ctcAnnual = Number(b.ctcAnnual);
  const joiningDate = b.joiningDate ? new Date(b.joiningDate) : null;

  if (!designation) {
    return res
      .status(400)
      .json({ success: false, message: "designation is required" });
  }
  if (!Number.isFinite(ctcAnnual) || ctcAnnual <= 0) {
    return res
      .status(400)
      .json({ success: false, message: "A valid annual CTC is required" });
  }
  if (!joiningDate || Number.isNaN(joiningDate.getTime())) {
    return res
      .status(400)
      .json({ success: false, message: "A valid joiningDate is required" });
  }

  const application: any = await CareerApplication.findById(
    req.params.id as string,
  ).populate("careerId", "title department location");
  if (!application) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }

  const companyName = config.smtp.companyName;
  const pdfBuffer = await generateOfferLetterPDF({
    candidateName: application.name,
    applicationNumber: application.applicationNumber || "",
    designation,
    department: b.department || application.department,
    ctcAnnual,
    joiningDate,
    location: b.location,
    reportingTo: b.reportingTo,
    notes: b.notes,
    companyName,
  });

  // Archive to S3. A failure here must not cost the candidate their offer
  // email, so it degrades to "sent but not archived" and says so.
  let offerLetterUrl: string | undefined;
  try {
    offerLetterUrl = await uploadBufferToAws(
      pdfBuffer,
      `Offer-Letter-${String(application.applicationNumber || application._id)}.pdf`,
      "application/pdf",
      "offer-letters",
    );
  } catch (err) {
    console.error("Failed to archive offer letter to S3:", err);
  }

  application.offer = {
    designation,
    department: b.department || application.department,
    ctcAnnual,
    joiningDate,
    location: b.location,
    reportingTo: b.reportingTo,
    offerLetterUrl,
    notes: b.notes,
    issuedByAdminId: adminId,
    issuedAt: new Date(),
  };
  application.status = "HIRED";
  await application.save();

  const mail = await sendOfferLetter({
    candidateName: application.name,
    candidateEmail: application.email,
    applicationNumber: application.applicationNumber,
    designation,
    department: application.offer.department,
    ctcAnnual,
    joiningDate,
    location: b.location,
    reportingTo: b.reportingTo,
    notes: b.notes,
    pdfBuffer,
  });

  res.locals.data = {
    application,
    emailSent: mail.success,
    emailError: mail.success ? undefined : mail.error,
    archivedToS3: !!offerLetterUrl,
  };
};

/**
 * POST /admin/applications/:id/evaluation
 *
 * The panel's assessment after an interview (§9.3). Recorded separately from
 * the status so "what the panel thought" and "what was decided" stay
 * distinguishable — a recommendation is advice, the status is the decision.
 */
export const saveEvaluation = async (req: Request, res: Response) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};

  const rating = b.rating === undefined || b.rating === "" ? undefined : Number(b.rating);
  if (rating !== undefined && (!Number.isFinite(rating) || rating < 0 || rating > 10)) {
    return res
      .status(400)
      .json({ success: false, message: "rating must be between 0 and 10" });
  }
  const RECS = ["SELECT", "REJECT", "HOLD", "NEXT_ROUND"];
  if (b.recommendation && !RECS.includes(b.recommendation)) {
    return res.status(400).json({
      success: false,
      message: `recommendation must be one of: ${RECS.join(", ")}`,
    });
  }

  const application: any = await CareerApplication.findById(
    req.params.id as string,
  );
  if (!application) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }
  if (!application.interview) {
    return res.status(400).json({
      success: false,
      message: "Schedule an interview before recording an evaluation",
    });
  }

  application.interview.evaluationRemarks = b.evaluationRemarks;
  application.interview.rating = rating;
  application.interview.interviewerName = b.interviewerName;
  application.interview.recommendation = b.recommendation;
  application.interview.hrReview = b.hrReview;
  application.interview.managementReview = b.managementReview;
  application.interview.evaluatedByAdminId = adminId;
  application.interview.evaluatedAt = new Date();
  await application.save();

  res.locals.data = { application };
};

/**
 * POST /admin/applications/:id/offer-response  body: { accepted, note?, declineReason? }
 *
 * Records whether the candidate accepted the offer (§9.5). The appointment
 * letter cannot be issued until this says yes — that ordering is the point of
 * the stage.
 */
export const recordOfferResponse = async (req: Request, res: Response) => {
  const b = req.body || {};
  if (typeof b.accepted !== "boolean") {
    return res
      .status(400)
      .json({ success: false, message: "accepted (true/false) is required" });
  }

  const application: any = await CareerApplication.findById(
    req.params.id as string,
  );
  if (!application) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }
  if (!application.offer) {
    return res.status(400).json({
      success: false,
      message: "No offer has been issued for this candidate yet",
    });
  }

  if (b.accepted) {
    application.offer.acceptedAt = new Date();
    application.offer.acceptanceNote = b.note;
    application.offer.declinedAt = undefined;
    application.offer.declineReason = undefined;
    application.status = "OFFER_ACCEPTED";
  } else {
    application.offer.declinedAt = new Date();
    application.offer.declineReason = b.declineReason || b.note;
    application.offer.acceptedAt = undefined;
    // A declined offer returns the candidate to the pool rather than being
    // silently marked hired.
    application.status = "REJECTED";
  }
  await application.save();

  res.locals.data = { application };
};

/**
 * POST /admin/applications/:id/signed-offer  (multipart: file)
 * Archives the countersigned offer the candidate returned.
 */
export const uploadSignedOffer = async (req: Request, res: Response) => {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) {
    return res
      .status(400)
      .json({ success: false, message: "a file is required" });
  }
  const application: any = await CareerApplication.findById(
    req.params.id as string,
  );
  if (!application) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }
  if (!application.offer) {
    return res
      .status(400)
      .json({ success: false, message: "No offer has been issued yet" });
  }
  const url = await uploadBufferToAws(
    file.buffer,
    `Signed-Offer-${application.applicationNumber || application._id}`,
    file.mimetype || "application/octet-stream",
    "signed-offers",
  );
  application.offer.signedOfferUrl = url;
  await application.save();
  res.locals.data = { application };
};

/**
 * POST /admin/applications/:id/appointment
 *
 * Issues the appointment letter on the joining date (§9.5): renders the PDF,
 * archives it to S3 and emails it. Requires an accepted offer, because an
 * appointment letter for an offer nobody accepted is not a real document.
 */
export const issueAppointment = async (req: Request, res: Response) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};

  const application: any = await CareerApplication.findById(
    req.params.id as string,
  ).populate("careerId", "title department location");
  if (!application) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }
  if (!application.offer) {
    return res
      .status(400)
      .json({ success: false, message: "No offer has been issued yet" });
  }
  if (!application.offer.acceptedAt) {
    return res.status(400).json({
      success: false,
      message:
        "Record the candidate's acceptance before issuing the appointment letter",
      requiresAcceptance: true,
    });
  }

  const joiningDate = b.joiningDate
    ? new Date(b.joiningDate)
    : new Date(application.offer.joiningDate);
  if (Number.isNaN(joiningDate.getTime())) {
    return res
      .status(400)
      .json({ success: false, message: "A valid joiningDate is required" });
  }
  const designation = String(
    b.designation || application.offer.designation || "",
  ).trim();
  if (!designation) {
    return res
      .status(400)
      .json({ success: false, message: "designation is required" });
  }

  const companyName = config.smtp.companyName;
  const pdfBuffer = await generateAppointmentLetterPDF({
    candidateName: application.name,
    applicationNumber: application.applicationNumber || "",
    designation,
    department: b.department || application.offer.department,
    joiningDate,
    location: b.location || application.offer.location,
    reportingTo: b.reportingTo || application.offer.reportingTo,
    ctcAnnual: application.offer.ctcAnnual,
    employeeCode: b.employeeCode,
    companyName,
  });

  let appointmentLetterUrl: string | undefined;
  try {
    appointmentLetterUrl = await uploadBufferToAws(
      pdfBuffer,
      `Appointment-Letter-${String(application.applicationNumber || application._id)}.pdf`,
      "application/pdf",
      "appointment-letters",
    );
  } catch (err) {
    console.error("Failed to archive appointment letter to S3:", err);
  }

  application.appointment = {
    issuedAt: new Date(),
    joiningDate,
    designation,
    department: b.department || application.offer.department,
    reportingTo: b.reportingTo || application.offer.reportingTo,
    location: b.location || application.offer.location,
    appointmentLetterUrl,
    employeeId: b.employeeId || undefined,
    issuedByAdminId: adminId,
  };
  application.status = "APPOINTED";
  await application.save();

  const mail = await sendAppointmentLetter({
    candidateName: application.name,
    candidateEmail: application.email,
    applicationNumber: application.applicationNumber,
    designation,
    department: application.appointment.department,
    joiningDate,
    location: application.appointment.location,
    reportingTo: application.appointment.reportingTo,
    employeeCode: b.employeeCode,
    pdfBuffer,
  });

  res.locals.data = {
    application,
    emailSent: mail.success,
    emailError: mail.success ? undefined : mail.error,
    archivedToS3: !!appointmentLetterUrl,
  };
};

/**
 * POST /admin/applications/:id/resend-acknowledgement
 *
 * Re-send the acknowledgement for an application whose email failed. The
 * application itself was never at risk — it is saved before any mail is
 * attempted — but a candidate who was never acknowledged needs someone to be
 * able to put that right without re-entering anything.
 */
export const resendAcknowledgement = async (req: Request, res: Response) => {
  const application: any = await CareerApplication.findById(
    req.params.id as string,
  ).populate("careerId", "title department location");
  if (!application) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }

  let pdfBuffer: Buffer | undefined;
  try {
    pdfBuffer = await generateApplicationPDF(application);
  } catch {
    // Send without the PDF rather than not at all.
  }

  const result = await sendApplicationAcknowledgement({
    candidateName: application.name,
    candidateEmail: application.email,
    candidatePhone: application.phone,
    position: application.position || application.careerId?.title || "",
    department: application.department || application.careerId?.department || "",
    applicationId: String(application._id),
    applicationNumber: application.applicationNumber || "",
    appliedDate: new Date(application.appliedAt || application.createdAt)
      .toLocaleDateString("en-IN"),
    pdfBuffer,
  });

  application.ackEmailStatus = result?.success ? "sent" : "failed";
  application.ackEmailError = result?.success ? undefined : result?.error;
  application.ackEmailAt = new Date();
  application.ackEmailAttempts = (application.ackEmailAttempts || 0) + 1;
  await application.save();

  res.locals.data = {
    sent: !!result?.success,
    error: result?.success ? undefined : result?.error,
    attempts: application.ackEmailAttempts,
  };
};

/** GET /admin/applications/failed-emails — everyone who was never acknowledged. */
export const failedAcknowledgements = async (req: Request, res: Response) => {
  const items = await CareerApplication.find({ ackEmailStatus: "failed" })
    .select("name email applicationNumber ackEmailError ackEmailAt ackEmailAttempts appliedAt")
    .sort({ appliedAt: -1 })
    .limit(200)
    .lean();
  res.locals.data = { items, total: items.length };
};
