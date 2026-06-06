import { Request, Response } from "express";
import { Service } from "../models/service.model";

export const listServices = async (req: Request, res: Response) => {
  const { category } = req.query as { category?: string };
  const filter: Record<string, any> = { isActive: true };
  if (category) filter.category = category;

  const services = await Service.find(filter)
    .populate("category", "name slug icon ctaOptions")
    .sort({ sortOrder: 1, createdAt: -1 })
    .lean();
  res.set("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  res.locals.data = services;
};

export const getServiceBySlug = async (req: Request, res: Response) => {
  const service = await Service.findOne({
    slug: req.params.slug,
    isActive: true,
  }).populate("category", "name slug icon ctaOptions");
  if (!service) {
    return res
      .status(404)
      .json({ success: false, message: "Service not found" });
  }
  res.locals.data = service;
};

// Find services near a location (for location-based CTA actions)
export const getNearbyServices = async (req: Request, res: Response) => {
  const {
    lat,
    lng,
    maxDistance = 50000,
    category,
  } = req.query as {
    lat?: string;
    lng?: string;
    maxDistance?: string;
    category?: string;
  };

  if (!lat || !lng) {
    return res.status(400).json({
      success: false,
      message: "lat and lng are required",
    });
  }

  const filter: Record<string, any> = {
    isActive: true,
    "location.type": "Point",
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [Number(lng), Number(lat)],
        },
        $maxDistance: Number(maxDistance), // meters
      },
    },
  };

  if (category) filter.category = category;

  const services = await Service.find(filter)
    .populate("category", "name slug icon ctaOptions")
    .limit(50);
  res.locals.data = services;
};
