import { Request, Response } from "express";
import { CentreRequest } from "../models/centre-request.model";
import { uploadFileToAws } from "../utils/s3";

export const submitCentreRequest = async (req: Request, res: Response) => {
  const {
    name,
    address,
    state,
    district,
    division,
    location,
    lat,
    lng,
    phone,
    email,
    website,
    serviceTypes,
    departments,
    services,
    timings,
    info,
    contactPerson,
    contactPhone,
    contactEmail,
  } = req.body;

  if (
    !name ||
    !address ||
    !state ||
    !district ||
    !contactPerson ||
    !contactPhone
  ) {
    return res.status(400).json({
      success: false,
      message:
        "Name, address, state, district, contact person and contact phone are required",
    });
  }

  let imageUrl = "";
  const imageFile = (req.file as Express.Multer.File | undefined) ?? undefined;
  if (imageFile) {
    const uploadResult = await uploadFileToAws([imageFile]);
    imageUrl = uploadResult.images as string;
  }

  let parsedLocation = {
    type: "Point" as const,
    coordinates: [0, 0] as [number, number],
  };
  try {
    const loc = typeof location === "string" ? JSON.parse(location) : location;
    if (loc && loc.coordinates && loc.coordinates.length === 2) {
      parsedLocation = {
        type: "Point",
        coordinates: [Number(loc.coordinates[0]), Number(loc.coordinates[1])],
      };
    } else if (lat && lng) {
      parsedLocation = {
        type: "Point",
        coordinates: [Number(lng), Number(lat)],
      };
    }
  } catch {}

  let parsedServiceTypes: string[] = [];
  try {
    parsedServiceTypes =
      typeof serviceTypes === "string"
        ? JSON.parse(serviceTypes)
        : serviceTypes || [];
  } catch {
    parsedServiceTypes = [];
  }

  let parsedDepartments: string[] = [];
  try {
    parsedDepartments =
      typeof departments === "string"
        ? JSON.parse(departments)
        : departments || [];
  } catch {
    parsedDepartments = [];
  }

  let parsedServices: string[] = [];
  try {
    parsedServices =
      typeof services === "string" ? JSON.parse(services) : services || [];
  } catch {
    parsedServices = [];
  }

  const centreRequest = new CentreRequest({
    name,
    type: "other",
    address,
    state,
    district,
    division: division || undefined,
    location: parsedLocation,
    phone: phone || "",
    email: email || "",
    website: website || "",
    serviceTypes: parsedServiceTypes,
    departments: parsedDepartments,
    services: parsedServices.filter((s: string) => s && s.trim()),
    timings: timings || "",
    image: imageUrl,
    info: info || "",
    contactPerson,
    contactPhone,
    contactEmail: contactEmail || "",
    status: "pending",
  });
  await centreRequest.save();

  res.locals.data = {
    message:
      "Your centre listing request has been submitted successfully. It will be reviewed by our team.",
    requestId: centreRequest._id,
  };
};
