/**
 * Render one of each generated document with sample data, so the layout can
 * actually be looked at instead of assumed.
 *
 * Usage: npx ts-node src/scripts/preview-documents.ts [outDir]
 */
import fs from "fs";
import path from "path";
import {
  generateOfferLetterPDF,
  generateAppointmentLetterPDF,
  generateInvoicePDF,
  generateReceiptPDF,
  generateDischargeSummaryPDF,
  generatePrescriptionPDF,
  generatePayslipPDF,
} from "../services/pdf.service";

const out = process.argv[2] || "/tmp/healwin-docs";

const run = async () => {
  fs.mkdirSync(out, { recursive: true });
  const write = (name: string, buf: Buffer) => {
    const p = path.join(out, name);
    fs.writeFileSync(p, buf);
    console.log(`  ${(buf.length / 1024).toFixed(1)} KB  ${p}`);
  };

  write(
    "offer-letter.pdf",
    await generateOfferLetterPDF({
      candidateName: "Bradley Brathwaite",
      applicationNumber: "APP-2026-0184",
      designation: "Staff Nurse — ICU",
      department: "Critical Care",
      ctcAnnual: 640000,
      joiningDate: new Date("2026-10-01"),
      location: "HealWin Medical Centre, Noida",
      reportingTo: "Dr. Barbara Johnson, Nursing Superintendent",
      notes:
        "A probation period of six months applies, during which either party may terminate this engagement with 15 days' notice.",
      companyName: "HealWin",
    }),
  );

  write(
    "appointment-letter.pdf",
    await generateAppointmentLetterPDF({
      candidateName: "Bradley Brathwaite",
      applicationNumber: "APP-2026-0184",
      designation: "Staff Nurse — ICU",
      department: "Critical Care",
      joiningDate: new Date("2026-10-01"),
      location: "HealWin Medical Centre, Noida",
      reportingTo: "Dr. Barbara Johnson, Nursing Superintendent",
      ctcAnnual: 640000,
      employeeCode: "HW-0184",
      companyName: "HealWin",
    }),
  );

  const patient = {
    fullName: "Bradley Brathwaite",
    patientId: "PT-004821",
    age: 46,
    gender: "male",
  };
  const invoice: any = {
    invoiceNo: "INV-2026-00318",
    createdAt: new Date(),
    gstin: "09AAACH7409R1ZZ",
    patientId: patient,
    lineItems: [
      { description: "ICU Bed Charges (3 days)", section: "IPD", quantity: 3, unitPrice: 6500, amount: 19500 },
      { description: "Consultant Visit — Critical Care", section: "IPD", quantity: 3, unitPrice: 1200, amount: 3600 },
      { description: "Complete Blood Count", section: "LAB", quantity: 1, unitPrice: 450, amount: 450 },
      { description: "Injection Meropenem 1g", section: "PHARMACY", quantity: 6, unitPrice: 380, amount: 2280 },
    ],
    subtotal: 25830, discount: 830, taxAmount: 1250, cgstAmount: 625, sgstAmount: 625,
    total: 26250, amountPaid: 20000, balanceDue: 6250,
    payments: [
      { paidAt: new Date(Date.now() - 864e5 * 2), method: "UPI", amount: 15000, isAdvance: true },
      { paidAt: new Date(), method: "CARD", amount: 5000 },
    ],
  };
  write("invoice.pdf", await generateInvoicePDF(invoice));
  write("receipt.pdf", await generateReceiptPDF(invoice));

  write(
    "discharge-summary.pdf",
    await generateDischargeSummaryPDF({
      admissionNo: "ADM-2026-0771",
      patientId: patient,
      attendingDoctorId: { fullName: "Barbara Johnson" },
      currentWard: "ICU", currentBedNumber: "ICU-04",
      admittedAt: new Date(Date.now() - 864e5 * 3),
      dischargedAt: new Date(),
      reason: "Community-acquired pneumonia with respiratory distress",
      dischargeSummary:
        "Patient admitted with fever, productive cough and hypoxia. Started on IV antibiotics and oxygen support. Weaned off oxygen on day 3 with steady improvement in saturation and inflammatory markers. Afebrile for 48 hours prior to discharge. Advised review in OPD after one week, and to return earlier if breathlessness or fever recurs.",
      medicationLog: [
        { at: new Date(Date.now() - 864e5 * 2), drug: "Inj Meropenem", dose: "1g", route: "IV" },
        { at: new Date(Date.now() - 864e5), drug: "Tab Paracetamol", dose: "650mg", route: "PO" },
        // Deliberately missing a timestamp — the summary must say so rather
        // than print "Invalid Date".
        { drug: "Neb Duolin", dose: "2.5ml", route: "NEB" },
      ],
      vitalsLog: [
        { temperature: 98.4, pulse: 78, bloodPressure: "118/76", spo2: 97, respiratoryRate: 18 },
      ],
    }),
  );

  write(
    "prescription.pdf",
    await generatePrescriptionPDF(
      {
        visitDate: new Date(),
        patientId: patient,
        doctorId: {
          fullName: "Barbara Johnson",
          email: "barbara@healwin.in",
          doctorProfile: {
            qualification: "MBBS, MD (Pulmonary Medicine)",
            speciality: "Critical Care",
            registrationNumber: "DMC/R/12894",
          },
        },
        chiefComplaint: "Fever with cough for 5 days",
        diagnosis: "Community-acquired pneumonia",
        prescriptions: [
          { drug: "Amoxiclav", strength: "625mg", dosage: "1 tab", frequency: "1-0-1", timing: "After food", duration: "5 days", instructions: "Complete the full course" },
          { drug: "Ascoril LS", strength: "Syrup", dosage: "10 ml", frequency: "TDS", duration: "5 days" },
        ],
        advice: "Plenty of fluids, steam inhalation twice daily. Review if fever persists beyond 48 hours.",
      },
      {
        hospital: {
          name: "HealWin Medical Centre",
          address: "601-602, Opp. Great India Place, Bhangel, Sector 18, Noida 201304",
          phone: "+91 120 555 7777",
          email: "care@healwin.in",
          website: "healwin.in",
        },
        department: "Pulmonary Medicine",
        readings: [{ name: "SpO2", value: "97%" }, { name: "Temp", value: "98.4 F" }],
      },
    ),
  );

  write(
    "payslip.pdf",
    await generatePayslipPDF(
      {
        employeeCode: "HW-0184",
        employeeName: "Bradley Brathwaite",
        designation: "Staff Nurse — ICU",
        month: 8,
        year: 2026,
        totalDays: 31,
        serviceDays: 31,
        unmarkedDays: 0,
        workedMinutes: 12000,
        overtimeMinutes: 180,
        overtimeAmount: 900,
        paidDays: 30,
        lopDays: 1,
        leaveDays: 2,
        earnings: {
          basic: 26000, hra: 10400, conveyance: 1600, medical: 1250,
          specialAllowance: 5000, otherAllowances: 0, overtime: 900,
          gross: 45150,
        },
        deductions: {
          pf: 3120, esi: 0, professionalTax: 200, tds: 1500,
          lop: 1456, other: 0, total: 6276,
        },
        netPay: 38874,
      } as any,
      {
        fullName: "Bradley Brathwaite",
        designationId: { name: "Staff Nurse — ICU" },
        departmentId: { name: "Critical Care" },
        dateOfJoining: new Date("2024-04-01"),
      } as any,
    ),
  );

  console.log("\ndone");
};

run().catch((e) => {
  console.error("failed:", e);
  process.exit(1);
});
