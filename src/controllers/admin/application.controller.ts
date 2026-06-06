import { Request, Response } from "express";
import { CareerApplication } from "../../models/career-application.model";
import { sendApplicationStatusUpdate } from "../../services/email.service";
import { paginate } from "../../utils/paginate.util";

export const getAllApplications = async (req: Request, res: Response) => {
  const { status, careerId, q, gender, department, dateFrom, dateTo } =
    req.query as {
      status?: string;
      careerId?: string;
      q?: string;
      gender?: string;
      department?: string;
      dateFrom?: string;
      dateTo?: string;
    };

  const filter: Record<string, any> = {};
  if (status) filter.status = status;
  if (careerId) filter.careerId = careerId;
  if (gender) filter.gender = gender;
  if (department) filter.department = department;

  if (dateFrom || dateTo) {
    filter.appliedAt = {};
    if (dateFrom) filter.appliedAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.appliedAt.$lte = end;
    }
  }

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ];
  }

  const result = await paginate(
    CareerApplication,
    filter,
    req,
    { appliedAt: -1 },
    [
      { path: "careerId", select: "title department location" },
      { path: "selectedStates", select: "name" },
      { path: "selectedDistricts", select: "name" },
    ],
  );

  res.locals.data = result;
};

export const getApplicationById = async (req: Request, res: Response) => {
  const application = await CareerApplication.findById(req.params.id)
    .populate("careerId", "title department location")
    .populate("selectedStates", "name")
    .populate("selectedDistricts", "name");

  if (!application) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }

  res.locals.data = application;
};

export const updateApplicationStatus = async (req: Request, res: Response) => {
  const { status } = req.body as { status?: string };
  if (!status) {
    return res
      .status(400)
      .json({ success: false, message: "Status is required" });
  }

  // Get old status before updating
  const existingApp = await CareerApplication.findById(req.params.id);
  if (!existingApp) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }
  const oldStatus = existingApp.status;

  const application = await CareerApplication.findByIdAndUpdate(
    req.params.id,
    { status },
    { returnDocument: "after" },
  )
    .populate("careerId", "title department location")
    .populate("selectedStates", "name")
    .populate("selectedDistricts", "name");

  if (!application) {
    return res
      .status(404)
      .json({ success: false, message: "Application not found" });
  }

  // Send status update email to candidate (non-blocking)
  if (oldStatus !== status) {
    sendApplicationStatusUpdate({
      candidateName: application.name,
      candidateEmail: application.email,
      position:
        application.position || (application.careerId as any)?.title || "",
      department:
        application.department ||
        (application.careerId as any)?.department ||
        "",
      applicationId: application._id.toString(),
      applicationNumber: application.applicationNumber || "",
      oldStatus,
      newStatus: status,
    }).catch((err) =>
      console.error("Failed to send status update email:", err),
    );
  }

  res.locals.data = application;
};

export const exportApplications = async (req: Request, res: Response) => {
  const { status, careerId, q, gender, department, dateFrom, dateTo } =
    req.query as {
      status?: string;
      careerId?: string;
      q?: string;
      gender?: string;
      department?: string;
      dateFrom?: string;
      dateTo?: string;
    };

  const filter: Record<string, any> = {};
  if (status) filter.status = status;
  if (careerId) filter.careerId = careerId;
  if (gender) filter.gender = gender;
  if (department) filter.department = department;

  if (dateFrom || dateTo) {
    filter.appliedAt = {};
    if (dateFrom) filter.appliedAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      filter.appliedAt.$lte = end;
    }
  }

  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { email: { $regex: q, $options: "i" } },
      { phone: { $regex: q, $options: "i" } },
    ];
  }

  const applications = await CareerApplication.find(filter)
    .populate("careerId", "title department location")
    .populate("selectedStates", "name")
    .populate("selectedDistricts", "name")
    .sort({ appliedAt: -1 });

  // Build CSV/JSON export data with S3 URLs for documents
  const rows = applications.map((app: any) => ({
    Name: app.name,
    Email: app.email,
    Phone: app.phone,
    DOB: app.dob ? new Date(app.dob).toLocaleDateString("en-IN") : "",
    Gender: app.gender || "",
    "Marital Status": app.maritalStatus || "",
    Address: app.address || "",
    Department: app.department || app.careerId?.department || "",
    Position: app.position || app.careerId?.title || "",
    Status: app.status,
    "Applied On": new Date(app.appliedAt).toLocaleDateString("en-IN"),
    "Resume URL": app.resumeUrl || "",
    "Passport Photo URL": app.passportPhotoUrl || "",
    "ID Proof URL": app.idProofUrl || "",
    "Educational Certificates URL": app.educationalCertificatesUrl || "",
    "Professional Registration URL": app.professionalRegistrationUrl || "",
    "Experience Certificates URL": app.experienceCertificatesUrl || "",
    "Other Documents URL": app.otherDocumentsUrl || "",
    "Selected States": (app.selectedStates || [])
      .map((s: any) => s.name)
      .join(", "),
    "Selected Districts": (app.selectedDistricts || [])
      .map((d: any) => d.name)
      .join(", "),
  }));

  res.locals.data = rows;
};
