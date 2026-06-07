import { Request, Response } from "express";
import { Types } from "mongoose";
import * as EnterpriseService from "../services/enterprise.service";

/**
 * Request enterprise account
 */
export const requestEnterpriseAccount = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const {
      companyName,
      gstin,
      email,
      phone,
      contactPerson,
      address,
      district,
      state,
      pincode,
    } = req.body;

    if (
      !companyName ||
      !email ||
      !phone ||
      !contactPerson ||
      !address ||
      !district ||
      !state ||
      !pincode
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const enterprise = await EnterpriseService.createEnterpriseRequest(userId, {
      companyName,
      gstin,
      email,
      phone,
      contactPerson,
      address,
      district,
      state,
      pincode,
    });

    res.status(201).json({
      success: true,
      message: "Enterprise account request submitted successfully",
      data: enterprise,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create enterprise request",
    });
  }
};

/**
 * Get user's enterprise
 */
export const getMyEnterprise = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const result = await EnterpriseService.getUserEnterprise(userId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "No enterprise account found",
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch enterprise",
    });
  }
};

/**
 * Update enterprise details
 */
export const updateEnterprise = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { enterpriseId } = req.params as Record<string, string>;

    const enterprise = await EnterpriseService.updateEnterprise(
      new Types.ObjectId(enterpriseId),
      userId,
      req.body,
    );

    if (!enterprise) {
      return res.status(404).json({
        success: false,
        message: "Enterprise not found",
      });
    }

    res.json({
      success: true,
      message: "Enterprise updated successfully",
      data: enterprise,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update enterprise",
    });
  }
};

/**
 * Get enterprise dashboard
 */
export const getEnterpriseDashboard = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const userEnterprise = await EnterpriseService.getUserEnterprise(userId);
    if (!userEnterprise) {
      return res.status(404).json({
        success: false,
        message: "No enterprise account found",
      });
    }

    const dashboard = await EnterpriseService.getEnterpriseDashboard(
      (userEnterprise.enterprise as any)._id,
    );

    res.json({
      success: true,
      data: dashboard,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch dashboard",
    });
  }
};

/**
 * Get enterprise users
 */
export const getEnterpriseUsers = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { page = 1, limit = 20 } = req.query;

    const userEnterprise = await EnterpriseService.getUserEnterprise(userId);
    if (!userEnterprise) {
      return res.status(404).json({
        success: false,
        message: "No enterprise account found",
      });
    }

    const result = await EnterpriseService.getEnterpriseUsers(
      (userEnterprise.enterprise as any)._id,
      Number(page),
      Number(limit),
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch users",
    });
  }
};

/**
 * Add user to enterprise
 */
export const addEnterpriseUser = async (req: Request, res: Response) => {
  try {
    const adminUserId = (req as any).user._id;
    const { email, phone, role, permissions } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        message: "Role is required",
      });
    }

    const userEnterprise =
      await EnterpriseService.getUserEnterprise(adminUserId);
    if (!userEnterprise) {
      return res.status(404).json({
        success: false,
        message: "No enterprise account found",
      });
    }

    const enterpriseUser = await EnterpriseService.addEnterpriseUser(
      (userEnterprise.enterprise as any)._id,
      adminUserId,
      { email, phone, role, permissions: permissions || [] },
    );

    res.status(201).json({
      success: true,
      message: "User added to enterprise",
      data: enterpriseUser,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to add user",
    });
  }
};

/**
 * Remove user from enterprise
 */
export const removeEnterpriseUser = async (req: Request, res: Response) => {
  try {
    const adminUserId = (req as any).user._id;
    const { userId: targetUserId } = req.params as Record<string, string>;

    const userEnterprise =
      await EnterpriseService.getUserEnterprise(adminUserId);
    if (!userEnterprise) {
      return res.status(404).json({
        success: false,
        message: "No enterprise account found",
      });
    }

    const removed = await EnterpriseService.removeEnterpriseUser(
      (userEnterprise.enterprise as any)._id,
      adminUserId,
      new Types.ObjectId(targetUserId),
    );

    if (!removed) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.json({
      success: true,
      message: "User removed from enterprise",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to remove user",
    });
  }
};

/**
 * Get enterprise bookings
 */
export const getEnterpriseBookings = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const { startDate, endDate, status, page = 1, limit = 20 } = req.query;

    const userEnterprise = await EnterpriseService.getUserEnterprise(userId);
    if (!userEnterprise) {
      return res.status(404).json({
        success: false,
        message: "No enterprise account found",
      });
    }

    const result = await EnterpriseService.getEnterpriseBookings(
      (userEnterprise.enterprise as any)._id,
      {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        status: status as string,
      },
      Number(page),
      Number(limit),
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch bookings",
    });
  }
};

/**
 * Create booking using enterprise credit
 */
export const createCreditBooking = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;

    const userEnterprise = await EnterpriseService.getUserEnterprise(userId);
    if (!userEnterprise) {
      return res.status(404).json({
        success: false,
        message: "No enterprise account found",
      });
    }

    const booking = await EnterpriseService.createCreditBooking(
      (userEnterprise.enterprise as any)._id,
      userId,
      req.body,
    );

    res.status(201).json({
      success: true,
      message: "Booking created using enterprise credit",
      data: booking,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create booking",
    });
  }
};
