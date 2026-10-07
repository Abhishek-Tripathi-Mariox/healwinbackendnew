import { Request, Response, NextFunction } from "express";

import Attendance from "../../models/attendance.model";
import HrEmployee from "../../models/hr-employee.model";
import EmployeeShift from "../../models/employee-shift.model";
import { parseCsvTable, toCsv, normalizeHeader } from "../../services/csv";
import { defaultShiftFor } from "../../services/attendance.service";
import { computeDay } from "../../services/working-hours";

/**
 * Biometric attendance import.
 *
 * Some staff are marked by hand on the attendance screen; others punch a
 * biometric device, which exports a CSV. Re-keying a month of those punches
 * is both slow and the kind of work that quietly goes wrong — and attendance
 * feeds payroll loss-of-pay, so a mistyped day costs someone money.
 *
 * Two things make a device export different from a tidy spreadsheet, and both
 * are handled here rather than being left to whoever prepares the file:
 *
 *  • Devices emit ONE ROW PER PUNCH, so a person who steps out for lunch has
 *    four rows for one day. Rows are collapsed per employee-day to the
 *    earliest in and the latest out.
 *  • Devices record times, not decisions. A `Status` column is honoured when
 *    present; otherwise the day is derived from the hours worked against that
 *    person's shift, the same rule the attendance screen uses.
 *
 * The file spans whatever dates it contains — one day or a whole month — so
 * monthly import is simply the ordinary case rather than a separate mode.
 *
 * `dryRun` (the default) validates and reports without writing, because the
 * commit OVERWRITES existing days: that is the point of an import, but it
 * must never be a surprise, so the preview counts them separately.
 */

/** Refuse a file big enough to be a mistake rather than a month. */
const MAX_ROWS = 20000;

const COLUMN_DEFS: {
  label: string;
  required?: boolean;
  hint?: string;
  aliases?: string[];
}[] = [
  {
    label: "Employee Code",
    required: true,
    hint: "HWE-000058 — or put the person's email/phone in those columns instead",
    aliases: ["empcode", "code", "employeeid", "empid", "staffid"],
  },
  {
    label: "Date",
    required: true,
    hint: "YYYY-MM-DD or DD/MM/YYYY",
    aliases: ["attendancedate", "punchdate", "day"],
  },
  {
    label: "In Time",
    hint: "09:15, 9:15 AM, or a full timestamp",
    aliases: ["intime", "checkin", "punchin", "firstin", "in"],
  },
  {
    label: "Out Time",
    hint: "18:30",
    aliases: ["outtime", "checkout", "punchout", "lastout", "out"],
  },
  {
    label: "Status",
    hint: "optional — P / A / HD / L / H / WO. Left blank, it is worked out from the hours",
    aliases: ["attendancestatus", "remark1"],
  },
  { label: "Remarks", aliases: ["note", "notes", "comment"] },
  { label: "Email", aliases: ["emailid"] },
  { label: "Phone", aliases: ["mobile", "mobilenumber", "contact"] },
];

const COLUMNS = COLUMN_DEFS.map((c) => ({ ...c, key: normalizeHeader(c.label) }));

const cell = (row: Record<string, string>, label: string): string => {
  const def = COLUMNS.find((c) => c.label === label)!;
  if (row[def.key]) return row[def.key];
  for (const a of def.aliases || []) if (row[a]) return row[a];
  return "";
};

/**
 * A date as a person — or a device — writes it.
 *
 * `new Date("07/10/2026")` reads the American order, so an Indian export of
 * 7 October silently becomes 10 July. Both orders are parsed explicitly.
 */
export const parseSheetDate = (raw: string): Date | null => {
  const s = String(raw || "").trim();
  if (!s) return null;
  // Some devices put the whole timestamp in the date column.
  const datePart = s.split(/[ T]/)[0];

  let m = datePart.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = datePart.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month > 12) return null;
    const d = new Date(Number(m[3]), month - 1, day);
    return Number.isNaN(d.getTime()) || d.getDate() !== day ? null : d;
  }
  return null;
};

/**
 * A punch time as "HH:mm".
 *
 * Accepts "9:15", "09:15:32", "9:15 AM" and a full "2026-10-07 09:15:00",
 * because which of those a device emits depends on its export settings and
 * nobody should have to normalise a thousand cells by hand.
 */
export const parseClock = (raw: string): string | null => {
  const s = String(raw || "").trim();
  if (!s || /^(-+|n\/?a|--:--)$/i.test(s)) return null;

  // The clock sits at the END of the cell, preceded by the start of the
  // string, a space or a "T" — one rule that covers a bare "09:15", a
  // 12-hour "9:15 AM" and a full "2026-10-07 09:15:00". Splitting on the
  // space instead read the " AM" of "9:15 AM" as the time half of a
  // timestamp and threw the clock away.
  const m = s.match(/(?:^|[\sT])(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?\.?$/);
  if (!m) return null;

  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

/** What HR writes in a Status column, in every form they write it. */
const STATUS_ALIASES: Record<string, string> = {
  p: "present", present: "present", pr: "present", "1": "present",
  a: "absent", absent: "absent", ab: "absent", "0": "absent",
  hd: "half_day", half: "half_day", halfday: "half_day", "half day": "half_day",
  "0.5": "half_day", halfdayleave: "half_day",
  l: "leave", leave: "leave", cl: "leave", sl: "leave", el: "leave", pl: "leave",
  h: "holiday", holiday: "holiday", ho: "holiday",
  wo: "week_off", weekoff: "week_off", "week off": "week_off", wh: "week_off",
  off: "week_off", w: "week_off",
};

export const parseStatus = (raw: string): string | null => {
  const s = String(raw || "").trim().toLowerCase().replace(/[_-]+/g, "");
  if (!s) return null;
  return STATUS_ALIASES[s] ?? STATUS_ALIASES[s.replace(/\s+/g, "")] ?? null;
};

const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const dayStart = (d: Date): Date => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

/** GET /admin/hr/attendance/import/template */
export const template = async (_req: Request, res: Response) => {
  // Three example rows that show the two ways a day can be stated: punches
  // alone (status worked out from the hours) and an explicit status with no
  // punches, which is how leave and week offs arrive.
  const labels = COLUMNS.map((c) => c.label);
  const rows = [
    {
      "Employee Code": "HWE-000058",
      Date: "2026-10-01",
      "In Time": "09:12",
      "Out Time": "18:34",
      Status: "",
      Remarks: "",
      Email: "",
      Phone: "",
    },
    {
      "Employee Code": "HWE-000058",
      Date: "2026-10-02",
      "In Time": "",
      "Out Time": "",
      Status: "L",
      Remarks: "Casual leave",
      Email: "",
      Phone: "",
    },
    {
      "Employee Code": "HWE-000061",
      Date: "2026-10-01",
      "In Time": "08:58",
      "Out Time": "13:05",
      Status: "",
      Remarks: "left early",
      Email: "",
      Phone: "",
    },
  ];
  const csv = toCsv(labels, rows, labels);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="attendance-import-template.csv"',
  );
  return res.send(csv);
};

interface RowError {
  row: number;
  employee: string;
  date: string;
  errors: string[];
}

interface DayEntry {
  employeeId: string;
  employeeCode: string;
  name: string;
  date: Date;
  key: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string | null;
  remarks: string;
  /** Rows of the file that fed this day — devices emit one per punch. */
  rows: number[];
}

/**
 * POST /admin/hr/attendance/import
 *
 * Accepts an uploaded file or raw CSV text, so a pasted sheet can be
 * previewed without a round trip through a file.
 */
export const importAttendance = async (
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
    req.msg = "No file was uploaded.";
    req.rData = {};
    return next();
  }

  const table = parseCsvTable(text);
  if (table.rows.length === 0) {
    req.rCode = 0;
    req.msg = "That file has a header but no rows.";
    req.rData = { headers: table.headers };
    return next();
  }
  if (table.rows.length > MAX_ROWS) {
    req.rCode = 0;
    req.msg = `That file has ${table.rows.length} rows — more than the ${MAX_ROWS} this import accepts. Split it by month.`;
    req.rData = {};
    return next();
  }

  // Required columns must be PRESENT, not merely non-empty on row one: a file
  // exported with the wrong template should fail as a whole, with a readable
  // reason, rather than as a thousand identical row errors.
  const present = new Set(Object.keys(table.rows[0] || {}));
  const missingColumns = COLUMNS.filter(
    (c) => c.required && !present.has(c.key) && !(c.aliases || []).some((a) => present.has(a)),
  ).map((c) => c.label);
  if (missingColumns.length) {
    req.rCode = 0;
    req.msg = `This file is missing the ${missingColumns.join(" and ")} column${missingColumns.length > 1 ? "s" : ""}. Download the template to see the expected headings.`;
    req.rData = { headers: table.headers, missingColumns };
    return next();
  }

  // Everyone who could be referenced, indexed by every identifier a device
  // export might carry.
  const staff: any[] = await HrEmployee.find({ isDeleted: false })
    .select("fullName employeeCode email phone status")
    .lean();
  const byCode = new Map<string, any>();
  const byEmail = new Map<string, any>();
  const byPhone = new Map<string, any>();
  for (const e of staff) {
    if (e.employeeCode) byCode.set(String(e.employeeCode).trim().toLowerCase(), e);
    if (e.email) byEmail.set(String(e.email).trim().toLowerCase(), e);
    if (e.phone) byPhone.set(String(e.phone).replace(/\D/g, "").slice(-10), e);
  }

  const errors: RowError[] = [];
  const days = new Map<string, DayEntry>();
  const unknownCodes = new Set<string>();

  table.rows.forEach((r, idx) => {
    const rowNo = idx + 2; // +1 header, +1 for 1-based counting
    const rowErrors: string[] = [];

    const rawCode = cell(r, "Employee Code");
    const rawEmail = cell(r, "Email").toLowerCase();
    const rawPhone = cell(r, "Phone").replace(/\D/g, "").slice(-10);
    const emp =
      (rawCode && byCode.get(rawCode.trim().toLowerCase())) ||
      (rawEmail && byEmail.get(rawEmail)) ||
      (rawPhone.length === 10 && byPhone.get(rawPhone)) ||
      null;

    if (!rawCode && !rawEmail && !rawPhone) {
      rowErrors.push("Employee Code is required");
    } else if (!emp) {
      rowErrors.push(
        `No employee matches "${rawCode || rawEmail || rawPhone}" — check the code, or import the employee first`,
      );
      if (rawCode) unknownCodes.add(rawCode);
    }

    const rawDate = cell(r, "Date");
    const date = parseSheetDate(rawDate);
    if (!rawDate) rowErrors.push("Date is required");
    else if (!date) rowErrors.push(`Date "${rawDate}" is not a date (use YYYY-MM-DD)`);

    const rawIn = cell(r, "In Time");
    const rawOut = cell(r, "Out Time");
    const checkIn = parseClock(rawIn);
    const checkOut = parseClock(rawOut);
    if (rawIn && !checkIn) rowErrors.push(`In Time "${rawIn}" is not a time`);
    if (rawOut && !checkOut) rowErrors.push(`Out Time "${rawOut}" is not a time`);

    const rawStatus = cell(r, "Status");
    const status = parseStatus(rawStatus);
    if (rawStatus && !status) {
      rowErrors.push(`Status "${rawStatus}" is not one of P / A / HD / L / H / WO`);
    }

    if (rowErrors.length) {
      errors.push({
        row: rowNo,
        employee: rawCode || rawEmail || rawPhone || "—",
        date: rawDate,
        errors: rowErrors,
      });
      return;
    }

    const key = `${emp._id}|${ymd(date!)}`;
    const existing = days.get(key);
    if (!existing) {
      days.set(key, {
        employeeId: String(emp._id),
        employeeCode: emp.employeeCode,
        name: emp.fullName,
        date: dayStart(date!),
        key,
        checkIn,
        checkOut,
        status,
        remarks: cell(r, "Remarks"),
        rows: [rowNo],
      });
      return;
    }
    // Another punch for a day already seen. Earliest in, latest out — the
    // span of the working day, not whichever row happened to come last.
    if (checkIn && (!existing.checkIn || checkIn < existing.checkIn)) {
      existing.checkIn = checkIn;
    }
    if (checkOut && (!existing.checkOut || checkOut > existing.checkOut)) {
      existing.checkOut = checkOut;
    }
    if (status && !existing.status) existing.status = status;
    if (!existing.remarks) existing.remarks = cell(r, "Remarks");
    existing.rows.push(rowNo);
  });

  const entries = [...days.values()];
  if (entries.length === 0) {
    req.rCode = 0;
    req.msg = "Nothing in this file could be read. The problems are listed below.";
    req.rData = { dryRun, totalRows: table.rows.length, days: 0, failed: errors.length, errors: errors.slice(0, 200) };
    return next();
  }

  // --- shifts, resolved in bulk ----------------------------------------
  // One query for every roster override in range, plus one standing shift
  // per person. Calling resolveShiftFor per employee-day would be three
  // round trips for each of (people × days).
  const employeeIds = [...new Set(entries.map((e) => e.employeeId))];
  const dateKeys = entries.map((e) => ymd(e.date)).sort();
  const rosters: any[] = await EmployeeShift.find({
    employeeId: { $in: employeeIds },
    date: { $gte: dateKeys[0], $lte: dateKeys[dateKeys.length - 1] },
  })
    .populate("workShiftId")
    .lean();
  const rosterShift = new Map<string, any>();
  for (const r of rosters) {
    if (r.workShiftId && typeof r.workShiftId === "object") {
      rosterShift.set(`${r.employeeId}|${r.date}`, r.workShiftId);
    }
  }
  const standingShift = new Map<string, any>();
  await Promise.all(
    employeeIds.map(async (id) => standingShift.set(id, await defaultShiftFor(id))),
  );

  // Which of these days already carry a decision — the import overwrites
  // them, and the preview has to say how many before anyone commits.
  const existingRows: any[] = await Attendance.find({
    employeeId: { $in: employeeIds },
    date: { $in: entries.map((e) => e.date) },
  })
    .select("employeeId date")
    .lean();
  const alreadyMarked = new Set(
    existingRows.map((r) => `${r.employeeId}|${ymd(new Date(r.date))}`),
  );

  const ops: any[] = [];
  const preview: any[] = [];
  const warnings: string[] = [];
  let derived = 0;
  let noShift = 0;
  let oneSidedPunch = 0;

  for (const e of entries) {
    const shift =
      rosterShift.get(`${e.employeeId}|${ymd(e.date)}`) ||
      standingShift.get(e.employeeId) ||
      null;
    const computed = shift ? computeDay(e.checkIn, e.checkOut, shift) : null;

    if (!computed && (e.checkIn || e.checkOut)) {
      // One punch but not the other: the device missed it. Record what there
      // is, but it cannot yield hours — that day needs a regularization.
      oneSidedPunch += 1;
    }
    if (!shift && (e.checkIn || e.checkOut)) noShift += 1;

    let status = e.status;
    if (!status) {
      if (computed) {
        status = computed.derivedStatus;
        derived += 1;
      } else {
        // No status, no usable hours — the device has no record of them that
        // day, which is what absent means.
        status = "absent";
      }
    }

    preview.push({
      employeeCode: e.employeeCode,
      name: e.name,
      date: ymd(e.date),
      checkIn: e.checkIn,
      checkOut: e.checkOut,
      status,
      statusSource: e.status ? "file" : computed ? "hours" : "no punches",
      workedMinutes: computed?.workedMinutes ?? 0,
      overwrites: alreadyMarked.has(`${e.employeeId}|${ymd(e.date)}`),
      punches: e.rows.length,
    });

    if (dryRun) continue;

    const update: any = {
      $set: {
        status,
        checkIn: e.checkIn || undefined,
        checkOut: e.checkOut || undefined,
        remarks: e.remarks || undefined,
        markedByAdminId: adminId,
        shiftId: shift?._id,
        workedMinutes: computed?.workedMinutes || 0,
        overtimeMinutes: computed?.overtimeMinutes || 0,
        isLate: computed?.isLate || false,
      },
      $setOnInsert: { subjectType: "hr_employee" },
    };
    // Re-marking a leave day detaches it from the leave request, so a later
    // cancellation of that leave does not delete this correction with it.
    if (status !== "leave") update.$unset = { leaveRequestId: "" };

    ops.push({
      updateOne: {
        filter: { employeeId: e.employeeId, date: e.date },
        update,
        upsert: true,
      },
    });
  }

  if (oneSidedPunch) {
    warnings.push(
      `${oneSidedPunch} day${oneSidedPunch === 1 ? " has" : "s have"} only one punch, so no hours could be worked out. Those days need a regularization.`,
    );
  }
  if (noShift) {
    warnings.push(
      `${noShift} day${noShift === 1 ? "" : "s"} belong to someone with no shift assigned, so their hours stay at zero. Set a default shift or roster them.`,
    );
  }

  const dates = preview.map((p) => p.date).sort();
  const overwrites = preview.filter((p) => p.overwrites).length;
  const summary = {
    dryRun,
    totalRows: table.rows.length,
    days: entries.length,
    employees: employeeIds.length,
    from: dates[0],
    to: dates[dates.length - 1],
    newDays: entries.length - overwrites,
    overwrites,
    derivedFromHours: derived,
    failed: errors.length,
    unknownCodes: [...unknownCodes].slice(0, 50),
    warnings,
    // Capped: a month for a large team is thousands of rows and the screen
    // only ever shows a sample.
    errors: errors.slice(0, 200),
    preview: preview.slice(0, 200),
  };

  if (dryRun) {
    req.rData = summary;
    req.msg = "checked";
    return next();
  }

  if (ops.length) await Attendance.bulkWrite(ops, { ordered: false });
  req.rData = { ...summary, imported: ops.length };
  req.msg = `${ops.length} day${ops.length === 1 ? "" : "s"} of attendance imported.`;
  return next();
};

export default { template, importAttendance };
