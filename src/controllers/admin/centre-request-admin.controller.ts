import { Request, Response } from "express";
import { CentreRequest } from "../../models/centre-request.model";
import { Centre } from "../../models/centre.model";
import { paginate } from "../../utils/paginate.util";

export const getAllCentreRequests = async (req: Request, res: Response) => {
  const { status, q, state, district } = req.query as {
    status?: string;
    q?: string;
    state?: string;
    district?: string;
  };
  const filter: Record<string, any> = {};
  if (status && status !== "all") filter.status = status;
  if (state) filter.state = { $regex: state, $options: "i" };
  if (district) filter.district = { $regex: district, $options: "i" };
  if (q) {
    filter.$or = [
      { name: { $regex: q, $options: "i" } },
      { address: { $regex: q, $options: "i" } },
      { contactPerson: { $regex: q, $options: "i" } },
    ];
  }
  const result = await paginate(CentreRequest, filter, req, { createdAt: -1 }, [
    { path: "division", select: "name" },
    { path: "serviceTypes", select: "name slug icon" },
    { path: "departments", select: "name" },
  ]);
  res.locals.data = result;
};

export const getCentreRequestById = async (req: Request, res: Response) => {
  const item = await CentreRequest.findById(req.params.id)
    .populate("division", "name")
    .populate("serviceTypes", "name slug icon")
    .populate("departments", "name");
  if (!item)
    return res
      .status(404)
      .json({ success: false, message: "Centre request not found" });
  res.locals.data = item;
};

export const approveCentreRequest = async (req: Request, res: Response) => {
  const request = await CentreRequest.findById(req.params.id);
  if (!request)
    return res
      .status(404)
      .json({ success: false, message: "Centre request not found" });

  if (request.status === "approved")
    return res
      .status(400)
      .json({ success: false, message: "Request is already approved" });

  const { state, district } = req.body;
  if (!state || !district)
    return res.status(400).json({
      success: false,
      message: "State and district must be selected to approve",
    });

  // Create Centre from the request data
  const centre = new Centre({
    name: request.name,
    type: request.type,
    address: request.address,
    state,
    district,
    division: request.division || undefined,
    location: request.location,
    phone: request.phone,
    email: request.email,
    website: request.website,
    serviceTypes: request.serviceTypes,
    departments: request.departments,
    services: request.services,
    rating: request.rating,
    timings: request.timings,
    image: request.image,
    info: request.info,
    isActive: true,
  });
  await centre.save();

  // Update request status
  request.status = "approved";
  request.adminNote = req.body.adminNote || "";
  await request.save();

  res.locals.data = request;
};

export const rejectCentreRequest = async (req: Request, res: Response) => {
  const request = await CentreRequest.findById(req.params.id);
  if (!request)
    return res
      .status(404)
      .json({ success: false, message: "Centre request not found" });

  request.status = "rejected";
  request.adminNote = req.body.adminNote || "";
  await request.save();

  res.locals.data = request;
};

export const deleteCentreRequest = async (req: Request, res: Response) => {
  const request = await CentreRequest.findByIdAndDelete(req.params.id);
  if (!request)
    return res
      .status(404)
      .json({ success: false, message: "Centre request not found" });
  res.locals.data = { message: "Deleted successfully" };
};
