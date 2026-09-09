import PDFDocument from "pdfkit";
import config from "../config";
import { ICareerApplication } from "../models/career-application.model";
import { IPayslip } from "../models/payslip.model";
import { IHrEmployee } from "../models/hr-employee.model";
import https from "https";
import http from "http";

/**
 * All generated documents are formatted in IST explicitly.
 *
 * `toLocaleString()` without a timeZone uses the SERVER's zone. TZ is unset in
 * deployment, so a UTC host printed every prescription, discharge summary and
 * invoice 5h30m behind the real time — correct only on a machine that happened
 * to be set to IST. Pin it rather than depend on host config.
 */
const IST = "Asia/Kolkata";
export const fmtDateTimeIST = (d: Date | string | number): string =>
  new Date(d).toLocaleString("en-IN", { timeZone: IST });
export const fmtDateIST = (d: Date | string | number): string =>
  new Date(d).toLocaleDateString("en-IN", { timeZone: IST });
/**
 * "9 September 2026" — for letters, where a numeric date is ambiguous to read
 * and looks abrupt in prose.
 */
export const fmtLongDateIST = (d: Date | string | number): string =>
  new Date(d).toLocaleDateString("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
export const fmtTimeIST = (d: Date | string | number): string =>
  new Date(d).toLocaleTimeString("en-IN", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
  });

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const inr = (n: number): string =>
  "Rs. " +
  (n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Download image from URL and return as Buffer
 */
const downloadImage = (url: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Follow redirect
          if (response.headers.location) {
            return downloadImage(response.headers.location)
              .then(resolve)
              .catch(reject);
          }
        }
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      })
      .on("error", reject);
  });
};

/**
 * Generate application acknowledgement PDF matching PHP format
 */
/* ══════════════════════════════════════════════════════════════════════════
 *  Shared document design
 *
 *  Every generated document — letters, invoices, prescriptions, discharge
 *  summaries, payslips — is built from the pieces below so they read as one
 *  organisation's paperwork rather than eight unrelated printouts.
 *
 *  The look: a deep navy masthead carrying the brand and its contact line, a
 *  centred document title over a short accent rule, then generously spaced
 *  body type. Borders are kept light — tables are separated by tint and hair
 *  rules rather than boxed in.
 * ═══════════════════════════════════════════════════════════════════════ */

export const DOC = {
  ink: "#0F172A", // near-black body text
  muted: "#64748B", // secondary text
  hairline: "#E2E8F0",
  band: "#12305B", // masthead navy
  bandSoft: "#1D4C8F", // the lighter diagonal on the masthead
  accent: "#0891B2", // rules and highlights
  tint: "#F1F5F9", // table label / zebra fill
  margin: 50,
} as const;

/** Usable width between the margins. */
const contentWidth = (doc: PDFKit.PDFDocument) =>
  doc.page.width - DOC.margin * 2;

/**
 * The masthead.
 *
 * Drawn as full-bleed shapes at the very top of the page, so it reads as
 * printed stationery rather than as the first line of the letter.
 */
export const letterhead = (
  doc: PDFKit.PDFDocument,
  opts: {
    logo?: Buffer;
    /**
     * Override the organisation shown. Clinical documents are issued by the
     * hospital that treated the patient, which in a multi-hospital deployment
     * is not the same as the platform brand — a prescription must carry the
     * hospital's own name and contact, not ours.
     */
    name?: string;
    tagline?: string;
    contact?: string;
  } = {},
): void => {
  const b = {
    ...config.brand,
    ...(opts.name ? { name: opts.name } : {}),
    ...(opts.tagline !== undefined ? { tagline: opts.tagline } : {}),
  };
  const W = doc.page.width;
  const H = 104;

  doc.save();
  doc.rect(0, 0, W, H).fill(DOC.band);
  // Two overlapping diagonals on the right — the same idea as the reference
  // letterhead, done in vector so it stays crisp at any print size.
  doc
    .moveTo(W * 0.58, 0)
    .lineTo(W, 0)
    .lineTo(W, H)
    .lineTo(W * 0.74, H)
    .fill(DOC.bandSoft);
  doc
    .moveTo(W * 0.78, 0)
    .lineTo(W * 0.93, 0)
    .lineTo(W * 0.72, H)
    .lineTo(W * 0.57, H)
    .fillOpacity(0.35)
    .fill("#FFFFFF");
  doc.fillOpacity(1);

  let x = DOC.margin;
  if (opts.logo) {
    try {
      doc.image(opts.logo, x, 26, { fit: [46, 46] });
      x += 58;
    } catch {
      // A broken logo must never cost us the whole document.
    }
  }

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(b.name.toUpperCase(), x, 28, { lineBreak: false });

  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor("#C7D9F1")
    .text(b.tagline, x, 55, { lineBreak: false });

  // Contact line — only the parts that are actually configured.
  const contact =
    opts.contact ?? [b.email, b.phone, b.website].filter(Boolean).join("   |   ");
  if (contact) {
    doc
      .fontSize(8.5)
      .fillColor("#9FBCE4")
      .text(contact, x, 72, { lineBreak: false });
  }
  doc.restore();

  // A thin accent bar under the band ties the header to the rules below it.
  doc.rect(0, H, W, 3).fill(DOC.accent);

  doc.fillColor(DOC.ink).font("Helvetica").fontSize(10);
  doc.x = DOC.margin;
  doc.y = H + 28;
};

/** Centred document title with a short accent rule beneath it. */
export const docTitle = (doc: PDFKit.PDFDocument, title: string): void => {
  const w = contentWidth(doc);
  doc
    .font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(DOC.ink)
    .text(title.toUpperCase(), DOC.margin, doc.y, {
      width: w,
      align: "center",
      characterSpacing: 0.6,
    });
  const y = doc.y + 6;
  const mid = doc.page.width / 2;
  doc.rect(mid - 26, y, 52, 2.5).fill(DOC.accent);
  doc.fillColor(DOC.ink).font("Helvetica").fontSize(10);
  doc.x = DOC.margin;
  doc.y = y + 18;
};

/**
 * Reference block — date and document number, set right, as on a real letter.
 */
export const refBlock = (
  doc: PDFKit.PDFDocument,
  rows: Array<[string, string]>,
): void => {
  const w = contentWidth(doc);
  doc.font("Helvetica").fontSize(9.5).fillColor(DOC.muted);
  for (const [label, value] of rows) {
    doc.text(`${label}: ${value}`, DOC.margin, doc.y, { width: w, align: "right" });
  }
  doc.fillColor(DOC.ink).fontSize(10);
  doc.x = DOC.margin;
  doc.moveDown(0.8);
};

/**
 * Key/value table.
 *
 * Tinted label column, hairline separators, no outer box — the same table
 * used by every document that has terms or particulars to state.
 */
export const infoTable = (
  doc: PDFKit.PDFDocument,
  rows: Array<[string, string]>,
  opts: { labelWidth?: number; heading?: string } = {},
): void => {
  const w = contentWidth(doc);
  const labelW = opts.labelWidth ?? 155;
  const valueW = w - labelW;

  if (opts.heading) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(DOC.muted)
      .text(opts.heading.toUpperCase(), DOC.margin, doc.y, {
        characterSpacing: 0.8,
      });
    doc.moveDown(0.45);
  }

  for (const [label, value] of rows) {
    const text = value || "—";
    const h = Math.max(
      22,
      doc.font("Helvetica").fontSize(10).heightOfString(text, {
        width: valueW - 20,
      }) + 11,
    );
    // Start a new page before a row would be split across the fold.
    if (doc.y + h > doc.page.height - 90) {
      doc.addPage();
      doc.y = DOC.margin;
    }
    const top = doc.y;
    doc.rect(DOC.margin, top, labelW, h).fill(DOC.tint);
    doc
      .moveTo(DOC.margin, top + h)
      .lineTo(DOC.margin + w, top + h)
      .lineWidth(0.5)
      .strokeColor(DOC.hairline)
      .stroke();
    doc
      .fillColor(DOC.muted)
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .text(label, DOC.margin + 10, top + 7, { width: labelW - 20 });
    doc
      .fillColor(DOC.ink)
      .font("Helvetica")
      .fontSize(10)
      .text(text, DOC.margin + labelW + 10, top + 7, { width: valueW - 20 });
    doc.y = top + h;
  }
  // The rows were written at explicit x offsets; put the cursor back or the
  // next flowing paragraph renders indented.
  doc.x = DOC.margin;
  doc.fillColor(DOC.ink);
};

/** Body paragraph — justified, with the spacing the letters are built on. */
export const para = (
  doc: PDFKit.PDFDocument,
  text: string,
  opts: { gap?: number; bold?: boolean } = {},
): void => {
  doc
    .font(opts.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(10.5)
    .fillColor(DOC.ink)
    .text(text, DOC.margin, doc.y, {
      width: contentWidth(doc),
      align: "justify",
      lineGap: 2.5,
    });
  doc.x = DOC.margin;
  doc.moveDown(opts.gap ?? 0.9);
};

/** Signature block, kept off the fold. */
export const signOff = (
  doc: PDFKit.PDFDocument,
  opts: { name?: string; role?: string } = {},
): void => {
  if (doc.y > doc.page.height - 170) doc.addPage();
  doc.moveDown(1.2);
  doc
    .font("Helvetica")
    .fontSize(10.5)
    .fillColor(DOC.ink)
    .text(`For ${config.brand.name}`, DOC.margin, doc.y);
  doc.moveDown(2.6);
  doc
    .moveTo(DOC.margin, doc.y)
    .lineTo(DOC.margin + 170, doc.y)
    .lineWidth(0.7)
    .strokeColor(DOC.hairline)
    .stroke();
  doc.moveDown(0.4);
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .text(opts.name || "Authorised Signatory", DOC.margin, doc.y);
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(DOC.muted)
    .text(opts.role || "Human Resources", DOC.margin, doc.y);
  doc.fillColor(DOC.ink);
};

/**
 * Footer on every page — a hair rule, the address, and "Page n of m".
 *
 * Called once, just before `doc.end()`: pdfkit can only number pages after
 * they all exist, so this walks the buffered range at the end.
 */
export const paginate = (
  doc: PDFKit.PDFDocument,
  note?: string,
  /**
   * Skip the address in the footer. Clinical documents print the treating
   * hospital's own address above the fold; repeating the platform address
   * underneath it just contradicts them.
   */
  opts: { address?: boolean } = {},
): void => {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // The footer sits BELOW the bottom margin by design. pdfkit treats text
    // crossing that margin as an overflow and starts a new page — which is
    // how a one-page letter came out three pages long, each new page
    // triggering another footer. Drop the margin while writing it.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 42;
    doc
      .moveTo(DOC.margin, y)
      .lineTo(doc.page.width - DOC.margin, y)
      .lineWidth(0.5)
      .strokeColor(DOC.hairline)
      .stroke();
    const left = [
      opts.address === false ? null : config.brand.address,
      note,
    ]
      .filter(Boolean)
      .join("  ·  ");
    doc.font("Helvetica").fontSize(7.5).fillColor(DOC.muted);
    if (left) {
      doc.text(left, DOC.margin, y + 8, {
        width: contentWidth(doc) - 90,
        lineBreak: false,
      });
    }
    doc.text(
      `Page ${i - range.start + 1} of ${range.count}`,
      DOC.margin,
      y + 8,
      { width: contentWidth(doc), align: "right", lineBreak: false },
    );
    doc.page.margins.bottom = bottomMargin;
  }
};

/** Fetch the configured logo once, tolerating any failure. */
const brandLogo = async (): Promise<Buffer | undefined> => {
  const url = config.brand.logoUrl;
  if (!url) return undefined;
  try {
    return await downloadImage(url);
  } catch {
    return undefined;
  }
};

export const generateApplicationPDF = async (
  application: ICareerApplication & { applicationNumber: string },
): Promise<Buffer> => {
  const logo = await brandLogo();
  return new Promise(async (resolve, reject) => {
    try {
      const margin = DOC.margin;
      const doc = new PDFDocument({
        size: "A4",
        margin,
        bufferPages: true,
        info: {
          Title: `Application ${application.applicationNumber}`,
          Author: config.brand.name,
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - margin * 2;

      // ============ HELPER: measure text height ============
      const measureHeight = (
        text: string,
        fontSize: number,
        width: number,
      ): number => {
        return doc
          .fontSize(fontSize)
          .font("Helvetica")
          .heightOfString(text, { width });
      };

      // ============ HELPER: draw table row with auto height ============
      const col1W = 35;
      const col2W = 175;
      const col3W = pageWidth - col1W - col2W;
      const cellPadX = 4;
      const cellPadY = 3;
      const tableFontSize = 8.5;
      const minRowH = 16;

      const drawTableRow = (
        c1: string,
        c2: string,
        c3: string,
        y: number,
        isBold = false,
        isHeader = false,
      ) => {
        const x = margin;
        // Calculate row height based on longest cell text
        const h2 = measureHeight(c2, tableFontSize, col2W - cellPadX * 2);
        const h3 = measureHeight(c3, tableFontSize, col3W - cellPadX * 2);
        const rowH = Math.max(minRowH, h2 + cellPadY * 2, h3 + cellPadY * 2);

        if (isHeader) {
          doc.rect(x, y, pageWidth, rowH).fill("#f0f0f0").stroke("#cccccc");
        } else {
          doc.rect(x, y, pageWidth, rowH).stroke("#cccccc");
        }

        doc
          .fontSize(tableFontSize)
          .font(isBold || isHeader ? "Helvetica-Bold" : "Helvetica")
          .fillColor("#000000");

        doc.text(c1, x + cellPadX, y + cellPadY, {
          width: col1W - cellPadX * 2,
        });
        doc.text(c2, x + col1W + cellPadX, y + cellPadY, {
          width: col2W - cellPadX * 2,
        });
        doc.text(c3, x + col1W + col2W + cellPadX, y + cellPadY, {
          width: col3W - cellPadX * 2,
        });

        return y + rowH;
      };

      // ============ HELPER: section header ============
      const drawSectionHeader = (label: string, y: number) => {
        const h = 17;
        doc.rect(margin, y, pageWidth, h).fill("#e8e8e8").stroke("#cccccc");
        doc
          .fontSize(8.5)
          .font("Helvetica-Bold")
          .fillColor("#000000")
          .text(label, margin + 5, y + 4);
        return y + h;
      };

      // ============ HEADER ============
      letterhead(doc, { logo });
      refBlock(doc, [
        ["Application No", (application as any).applicationNumber || "—"],
        ["Received", fmtDateIST((application as any).createdAt || new Date())],
      ]);
      docTitle(doc, "Application Acknowledgement");

      // ============ GREETING WITH PHOTO ============
      const photoX = doc.page.width - margin - 75;
      let photoPlaced = false;

      if (application.passportPhotoUrl) {
        try {
          const imgBuffer = await downloadImage(application.passportPhotoUrl);
          if (imgBuffer.length > 100) {
            doc.image(imgBuffer, photoX, doc.y, {
              width: 70,
              height: 88,
              fit: [70, 88],
            });
            photoPlaced = true;
          }
        } catch (err) {
          console.warn(
            "⚠️ Could not embed passport photo in PDF:",
            (err as Error).message,
          );
        }
      }

      const textWidth = photoPlaced ? pageWidth - 90 : pageWidth;

      doc
        .fontSize(9.5)
        .font("Helvetica")
        .text(`Dear `, { continued: true, width: textWidth })
        .font("Helvetica-Bold")
        .text(`${application.name},`, { continued: false })
        .font("Helvetica")
        .text(`Thank you for applying to be a part of `, {
          continued: true,
          width: textWidth,
        })
        .font("Helvetica-Bold")
        .text("HealWin Life Support & Emergency Care.", { continued: false })
        .font("Helvetica")
        .text("Your application has been submitted successfully.", {
          width: textWidth,
        })
        .text(`Your Application Number is `, {
          continued: true,
          width: textWidth,
        })
        .font("Helvetica-Bold")
        .text(`${application.applicationNumber}.`, { continued: false })
        .font("Helvetica")
        .text(
          "Please keep this number safely for future reference and bring it with you during the interview.",
          { width: textWidth },
        );

      doc.moveDown(0.5);
      doc
        .fontSize(9.5)
        .font("Helvetica")
        .text("Below are the details we received from your application:");
      doc.moveDown(0.3);

      // ============ SECTION A: PERSONAL DETAILS ============
      let y = doc.y;

      y = drawSectionHeader("A    Personal Details", y);

      const personalRows: [string, string, string][] = [
        ["01", "Name", application.name || ""],
        ["02", "Mobile Number", application.phone || ""],
        ["03", "Email Address", application.email || ""],
        [
          "04",
          "Date of Birth",
          application.dob
            ? fmtDateIST(application.dob)
            : "",
        ],
        ["05", "Gender", application.gender || ""],
        ["06", "Marital Status", application.maritalStatus || ""],
        ["07", "Address", application.address || ""],
      ];

      for (const [c1, c2, c3] of personalRows) {
        y = drawTableRow(c1, c2, c3, y, c2 === "Name");
      }

      // ============ SECTION B: POSITION APPLIED FOR ============
      y += 4;
      y = drawSectionHeader("B    Position Applied For", y);
      y = drawTableRow("01", "Position", application.position || "", y);
      y = drawTableRow("02", "Department", application.department || "", y);
      y = drawTableRow(
        "03",
        "Applied On",
        application.appliedAt
          ? fmtDateIST(application.appliedAt)
          : "",
        y,
      );

      // ============ SECTION C: UPLOADED DOCUMENTS ============
      y += 4;
      y = drawSectionHeader("C    Uploaded Documents", y);

      const docRows: [string, string, string][] = [
        ["01", "Resume / CV", application.resumeUrl ? "Yes" : "No"],
        [
          "02",
          "Passport Size Photo",
          application.passportPhotoUrl ? "Yes" : "No",
        ],
        ["03", "ID Proof", application.idProofUrl ? "Yes" : "No"],
        [
          "04",
          "Educational Certificates",
          application.educationalCertificatesUrl ? "Yes" : "No",
        ],
        [
          "05",
          "Professional Registration",
          application.professionalRegistrationUrl ? "Yes" : "No",
        ],
        [
          "06",
          "Experience Certificates",
          application.experienceCertificatesUrl ? "Yes" : "No",
        ],
        ["07", "Other Documents", application.otherDocumentsUrl ? "Yes" : "No"],
      ];

      for (const [c1, c2, c3] of docRows) {
        y = drawTableRow(c1, c2, c3, y);
      }

      // ============ FOOTER ============
      y += 18;

      doc
        .fontSize(9.5)
        .font("Helvetica")
        .fillColor("#0066cc")
        .text(
          "Our team will review your application and contact you soon.",
          margin,
          y,
        );
      y += 14;
      doc.text("Thank you for supporting life-saving services.", margin, y);
      y += 18;

      doc
        .fillColor("#000000")
        .font("Helvetica")
        .text("Warm regards,", margin, y);
      y += 13;
      doc
        .font("Helvetica-Bold")
        .fillColor(DOC.ink)
        .text(`HR Team, ${config.brand.name}`, margin, y);
      y += 13;
      // Contact details come from the brand config now — they used to be
      // hardcoded here, so a change of number meant a code change.
      doc
        .font("Helvetica")
        .fillColor(DOC.muted)
        .text(
          [config.brand.phone, config.brand.email, config.brand.website]
            .filter(Boolean)
            .join(", "),
          margin,
          y,
        );

      paginate(doc, `Application · ${application.applicationNumber}`);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Generate a salary-slip PDF for one payslip. Two-column earnings vs deductions
 * table with a net-pay summary, matching the on-screen payslip.
 */
export const generatePayslipPDF = async (
  payslip: IPayslip,
  employee?: Partial<IHrEmployee>,
): Promise<Buffer> => {
  const logo = await brandLogo();
  return new Promise((resolve, reject) => {
    try {
      const margin = DOC.margin;
      const doc = new PDFDocument({
        size: "A4",
        margin,
        bufferPages: true,
        info: {
          Title: `Payslip ${payslip.employeeCode} ${MONTH_NAMES[payslip.month - 1]} ${payslip.year}`,
          Author: config.brand.name,
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - margin * 2;

      // ===== Header =====
      letterhead(doc, { logo });
      refBlock(doc, [
        ["Employee Code", payslip.employeeCode || "—"],
        ["Generated", fmtDateIST(new Date())],
      ]);
      docTitle(
        doc,
        `Payslip — ${MONTH_NAMES[payslip.month - 1]} ${payslip.year}`,
      );

      // ===== Employee meta =====
      let y = doc.y;
      const lineH = 16;
      const col2X = margin + pageWidth / 2;
      const metaRow = (l1: string, v1: string, l2: string, v2: string) => {
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#444444");
        doc.text(l1, margin, y, { width: 90, continued: false });
        doc.font("Helvetica").fillColor("#000000");
        doc.text(v1, margin + 95, y, { width: pageWidth / 2 - 100 });
        doc.font("Helvetica-Bold").fillColor("#444444");
        doc.text(l2, col2X, y, { width: 90 });
        doc.font("Helvetica").fillColor("#000000");
        doc.text(v2, col2X + 95, y, { width: pageWidth / 2 - 100 });
        y += lineH;
      };

      metaRow(
        "Employee",
        payslip.employeeName,
        "Emp Code",
        payslip.employeeCode,
      );
      // For someone who joined or left mid-cycle, showing "3 / 30" reads as 27
      // days of loss of pay. Count against the days they were actually on the
      // rolls and say so.
      const partMonth =
        !!payslip.serviceDays && payslip.serviceDays < payslip.totalDays;
      metaRow(
        "Designation",
        payslip.designation || "-",
        "Paid Days",
        `${payslip.paidDays} / ${partMonth ? payslip.serviceDays : payslip.totalDays}` +
          (partMonth ? " (part month)" : ""),
      );
      metaRow(
        "PAN",
        employee?.pan || "-",
        "LOP Days",
        String(payslip.lopDays),
      );
      metaRow(
        "Bank A/C",
        employee?.accountNumber || "-",
        "UAN",
        employee?.uan || "-",
      );

      y += 8;

      // ===== Earnings vs Deductions table =====
      const colW = pageWidth / 2;
      const drawTableHeader = (yy: number) => {
        doc.rect(margin, yy, colW, 18).fill("#e8f0fe").stroke("#cccccc");
        doc.rect(margin + colW, yy, colW, 18).fill("#fdecea").stroke("#cccccc");
        doc.fillColor("#000000").font("Helvetica-Bold").fontSize(9.5);
        doc.text("Earnings", margin + 6, yy + 5, { width: colW - 80 });
        doc.text("Amount", margin + colW - 80, yy + 5, {
          width: 74,
          align: "right",
        });
        doc.text("Deductions", margin + colW + 6, yy + 5, { width: colW - 80 });
        doc.text("Amount", margin + colW * 2 - 80, yy + 5, {
          width: 74,
          align: "right",
        });
        return yy + 18;
      };

      const e = payslip.earnings;
      const d = payslip.deductions;
      const earnRows: [string, number][] = [
        ["Basic", e.basic],
        ["HRA", e.hra],
        ["Conveyance", e.conveyance],
        ["Medical", e.medical],
        ["Special Allowance", e.specialAllowance],
        ["Other Allowances", e.otherAllowances],
        // Overtime is part of `gross`, but had no row of its own — so on any
        // payslip with overtime the earnings column did not add up to the
        // gross printed beneath it, and there was no way for the employee to
        // see what the difference was.
        ...((e.overtime
          ? [
              [
                payslip.overtimeMinutes
                  ? `Overtime (${Math.floor(payslip.overtimeMinutes / 60)}h ${payslip.overtimeMinutes % 60}m)`
                  : "Overtime",
                e.overtime,
              ],
            ]
          : []) as [string, number][]),
      ];
      const dedRows: [string, number][] = [
        ["Provident Fund (PF)", d.pf],
        ["ESI", d.esi],
        ["Professional Tax", d.professionalTax],
        ["TDS", d.tds],
        ["Loss of Pay", d.lop],
        ["Other", d.other],
      ];

      y = drawTableHeader(y);
      const rowH = 16;
      const rows = Math.max(earnRows.length, dedRows.length);
      doc.font("Helvetica").fontSize(9).fillColor("#000000");
      for (let i = 0; i < rows; i++) {
        doc.rect(margin, y, colW, rowH).stroke("#dddddd");
        doc.rect(margin + colW, y, colW, rowH).stroke("#dddddd");
        if (earnRows[i]) {
          doc.text(earnRows[i][0], margin + 6, y + 4, { width: colW - 80 });
          doc.text(inr(earnRows[i][1]), margin + colW - 80, y + 4, {
            width: 74,
            align: "right",
          });
        }
        if (dedRows[i]) {
          doc.text(dedRows[i][0], margin + colW + 6, y + 4, {
            width: colW - 80,
          });
          doc.text(inr(dedRows[i][1]), margin + colW * 2 - 80, y + 4, {
            width: 74,
            align: "right",
          });
        }
        y += rowH;
      }

      // Totals row
      doc.rect(margin, y, colW, rowH).fill("#e8f0fe").stroke("#cccccc");
      doc.rect(margin + colW, y, colW, rowH).fill("#fdecea").stroke("#cccccc");
      doc.fillColor("#000000").font("Helvetica-Bold");
      doc.text("Gross Earnings", margin + 6, y + 4, { width: colW - 80 });
      doc.text(inr(e.gross), margin + colW - 80, y + 4, {
        width: 74,
        align: "right",
      });
      doc.text("Total Deductions", margin + colW + 6, y + 4, {
        width: colW - 80,
      });
      doc.text(inr(d.total), margin + colW * 2 - 80, y + 4, {
        width: 74,
        align: "right",
      });
      y += rowH + 14;

      // ===== Net pay =====
      doc.rect(margin, y, pageWidth, 26).fill("#0066cc");
      doc
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(12)
        .text(`Net Pay: ${inr(payslip.netPay)}`, margin + 8, y + 7, {
          width: pageWidth - 16,
        });
      y += 40;

      doc
        .fillColor(DOC.muted)
        .font("Helvetica-Oblique")
        .fontSize(8)
        .text(
          "This is a computer-generated payslip and does not require a signature.",
          margin,
          y,
          { width: pageWidth, align: "center" },
        );

      paginate(
        doc,
        `Payslip · ${payslip.employeeCode} · ${MONTH_NAMES[payslip.month - 1]} ${payslip.year}`,
      );
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const INR = (n: number) => `Rs. ${(n || 0).toLocaleString("en-IN")}`;

/** Hospital invoice as a PDF (digital bill). */
export const generateInvoicePDF = async (invoice: any): Promise<Buffer> => {
  const logo = await brandLogo();
  return new Promise((resolve, reject) => {
    try {
      const margin = DOC.margin;
      const doc = new PDFDocument({
        size: "A4",
        margin,
        bufferPages: true,
        info: {
          Title: `Invoice ${invoice.invoiceNo}`,
          Author: config.brand.name,
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = doc.page.width - margin * 2;
      const patient = invoice.patientId || {};

      letterhead(doc, { logo });
      refBlock(doc, [
        ["Invoice No", invoice.invoiceNo || "—"],
        ["Date", fmtDateTimeIST(invoice.createdAt)],
        ...(invoice.gstin
          ? ([["GSTIN", invoice.gstin]] as Array<[string, string]>)
          : []),
      ]);
      docTitle(doc, "Tax Invoice");

      doc.fontSize(10).font("Helvetica-Bold").fillColor(DOC.muted)
        .text("BILLED TO", margin, doc.y, { characterSpacing: 0.8 });
      doc.moveDown(0.3);
      doc.fontSize(11).font("Helvetica-Bold").fillColor(DOC.ink)
        .text(patient.fullName || "—", margin, doc.y);
      if (patient.patientId) {
        doc.fontSize(9).font("Helvetica").fillColor(DOC.muted)
          .text(`Patient ID: ${patient.patientId}`, margin, doc.y);
      }
      doc.fillColor(DOC.ink).fontSize(9);
      doc.x = margin;
      doc.moveDown(1);

      // Line items table
      const cols = [margin, margin + 230, margin + 300, margin + 380, margin + pageW];
      const row = (a: string, b: string, c: string, d: string, bold = false) => {
        const y = doc.y;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#000");
        doc.text(a, cols[0] + 2, y, { width: cols[1] - cols[0] - 4 });
        doc.text(b, cols[1], y, { width: cols[2] - cols[1], align: "right" });
        doc.text(c, cols[2], y, { width: cols[3] - cols[2], align: "right" });
        doc.text(d, cols[3], y, { width: cols[4] - cols[3], align: "right" });
        doc.moveDown(0.4);
      };
      doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y).stroke("#ccc");
      doc.moveDown(0.3);
      row("Item (section)", "Qty", "Rate", "Amount", true);
      doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y).stroke("#ccc");
      doc.moveDown(0.3);
      for (const li of invoice.lineItems || []) {
        row(`${li.description}  [${li.section}]`, String(li.quantity), INR(li.unitPrice), INR(li.amount));
      }
      doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y).stroke("#ccc");
      doc.moveDown(0.4);

      const tot = (l: string, v: string, bold = false) => {
        const y = doc.y;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
        doc.text(l, cols[2] - 40, y, { width: cols[3] - cols[2] + 40, align: "right" });
        doc.text(v, cols[3], y, { width: cols[4] - cols[3], align: "right" });
        doc.moveDown(0.35);
      };
      tot("Subtotal", INR(invoice.subtotal));
      if (invoice.discount) tot("Discount", `- ${INR(invoice.discount)}`);
      if (invoice.taxAmount) { tot(`CGST`, INR(invoice.cgstAmount)); tot(`SGST`, INR(invoice.sgstAmount)); }
      tot("Total", INR(invoice.total), true);
      tot("Paid", INR(invoice.amountPaid));
      tot("Balance Due", INR(invoice.balanceDue), true);

      doc.moveDown(1.2);
      doc.fontSize(8).fillColor(DOC.muted)
        .text("This is a computer-generated invoice and does not require a signature.",
          margin, doc.y, { width: pageW, align: "center" });

      paginate(doc, `Invoice ${invoice.invoiceNo || ""}`.trim());
      doc.end();
    } catch (e) { reject(e); }
  });
};

/** Payment receipt PDF for an invoice's (non-refund) payments. */
export const generateReceiptPDF = async (invoice: any): Promise<Buffer> => {
  const logo = await brandLogo();
  return new Promise((resolve, reject) => {
    try {
      const margin = DOC.margin;
      const doc = new PDFDocument({
        size: "A4",
        margin,
        bufferPages: true,
        info: { Title: `Receipt ${invoice.invoiceNo}`, Author: config.brand.name },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      const patient = invoice.patientId || {};

      letterhead(doc, { logo });
      refBlock(doc, [
        ["Invoice", invoice.invoiceNo || "—"],
        ["Issued", fmtDateTimeIST(new Date())],
      ]);
      docTitle(doc, "Payment Receipt");

      infoTable(doc, [
        ["Patient", patient.fullName || ""],
        ...(patient.patientId
          ? ([["Patient ID", patient.patientId]] as Array<[string, string]>)
          : []),
        ["Against Invoice", invoice.invoiceNo || ""],
      ]);
      doc.moveDown(1.2);

      doc.font("Helvetica-Bold").fontSize(10).fillColor(DOC.muted)
        .text("PAYMENTS RECEIVED", margin, doc.y, { characterSpacing: 0.8 });
      doc.moveDown(0.5);

      const pageW2 = doc.page.width - margin * 2;
      const cols = [margin, margin + 150, margin + 270, margin + pageW2];
      const line = (a: string, b: string, c: string, bold = false) => {
        const y = doc.y;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9)
          .fillColor(bold ? DOC.muted : DOC.ink);
        doc.text(a, cols[0], y, { width: cols[1] - cols[0] - 8 });
        doc.text(b, cols[1], y, { width: cols[2] - cols[1] - 8 });
        doc.text(c, cols[2], y, { width: cols[3] - cols[2], align: "right" });
        doc.x = margin;
        doc.moveDown(0.55);
      };
      line("DATE", "METHOD", "AMOUNT", true);
      doc.moveTo(margin, doc.y - 3).lineTo(margin + pageW2, doc.y - 3)
        .lineWidth(0.5).strokeColor(DOC.hairline).stroke();

      for (const p of invoice.payments || []) {
        const label = p.isRefund ? "Refund" : p.isAdvance ? "Advance" : "Payment";
        line(
          fmtDateTimeIST(p.paidAt),
          `${label} · ${p.method}`,
          `${p.isRefund ? "-" : ""}${INR(p.amount)}`,
        );
      }

      doc.moveTo(margin, doc.y).lineTo(margin + pageW2, doc.y)
        .lineWidth(0.5).strokeColor(DOC.hairline).stroke();
      doc.moveDown(0.6);

      const total = (l: string, v: string) => {
        const y = doc.y;
        doc.font("Helvetica-Bold").fontSize(10).fillColor(DOC.ink);
        doc.text(l, cols[1], y, { width: cols[2] - cols[1] + 40, align: "right" });
        doc.text(v, cols[2] + 40, y, { width: cols[3] - cols[2] - 40, align: "right" });
        doc.x = margin;
        doc.moveDown(0.45);
      };
      total("Total Paid", INR(invoice.amountPaid));
      total("Balance Due", INR(invoice.balanceDue));

      doc.x = margin;
      doc.moveDown(1.4);
      doc.fontSize(8).font("Helvetica").fillColor(DOC.muted)
        .text("Thank you. This is a computer-generated receipt and does not require a signature.",
          margin, doc.y, { width: pageW2, align: "center" });

      paginate(doc, `Receipt · ${invoice.invoiceNo || ""}`.trim());
      doc.end();
    } catch (e) { reject(e); }
  });
};

const age = (dob?: Date | string) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
};

/**
 * IPD discharge summary — the real document a real hospital hands the
 * patient at discharge, built entirely from the admission's own data
 * (bed history, vitals/medication/progress logs, the free-text summary
 * staff wrote) rather than fields that don't exist on the model.
 */
export const generateDischargeSummaryPDF = async (
  admission: any,
): Promise<Buffer> => {
  const logo = await brandLogo();
  return new Promise((resolve, reject) => {
    try {
      const margin = DOC.margin;
      const doc = new PDFDocument({
        size: "A4",
        margin,
        bufferPages: true,
        info: {
          Title: `Discharge Summary ${admission.admissionNo}`,
          Author: config.brand.name,
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = doc.page.width - margin * 2;
      const patient = admission.patientId || {};
      const doctor = admission.attendingDoctorId || {};
      const patientAge = patient.age ?? age(patient.dateOfBirth);

      letterhead(doc, { logo });
      refBlock(doc, [
        ["Admission No", admission.admissionNo || "—"],
        ["Issued", fmtDateTimeIST(new Date())],
      ]);
      docTitle(doc, "Discharge Summary");

      infoTable(doc, [
        [
          "Patient",
          `${patient.fullName || "—"}${patient.patientId ? ` (${patient.patientId})` : ""}` +
            `${patientAge != null ? `, ${patientAge}y` : ""}` +
            `${patient.gender ? `, ${titleCasePdf(patient.gender)}` : ""}`,
        ],
        ["Attending Doctor", doctor.fullName || ""],
        [
          "Ward / Bed",
          `${admission.currentWard || admission.ward || "—"} / ${admission.currentBedNumber || admission.bedNumber || "—"}`,
        ],
        ["Admitted", fmtDateTimeIST(admission.admittedAt)],
        [
          "Discharged",
          admission.dischargedAt ? fmtDateTimeIST(admission.dischargedAt) : "",
        ],
        ...(admission.reason
          ? ([["Reason for Admission", admission.reason]] as Array<[string, string]>)
          : []),
      ]);
      doc.moveDown(1.1);

      const section = (title: string) => {
        // Keep a heading with at least a little of its section beneath it.
        if (doc.y > doc.page.height - 130) doc.addPage();
        doc.fontSize(10).font("Helvetica-Bold").fillColor(DOC.muted)
          .text(title.toUpperCase(), margin, doc.y, { characterSpacing: 0.8 });
        doc.moveDown(0.25);
        doc.rect(margin, doc.y, 34, 2).fill(DOC.accent);
        doc.fillColor(DOC.ink).font("Helvetica").fontSize(9.5);
        doc.x = margin;
        doc.moveDown(0.7);
      };

      section("Course in Hospital / Discharge Notes");
      doc.fontSize(9).font("Helvetica").text(admission.dischargeSummary || "No summary recorded.", { width: pageW });
      doc.moveDown(0.6);

      if ((admission.medicationLog || []).length > 0) {
        section("Medications Administered");
        for (const m of admission.medicationLog) {
          // Was `new Date(m.at).toLocaleString("en-IN")`: unpinned (so it
          // printed the server's zone, not IST, against this file's own rule)
          // and rendered a literal "Invalid Date" whenever the timestamp was
          // missing — which is exactly when a nurse needs to notice it isn't
          // recorded.
          const when = m.at ? fmtDateTimeIST(m.at) : "Time not recorded";
          doc.fontSize(9).font("Helvetica").text(
            `${when}  —  ${m.drug || "Medication"}${m.dose ? ` ${m.dose}` : ""}${m.route ? ` (${m.route})` : ""}${m.notes ? `  ${m.notes}` : ""}`,
            { width: pageW },
          );
        }
        doc.moveDown(0.6);
      }

      if ((admission.vitalsLog || []).length > 0) {
        const last = admission.vitalsLog[admission.vitalsLog.length - 1];
        section("Vitals at Discharge");
        doc.fontSize(9).font("Helvetica").text(
          [
            last.bloodPressure ? `BP: ${last.bloodPressure}` : null,
            last.pulse != null ? `Pulse: ${last.pulse}` : null,
            last.temperature != null ? `Temp: ${last.temperature}°F` : null,
            last.spo2 != null ? `SpO2: ${last.spo2}%` : null,
            last.respiratoryRate != null ? `RR: ${last.respiratoryRate}` : null,
          ]
            .filter(Boolean)
            .join("   ·   ") || "No vitals recorded.",
        );
        doc.moveDown(0.6);
      }

      doc.x = margin;
      doc.moveDown(1);
      doc.fontSize(8).font("Helvetica").fillColor(DOC.muted).text(
        "This is a computer-generated discharge summary. Please follow up with your treating doctor as advised.",
        margin,
        doc.y,
        { width: pageW, align: "center" },
      );

      paginate(doc, `Discharge · ${admission.admissionNo || ""}`.trim());
      doc.end();
    } catch (e) { reject(e); }
  });
};

const titleCasePdf = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Prescription PDF — laid out like a real hospital OPD prescription
 * (Medanta/Apollo style) rather than a generic report: letterhead with the
 * doctor's credentials and registration number, a one-line patient strip,
 * inline vitals / diagnosis / investigative readings, then the MEDICATION
 * ADVISE table with per-drug remarks, followed by investigations advised,
 * notes and advice, and a computer-generated authorisation footer.
 *
 * `extras` carries the things that don't live on the encounter: the hospital
 * letterhead block and the lab readings to quote.
 */
export const generatePrescriptionPDF = async (
  encounter: any,
  extras: {
    hospital: { name: string; address?: string; phone?: string; email?: string; website?: string };
    readings?: { name: string; value: string; at?: Date | string }[];
    department?: string;
  },
): Promise<Buffer> => {
  const logo = await brandLogo();
  return new Promise((resolve, reject) => {
    try {
      const margin = DOC.margin;
      const doc = new PDFDocument({
        size: "A4",
        margin,
        bufferPages: true,
        info: { Title: "Prescription", Author: extras.hospital.name },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = doc.page.width - margin * 2;
      const patient = encounter.patientId || {};
      const doctor = encounter.doctorId || {};
      const prof = doctor.doctorProfile || {};
      const visit = new Date(encounter.visitDate || encounter.createdAt || Date.now());

      // ---------- Letterhead ----------
      // The treating hospital's identity, not the platform's.
      letterhead(doc, {
        logo,
        name: extras.hospital.name,
        tagline: extras.department || config.brand.tagline,
        contact:
          [extras.hospital.phone, extras.hospital.email, extras.hospital.website]
            .filter(Boolean)
            .join("   |   ") || undefined,
      });

      // ---------- Prescriber ----------
      const docTop = doc.y;
      doc.fontSize(12).font("Helvetica-Bold").fillColor(DOC.ink)
        .text(doctor.fullName ? `Dr. ${doctor.fullName}` : "Doctor", margin, docTop, {
          width: pageW * 0.6,
        });
      doc.fontSize(8.5).font("Helvetica").fillColor(DOC.muted);
      const credentials = [
        prof.qualification,
        prof.speciality,
        doctor.email,
        prof.registrationNumber ? `Regd. No. ${prof.registrationNumber}` : null,
      ].filter(Boolean) as string[];
      for (const c of credentials) doc.text(c, margin, doc.y, { width: pageW * 0.6 });

      doc.x = margin;
      doc.moveDown(0.7);
      doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y)
        .lineWidth(0.7).strokeColor(DOC.hairline).stroke();
      doc.fillColor(DOC.ink);
      doc.moveDown(0.6);

      // ---------- Patient strip ----------
      const ageStr = patient.age != null ? `${patient.age} YEAR(S)` : "";
      const y0 = doc.y;
      doc.fontSize(10).font("Helvetica-Bold").fillColor("#000").text(
        [String(patient.fullName || "-").toUpperCase(),
         patient.gender ? String(patient.gender).toUpperCase() : null,
         ageStr || null].filter(Boolean).join(", "),
        margin, y0, { width: pageW * 0.65 },
      );
      doc.fontSize(9).font("Helvetica").text(
        fmtDateTimeIST(visit),
        margin + pageW * 0.65, y0, { width: pageW * 0.35, align: "right" },
      );
      if (patient.patientId) {
        doc.fontSize(8).font("Helvetica").fillColor("#333")
          .text(`UHID : ${patient.patientId}`, margin, doc.y);
      }
      doc.moveDown(0.4);
      doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y).lineWidth(0.5).stroke("#999");
      doc.moveDown(0.5);

      // ---------- Inline label blocks ----------
      const inline = (label: string, value: string) => {
        if (!value) return;
        doc.fontSize(8).font("Helvetica-Bold").fillColor("#000")
          .text(`${label} : `, { continued: true })
          .font("Helvetica").text(value);
        doc.moveDown(0.15);
      };

      const v = encounter.vitals || {};
      inline("VITALS", [
        v.pulse ? `PULSE RATE-${v.pulse}/min` : null,
        v.height ? `BODY HEIGHT-${v.height}Cms` : null,
        v.weight && v.height ? `BODY MASS INDEX-${(v.weight / Math.pow(v.height / 100, 2)).toFixed(1)}kg/m2` : null,
        v.weight ? `BODY WEIGHT-${v.weight}Kgs` : null,
        v.bloodPressure ? `BP-${v.bloodPressure}mmHg` : null,
        v.spo2 ? `SpO2-${v.spo2}%` : null,
        v.temperature ? `TEMP-${v.temperature}F` : null,
      ].filter(Boolean).join(" | "));

      const dx = (encounter.icdDiagnoses || []).length
        ? encounter.icdDiagnoses.map((d: any) => (d.code ? `${d.text} (${d.code})` : d.text))
        : encounter.diagnoses || [];
      inline("DIAGNOSIS", dx.join(" | "));
      if (encounter.chiefComplaint) inline("CHIEF COMPLAINT", encounter.chiefComplaint);

      inline("INVESTIGATIVE READINGS", (extras.readings || [])
        .map((r) => `${r.name.toUpperCase()} : ${r.value}${r.at ? ` - ${fmtDateIST(r.at)}` : ""}`)
        .join(" | "));

      doc.moveDown(0.5);

      // ---------- MEDICATION ADVISE table ----------
      const rx = encounter.prescriptions || [];
      if (rx.length) {
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#000")
          .text("MEDICATION ADVISE", { align: "center", underline: true });
        doc.moveDown(0.4);

        const cols = [22, 150, 48, 66, 52, pageW - 22 - 150 - 48 - 66 - 52];
        const heads = ["", "Medications", "Dose", "Frequency", "Duration", "Remarks"];
        let y = doc.y;

        const drawRow = (cells: string[], bold: boolean, top: number): number => {
          doc.fontSize(7.5).font(bold ? "Helvetica-Bold" : "Helvetica").fillColor("#000");
          // tallest cell decides the row height
          const h = Math.max(...cells.map((c, i) =>
            doc.heightOfString(c || "", { width: cols[i] - 8 }))) + 8;
          let x = margin;
          cells.forEach((c, i) => {
            doc.rect(x, top, cols[i], h).lineWidth(0.5).strokeColor("#999").stroke();
            doc.text(c || "", x + 4, top + 4, { width: cols[i] - 8 });
            x += cols[i];
          });
          return top + h;
        };

        y = drawRow(heads, true, y);
        rx.forEach((p: any, i: number) => {
          // page break before a row that would overflow
          if (y > doc.page.height - 150) {
            doc.addPage();
            y = margin;
            y = drawRow(heads, true, y);
          }
          const name = [p.drug, p.strength].filter(Boolean).join(" ");
          const remarks = [
            p.notes,
            p.timing ? `Take ${p.timing.toLowerCase()}.` : null,
            p.quantity ? `Total ${p.quantity} unit(s).` : null,
          ].filter(Boolean).join(" ");
          y = drawRow(
            [String(i + 1), name, p.dosage || "", [p.frequency, p.timing].filter(Boolean).join("\n"), p.duration || "", remarks],
            false,
            y,
          );
        });
        // Reset the cursor: the table wrote cells at explicit x offsets, so
        // doc.x is parked in the last column. Without this every block below
        // (investigations, notes, advice) renders indented under "Remarks".
        doc.x = margin;
        doc.y = y + 8;
      }

      // ---------- Advice blocks ----------
      const orders = [...(encounter.labOrders || []), ...(encounter.imagingOrders || [])];
      if (orders.length) inline("INVESTIGATION ADVISED", orders.join(" | "));
      if (encounter.followUpAt) {
        inline("FOLLOW UP", fmtDateIST(encounter.followUpAt));
      }
      if (encounter.notes) inline("NOTES", encounter.notes);

      const advice = encounter.summary || encounter.treatmentPlan;
      if (advice) {
        doc.moveDown(0.2);
        doc.fontSize(8).font("Helvetica-Bold").text("ADVICE :");
        doc.fontSize(8).font("Helvetica").text(`•  ${advice}`, { indent: 8 });
      }

      // ---------- Footer ----------
      const footerTop = doc.page.height - 120;
      doc.y = Math.max(doc.y + 20, footerTop - 40);
      doc.fontSize(8).font("Helvetica").fillColor("#000")
        .text(doctor.fullName ? `Dr. ${doctor.fullName}` : "", margin, doc.y, {
          width: pageW, align: "right",
        });
      doc.moveDown(0.3);
      doc.fontSize(6.5).fillColor("#444").text(
        `PRESCRIPTION AUTHORIZED BY ${doctor.fullName ? `DR. ${String(doctor.fullName).toUpperCase()}` : "THE DOCTOR"} ON ` +
        `${fmtDateIST(visit)} ${fmtTimeIST(visit)}  ` +
        `(THIS IS A COMPUTER GENERATED REPORT. SIGNATURE IS NOT REQUIRED.)`,
        margin, doc.y, { width: pageW },
      );

      doc.x = margin;
      doc.moveDown(1);
      doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y)
        .lineWidth(0.5).strokeColor(DOC.hairline).stroke();
      doc.moveDown(0.5);
      doc.fontSize(9).font("Helvetica-Bold").fillColor(DOC.band)
        .text(extras.hospital.name, margin, doc.y, { width: pageW, align: "center" });
      doc.fontSize(7).font("Helvetica").fillColor(DOC.muted);
      if (extras.hospital.address) {
        doc.text(extras.hospital.address, margin, doc.y, {
          width: pageW,
          align: "center",
        });
      }
      const contact = [
        extras.hospital.phone ? `Tel: ${extras.hospital.phone}` : null,
        extras.hospital.email || null,
        extras.hospital.website || null,
      ].filter(Boolean).join("   |   ");
      if (contact) {
        doc.text(contact, margin, doc.y, { width: pageW, align: "center" });
      }

      // The hospital's own footer already names the address, so the shared
      // one would only repeat it — page numbers are what is missing.
      paginate(doc, undefined, { address: false });
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
};

/**
 * Offer letter issued to a hired candidate.
 *
 * The same buffer is both emailed to the candidate and archived to S3, so the
 * copy on file is byte-identical to the one they received — which matters if
 * the terms are ever disputed.
 */
/**
 * Offer letter — a proposal of employment, issued when an application is
 * marked hired. Printed on the shared letterhead so it matches every other
 * document the organisation sends out.
 */
export const generateOfferLetterPDF = async (data: {
  candidateName: string;
  applicationNumber: string;
  designation: string;
  department?: string;
  ctcAnnual: number;
  joiningDate: Date | string;
  location?: string;
  reportingTo?: string;
  notes?: string;
  companyName: string;
}): Promise<Buffer> => {
  const logo = await brandLogo();
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: DOC.margin,
        // Buffered so the footer can number the pages once they all exist.
        bufferPages: true,
        info: {
          Title: `Offer Letter - ${data.candidateName}`,
          Author: data.companyName,
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      letterhead(doc, { logo });
      refBlock(doc, [
        ["Date", fmtLongDateIST(new Date())],
        ["Ref", data.applicationNumber || "—"],
      ]);
      docTitle(doc, "Letter of Offer");

      para(doc, `Dear ${data.candidateName},`, { gap: 0.5 });
      para(
        doc,
        `We are pleased to offer you the position of ${data.designation} at ${data.companyName}. ` +
          `Following your application and interview, your qualifications and experience stood out, and we ` +
          `would be glad to have you join us. The principal terms of your employment are set out below.`,
      );

      infoTable(
        doc,
        [
          ["Designation", data.designation],
          ["Department", data.department || ""],
          ["Annual CTC", inr(data.ctcAnnual)],
          ["Date of Joining", fmtLongDateIST(data.joiningDate)],
          ["Place of Posting", data.location || ""],
          ["Reporting To", data.reportingTo || ""],
        ],
        { heading: "Terms of the offer" },
      );
      doc.moveDown(1.1);

      if (data.notes) {
        para(doc, "Additional Terms", { bold: true, gap: 0.35 });
        para(doc, data.notes);
      }

      para(
        doc,
        "This offer is subject to verification of the documents and credentials submitted with your " +
          "application, and to your acceptance of the terms above. Please confirm your acceptance by " +
          "replying to this email on or before your date of joining.",
      );
      para(doc, "We look forward to welcoming you to the team.", { gap: 0.4 });

      signOff(doc);
      paginate(doc, `Offer · ${data.applicationNumber || data.candidateName}`);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

/**
 * Appointment letter — issued on the joining date once the offer has been
 * accepted. Deliberately a different document from the offer: the offer is a
 * proposal, this confirms an employment that has begun.
 */
export const generateAppointmentLetterPDF = async (data: {
  candidateName: string;
  applicationNumber: string;
  designation: string;
  department?: string;
  joiningDate: Date | string;
  location?: string;
  reportingTo?: string;
  ctcAnnual?: number;
  employeeCode?: string;
  companyName: string;
}): Promise<Buffer> => {
  const logo = await brandLogo();
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: DOC.margin,
        bufferPages: true,
        info: {
          Title: `Appointment Letter - ${data.candidateName}`,
          Author: data.companyName,
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      letterhead(doc, { logo });
      refBlock(doc, [
        ["Date", fmtLongDateIST(new Date())],
        ["Ref", data.applicationNumber || "—"],
      ]);
      docTitle(doc, "Letter of Appointment");

      para(doc, `Dear ${data.candidateName},`, { gap: 0.5 });
      para(
        doc,
        `Further to your acceptance of our offer, we are pleased to confirm your appointment as ` +
          `${data.designation} at ${data.companyName} with effect from ${fmtLongDateIST(data.joiningDate)}. ` +
          `Your appointment is governed by the terms below and by the organisation's policies in force ` +
          `from time to time.`,
      );

      infoTable(
        doc,
        [
          ["Employee Name", data.candidateName],
          ...(data.employeeCode
            ? ([["Employee Code", data.employeeCode]] as Array<[string, string]>)
            : []),
          ["Designation", data.designation],
          ["Department", data.department || ""],
          ["Date of Joining", fmtLongDateIST(data.joiningDate)],
          ["Place of Posting", data.location || ""],
          ["Reporting To", data.reportingTo || ""],
          ...(data.ctcAnnual
            ? ([["Annual CTC", inr(data.ctcAnnual)]] as Array<[string, string]>)
            : []),
        ],
        { heading: "Particulars of appointment" },
      );
      doc.moveDown(1.1);

      para(
        doc,
        "You are required to comply with the organisation's code of conduct, confidentiality obligations " +
          "and patient-privacy policies at all times. Please report to Human Resources on your date of " +
          "joining with the original documents submitted during recruitment.",
      );
      para(
        doc,
        "We warmly welcome you to the team and look forward to working with you.",
        { gap: 0.4 },
      );

      signOff(doc);
      paginate(doc, `Appointment · ${data.employeeCode || data.applicationNumber || data.candidateName}`);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};
