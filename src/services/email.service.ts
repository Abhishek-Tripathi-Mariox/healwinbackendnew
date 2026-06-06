import nodemailer from "nodemailer";
import config from "../config";
import {
  EmailTemplate,
  EmailTemplateType,
} from "../models/email-template.model";
import { SmtpPurpose, SmtpSettings } from "../models/smtp-settings.model";
import { LogoSettings } from "../models/logo-settings.model";

// 'host' => 'smtp.gmail.com',
// 'username' => 'hr@healwin.in',
// 'password' => 'dyzc bnix uxdi jbwh',
// 'port' => 587,
// 'encryption' => PHPMailer::ENCRYPTION_STARTTLS

/**
 * Get SMTP settings — reads from DB first, falls back to env config
 */
export const getSmtpConfig = async (
  purpose: SmtpPurpose = "NOTIFICATIONS",
): Promise<{
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
  hrEmail: string;
  hrEmails: string[];
  acknowledgementCcEmails: string[];
  companyName: string;
}> => {
  const parseEmailList = (value: string) => [
    ...new Set(
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  // Try to get settings from DB. Old records without a purpose are treated as
  // NOTIFICATIONS for backward compatibility.
  const dbFilter =
    purpose === "OTP"
      ? { purpose: "OTP" as const }
      : {
          $or: [
            { purpose: "NOTIFICATIONS" as const },
            { purpose: { $exists: false } },
          ],
        };

  const dbSettings = await SmtpSettings.findOne(dbFilter).sort({
    updatedAt: -1,
  });

  if (dbSettings && dbSettings.host && dbSettings.user && dbSettings.pass) {
    if (purpose === "OTP") {
      return {
        host: dbSettings.host,
        port: dbSettings.port,
        secure: dbSettings.secure,
        user: dbSettings.user.trim(),
        pass: dbSettings.pass,
        fromEmail: dbSettings.fromEmail,
        fromName: dbSettings.fromName,
        hrEmail: "",
        hrEmails: [],
        acknowledgementCcEmails: [],
        companyName:
          dbSettings.companyName ||
          (config as any).smtpOtp?.companyName ||
          config.smtp.companyName,
      };
    }

    const hrEmails = [
      ...new Set(
        (dbSettings.hrEmails || [])
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),
    ];
    const normalizedHrEmails =
      hrEmails.length > 0
        ? hrEmails
        : dbSettings.hrEmail
          ? [dbSettings.hrEmail.trim().toLowerCase()]
          : [];

    return {
      host: dbSettings.host,
      port: dbSettings.port,
      secure: dbSettings.secure,
      user: dbSettings.user.trim(),
      pass: dbSettings.pass,
      fromEmail: dbSettings.fromEmail,
      fromName: dbSettings.fromName,
      hrEmail: dbSettings.hrEmail || normalizedHrEmails[0] || "",
      hrEmails: normalizedHrEmails,
      acknowledgementCcEmails: [
        ...new Set(
          (dbSettings.acknowledgementCcEmails || [])
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        ),
      ],
      companyName: dbSettings.companyName,
    };
  }

  // Fall back to env config
  if (purpose === "OTP") {
    const smtpOtp = (config as any).smtpOtp || {};
    return {
      host: smtpOtp.host || config.smtp.host,
      port: smtpOtp.port || config.smtp.port,
      secure:
        typeof smtpOtp.secure === "boolean"
          ? smtpOtp.secure
          : config.smtp.secure,
      user: (smtpOtp.user || config.smtp.user).trim(),
      pass: smtpOtp.pass || config.smtp.pass,
      fromEmail: smtpOtp.fromEmail || config.smtp.fromEmail,
      fromName: smtpOtp.fromName || config.smtp.fromName,
      hrEmail: "",
      hrEmails: [],
      acknowledgementCcEmails: [],
      companyName: smtpOtp.companyName || config.smtp.companyName,
    };
  }

  const envHrEmails = parseEmailList((config.smtp as any).hrEmails || "");
  const fallbackHrEmails =
    envHrEmails.length > 0
      ? envHrEmails
      : config.smtp.hrEmail
        ? [config.smtp.hrEmail.trim().toLowerCase()]
        : [];

  return {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    user: config.smtp.user.trim(),
    pass: config.smtp.pass,
    fromEmail: config.smtp.fromEmail,
    fromName: config.smtp.fromName,
    hrEmail: config.smtp.hrEmail,
    hrEmails: fallbackHrEmails,
    acknowledgementCcEmails: parseEmailList(
      (config.smtp as any).acknowledgementCcEmails || "",
    ),
    companyName: config.smtp.companyName,
  };
};

// Create reusable transporter using SMTP config (from DB or env)
const createTransporter = async (
  smtp: Awaited<ReturnType<typeof getSmtpConfig>>,
) => {
  // Use nodemailer's built-in Gmail service if host is Gmail
  const isGmail =
    smtp.host.includes("gmail") ||
    smtp.user.endsWith("@gmail.com") ||
    smtp.user.endsWith("@healwin.in");

  if (isGmail) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });
  }

  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

/**
 * Replace placeholders in template string
 * Placeholders are in format {{key}}
 */
const replacePlaceholders = (
  template: string,
  data: Record<string, string>,
): string => {
  let result = template;
  for (const [key, value] of Object.entries(data)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
    result = result.replace(regex, value || "");
  }
  return result;
};

const escapeHtml = (value: string) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Get the active email template by type
 */
export const getActiveTemplate = async (type: EmailTemplateType) => {
  return EmailTemplate.findOne({ type, isActive: true }).sort({
    updatedAt: -1,
  });
};

/**
 * Send email using nodemailer
 */
export const sendEmail = async (options: {
  to: string;
  subject: string;
  html: string;
  purpose?: SmtpPurpose;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
}) => {
  try {
    const smtp = await getSmtpConfig(options.purpose || "NOTIFICATIONS");
    const transporter = await createTransporter(smtp);

    const mailOptions = {
      from: `"${smtp.fromName}" <${smtp.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      ...(options.cc && { cc: options.cc }),
      ...(options.bcc && { bcc: options.bcc }),
      ...(options.replyTo && { replyTo: options.replyTo }),
      ...(options.attachments && { attachments: options.attachments }),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent: ${info.messageId} → ${options.to}`);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(`❌ Email send failed to ${options.to}:`, error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get the main logo URL from LogoSettings
 */
const getLogoUrl = async (): Promise<string> => {
  try {
    const logo = await LogoSettings.findOne().sort({ updatedAt: -1 });
    return logo?.mainLogo || "";
  } catch {
    return "";
  }
};

/**
 * Build the email logo header — uses uploaded logo image if available, else company name text
 */
const buildLogoHeader = (logoUrl: string, companyName: string): string => {
  if (logoUrl) {
    return `<div style="text-align: center; margin-bottom: 20px;"><img src="${logoUrl}" alt="${companyName}" style="max-height: 50px; max-width: 200px;" /></div>`;
  }
  return `<div style="text-align: center; margin-bottom: 20px;"><h2 style="color: #0891b2; margin: 0;">${companyName}</h2></div>`;
};

/**
 * Send a single application email to the candidate (with HR in BCC)
 */
export const sendApplicationAcknowledgement = async (applicationData: {
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  position: string;
  department: string;
  applicationId: string;
  applicationNumber: string;
  appliedDate: string;
  pdfBuffer?: Buffer;
  documents?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
}) => {
  const template = await getActiveTemplate("APPLICATION_ACKNOWLEDGEMENT");
  const smtp = await getSmtpConfig();
  const logoUrl = await getLogoUrl();

  let subject: string;
  let html: string;

  if (template) {
    const placeholderData: Record<string, string> = {
      candidateName: applicationData.candidateName,
      candidateEmail: applicationData.candidateEmail,
      position: applicationData.position,
      department: applicationData.department,
      applicationId: applicationData.applicationId,
      applicationNumber: applicationData.applicationNumber,
      appliedDate: applicationData.appliedDate,
      companyName: smtp.companyName,
      companyEmail: smtp.fromEmail,
      logoUrl,
    };

    subject = replacePlaceholders(template.subject, placeholderData);
    html = replacePlaceholders(template.body, placeholderData);
  } else {
    const logoHeader = buildLogoHeader(logoUrl, smtp.companyName);
    // Default acknowledgement email (fallback)
    subject = `Acknowledgment of Your Job Application (#${applicationData.applicationNumber})`;
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${logoHeader}
        <p>Dear <strong>${applicationData.candidateName}</strong>,</p>
        <p>Thank you for applying for the position of <strong>${applicationData.position}</strong>${applicationData.department ? ` in the <strong>${applicationData.department}</strong> department` : ""}.</p>
        <p>Your application has been received successfully. Here are your details:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 10px; border: 1px solid #e5e7eb; background: #f8fafc; font-weight: bold;">Application Number</td><td style="padding: 10px; border: 1px solid #e5e7eb;">${applicationData.applicationNumber}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #e5e7eb; background: #f8fafc; font-weight: bold;">Position</td><td style="padding: 10px; border: 1px solid #e5e7eb;">${applicationData.position}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #e5e7eb; background: #f8fafc; font-weight: bold;">Department</td><td style="padding: 10px; border: 1px solid #e5e7eb;">${applicationData.department || "N/A"}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #e5e7eb; background: #f8fafc; font-weight: bold;">Applied On</td><td style="padding: 10px; border: 1px solid #e5e7eb;">${applicationData.appliedDate}</td></tr>
        </table>
        <p>We will review your application and get back to you shortly. Please find your application acknowledgement attached.</p>
        <p style="margin-top: 30px;">Best regards,<br/><strong>${smtp.companyName}</strong><br/>${smtp.fromEmail}</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">&copy; ${new Date().getFullYear()} ${smtp.companyName}. All rights reserved.</p>
      </div>
    `;
  }

  const attachments: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }> = [];

  if (applicationData.pdfBuffer) {
    attachments.push({
      filename: `application_${applicationData.applicationNumber}.pdf`,
      content: applicationData.pdfBuffer,
      contentType: "application/pdf",
    });
  }

  // Attach all uploaded documents from the applicant
  if (applicationData.documents?.length) {
    for (const doc of applicationData.documents) {
      attachments.push({
        filename: doc.filename,
        content: doc.content,
        ...(doc.contentType && { contentType: doc.contentType }),
      });
    }
  }

  // Build BCC list: HR emails + any configured CC emails
  const bccList: string[] = [];

  // Add HR emails to BCC
  const hrRecipients =
    smtp.hrEmails.length > 0
      ? smtp.hrEmails
      : smtp.hrEmail
        ? [smtp.hrEmail]
        : [];
  bccList.push(...hrRecipients);

  // Add acknowledgement CC emails to BCC as well
  if (smtp.acknowledgementCcEmails.length > 0) {
    bccList.push(...smtp.acknowledgementCcEmails);
  }

  const uniqueBcc = [...new Set(bccList.filter(Boolean))];

  return sendEmail({
    to: applicationData.candidateEmail,
    bcc: uniqueBcc.length > 0 ? uniqueBcc.join(",") : undefined,
    subject,
    html,
    attachments: attachments.length > 0 ? attachments : undefined,
  });
};

/**
 * Send resume-only submission to HR from "Submit Your Resume" CTA
 */
export const sendResumeSubmissionToHR = async (data: {
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  message?: string;
  resumeUrl?: string;
  resumeFileName?: string;
  resumeMimeType?: string;
  resumeBuffer?: Buffer;
}) => {
  const smtp = await getSmtpConfig("NOTIFICATIONS");

  const hrRecipients =
    smtp.hrEmails.length > 0
      ? smtp.hrEmails
      : smtp.hrEmail
        ? [smtp.hrEmail]
        : ["hr@healwin.in"];

  const messageHtml = data.message
    ? `<p style="margin: 0 0 12px 0; color: #374151;"><strong>Message:</strong><br/>${escapeHtml(data.message).replace(/\n/g, "<br/>")}</p>`
    : "";

  const resumeUrlHtml = data.resumeUrl
    ? `<p style="margin: 0 0 12px 0; color: #374151;"><strong>Resume URL:</strong> <a href="${data.resumeUrl}" target="_blank" rel="noopener noreferrer">${data.resumeUrl}</a></p>`
    : "";

  const subject = `New Resume Submission - ${data.candidateName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto;">
      <h2 style="color: #2563eb;">New Resume Submission Received</h2>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Name</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.candidateName)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Email</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.candidateEmail)}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Phone</td>
          <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(data.candidatePhone)}</td>
        </tr>
      </table>
      ${messageHtml}
      ${resumeUrlHtml}
      <p style="margin-top: 16px; color: #6b7280;">
        Resume has been attached with this email.
      </p>
    </div>
  `;

  const attachments =
    data.resumeBuffer && data.resumeFileName
      ? [
          {
            filename: data.resumeFileName,
            content: data.resumeBuffer,
            contentType: data.resumeMimeType || "application/octet-stream",
          },
        ]
      : undefined;

  return sendEmail({
    to: hrRecipients.join(","),
    subject,
    html,
    replyTo: data.candidateEmail,
    attachments,
  });
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  IN_REVIEW: "In Review",
  SHORTLISTED: "Shortlisted",
  ONHOLD: "On Hold",
  REJECTED: "Rejected",
  HIRED: "Hired",
};

const STATUS_TEMPLATE_BY_NEW_STATUS: Record<string, EmailTemplateType> = {
  SHORTLISTED: "APPLICATION_STATUS_SHORTLISTED",
  HIRED: "APPLICATION_STATUS_HIRED",
  REJECTED: "APPLICATION_STATUS_REJECTED",
};

const getStatusLabel = (status: string) =>
  STATUS_LABELS[status] ||
  status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/**
 * Send application status update email to candidate
 */
export const sendApplicationStatusUpdate = async (data: {
  candidateName: string;
  candidateEmail: string;
  position: string;
  department: string;
  applicationId: string;
  applicationNumber?: string;
  oldStatus: string;
  newStatus: string;
}) => {
  const targetedType = STATUS_TEMPLATE_BY_NEW_STATUS[data.newStatus];

  const smtp = await getSmtpConfig();
  const logoUrl = await getLogoUrl();
  const logoHeader = buildLogoHeader(logoUrl, smtp.companyName);

  const fallbackTemplate = {
    subject: "Application Status Update - {{position}} | {{companyName}}",
    body: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        ${logoHeader}
        <p>Dear <strong>{{candidateName}}</strong>,</p>
        <p>Your application status has been updated by our recruitment team.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <tr><td style="padding: 10px; border: 1px solid #e5e7eb; background: #f8fafc; font-weight: bold;">Position</td><td style="padding: 10px; border: 1px solid #e5e7eb;">{{position}}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #e5e7eb; background: #f8fafc; font-weight: bold;">Department</td><td style="padding: 10px; border: 1px solid #e5e7eb;">{{department}}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #e5e7eb; background: #f8fafc; font-weight: bold;">Previous Status</td><td style="padding: 10px; border: 1px solid #e5e7eb;">{{oldStatus}}</td></tr>
          <tr><td style="padding: 10px; border: 1px solid #e5e7eb; background: #f8fafc; font-weight: bold;">Current Status</td><td style="padding: 10px; border: 1px solid #e5e7eb;">{{newStatus}}</td></tr>
        </table>
        <p>If you have any questions, please contact us at <a href="mailto:{{companyEmail}}">{{companyEmail}}</a>.</p>
        <p style="margin-top: 30px;">Best regards,<br/><strong>{{companyName}}</strong></p>
      </div>
    `,
  };
  const template =
    (targetedType
      ? (await getActiveTemplate(targetedType)) ||
        (await getActiveTemplate("APPLICATION_STATUS_UPDATE"))
      : await getActiveTemplate("APPLICATION_STATUS_UPDATE")) ||
    fallbackTemplate;

  // Template is guaranteed by fallbackTemplate above.

  const placeholderData: Record<string, string> = {
    candidateName: data.candidateName,
    candidateEmail: data.candidateEmail,
    position: data.position,
    department: data.department,
    applicationId: data.applicationId,
    applicationNumber: data.applicationNumber || "",
    oldStatus: getStatusLabel(data.oldStatus),
    newStatus: getStatusLabel(data.newStatus),
    oldStatusCode: data.oldStatus,
    newStatusCode: data.newStatus,
    companyName: smtp.companyName,
    companyEmail: smtp.fromEmail,
    logoUrl,
  };

  const subject = replacePlaceholders(template.subject, placeholderData);
  const html = replacePlaceholders(template.body, placeholderData);

  return sendEmail({
    to: data.candidateEmail,
    subject,
    html,
  });
};

/**
 * Send OTP verification email
 */
export const sendOtpEmail = async (email: string, otp: string) => {
  const smtp = await getSmtpConfig("OTP");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h2 style="color: #0891b2; margin: 0;">HealWin Life Support & Emergency Care</h2>
      </div>
      <div style="background: #f8fafc; border-radius: 8px; padding: 30px; text-align: center;">
        <h3 style="color: #1e293b; margin-top: 0;">Email Verification</h3>
        <p style="color: #475569;">Please use the following OTP to verify your email address:</p>
        <div style="background: #ffffff; border: 2px dashed #0891b2; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0891b2;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 14px;">This OTP is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
      </div>
      <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
        <p>If you did not request this, please ignore this email.</p>
        <p>&copy; ${new Date().getFullYear()} ${smtp.companyName}. All rights reserved.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `${otp} - Email Verification OTP | ${smtp.companyName}`,
    html,
    purpose: "OTP",
  });
};
