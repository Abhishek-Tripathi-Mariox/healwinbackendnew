import { Request, Response, NextFunction } from "express";
import { Admin } from "../../models/admin.model";
import HrEmployee from "../../models/hr-employee.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import Driver from "../../models/driver.model";
import { escapeRegex } from "../../utils/helpers";
import { Types } from "mongoose";

/**
 * Everyone who works for HealWin, in one list.
 *
 * Ambulance crew, panel admins and ride drivers are HealWin's employees just
 * as much as the HR records are — they simply live in different collections
 * because each carries things the others do not (a driver has a licence and a
 * duty state; an admin has a role and permissions). Splitting the *screens*
 * along those storage lines made the panel look as though a driver were not
 * staff at all.
 *
 * So this presents one roster over four sources. It deliberately does NOT
 * merge the data: the crew collection is what the driver app authenticates
 * against and what emergency dispatch assigns from, and moving it would put
 * dispatch at risk to tidy up a menu.
 *
 * Each row says where it came from (`type`, `sourceId`) and who may edit it
 * (`editableAs`), so the screen can offer the right form for that person.
 */

export type PersonType =
  | "hr_employee"
  | "ambulance_driver"
  | "ambulance_attendant"
  | "admin"
  | "doctor"
  | "ride_driver";

export interface PersonRow {
  type: PersonType;
  sourceId: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  /** The system role from Roles & Permissions. Empty when they have no login. */
  role: string;
  /** A doctor's speciality — free text, deliberately NOT the role. */
  speciality?: string;
  department?: string;
  designation?: string;
  category?: string;
  status: string;
  /**
   * True when this employee also has a panel login. Worth showing: it is the
   * difference between someone who merely exists on the payroll and someone
   * who can sign in and act.
   */
  hasPanelLogin?: boolean;
  /** Which form the screen should open to edit this person. */
  editableAs: "hr" | "crew" | "admin" | "ride_driver";
}

const TYPE_LABEL: Record<PersonType, string> = {
  hr_employee: "HR Staff",
  ambulance_driver: "Ambulance Driver",
  ambulance_attendant: "Ambulance Attendant",
  admin: "Panel Admin",
  doctor: "Doctor",
  ride_driver: "Ride Driver",
};

/**
 * A source of people.
 *
 * `count` and `fetch` are kept separate so a page can be served by reading
 * only the segment it actually falls in — see the pagination note below.
 */
interface Segment {
  /** Types this segment can produce, for the type filter. */
  types: PersonType[];
  count: (f: Filters) => Promise<number>;
  fetch: (f: Filters, skip: number, limit: number) => Promise<PersonRow[]>;
}

interface Filters {
  q: string;
  status: string;
  departmentId: string;
  designationId: string;
}

/** Status shared across sources: the collections spell it differently. */
const matchesStatus = (status: string, active: boolean): boolean =>
  !status || (status === "active" ? active : !active);

const hrSegment: Segment = {
  types: ["hr_employee"],
  count: (f) => HrEmployee.countDocuments(hrQuery(f)),
  fetch: async (f, skip, limit) => {
    const rows: any[] = await HrEmployee.find(hrQuery(f))
      .select("fullName employeeCode email phone status category departmentId designationId linkedAdminId")
      .populate("departmentId", "name")
      .populate("designationId", "name")
      .populate("linkedAdminId", "roleName doctorProfile.speciality")
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
    return rows.map((e) => {
      /**
       * Role means the system role, and nothing else.
       *
       * This column used to show whatever it could find: a doctor's free-text
       * speciality ("Cardiologist", "mind se related"), or the HR designation,
       * or the literal word "Employee" when both were blank. Three different
       * kinds of thing under one heading, none of them a role — so the column
       * could not be trusted or filtered on. It now shows the role defined
       * under Roles & Permissions, and is empty for someone who has no panel
       * login to carry one. Speciality and designation have columns of their
       * own.
       */
      const linked = e.linkedAdminId;
      return {
        type: "hr_employee" as const,
        sourceId: String(e._id),
        code: e.employeeCode || "",
        name: e.fullName,
        email: e.email,
        phone: e.phone,
        role: linked?.roleName || "",
        speciality: linked?.doctorProfile?.speciality,
        department: e.departmentId?.name,
        designation: e.designationId?.name,
        category: e.category,
        status: e.status || "active",
        hasPanelLogin: !!linked,
        editableAs: "hr" as const,
      };
    });
  },
};

const hrQuery = (f: Filters): any => {
  const q: any = { isDeleted: false };
  if (f.status) q.status = f.status;
  if (f.departmentId) q.departmentId = f.departmentId === "none" ? null : f.departmentId;
  if (f.designationId) q.designationId = f.designationId === "none" ? null : f.designationId;
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), "i");
    q.$or = [{ fullName: rx }, { employeeCode: rx }, { email: rx }, { phone: rx }];
  }
  return q;
};

const crewQuery = (f: Filters): any => {
  const q: any = { isDeleted: { $ne: true } };
  if (f.status) q.isActive = f.status === "active";
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), "i");
    q.$or = [{ fullName: rx }, { mobileNumber: rx }];
  }
  return q;
};

const crewSegment: Segment = {
  types: ["ambulance_driver", "ambulance_attendant"],
  // Department and designation are HR concepts the crew collection does not
  // carry, so filtering by them means this segment has nothing to offer.
  count: (f) =>
    f.departmentId || f.designationId
      ? Promise.resolve(0)
      : AmbulanceStaff.countDocuments(crewQuery(f)),
  fetch: async (f, skip, limit) => {
    if (f.departmentId || f.designationId) return [];
    const rows: any[] = await AmbulanceStaff.find(crewQuery(f))
      .select("fullName mobileNumber role isActive licenseNumber providerId hospitalId")
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
    return rows.map((s) => ({
      type: (s.role === "attendant" ? "ambulance_attendant" : "ambulance_driver") as PersonType,
      sourceId: String(s._id),
      code: "",
      name: s.fullName,
      phone: s.mobileNumber,
      role: "",
      department: "Ambulance",
      status: s.isActive ? "active" : "inactive",
      editableAs: "crew" as const,
    }));
  },
};

const adminQuery = (f: Filters): any => {
  const q: any = { isDeleted: { $ne: true } };
  if (f.status) q.isActive = f.status === "active";
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), "i");
    q.$or = [{ fullName: rx }, { email: rx }, { phone: rx }];
  }
  return q;
};

/**
 * Admins who already appear as an HR employee.
 *
 * Creating a panel login now also creates the HR record and links it, so
 * almost every admin has one. Listing both would show the same person twice —
 * once with their department and payroll, once without — and make the
 * headcount wrong. The HR row wins: it carries more, and its Role column
 * already shows the panel role.
 */
const linkedAdminIds = async (): Promise<Types.ObjectId[]> => {
  const rows = await HrEmployee.find({
    isDeleted: false,
    linkedAdminId: { $ne: null },
  })
    .select("linkedAdminId")
    .lean();
  return rows.map((r: any) => r.linkedAdminId).filter(Boolean);
};

const adminQueryExcludingLinked = async (f: Filters): Promise<any> => {
  const q = adminQuery(f);
  const linked = await linkedAdminIds();
  if (linked.length) q._id = { $nin: linked };
  return q;
};

const adminSegment: Segment = {
  types: ["admin", "doctor"],
  count: async (f) =>
    f.departmentId || f.designationId
      ? 0
      : Admin.countDocuments(await adminQueryExcludingLinked(f)),
  fetch: async (f, skip, limit) => {
    if (f.departmentId || f.designationId) return [];
    const rows: any[] = await Admin.find(await adminQueryExcludingLinked(f))
      .select("fullName email phone roleName isActive doctorProfile.speciality")
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
    return rows.map((a) => {
      const isDoctor = a.roleName === "Doctor";
      return {
        type: (isDoctor ? "doctor" : "admin") as PersonType,
        sourceId: String(a._id),
        code: "",
        name: a.fullName,
        email: a.email,
        phone: a.phone,
        role: a.roleName || "",
        speciality: a.doctorProfile?.speciality,
        status: a.isActive ? "active" : "inactive",
        editableAs: "admin" as const,
      };
    });
  },
};

const driverQuery = (f: Filters): any => {
  const q: any = { isDeleted: { $ne: true } };
  if (f.status) q.isActive = f.status === "active";
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), "i");
    q.$or = [{ fullName: rx }, { mobileNumber: rx }];
  }
  return q;
};

const rideDriverSegment: Segment = {
  types: ["ride_driver"],
  count: (f) =>
    f.departmentId || f.designationId
      ? Promise.resolve(0)
      : Driver.countDocuments(driverQuery(f)),
  fetch: async (f, skip, limit) => {
    if (f.departmentId || f.designationId) return [];
    const rows: any[] = await Driver.find(driverQuery(f))
      .select("fullName mobileNumber status isActive")
      .sort({ fullName: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
    return rows.map((d) => ({
      type: "ride_driver" as PersonType,
      sourceId: String(d._id),
      code: "",
      name: d.fullName,
      phone: d.mobileNumber,
      role: "",
      status: d.isActive === false ? "inactive" : d.status || "active",
      editableAs: "ride_driver" as const,
    }));
  },
};

/** In display order — also the order pages walk through. */
const SEGMENTS: { key: string; seg: Segment }[] = [
  { key: "hr", seg: hrSegment },
  { key: "crew", seg: crewSegment },
  { key: "admin", seg: adminSegment },
  { key: "ride_driver", seg: rideDriverSegment },
];

/** GET /admin/people */
export const list = async (req: Request, _res: Response, next: NextFunction) => {
  const page = Math.max(1, parseInt(String(req.query.page || "1"), 10));
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || "25"), 10)));
  const type = String(req.query.type || "");

  const filters: Filters = {
    q: String(req.query.q || req.query.search || "").trim(),
    status: String(req.query.status || ""),
    departmentId: String(req.query.departmentId || ""),
    designationId: String(req.query.designationId || ""),
  };

  // Only the segments that can produce the requested type.
  const active = type
    ? SEGMENTS.filter(({ seg }) => seg.types.includes(type as PersonType))
    : SEGMENTS;

  const counts = await Promise.all(active.map(({ seg }) => seg.count(filters)));
  const total = counts.reduce((a, b) => a + b, 0);

  /**
   * Paged one segment at a time.
   *
   * Sorting the whole roster by name would mean reading every person from
   * every collection on every request just to slice out twenty of them — the
   * thing that stops working once there are a hundred thousand employees.
   * Grouping by source and sorting by name *within* each group keeps a page
   * to at most a couple of indexed queries, and reads naturally: HR staff,
   * then ambulance crew, then panel admins, then ride drivers.
   */
  const items: PersonRow[] = [];
  let offset = (page - 1) * limit;
  let remaining = limit;

  for (let i = 0; i < active.length && remaining > 0; i++) {
    const size = counts[i];
    if (offset >= size) {
      offset -= size; // this whole segment sits before the page
      continue;
    }
    const rows = await active[i].seg.fetch(filters, offset, remaining);
    const wanted = type ? rows.filter((r) => r.type === type) : rows;
    items.push(...wanted.slice(0, remaining));
    remaining -= wanted.length;
    offset = 0; // subsequent segments start from their beginning
  }

  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    typeLabels: TYPE_LABEL,
  };
  req.msg = "success";
  return next();
};

/** GET /admin/people/counts — how many of each type, for the filter chips. */
export const counts = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const empty: Filters = { q: "", status: "", departmentId: "", designationId: "" };
  const [hr, crewRows, admins, drivers] = await Promise.all([
    HrEmployee.countDocuments(hrQuery(empty)),
    AmbulanceStaff.find(crewQuery(empty)).select("role").lean(),
    // Excluding linked ones, so the chips add up to the list.
    Admin.find(await adminQueryExcludingLinked(empty)).select("roleName").lean(),
    Driver.countDocuments(driverQuery(empty)),
  ]);

  const byType: Record<string, number> = {
    hr_employee: hr,
    ambulance_driver: (crewRows as any[]).filter((s) => s.role !== "attendant").length,
    ambulance_attendant: (crewRows as any[]).filter((s) => s.role === "attendant").length,
    doctor: (admins as any[]).filter((a) => a.roleName === "Doctor").length,
    admin: (admins as any[]).filter((a) => a.roleName !== "Doctor").length,
    ride_driver: drivers,
  };
  req.rData = {
    byType,
    total: Object.values(byType).reduce((a, b) => a + b, 0),
    typeLabels: TYPE_LABEL,
  };
  req.msg = "success";
  return next();
};
