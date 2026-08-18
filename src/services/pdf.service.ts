import PDFDocument from "pdfkit";
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
export const generateApplicationPDF = async (
  application: ICareerApplication & { applicationNumber: string },
): Promise<Buffer> => {
  return new Promise(async (resolve, reject) => {
    try {
      const margin = 40;
      const doc = new PDFDocument({
        size: "A4",
        margin,
        info: {
          Title: `Application ${application.applicationNumber}`,
          Author: "HealWin Life Support & Emergency Care",
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
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .text("Acknowledgment of Your Application Submission", {
          align: "center",
        });
      doc.moveDown(0.8);

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
      doc.font("Helvetica-Bold").text("HR Team, HealWin", margin, y);
      y += 13;
      doc
        .font("Helvetica")
        .text("080 4018 4600, hr@healwin.in, www.healwin.in", margin, y);

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
export const generatePayslipPDF = (
  payslip: IPayslip,
  employee?: Partial<IHrEmployee>,
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const margin = 40;
      const doc = new PDFDocument({
        size: "A4",
        margin,
        info: {
          Title: `Payslip ${payslip.employeeCode} ${MONTH_NAMES[payslip.month - 1]} ${payslip.year}`,
          Author: "HealWin Life Support & Emergency Care",
        },
      });

      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageWidth = doc.page.width - margin * 2;

      // ===== Header =====
      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .fillColor("#0066cc")
        .text("HealWin Life Support & Emergency Care", { align: "center" });
      doc
        .fontSize(10)
        .font("Helvetica")
        .fillColor("#000000")
        .text(
          `Payslip for ${MONTH_NAMES[payslip.month - 1]} ${payslip.year}`,
          { align: "center" },
        );
      doc.moveDown(1);

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
      metaRow(
        "Designation",
        payslip.designation || "-",
        "Paid Days",
        `${payslip.paidDays} / ${payslip.totalDays}`,
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
        .fillColor("#888888")
        .font("Helvetica-Oblique")
        .fontSize(8)
        .text(
          "This is a computer-generated payslip and does not require a signature.",
          margin,
          y,
          { width: pageWidth, align: "center" },
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

const INR = (n: number) => `Rs. ${(n || 0).toLocaleString("en-IN")}`;

/** Hospital invoice as a PDF (digital bill). */
export const generateInvoicePDF = (invoice: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const margin = 40;
      const doc = new PDFDocument({
        size: "A4",
        margin,
        info: { Title: `Invoice ${invoice.invoiceNo}`, Author: "HealWin" },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = doc.page.width - margin * 2;
      const patient = invoice.patientId || {};

      // Letterhead: real hospital identity + a rule under it. This used to be
      // a hardcoded name floating with no address, contact or separator — it
      // did not read as a document from anywhere in particular.
      const hospitalName = process.env.HOSPITAL_NAME || "HealWin Hospital";
      const hospitalAddr = process.env.HOSPITAL_ADDRESS || "";
      const hospitalContact = [
        process.env.HOSPITAL_PHONE ? `Tel: ${process.env.HOSPITAL_PHONE}` : null,
        process.env.HOSPITAL_EMAIL || null,
        process.env.HOSPITAL_WEBSITE || null,
      ]
        .filter(Boolean)
        .join("   |   ");

      doc.fontSize(16).font("Helvetica-Bold").fillColor("#0066cc")
        .text(hospitalName, { align: "center" });
      doc.fontSize(8).font("Helvetica").fillColor("#444");
      if (hospitalAddr) doc.text(hospitalAddr, { align: "center" });
      if (hospitalContact) doc.text(hospitalContact, { align: "center" });
      if (invoice.gstin) doc.text(`GSTIN: ${invoice.gstin}`, { align: "center" });

      doc.moveDown(0.4);
      doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y)
        .lineWidth(1).strokeColor("#0066cc").stroke();
      doc.moveDown(0.5);

      doc.fontSize(12).font("Helvetica-Bold").fillColor("#000")
        .text("TAX INVOICE", { align: "center" });
      doc.moveDown(0.3);
      doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y)
        .lineWidth(0.5).strokeColor("#999").stroke();
      doc.moveDown(0.5);
      doc.moveDown(1).fillColor("#000");

      doc.fontSize(9);
      doc.font("Helvetica-Bold").text(`Invoice No: `, { continued: true }).font("Helvetica").text(invoice.invoiceNo);
      doc.font("Helvetica-Bold").text(`Date: `, { continued: true }).font("Helvetica")
        .text(fmtDateTimeIST(invoice.createdAt));
      doc.font("Helvetica-Bold").text(`Patient: `, { continued: true }).font("Helvetica")
        .text(`${patient.fullName || "-"}${patient.patientId ? ` (${patient.patientId})` : ""}`);
      doc.moveDown(0.5);

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

      doc.moveDown(1);
      doc.fontSize(8).fillColor("#666").text("This is a computer-generated invoice.", { align: "center" });
      doc.end();
    } catch (e) { reject(e); }
  });
};

/** Payment receipt PDF for an invoice's (non-refund) payments. */
export const generateReceiptPDF = (invoice: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const margin = 40;
      const doc = new PDFDocument({ size: "A4", margin, info: { Title: `Receipt ${invoice.invoiceNo}` } });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      const patient = invoice.patientId || {};

      doc.fontSize(16).font("Helvetica-Bold").fillColor("#0066cc")
        .text("HealWin Life Support & Emergency Care", { align: "center" });
      doc.fontSize(11).font("Helvetica").fillColor("#000").text("Payment Receipt", { align: "center" });
      doc.moveDown(1);
      doc.fontSize(9);
      doc.font("Helvetica-Bold").text("Invoice: ", { continued: true }).font("Helvetica").text(invoice.invoiceNo);
      doc.font("Helvetica-Bold").text("Patient: ", { continued: true }).font("Helvetica").text(patient.fullName || "-");
      doc.moveDown(0.5);

      doc.font("Helvetica-Bold").text("Payments", { underline: true });
      doc.moveDown(0.3);
      for (const p of (invoice.payments || [])) {
        const label = p.isRefund ? "Refund" : p.isAdvance ? "Advance" : "Payment";
        doc.font("Helvetica").fontSize(9).text(
          `${fmtDateTimeIST(p.paidAt)}  -  ${label} (${p.method})  -  ${p.isRefund ? "-" : ""}${INR(p.amount)}`,
        );
      }
      doc.moveDown(0.8);
      doc.font("Helvetica-Bold").text(`Total Paid: ${INR(invoice.amountPaid)}`);
      doc.font("Helvetica-Bold").text(`Balance Due: ${INR(invoice.balanceDue)}`);
      doc.moveDown(1);
      doc.fontSize(8).fillColor("#666").text("Thank you. This is a computer-generated receipt.", { align: "center" });
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
export const generateDischargeSummaryPDF = (admission: any): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const margin = 40;
      const doc = new PDFDocument({
        size: "A4",
        margin,
        info: { Title: `Discharge Summary ${admission.admissionNo}`, Author: "HealWin" },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const pageW = doc.page.width - margin * 2;
      const patient = admission.patientId || {};
      const doctor = admission.attendingDoctorId || {};
      const patientAge = patient.age ?? age(patient.dateOfBirth);

      doc.fontSize(16).font("Helvetica-Bold").fillColor("#0066cc")
        .text("HealWin Life Support & Emergency Care", { align: "center" });
      doc.fontSize(11).font("Helvetica").fillColor("#000")
        .text("Discharge Summary", { align: "center" });
      doc.moveDown(1);

      const field = (label: string, value: string) => {
        doc.fontSize(9).font("Helvetica-Bold").text(`${label}: `, { continued: true })
          .font("Helvetica").text(value || "-");
      };
      field("Admission No", admission.admissionNo);
      field(
        "Patient",
        `${patient.fullName || "-"}${patient.patientId ? ` (${patient.patientId})` : ""}` +
          `${patientAge != null ? `, ${patientAge}y` : ""}${patient.gender ? `, ${titleCasePdf(patient.gender)}` : ""}`,
      );
      field("Attending Doctor", doctor.fullName || "-");
      field("Ward / Bed", `${admission.currentWard || admission.ward || "-"} / ${admission.currentBedNumber || admission.bedNumber || "-"}`);
      field("Admitted", fmtDateTimeIST(admission.admittedAt));
      field("Discharged", admission.dischargedAt ? fmtDateTimeIST(admission.dischargedAt) : "-");
      if (admission.reason) field("Reason for Admission", admission.reason);
      doc.moveDown(0.8);

      const section = (title: string) => {
        doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y).stroke("#ccc");
        doc.moveDown(0.3);
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#0066cc").text(title);
        doc.fillColor("#000").moveDown(0.3);
      };

      section("Course in Hospital / Discharge Notes");
      doc.fontSize(9).font("Helvetica").text(admission.dischargeSummary || "No summary recorded.", { width: pageW });
      doc.moveDown(0.6);

      if ((admission.medicationLog || []).length > 0) {
        section("Medications Administered");
        for (const m of admission.medicationLog) {
          doc.fontSize(9).font("Helvetica").text(
            `${new Date(m.at).toLocaleString("en-IN")}  —  ${m.drug}${m.dose ? ` ${m.dose}` : ""}${m.route ? ` (${m.route})` : ""}${m.notes ? `  ${m.notes}` : ""}`,
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

      doc.moveDown(0.6);
      doc.fontSize(8).fillColor("#666").text(
        "This is a computer-generated discharge summary. Please follow up with your treating doctor as advised.",
        { align: "center" },
      );
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
export const generatePrescriptionPDF = (
  encounter: any,
  extras: {
    hospital: { name: string; address?: string; phone?: string; email?: string; website?: string };
    readings?: { name: string; value: string; at?: Date | string }[];
    department?: string;
  },
): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const margin = 40;
      const doc = new PDFDocument({
        size: "A4",
        margin,
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
      doc.fontSize(18).font("Helvetica-Bold").fillColor("#c0392b")
        .text(extras.hospital.name, margin, margin, { width: pageW * 0.6 });
      if (extras.department) {
        doc.fontSize(10).font("Helvetica-Bold").fillColor("#000")
          .text(extras.department, margin + pageW * 0.6, margin + 4, {
            width: pageW * 0.4,
            align: "right",
          });
      }
      doc.moveDown(0.6);

      const docTop = doc.y;
      doc.fontSize(12).font("Helvetica-Bold").fillColor("#000")
        .text(doctor.fullName ? `Dr. ${doctor.fullName}` : "Doctor", margin, docTop);
      doc.fontSize(8).font("Helvetica").fillColor("#333");
      if (prof.qualification) doc.text(prof.qualification);
      if (prof.speciality) doc.text(prof.speciality);
      if (doctor.email) doc.text(doctor.email);
      if (prof.registrationNumber) doc.text(`Regd No.- ${prof.registrationNumber}`);

      doc.moveDown(0.6);
      doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y).lineWidth(1).stroke("#333");
      doc.moveDown(0.5);

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

      doc.moveDown(0.8);
      doc.moveTo(margin, doc.y).lineTo(margin + pageW, doc.y).lineWidth(0.5).stroke("#999");
      doc.moveDown(0.4);
      doc.fontSize(9).font("Helvetica-Bold").fillColor("#c0392b")
        .text(extras.hospital.name, { align: "center" });
      doc.fontSize(7).font("Helvetica").fillColor("#333");
      if (extras.hospital.address) doc.text(extras.hospital.address, { align: "center" });
      const contact = [
        extras.hospital.phone ? `Tel: ${extras.hospital.phone}` : null,
        extras.hospital.email || null,
        extras.hospital.website || null,
      ].filter(Boolean).join("   |   ");
      if (contact) doc.text(contact, { align: "center" });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
};
