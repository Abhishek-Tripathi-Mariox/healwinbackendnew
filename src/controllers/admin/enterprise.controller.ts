import { Request, Response } from "express";
import { Types } from "mongoose";
import * as EnterpriseService from "../../services/enterprise.service";

/**
 * Get all enterprises
 */
export const getAllEnterprises = async (req: Request, res: Response) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;

    const result = await EnterpriseService.getAllEnterprises(
      {
        status: status as string,
        search: search as string,
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
      message: error.message || "Failed to fetch enterprises",
    });
  }
};

/**
 * Get enterprise by ID
 */
export const getEnterpriseById = async (req: Request, res: Response) => {
  try {
    const { enterpriseId } = req.params;

    const enterprise = await EnterpriseService.getEnterpriseById(
      new Types.ObjectId(enterpriseId),
    );

    if (!enterprise) {
      return res.status(404).json({
        success: false,
        message: "Enterprise not found",
      });
    }

    // Get additional stats
    const dashboard = await EnterpriseService.getEnterpriseDashboard(
      new Types.ObjectId(enterpriseId),
    );

    res.json({
      success: true,
      data: {
        enterprise,
        stats: dashboard.stats,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch enterprise",
    });
  }
};

/**
 * Approve enterprise
 */
export const approveEnterprise = async (req: Request, res: Response) => {
  try {
    const adminId = (req as any).admin._id;
    const { enterpriseId } = req.params;
    const { creditLimit, discountPercentage, paymentTerms } = req.body;

    if (!creditLimit || discountPercentage === undefined || !paymentTerms) {
      return res.status(400).json({
        success: false,
        message:
          "Credit limit, discount percentage, and payment terms are required",
      });
    }

    const enterprise = await EnterpriseService.approveEnterprise(
      new Types.ObjectId(enterpriseId),
      adminId,
      creditLimit,
      discountPercentage,
      paymentTerms,
    );

    if (!enterprise) {
      return res.status(404).json({
        success: false,
        message: "Enterprise not found",
      });
    }

    res.json({
      success: true,
      message: "Enterprise approved successfully",
      data: enterprise,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to approve enterprise",
    });
  }
};

/**
 * Reject enterprise
 */
export const rejectEnterprise = async (req: Request, res: Response) => {
  try {
    const { enterpriseId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const enterprise = await EnterpriseService.rejectEnterprise(
      new Types.ObjectId(enterpriseId),
      reason,
    );

    if (!enterprise) {
      return res.status(404).json({
        success: false,
        message: "Enterprise not found",
      });
    }

    res.json({
      success: true,
      message: "Enterprise rejected",
      data: enterprise,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reject enterprise",
    });
  }
};

/**
 * Suspend enterprise
 */
export const suspendEnterprise = async (req: Request, res: Response) => {
  try {
    const { enterpriseId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Suspension reason is required",
      });
    }

    const enterprise = await EnterpriseService.suspendEnterprise(
      new Types.ObjectId(enterpriseId),
      reason,
    );

    if (!enterprise) {
      return res.status(404).json({
        success: false,
        message: "Enterprise not found",
      });
    }

    res.json({
      success: true,
      message: "Enterprise suspended",
      data: enterprise,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to suspend enterprise",
    });
  }
};

/**
 * Update enterprise credit limit
 */
export const updateCreditLimit = async (req: Request, res: Response) => {
  try {
    const { enterpriseId } = req.params;
    const { creditLimit } = req.body;

    if (!creditLimit) {
      return res.status(400).json({
        success: false,
        message: "Credit limit is required",
      });
    }

    const enterprise = await EnterpriseService.updateCreditLimit(
      new Types.ObjectId(enterpriseId),
      creditLimit,
    );

    if (!enterprise) {
      return res.status(404).json({
        success: false,
        message: "Enterprise not found",
      });
    }

    res.json({
      success: true,
      message: "Credit limit updated",
      data: enterprise,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update credit limit",
    });
  }
};

/**
 * Get enterprise users
 */
export const getEnterpriseUsers = async (req: Request, res: Response) => {
  try {
    const { enterpriseId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const result = await EnterpriseService.getEnterpriseUsers(
      new Types.ObjectId(enterpriseId),
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
 * Get enterprise bookings
 */
export const getEnterpriseBookings = async (req: Request, res: Response) => {
  try {
    const { enterpriseId } = req.params;
    const { startDate, endDate, status, page = 1, limit = 20 } = req.query;

    const result = await EnterpriseService.getEnterpriseBookings(
      new Types.ObjectId(enterpriseId),
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
