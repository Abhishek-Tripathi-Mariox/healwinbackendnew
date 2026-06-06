import PDFDocument from "pdfkit";
import { ICareerApplication } from "../models/career-application.model";
import { IPayslip } from "../models/payslip.model";
import { IHrEmployee } from "../models/hr-employee.model";
import https from "https";
import http from "http";

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
            ? new Date(application.dob).toLocaleDateString("en-IN")
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
          ? new Date(application.appliedAt).toLocaleDateString("en-IN")
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
