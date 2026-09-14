import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import CompOff from "../../models/comp-off.model";
import Holiday from "../../models/holiday.model";
import HrEmployee from "../../models/hr-employee.model";
import Attendance from "../../models/attendance.model";
import { paginate } from "../../utils/paginate.util";

/**
 * Compensatory off.
 *
 * The hospital does not close for public holidays, so nobody gets the day off
 * automatically — staff rostered on a holiday work it and HR grants them a day
 * back afterwards. Granting is deliberately manual: only HR knows who actually
 * turned up, and crediting everyone on the roster would hand days to people who
 * were on leave that week.
 */

const dayStart = (input: Date | string): Date => {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * GET /admin/hr/comp-off/worked?date=YYYY-MM-DD
 *
 * Who worked a given holiday, and whether they have already been credited for
 * it. This is what makes the manual grant workable — otherwise HR is comparing
 * a roster against an attendance sheet by eye.
 */
export const worked = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const raw = String(req.query.date || "");
  const date = raw ? dayStart(raw) : null;
  if (!date || Number.isNaN(date.getTime())) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "date (YYYY-MM-DD) is required" };
    return next();
  }

  const holiday = await Holiday.findOne({
    date,
    isActive: true,
  })
    .select("name type isWorkingDay")
    .lean();

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  // Present or half-day only. Someone marked absent or on leave that day did
  // not work it and is owed nothing.
  const rows = await Attendance.find({
    subjectType: "hr_employee",
    date: { $gte: date, $lte: end },
    status: { $in: ["present", "half_day"] },
  })
    .select("employeeId status workedMinutes")
    .populate("employeeId", "fullName employeeCode departmentId designationId")
    .lean();

  const ids = rows.map((r: any) => r.employeeId?._id).filter(Boolean);
  const credited = await CompOff.find({
    employeeId: { $in: ids },
    workedOn: date,
    status: { $in: ["available", "used"] },
  })
    .select("employeeId days")
    .lean();
  const creditedBy = new Map(
    credited.map((c: any) => [String(c.employeeId), c.days]),
  );

  req.rData = {
    date,
    holiday: holiday || null,
    items: rows
      .filter((r: any) => r.employeeId)
      .map((r: any) => ({
        employeeId: r.employeeId._id,
        fullName: r.employeeId.fullName,
        employeeCode: r.employeeId.employeeCode,
        status: r.status,
        workedMinutes: r.workedMinutes || 0,
        // A half shift earns half a day back.
        suggestedDays: r.status === "half_day" ? 0.5 : 1,
        alreadyCredited: creditedBy.get(String(r.employeeId._id)) ?? null,
      })),
  };
  req.msg = "success";
  return next();
};

/** POST /admin/hr/comp-off — grant one or more credits. */
export const grant = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const b = req.body || {};
  const workedOn = b.workedOn ? dayStart(b.workedOn) : null;
  if (!workedOn || Number.isNaN(workedOn.getTime())) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "workedOn (YYYY-MM-DD) is required" };
    return next();
  }
  if (workedOn > dayStart(new Date())) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "A compensatory off cannot be granted for a day that has not happened yet." };
    return next();
  }

  // One employee, or several at once from the "who worked" list.
  const entries: { employeeId: string; days?: number }[] = Array.isArray(b.entries)
    ? b.entries
    : b.employeeId
      ? [{ employeeId: b.employeeId, days: b.days }]
      : [];
  if (!entries.length) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "employeeId (or a non-empty entries list) is required" };
    return next();
  }

  const holiday = await Holiday.findOne({ date: workedOn, isActive: true })
    .select("_id name")
    .lean();

  const granted: any[] = [];
  const skipped: { employeeId: string; reason: string }[] = [];

  for (const e of entries) {
    const days = Number(e.days ?? 1);
    if (!Number.isFinite(days) || days < 0.5 || days > 5) {
      skipped.push({ employeeId: String(e.employeeId), reason: "days must be between 0.5 and 5" });
      continue;
    }
    if (!Types.ObjectId.isValid(String(e.employeeId))) {
      skipped.push({ employeeId: String(e.employeeId), reason: "invalid employee" });
      continue;
    }
    try {
      const doc = await CompOff.create({
        employeeId: e.employeeId,
        workedOn,
        holidayId: holiday?._id,
        days,
        reason: b.reason || (holiday ? `Worked on ${holiday.name}` : undefined),
        grantedByAdminId: adminId,
      });
      granted.push(doc);
    } catch (err: any) {
      // The unique index is the guard against granting the same day twice —
      // easy to do when the same holiday is reviewed by two people.
      if (err?.code === 11000) {
        skipped.push({
          employeeId: String(e.employeeId),
          reason: "already credited for this day",
        });
      } else {
        throw err;
      }
    }
  }

  req.rData = {
    granted: granted.length,
    skipped,
    holiday: holiday?.name || null,
  };
  req.msg = granted.length ? "saved" : "validation_failed";
  if (!granted.length) req.rCode = 0;
  return next();
};

/** GET /admin/hr/comp-off?employeeId=&status= — the ledger. */
export const list = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const query: any = {};
  if (req.query.employeeId) query.employeeId = req.query.employeeId;
  if (req.query.status) query.status = req.query.status;

  const { items, pagination } = await paginate(
    CompOff,
    query,
    req,
    { createdAt: -1 },
    [
      { path: "employeeId", select: "fullName employeeCode" },
      { path: "grantedByAdminId", select: "fullName email" },
    ],
  );
  req.rData = { items, pagination };
  req.msg = "success";
  return next();
};

/**
 * GET /admin/hr/comp-off/balance/:employeeId — days owed and days taken.
 */
export const balance = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const employeeId = String(req.params.employeeId);
  const rows = await CompOff.find({
    employeeId,
    status: { $in: ["available", "used"] },
  })
    .select("days used workedOn status")
    .sort({ workedOn: -1 })
    .lean();

  const credited = rows.reduce((s, r: any) => s + (r.days || 0), 0);
  const used = rows.reduce((s, r: any) => s + (r.used || 0), 0);
  req.rData = {
    credited,
    used,
    balance: Math.round((credited - used) * 100) / 100,
    entries: rows,
  };
  req.msg = "success";
  return next();
};

/** DELETE /admin/hr/comp-off/:id — cancel a credit granted in error. */
export const cancel = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const doc = await CompOff.findById(req.params.id);
  if (!doc) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }
  if (doc.used > 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = {
      hint: "Part of this credit has already been taken as leave, so it cannot be cancelled.",
    };
    return next();
  }
  // Cancelled rather than deleted: the record of the grant and who made it is
  // worth keeping, and the partial index stops it blocking a re-grant.
  doc.status = "cancelled";
  await doc.save();
  req.rData = { cancelled: true };
  req.msg = "deleted";
  return next();
};
