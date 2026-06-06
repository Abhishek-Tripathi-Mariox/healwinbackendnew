import { Request, Response } from "express";
import nodemailer from "nodemailer";
import { EmailTemplate } from "../../models/email-template.model";
import { paginate } from "../../utils/paginate.util";
import { SmtpPurpose, SmtpSettings } from "../../models/smtp-settings.model";
import {
  sendEmail,
  getActiveTemplate,
  getSmtpConfig,
} from "../../services/email.service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const parseEmailList = (value: unknown): string[] => {
  const normalize = (entries: string[]) => [
    ...new Set(
      entries.map((entry) => entry.trim().toLowerCase()).filter(Boolean),
    ),
  ];

  if (Array.isArray(value)) {
    return normalize(value.map((entry) => String(entry || "")));
  }

  return normalize(String(value || "").split(","));
};

const parseSmtpPurpose = (value: unknown): SmtpPurpose =>
  String(value || "")
    .trim()
    .toLowerCase() === "otp"
    ? "OTP"
    : "NOTIFICATIONS";

const buildSmtpFilter = (purpose: SmtpPurpose) =>
  purpose === "OTP"
    ? { purpose: "OTP" as const }
    : {
        $or: [
          { purpose: "NOTIFICATIONS" as const },
          { purpose: { $exists: false } },
        ],
      };

/**
 * Get all email templates
 */
export const getAllTemplates = async (req: Request, res: Response) => {
  const { type, q } = req.query as { type?: string; q?: string };

  const filter: Record<string, any> = {};
  if (type) filter.type = type;
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { subject: { $regex: q, $options: "i" } },
    ];
  }

  const result = await paginate(EmailTemplate, filter, req, { updatedAt: -1 });
  res.locals.data = result;
};

/**
 * Get single email template by ID
 */
export const getTemplateById = async (req: Request, res: Response) => {
  const template = await EmailTemplate.findById(req.params.id);
  if (!template) {
    return res
      .status(404)
      .json({ success: false, message: "Template not found" });
  }
  res.locals.data = template;
};

/**
 * Create new email template
 */
export const createTemplate = async (req: Request, res: Response) => {
  const { name, type, subject, body, isActive, placeholders } = req.body;

  if (!name || !type || !subject || !body) {
    return res.status(400).json({
      success: false,
      message: "Name, type, subject, and body are required",
    });
  }

  // If setting as active, deactivate other templates of the same type
  if (isActive !== false) {
    await EmailTemplate.updateMany(
      { type, isActive: true },
      { isActive: false },
    );
  }

  const template = await EmailTemplate.create({
    name,
    type,
    subject,
    body,
    isActive: isActive !== false,
    placeholders: placeholders || getDefaultPlaceholders(type),
  });

  res.locals.data = template;
};

/**
 * Update email template
 */
export const updateTemplate = async (req: Request, res: Response) => {
  const { name, type, subject, body, isActive, placeholders } = req.body;

  const template = await EmailTemplate.findById(req.params.id);
  if (!template) {
    return res
      .status(404)
      .json({ success: false, message: "Template not found" });
  }

  // If activating this template, deactivate other templates of the same type
  if (isActive === true && !template.isActive) {
    await EmailTemplate.updateMany(
      { type: template.type, isActive: true, _id: { $ne: template._id } },
      { isActive: false },
    );
  }

  if (name !== undefined) template.name = name;
  if (type !== undefined) template.type = type;
  if (subject !== undefined) template.subject = subject;
  if (body !== undefined) template.body = body;
  if (isActive !== undefined) template.isActive = isActive;
  if (placeholders !== undefined) template.placeholders = placeholders;

  await template.save();
  res.locals.data = template;
};

/**
 * Delete email template
 */
export const deleteTemplate = async (req: Request, res: Response) => {
  const template = await EmailTemplate.findByIdAndDelete(req.params.id);
  if (!template) {
    return res
      .status(404)
      .json({ success: false, message: "Template not found" });
  }
  res.locals.data = { message: "Template deleted successfully" };
};

/**
 * Send a test email using a template
 */
export const sendTestEmail = async (req: Request, res: Response) => {
  const { templateId, testEmail } = req.body;

  if (!templateId || !testEmail) {
    return res.status(400).json({
      success: false,
      message: "Template ID and test email are required",
    });
  }

  const template = await EmailTemplate.findById(templateId);
  if (!template) {
    return res
      .status(404)
      .json({ success: false, message: "Template not found" });
  }

  // Use sample data for placeholders
  const smtp = await getSmtpConfig();
  const sampleNewStatusByType: Record<string, string> = {
    APPLICATION_STATUS_SHORTLISTED: "Shortlisted",
    APPLICATION_STATUS_HIRED: "Hired",
    APPLICATION_STATUS_REJECTED: "Rejected",
  };
  const sampleNewStatus = sampleNewStatusByType[template.type] || "IN_REVIEW";

  const sampleData: Record<string, string> = {
    candidateName: "John Doe",
    candidateEmail: testEmail,
    candidatePhone: "+91 98765 43210",
    position: "Software Engineer",
    department: "Engineering",
    applicationId: "APP-2026-001",
    applicationNumber: "2026-HWJA-10001",
    appliedDate: new Date().toLocaleDateString("en-IN"),
    companyName: smtp.companyName,
    companyEmail: smtp.fromEmail,
    oldStatus: "In Review",
    newStatus: sampleNewStatus,
    oldStatusCode: "IN_REVIEW",
    newStatusCode: sampleNewStatus.toUpperCase().replace(/\s+/g, "_"),
  };

  // Replace placeholders
  let subject = template.subject;
  let body = template.body;
  for (const [key, value] of Object.entries(sampleData)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    subject = subject.replace(regex, value);
    body = body.replace(regex, value);
  }

  const result = await sendEmail({
    to: testEmail,
    subject: `[TEST] ${subject}`,
    html: body,
  });

  if (result.success) {
    res.locals.data = {
      message: "Test email sent successfully",
      messageId: result.messageId,
    };
  } else {
    return res.status(500).json({
      success: false,
      message: `Failed to send email: ${result.error}`,
    });
  }
};

/**
 * Get SMTP config status (without exposing credentials)
 */
export const getSmtpStatus = async (_req: Request, res: Response) => {
  const notificationsSmtp = await getSmtpConfig("NOTIFICATIONS");
  const otpSmtp = await getSmtpConfig("OTP");

  const notificationHrRecipients =
    notificationsSmtp.hrEmails && notificationsSmtp.hrEmails.length > 0
      ? notificationsSmtp.hrEmails
      : notificationsSmtp.hrEmail
        ? [notificationsSmtp.hrEmail]
        : [];

  const notificationsStatus = {
    configured: !!(
      notificationsSmtp.host &&
      notificationsSmtp.user &&
      notificationHrRecipients.length > 0
    ),
    host: notificationsSmtp.host || "Not configured",
    port: notificationsSmtp.port,
    fromEmail: notificationsSmtp.fromEmail || "Not configured",
    fromName: notificationsSmtp.fromName || "Not configured",
    hrEmail: notificationsSmtp.hrEmail || "Not configured",
    hrEmails: notificationHrRecipients,
    acknowledgementCcEmails: notificationsSmtp.acknowledgementCcEmails || [],
  };

  const otpStatus = {
    configured: !!(otpSmtp.host && otpSmtp.user && otpSmtp.fromEmail),
    host: otpSmtp.host || "Not configured",
    port: otpSmtp.port,
    fromEmail: otpSmtp.fromEmail || "Not configured",
    fromName: otpSmtp.fromName || "Not configured",
    hrEmail: "Not required",
    hrEmails: [],
    acknowledgementCcEmails: [],
  };

  // Keep backward-compatible top-level fields from notifications config.
  res.locals.data = {
    ...notificationsStatus,
    notifications: notificationsStatus,
    otp: otpStatus,
  };
};

/**
 * Get available placeholders for a type
 */
export const getPlaceholders = async (req: Request, res: Response) => {
  const { type } = req.query as { type?: string };
  res.locals.data = getDefaultPlaceholders(
    type || "APPLICATION_ACKNOWLEDGEMENT",
  );
};

function getDefaultPlaceholders(type: string): string[] {
  const common = [
    "candidateName",
    "candidateEmail",
    "position",
    "department",
    "applicationId",
    "applicationNumber",
    "appliedDate",
    "companyName",
    "companyEmail",
  ];

  switch (type) {
    case "APPLICATION_ACKNOWLEDGEMENT":
      return common;
    case "APPLICATION_HR_NOTIFICATION":
      return [...common, "candidatePhone"];
    case "APPLICATION_STATUS_UPDATE":
    case "APPLICATION_STATUS_SHORTLISTED":
    case "APPLICATION_STATUS_HIRED":
    case "APPLICATION_STATUS_REJECTED":
      return [
        ...common,
        "oldStatus",
        "newStatus",
        "oldStatusCode",
        "newStatusCode",
      ];
    default:
      return common;
  }
}

// ==================== SMTP SETTINGS CRUD ====================

/**
 * Get current SMTP settings (password masked)
 */
export const getSmtpSettings = async (req: Request, res: Response) => {
  const purpose = parseSmtpPurpose(req.query.purpose);
  const settings = await SmtpSettings.findOne(buildSmtpFilter(purpose)).sort({
    updatedAt: -1,
  });

  if (!settings) {
    res.locals.data = null;
    return;
  }

  res.locals.data = {
    _id: settings._id,
    purpose,
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    user: settings.user,
    pass: "••••••••", // Mask password
    fromEmail: settings.fromEmail,
    fromName: settings.fromName,
    hrEmail: purpose === "NOTIFICATIONS" ? settings.hrEmail : "",
    hrEmails:
      purpose === "NOTIFICATIONS"
        ? settings.hrEmails && settings.hrEmails.length > 0
          ? settings.hrEmails
          : settings.hrEmail
            ? [settings.hrEmail]
            : []
        : [],
    acknowledgementCcEmails:
      purpose === "NOTIFICATIONS" ? settings.acknowledgementCcEmails || [] : [],
    companyName: settings.companyName,
    updatedAt: settings.updatedAt,
  };
};

/**
 * Save/update SMTP settings
 */
export const updateSmtpSettings = async (req: Request, res: Response) => {
  const purpose = parseSmtpPurpose(req.query.purpose || req.body.purpose);
  const {
    host,
    port,
    secure,
    user,
    pass,
    fromEmail,
    fromName,
    hrEmail,
    hrEmails,
    acknowledgementCcEmails,
    companyName,
  } = req.body;

  const parsedHrEmails =
    purpose === "NOTIFICATIONS" ? parseEmailList(hrEmails || hrEmail) : [];
  const parsedAckCcEmails =
    purpose === "NOTIFICATIONS" ? parseEmailList(acknowledgementCcEmails) : [];

  if (!host || !user || !fromEmail || !fromName || !companyName) {
    return res.status(400).json({
      success: false,
      message:
        "Host, user, from email, from name, and company name are required",
    });
  }

  if (purpose === "NOTIFICATIONS") {
    if (parsedHrEmails.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one HR notification email is required",
      });
    }

    const invalidHrEmail = parsedHrEmails.find(
      (email) => !EMAIL_REGEX.test(email),
    );
    if (invalidHrEmail) {
      return res.status(400).json({
        success: false,
        message: `Invalid HR email address: ${invalidHrEmail}`,
      });
    }

    const invalidAckCcEmail = parsedAckCcEmails.find(
      (email) => !EMAIL_REGEX.test(email),
    );
    if (invalidAckCcEmail) {
      return res.status(400).json({
        success: false,
        message: `Invalid acknowledgement CC email address: ${invalidAckCcEmail}`,
      });
    }
  }

  // Find existing settings or create new
  let settings = await SmtpSettings.findOne(buildSmtpFilter(purpose)).sort({
    updatedAt: -1,
  });

  if (settings) {
    settings.purpose = purpose;
    settings.host = host;
    settings.port = port || 587;
    settings.secure = secure ?? false;
    settings.user = user;
    // Only update password if a real value is provided (not the masked value)
    if (pass && pass !== "••••••••") {
      settings.pass = pass;
    }
    settings.fromEmail = fromEmail;
    settings.fromName = fromName;
    settings.hrEmail = purpose === "NOTIFICATIONS" ? parsedHrEmails[0] : "";
    settings.hrEmails = purpose === "NOTIFICATIONS" ? parsedHrEmails : [];
    settings.acknowledgementCcEmails =
      purpose === "NOTIFICATIONS" ? parsedAckCcEmails : [];
    settings.companyName = companyName;
    settings.updatedBy = (req as any).adminUser?._id;
    await settings.save();
  } else {
    if (!pass || pass === "••••••••") {
      return res.status(400).json({
        success: false,
        message: "Password is required for initial SMTP setup",
      });
    }
    settings = await SmtpSettings.create({
      purpose,
      host,
      port: port || 587,
      secure: secure ?? false,
      user,
      pass,
      fromEmail,
      fromName,
      hrEmail: purpose === "NOTIFICATIONS" ? parsedHrEmails[0] : "",
      hrEmails: purpose === "NOTIFICATIONS" ? parsedHrEmails : [],
      acknowledgementCcEmails:
        purpose === "NOTIFICATIONS" ? parsedAckCcEmails : [],
      companyName,
      updatedBy: (req as any).adminUser?._id,
    });
  }

  res.locals.data = {
    message: `${
      purpose === "OTP" ? "OTP" : "Notification"
    } SMTP settings saved successfully`,
    configured: true,
    purpose,
  };
};

/**
 * Test SMTP connection with current saved settings
 */
export const testSmtpConnection = async (req: Request, res: Response) => {
  const purpose = parseSmtpPurpose(req.query.purpose || req.body.purpose);
  const smtp = await getSmtpConfig(purpose);

  if (!smtp.host || !smtp.user || !smtp.pass) {
    return res.status(400).json({
      success: false,
      message: "SMTP is not configured. Please save settings first.",
    });
  }

  console.log(
    `🔍 Testing ${purpose} SMTP: user=${smtp.user}, host=${smtp.host}, passLength=${smtp.pass.length}, isGmail=${smtp.host.includes("gmail")}`,
  );

  try {
    const isGmail =
      smtp.host.includes("gmail") ||
      smtp.user.endsWith("@gmail.com") ||
      smtp.user.endsWith("@healwin.in");

    const transportConfig = isGmail
      ? {
          service: "gmail" as const,
          auth: { user: smtp.user, pass: smtp.pass },
        }
      : {
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          auth: { user: smtp.user, pass: smtp.pass },
          tls: { rejectUnauthorized: false },
        };

    const transporter = nodemailer.createTransport(transportConfig);

    await transporter.verify();

    res.locals.data = {
      success: true,
      message: `${
        purpose === "OTP" ? "OTP" : "Notification"
      } SMTP connection successful! Email service is ready.`,
      purpose,
    };
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: `SMTP connection failed: ${error.message}`,
    });
  }
};
