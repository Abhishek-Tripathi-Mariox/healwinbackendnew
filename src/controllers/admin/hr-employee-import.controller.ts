import { Request, Response, NextFunction } from "express";
import HrEmployee from "../../models/hr-employee.model";
import Department from "../../models/department.model";
import Designation from "../../models/designation.model";
import EmploymentType from "../../models/employment-type.model";
import { nextSequence } from "../../models/counter.model";
import { parseCsvTable, toCsv, normalizeHeader } from "../../services/csv";

/**
 * Bulk employee import.
 *
 * HR builds the list in Excel and uploads it as CSV. Two things make that
 * safe enough to trust with staff records:
 *
 *  • It validates first and reports per-row problems with the row number, so a
 *    typo on row 47 is fixed in the spreadsheet rather than discovered later as
 *    a broken employee record.
 *  • `dryRun` previews the whole file without writing anything, which is the
 *    default the screen uses before asking for confirmation.
 *
 * Departments, designations and employment types are matched BY NAME, because
 * that is what a person types in a spreadsheet — nobody pastes ObjectIds.
 */

const pad = (n: number) => String(n).padStart(6, "0");

/**
 * Columns the template offers. "Full Name" and "Joining Date" are required.
 *
 * The lookup key is DERIVED from the label rather than written out beside it.
 * Keeping both by hand drifted immediately — "Annual CTC" normalises to
 * `annualctc`, but the key said `ctcannual`, so the column was silently never
 * read and every imported employee got a salary of zero. Deriving it means the
 * label and the key cannot disagree.
 *
 * `aliases` accept the other headings people reasonably type.
 */
const COLUMN_DEFS: {
  label: string;
  required?: boolean;
  hint?: string;
  aliases?: string[];
}[] = [
  { label: "Full Name", required: true, aliases: ["name", "employeename"] },
  { label: "Joining Date", required: true, hint: "YYYY-MM-DD", aliases: ["doj", "dateofjoining"] },
  { label: "Email", aliases: ["emailid"] },
  { label: "Phone", aliases: ["mobile", "mobilenumber", "contact"] },
  { label: "Gender", hint: "male / female / other" },
  { label: "Date of Birth", hint: "YYYY-MM-DD", aliases: ["dob"] },
  { label: "Department", hint: "must match an existing department" },
  { label: "Designation", hint: "must match an existing designation" },
  { label: "Employment Type", aliases: ["employmenttype"] },
  { label: "Address" },
  { label: "Bank Name" },
  { label: "Account Number", aliases: ["accountno", "acno"] },
  { label: "IFSC", aliases: ["ifsccode"] },
  { label: "PAN", aliases: ["pannumber"] },
  { label: "Aadhaar", aliases: ["aadhar", "aadharnumber", "aadhaarnumber"] },
  { label: "UAN" },
  { label: "Annual CTC", hint: "number, e.g. 480000", aliases: ["ctc", "ctcannual", "annualsalary"] },
];

const COLUMNS = COLUMN_DEFS.map((c) => ({
  ...c,
  key: normalizeHeader(c.label),
}));

/**
 * Read a column from a row, trying the label's own key and then its aliases.
 */
const cell = (row: Record<string, string>, label: string): string => {
  const def = COLUMNS.find((c) => c.label === label)!;
  const direct = row[def.key];
  if (direct) return direct;
  for (const a of def.aliases || []) {
    if (row[a]) return row[a];
  }
  return "";
};

/** True when the row carries this column at all (even if blank). */
const hasColumn = (row: Record<string, string>, label: string): boolean => {
  const def = COLUMNS.find((c) => c.label === label)!;
  return def.key in row || (def.aliases || []).some((a) => a in row);
};

/**
 * A date as a person writes it in a spreadsheet.
 *
 * Excel hands back all of these, and `new Date(...)` reads "15/01/2026" as an
 * invalid date and "01/15/2026" as the American order — either way the wrong
 * joining date, which changes what someone is paid.
 */
const parseSheetDate = (raw: string): Date | null => {
  const s = String(raw || "").trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // DD-MM-YYYY or DD/MM/YYYY — day first, the Indian convention.
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month > 12) return null;
    const d = new Date(Number(m[3]), month - 1, day);
    return Number.isNaN(d.getTime()) || d.getDate() !== day ? null : d;
  }
  return null;
};

const GENDERS = new Set(["male", "female", "other"]);

interface RowResult {
  row: number;
  fullName: string;
  errors: string[];
  employeeCode?: string;
}

/** GET /admin/hr/employees/import/template — a CSV with the right headers. */
export const template = async (req: Request, res: Response) => {
  // One example row, so the expected date format and name matching are obvious
  // rather than something to guess at.
  const example: Record<string, string> = {
    "Full Name": "Ravi Kumar",
    "Joining Date": "2026-01-15",
    Email: "ravi.kumar@example.com",
    Phone: "9876500011",
    Gender: "male",
    "Date of Birth": "1994-08-02",
    Department: "Critical Care",
    Designation: "Staff Nurse",
    "Employment Type": "Full Time",
    Address: "12, MG Road, Noida",
    "Bank Name": "HDFC Bank",
    "Account Number": "50100123456789",
    IFSC: "HDFC0001234",
    PAN: "ABCDE1234F",
    Aadhaar: "123456789012",
    UAN: "101234567890",
    "Annual CTC": "480000",
  };
  const labels = COLUMNS.map((c) => c.label);
  const csv = toCsv(labels, [example], labels);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="employee-import-template.csv"',
  );
  return res.send(csv);
};

/**
 * POST /admin/hr/employees/import — validate, and write unless `dryRun`.
 *
 * Accepts either an uploaded file or raw CSV text in the body, so the screen
 * can preview a pasted sheet without a round trip through a file.
 */
export const importEmployees = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const dryRun = String(req.body?.dryRun ?? "true") !== "false";

  const text =
    (req as any).file?.buffer?.toString("utf8") ||
    (typeof req.body?.csv === "string" ? req.body.csv : "");
  if (!text.trim()) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "Upload a CSV file, or send its text as `csv`." };
    return next();
  }

  const table = parseCsvTable(text);
  if (!table.rows.length) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "The file has headers but no rows." };
    return next();
  }
  if (table.rows.length > 2000) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: `${table.rows.length} rows is too many for one import. Split the file into batches of 2000 or fewer.`,
    };
    return next();
  }

  const missingRequired = COLUMNS.filter(
    (c) => c.required && !hasColumn(table.rows[0], c.label),
  );
  if (missingRequired.length) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: `Missing required column(s): ${missingRequired.map((c) => c.label).join(", ")}. Download the template to see the expected headers.`,
      headersFound: table.headers,
    };
    return next();
  }

  // Master data, looked up by lower-cased name.
  const [departments, designations, employmentTypes] = await Promise.all([
    Department.find({}).select("name").lean(),
    Designation.find({}).select("name").lean(),
    EmploymentType.find({}).select("name").lean(),
  ]);
  const byName = (rows: any[]) =>
    new Map(rows.map((r: any) => [String(r.name || "").trim().toLowerCase(), r._id]));
  const deptMap = byName(departments);
  const desigMap = byName(designations);
  const empTypeMap = byName(employmentTypes);

  // Existing emails, to reject duplicates without a round trip per row.
  const emailsInFile = table.rows
    .map((r) => cell(r, "Email").toLowerCase())
    .filter(Boolean);
  const existing = emailsInFile.length
    ? await HrEmployee.find({ email: { $in: emailsInFile }, isDeleted: false })
        .select("email")
        .lean()
    : [];
  const takenEmails = new Set(
    existing.map((e: any) => String(e.email || "").toLowerCase()),
  );

  const seenEmails = new Set<string>();
  const results: RowResult[] = [];
  const valid: any[] = [];

  table.rows.forEach((r, idx) => {
    const rowNo = idx + 2; // +1 for the header, +1 for 1-based counting
    const errors: string[] = [];
    const fullName = cell(r, "Full Name");

    if (!fullName) errors.push("Full Name is required");

    const rawJoining = cell(r, "Joining Date");
    const joining = parseSheetDate(rawJoining);
    if (!rawJoining) errors.push("Joining Date is required");
    else if (!joining)
      errors.push(`Joining Date "${rawJoining}" is not a date (use YYYY-MM-DD)`);

    const rawDob = cell(r, "Date of Birth");
    const dob = rawDob ? parseSheetDate(rawDob) : null;
    if (rawDob && !dob)
      errors.push(`Date of Birth "${rawDob}" is not a date (use YYYY-MM-DD)`);

    const rawEmail = cell(r, "Email");
    const email = rawEmail.toLowerCase();
    if (email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errors.push(`"${rawEmail}" is not a valid email`);
      } else if (takenEmails.has(email)) {
        errors.push(`An employee with email ${rawEmail} already exists`);
      } else if (seenEmails.has(email)) {
        errors.push(`Email ${rawEmail} appears more than once in this file`);
      }
      seenEmails.add(email);
    }

    const rawGender = cell(r, "Gender");
    if (rawGender && !GENDERS.has(rawGender.toLowerCase())) {
      errors.push(`Gender "${rawGender}" must be male, female or other`);
    }

    const lookup = (
      value: string,
      map: Map<string, any>,
      label: string,
    ): any | undefined => {
      if (!value) return undefined;
      const id = map.get(value.trim().toLowerCase());
      if (!id) errors.push(`${label} "${value}" does not exist — create it first`);
      return id;
    };
    const departmentId = lookup(cell(r, "Department"), deptMap, "Department");
    const designationId = lookup(cell(r, "Designation"), desigMap, "Designation");
    const employmentTypeId = lookup(
      cell(r, "Employment Type"),
      empTypeMap,
      "Employment Type",
    );

    let ctcAnnual: number | undefined;
    const rawCtc = cell(r, "Annual CTC");
    if (rawCtc) {
      const n = Number(rawCtc.replace(/[,\s₹]/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        errors.push(`Annual CTC "${rawCtc}" is not a number`);
      } else {
        ctcAnnual = n;
      }
    }

    results.push({ row: rowNo, fullName: fullName || "(no name)", errors });

    if (!errors.length) {
      valid.push({
        _rowNo: rowNo,
        fullName,
        joiningDate: joining,
        dob: dob || undefined,
        email: email || undefined,
        phone: cell(r, "Phone") || undefined,
        gender: rawGender ? rawGender.toLowerCase() : undefined,
        address: cell(r, "Address") || undefined,
        departmentId,
        designationId,
        employmentTypeId,
        bankName: cell(r, "Bank Name") || undefined,
        accountNumber: cell(r, "Account Number") || undefined,
        ifsc: cell(r, "IFSC") || undefined,
        pan: cell(r, "PAN") || undefined,
        aadhaar: cell(r, "Aadhaar") || undefined,
        uan: cell(r, "UAN") || undefined,
        ...(ctcAnnual !== undefined ? { salaryStructure: { ctcAnnual } } : {}),
      });
    }
  });

  const failedRows = results.filter((r) => r.errors.length);

  if (dryRun) {
    req.rData = {
      dryRun: true,
      totalRows: table.rows.length,
      wouldCreate: valid.length,
      failed: failedRows.length,
      errors: failedRows,
    };
    req.msg = "success";
    return next();
  }

  // Valid rows are written even when others failed. An all-or-nothing import
  // means one bad row in a hundred sends HR back to the spreadsheet with
  // nothing loaded; the per-row report says exactly which ones to fix and
  // re-upload.
  const created: { row: number; employeeCode: string; fullName: string }[] = [];
  for (const v of valid) {
    const { _rowNo, ...fields } = v;
    try {
      const seq = await nextSequence("hr_employee");
      const doc = await HrEmployee.create({
        ...fields,
        employeeCode: `HWE-${pad(seq)}`,
        status: "active",
        createdByAdminId: adminId,
      });
      created.push({
        row: _rowNo,
        employeeCode: doc.employeeCode,
        fullName: doc.fullName,
      });
    } catch (err: any) {
      failedRows.push({
        row: _rowNo,
        fullName: fields.fullName,
        errors: [err?.message || "Could not be saved"],
      });
    }
  }

  req.rData = {
    dryRun: false,
    totalRows: table.rows.length,
    created: created.length,
    failed: failedRows.length,
    createdRows: created,
    errors: failedRows,
  };
  req.msg = "success";
  return next();
};
