import { Request, Response } from "express";
import { Career } from "../models/career.model";
import { CareerApplication } from "../models/career-application.model";
import { Otp } from "../models/otp.model";
import { uploadFileToAws } from "../utils/s3";
import {
  sendApplicationAcknowledgement,
  sendOtpEmail,
  sendResumeSubmissionToHR,
} from "../services/email.service";
import { sendOtpSms } from "../services/sms.service";
import { generateApplicationPDF } from "../services/pdf.service";
import crypto from "crypto";

const INDIAN_MOBILE_REGEX = /^[6-9]\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
const RESUME_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const normalizeIndianPhone = (phone = "") => {
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
};

const isAllowedEmail = (email = "") => {
  const normalized = String(email).trim().toLowerCase();
  return EMAIL_REGEX.test(normalized);
};

export const listCareers = async (_req: Request, res: Response) => {
  const careers = await Career.find({ isActive: true })
    .populate("states", "name code")
    .populate("districts", "name state")
    .sort({ postedAt: -1 })
    .lean();
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.locals.data = careers;
};

export const getCareer = async (req: Request, res: Response) => {
  const career = await Career.findOne({ _id: (req.params.id as string), isActive: true })
    .populate("states", "name code")
    .populate("districts", "name state");
  if (!career) {
    return res
      .status(404)
      .json({ success: false, message: "Career not found" });
  }
  res.locals.data = career;
};

/* ── OTP: Send OTP ── */
export const sendOtp = async (req: Request, res: Response) => {
  let { identifier, type } = req.body as {
    identifier?: string;
    type?: "email" | "phone";
  };

  if (!identifier || !type) {
    return res
      .status(400)
      .json({ success: false, message: "Identifier and type are required" });
  }

  if (type === "phone") {
    identifier = normalizeIndianPhone(identifier);
    if (!INDIAN_MOBILE_REGEX.test(identifier)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Indian mobile number (must be 10 digits)",
      });
    }
  } else {
    identifier = String(identifier).trim().toLowerCase();
    if (!isAllowedEmail(identifier)) {
      return res.status(400).json({
        success: false,
        message:
          "Please use a valid business/personal email (temporary emails are not allowed)",
      });
    }
  }

  // Generate 6-digit OTP
  const otp = crypto.randomInt(100000, 999999).toString();

  // Remove old OTPs for this identifier+type
  await Otp.deleteMany({ identifier, type });

  // Create new OTP with 120 second expiry
  await Otp.create({
    identifier,
    type,
    otp,
    expiresAt: new Date(Date.now() + 120 * 1000),
    lastSentAt: new Date(),
  });

  // Send OTP via appropriate channel
  if (type === "phone") {
    try {
      const smsResult = await sendOtpSms(identifier, otp);
      console.log(
        "[OTP] SMS result for",
        identifier,
        ":",
        JSON.stringify(smsResult),
      );
      if (!smsResult.success) {
        console.error("Failed to send OTP SMS:", smsResult.message);
        return res.status(500).json({
          success: false,
          message: "Failed to send OTP SMS. Please try again.",
        });
      }
    } catch (err) {
      console.error("Failed to send OTP SMS:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP SMS. Please try again.",
      });
    }
  } else if (type === "email") {
    try {
      await sendOtpEmail(identifier, otp);
    } catch (err) {
      console.error("Failed to send OTP email:", err);
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Please try again.",
      });
    }
  }

  res.locals.data = { message: "OTP sent successfully" };
};

/* ── OTP: Verify OTP ── */
export const verifyOtp = async (req: Request, res: Response) => {
  let { identifier, type, otp } = req.body as {
    identifier?: string;
    type?: "email" | "phone";
    otp?: string;
  };

  if (!identifier || !type || !otp) {
    return res.status(400).json({
      success: false,
      message: "Identifier, type, and OTP are required",
    });
  }

  if (type === "phone") {
    identifier = normalizeIndianPhone(identifier);
    if (!INDIAN_MOBILE_REGEX.test(identifier)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Indian mobile number",
      });
    }
  } else {
    identifier = String(identifier).trim().toLowerCase();
    if (!isAllowedEmail(identifier)) {
      return res.status(400).json({
        success: false,
        message:
          "Please use a valid business/personal email (temporary emails are not allowed)",
      });
    }
  }

  const record = await Otp.findOne({
    identifier,
    type,
    otp,
    expiresAt: { $gt: new Date() },
  });

  if (!record) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid or expired OTP" });
  }

  record.verified = true;
  // Extend expiry so the verified OTP survives while the user fills the
  // rest of the application form (uploads, declarations, etc.). Without
  // this the TTL index deletes the record 2 minutes after send, causing
  // "Email must be verified via OTP before applying" on submit.
  record.expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await record.save();

  res.locals.data = { message: "OTP verified successfully", verified: true };
};

/* ── Helper: upload a single field from req.files ── */
const uploadField = async (
  files: { [field: string]: Express.Multer.File[] } | undefined,
  fieldName: string,
): Promise<string | undefined> => {
  if (!files || !files[fieldName] || files[fieldName].length === 0)
    return undefined;
  const result = await uploadFileToAws([files[fieldName][0]]);
  return result.images as string;
};

export const submitResume = async (req: Request, res: Response) => {
  const { name, email, phone, message } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    message?: string;
  };
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedPhone = normalizeIndianPhone(String(phone || ""));
  const resumeFile = (req as Request & { file?: Express.Multer.File }).file;

  if (!name || !normalizedEmail || !normalizedPhone) {
    return res.status(400).json({
      success: false,
      message: "Name, email, and phone are required",
    });
  }

  if (!isAllowedEmail(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      message:
        "Please use a valid business/personal email (temporary emails are not allowed)",
    });
  }

  if (!INDIAN_MOBILE_REGEX.test(normalizedPhone)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Indian mobile number (must be 10 digits)",
    });
  }

  if (!resumeFile) {
    return res.status(400).json({
      success: false,
      message: "Resume file is required",
    });
  }

  const fileName = String(resumeFile.originalname || "").toLowerCase();
  const hasAllowedExtension =
    fileName.endsWith(".pdf") ||
    fileName.endsWith(".doc") ||
    fileName.endsWith(".docx");

  if (
    !RESUME_ALLOWED_MIME_TYPES.has(resumeFile.mimetype) &&
    !hasAllowedExtension
  ) {
    return res.status(400).json({
      success: false,
      message: "Resume must be a PDF or Word document (.pdf, .doc, .docx)",
    });
  }

  let resumeUrl = "";
  try {
    const uploaded = await uploadFileToAws([resumeFile]);
    resumeUrl = String(uploaded.images || "");
  } catch (err) {
    console.error("Failed to upload resume to S3:", err);
  }

  const emailResult = await sendResumeSubmissionToHR({
    candidateName: String(name).trim(),
    candidateEmail: normalizedEmail,
    candidatePhone: normalizedPhone,
    message: String(message || "").trim(),
    resumeUrl,
    resumeFileName: resumeFile.originalname || "resume.pdf",
    resumeMimeType: resumeFile.mimetype,
    resumeBuffer: resumeFile.buffer,
  });

  if (!emailResult.success) {
    return res.status(500).json({
      success: false,
      message: "Failed to submit resume. Please try again.",
    });
  }

  res.locals.data = {
    message: "Resume submitted successfully",
  };
};

export const applyToCareer = async (req: Request, res: Response) => {
  const {
    name,
    email,
    phone,
    dob,
    gender,
    maritalStatus,
    address,
    department,
    position,
    declaration,
    experience,
    coverLetter,
    selectedStates,
    selectedDistricts,
  } = req.body;
  const careerId = (req.params.id as string);

  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  const normalizedPhone = normalizeIndianPhone(String(phone || ""));

  if (!name || !normalizedEmail || !normalizedPhone) {
    return res.status(400).json({
      success: false,
      message: "Name, email, and phone are required",
    });
  }

  if (!isAllowedEmail(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      message:
        "Please use a valid business/personal email (temporary emails are not allowed)",
    });
  }

  if (!INDIAN_MOBILE_REGEX.test(normalizedPhone)) {
    return res.status(400).json({
      success: false,
      message: "Invalid Indian mobile number (must be 10 digits)",
    });
  }

  if (!dob) {
    return res.status(400).json({
      success: false,
      message: "Date of birth is required",
    });
  }

  const parsedDob = new Date(dob);
  if (Number.isNaN(parsedDob.getTime())) {
    return res.status(400).json({
      success: false,
      message: "Invalid date of birth",
    });
  }

  // Verify OTP for email
  const emailOtp = await Otp.findOne({
    identifier: normalizedEmail,
    type: "email",
    verified: true,
  });

  if (!emailOtp) {
    return res.status(400).json({
      success: false,
      message: "Email must be verified via OTP before applying",
    });
  }

  // Verify OTP for mobile
  const phoneOtp = await Otp.findOne({
    identifier: normalizedPhone,
    type: "phone",
    verified: true,
  });

  if (!phoneOtp) {
    return res.status(400).json({
      success: false,
      message: "Mobile number must be verified via OTP before applying",
    });
  }

  const career = await Career.findOne({ _id: careerId, isActive: true });
  if (!career) {
    return res
      .status(404)
      .json({ success: false, message: "Career not found" });
  }

  // Validate max 3 selected locations
  const statesArr = selectedStates
    ? JSON.parse(
        typeof selectedStates === "string"
          ? selectedStates
          : JSON.stringify(selectedStates),
      )
    : [];
  const districtsArr = selectedDistricts
    ? JSON.parse(
        typeof selectedDistricts === "string"
          ? selectedDistricts
          : JSON.stringify(selectedDistricts),
      )
    : [];

  /* Validate passportPhoto is image type */
  const files = req.files as
    | { [field: string]: Express.Multer.File[] }
    | undefined;

  if (files?.passportPhoto?.[0]) {
    const mime = files.passportPhoto[0].mimetype;
    if (!mime.startsWith("image/")) {
      return res.status(400).json({
        success: false,
        message: "Passport photo must be an image file (jpg, png, etc.)",
      });
    }
  }

  /* Upload all document files in parallel */
  const [
    resumeUrl,
    passportPhotoUrl,
    idProofUrl,
    educationalCertificatesUrl,
    professionalRegistrationUrl,
    experienceCertificatesUrl,
    otherDocumentsUrl,
  ] = await Promise.all([
    uploadField(files, "resume"),
    uploadField(files, "passportPhoto"),
    uploadField(files, "idProof"),
    uploadField(files, "educationalCertificates"),
    uploadField(files, "professionalRegistration"),
    uploadField(files, "experienceCertificates"),
    uploadField(files, "otherDocuments"),
  ]);

  const application = await CareerApplication.create({
    careerId,
    name,
    email: normalizedEmail,
    phone: normalizedPhone,
    dob: parsedDob,
    gender,
    maritalStatus,
    address,
    department,
    position,
    declaration: declaration === "true" || declaration === true,
    experience,
    coverLetter,
    selectedStates: statesArr,
    selectedDistricts: districtsArr,
    resumeUrl,
    passportPhotoUrl,
    idProofUrl,
    educationalCertificatesUrl,
    professionalRegistrationUrl,
    experienceCertificatesUrl,
    otherDocumentsUrl,
    status: "NEW",
  });

  // Clean up verified OTPs
  await Otp.deleteMany({ identifier: normalizedEmail, type: "email" });
  await Otp.deleteMany({ identifier: normalizedPhone, type: "phone" });

  // Generate PDF acknowledgement and send emails (non-blocking)
  const appNumber = (application as any).applicationNumber || "";

  // Collect uploaded document buffers to attach in the email
  const documentAttachments: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }> = [];

  const docFields: Array<{ field: string; label: string }> = [
    { field: "resume", label: "Resume" },
    { field: "passportPhoto", label: "Passport_Photo" },
    { field: "idProof", label: "ID_Proof" },
    { field: "educationalCertificates", label: "Educational_Certificates" },
    { field: "professionalRegistration", label: "Professional_Registration" },
    { field: "experienceCertificates", label: "Experience_Certificates" },
    { field: "otherDocuments", label: "Other_Documents" },
  ];

  if (files) {
    for (const { field, label } of docFields) {
      const fileArr = files[field];
      if (fileArr?.[0]) {
        const f = fileArr[0];
        const ext = (f.originalname || "").split(".").pop() || "bin";
        documentAttachments.push({
          filename: `${label}.${ext}`,
          content: f.buffer,
          contentType: f.mimetype,
        });
      }
    }
  }

  const emailData = {
    candidateName: name,
    candidateEmail: normalizedEmail,
    candidatePhone: normalizedPhone,
    position: position || career.title || "",
    department: department || "",
    applicationId: application._id.toString(),
    applicationNumber: appNumber,
    appliedDate: new Date().toLocaleDateString("en-IN"),
  };

  // Fire-and-forget: generate PDF then send single email (HR gets BCC)
  (async () => {
    try {
      const pdfBuffer = await generateApplicationPDF(application as any);

      await sendApplicationAcknowledgement({
        ...emailData,
        pdfBuffer,
        documents: documentAttachments,
      }).catch((err) =>
        console.error("Failed to send application email:", err),
      );
    } catch (err) {
      console.error("Failed to generate PDF or send email:", err);
      // Still try sending email without PDF
      sendApplicationAcknowledgement({
        ...emailData,
        documents: documentAttachments,
      }).catch((e) => console.error("Failed to send application email:", e));
    }
  })();

  res.locals.data = application;
};
