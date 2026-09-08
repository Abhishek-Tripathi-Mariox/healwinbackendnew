/**
 * Email template seed — creates one active template per email the careers
 * pipeline sends, so every mail has a real, editable record in the admin panel
 * rather than falling back to the copy hardcoded in email.service.ts.
 *
 * Idempotent: a template that already exists is left ALONE. HR edits the
 * wording in the panel, and re-running the seed must never overwrite that.
 * Pass --force to reset every template back to these defaults.
 *
 * Usage: npm run seed:email-templates  [-- --force]
 */
import mongoose from "mongoose";
import config from "../config";
import {
  EmailTemplate,
  EmailTemplateType,
} from "../models/email-template.model";

const wrap = (
  heading: string,
  gradient: string,
  inner: string,
  signoff = "{{companyName}} HR Team",
) => `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, ${gradient}); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${heading}</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p style="font-size: 16px; color: #374151;">Dear <strong>{{candidateName}}</strong>,</p>
${inner}
    <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">
      For any questions, contact us at <a href="mailto:{{companyEmail}}" style="color: #2563eb;">{{companyEmail}}</a>.
    </p>
    <p style="font-size: 14px; color: #374151; margin-top: 24px;">
      Best regards,<br/><strong>${signoff}</strong>
    </p>
  </div>
</div>`;

const box = (rows: string) =>
  `    <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
${rows}
    </div>`;

const line = (label: string, tag: string) =>
  `      <p style="margin: 4px 0; font-size: 13px; color: #374151;"><strong>${label}:</strong> ${tag}</p>`;

const para = (text: string) =>
  `    <p style="font-size: 14px; color: #6b7280; line-height: 1.6;">${text}</p>`;

const COMMON = [
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

interface Seed {
  type: EmailTemplateType;
  name: string;
  subject: string;
  body: string;
  placeholders: string[];
}

const TEMPLATES: Seed[] = [
  {
    type: "APPLICATION_ACKNOWLEDGEMENT",
    name: "Application Acknowledgement",
    subject: "Application Received - {{position}} | {{companyName}}",
    placeholders: COMMON,
    body: wrap(
      "Application Received",
      "#0891b2, #0e7490",
      para(
        "Thank you for applying for <strong>{{position}}</strong> in <strong>{{department}}</strong>. We have received your application and our team is reviewing it.",
      ) +
        "\n" +
        box(
          line("Application No.", "{{applicationNumber}}") +
            "\n" +
            line("Position", "{{position}}") +
            "\n" +
            line("Applied On", "{{appliedDate}}"),
        ) +
        "\n" +
        para(
          "A copy of your submitted application is attached for your records. We will be in touch about the next steps.",
        ),
    ),
  },
  {
    type: "APPLICATION_STATUS_UPDATE",
    name: "Application Status Update",
    subject: "Application Status Update - {{position}} | {{companyName}}",
    placeholders: [...COMMON, "oldStatus", "newStatus"],
    body: wrap(
      "Application Update",
      "#7c3aed, #6d28d9",
      para("Your application status has been updated by our recruitment team.") +
        "\n" +
        box(
          line("Position", "{{position}}") +
            "\n" +
            line("Previous Status", "{{oldStatus}}") +
            "\n" +
            line("Current Status", "{{newStatus}}"),
        ),
    ),
  },
  {
    type: "APPLICATION_STATUS_SHORTLISTED",
    name: "Application Shortlisted",
    subject: "You are shortlisted - {{position}} | {{companyName}}",
    placeholders: [...COMMON, "oldStatus", "newStatus"],
    body: wrap(
      "You are Shortlisted",
      "#059669, #047857",
      para(
        "Great news — your application for <strong>{{position}}</strong> in <strong>{{department}}</strong> has been shortlisted.",
      ) +
        "\n" +
        para("Our HR team will contact you shortly with the next steps.") +
        "\n" +
        box(line("Application No.", "{{applicationNumber}}")),
    ),
  },
  {
    type: "APPLICATION_INTERVIEW_SCHEDULED",
    name: "Interview Scheduled",
    subject: "Interview Invitation - {{position}} | {{companyName}}",
    placeholders: [
      ...COMMON,
      "when",
      "durationMinutes",
      "roundName",
      "meetingLink",
      "venueName",
      "venueAddress",
      "contactPerson",
      "contactPhone",
      "instructions",
    ],
    body: wrap(
      "Interview Invitation",
      "#0891b2, #0e7490",
      para(
        "Thank you for applying for <strong>{{position}}</strong>. We are pleased to invite you for an interview.",
      ) +
        "\n" +
        box(
          line("Date &amp; Time", "{{when}} IST") +
            "\n" +
            line("Duration", "{{durationMinutes}} minutes") +
            "\n" +
            line("Round", "{{roundName}}"),
        ) +
        "\n    <!-- Online interviews fill {{meetingLink}}; walk-ins fill the venue\n" +
        "         and contact fields. Whichever does not apply renders empty, so\n" +
        "         this one template serves both modes. -->\n" +
        box(
          line("Joining link", "{{meetingLink}}") +
            "\n" +
            line("Venue", "{{venueName}}") +
            "\n" +
            line("Address", "{{venueAddress}}") +
            "\n" +
            line("Ask for", "{{contactPerson}}") +
            "\n" +
            line("Contact", "{{contactPhone}}"),
        ) +
        "\n" +
        para("{{instructions}}") +
        "\n" +
        para(
          "If this time does not suit you, reply to this email and we will try to reschedule.",
        ),
      "{{companyName}} Recruitment Team",
    ),
  },
  {
    type: "APPLICATION_OFFER_LETTER",
    name: "Offer Letter",
    subject: "Offer of Employment - {{designation}} | {{companyName}}",
    placeholders: [
      ...COMMON,
      "designation",
      "ctc",
      "joiningDate",
      "location",
      "reportingTo",
      "notes",
    ],
    body: wrap(
      "Congratulations!",
      "#059669, #047857",
      para(
        "Following your interview, we are delighted to offer you a position at <strong>{{companyName}}</strong>.",
      ) +
        "\n" +
        box(
          line("Designation", "{{designation}}") +
            "\n" +
            line("Department", "{{department}}") +
            "\n" +
            line("Annual CTC", "{{ctc}}") +
            "\n" +
            line("Date of Joining", "{{joiningDate}}") +
            "\n" +
            line("Place of Posting", "{{location}}") +
            "\n" +
            line("Reporting To", "{{reportingTo}}"),
        ) +
        "\n" +
        para(
          "Your formal offer letter is attached to this email as a PDF. Please review it and confirm your acceptance by replying to this email.",
        ) +
        "\n" +
        para("{{notes}}"),
      "{{companyName}} Human Resources",
    ),
  },
  {
    type: "APPLICATION_STATUS_HIRED",
    name: "Application Hired",
    subject: "Congratulations - Selected for {{position}} | {{companyName}}",
    placeholders: [...COMMON, "oldStatus", "newStatus"],
    body: wrap(
      "Congratulations!",
      "#2563eb, #1d4ed8",
      para(
        "We are delighted to let you know that you have been selected for <strong>{{position}}</strong> in <strong>{{department}}</strong>.",
      ) +
        "\n" +
        para(
          "Our HR team will be in touch with your offer and joining formalities.",
        ) +
        "\n" +
        box(line("Application No.", "{{applicationNumber}}")),
    ),
  },
  {
    type: "APPLICATION_STATUS_REJECTED",
    name: "Application Rejected",
    subject: "Update on your application - {{position}} | {{companyName}}",
    placeholders: [...COMMON, "oldStatus", "newStatus"],
    body: wrap(
      "Application Update",
      "#6b7280, #4b5563",
      para(
        "Thank you for your interest in <strong>{{position}}</strong> and for the time you invested in your application.",
      ) +
        "\n" +
        para(
          "After careful consideration we will not be moving forward with your application on this occasion. We genuinely appreciate your interest and encourage you to apply for future openings that match your experience.",
        ) +
        "\n" +
        para("We wish you every success in your search."),
    ),
  },
  {
    type: "APPLICATION_HR_NOTIFICATION",
    name: "HR New Application Notification",
    subject: "New Application - {{position}} | {{candidateName}}",
    placeholders: [...COMMON, "candidatePhone"],
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #16a34a, #15803d); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 24px;">New Application Received</h1>
  </div>
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
${box(
  line("Candidate", "{{candidateName}}") +
    "\n" +
    line("Email", "{{candidateEmail}}") +
    "\n" +
    line("Phone", "{{candidatePhone}}") +
    "\n" +
    line("Position", "{{position}}") +
    "\n" +
    line("Department", "{{department}}") +
    "\n" +
    line("Application No.", "{{applicationNumber}}") +
    "\n" +
    line("Applied On", "{{appliedDate}}"),
)}
    <p style="font-size: 14px; color: #6b7280;">The candidate's documents are attached.</p>
  </div>
</div>`,
  },
];

const seedEmailTemplates = async () => {
  const force = process.argv.includes("--force");
  try {
    await mongoose.connect(config.database.url);
    console.log("✅ Connected to MongoDB");

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const t of TEMPLATES) {
      const existing = await EmailTemplate.findOne({ type: t.type });
      if (existing && !force) {
        skipped += 1;
        console.log(`  ⏭️  ${t.type} already exists (kept HR's wording)`);
        continue;
      }
      if (existing) {
        existing.name = t.name;
        existing.subject = t.subject;
        existing.body = t.body;
        existing.placeholders = t.placeholders;
        existing.isActive = true;
        await existing.save();
        updated += 1;
        console.log(`  ♻️  ${t.type} reset to default`);
      } else {
        await EmailTemplate.create({ ...t, isActive: true });
        created += 1;
        console.log(`  ✅ ${t.type} created`);
      }
    }

    console.log(
      `\n🌱 Email templates: ${created} created, ${updated} reset, ${skipped} left alone.`,
    );
    if (skipped && !force) {
      console.log("   Re-run with --force to reset existing templates.");
    }
  } catch (err) {
    console.error("❌ Email template seed failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
};

seedEmailTemplates();
