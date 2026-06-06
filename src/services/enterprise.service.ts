import { Types, ClientSession } from "mongoose";
import {
  Enterprise,
  EnterpriseUser,
  IEnterprise,
} from "../models/enterprise.model";
import User from "../models/Users";
import Booking from "../models/booking.model";

/**
 * Create enterprise account request
 */
export const createEnterpriseRequest = async (
  userId: Types.ObjectId,
  data: {
    companyName: string;
    gstin?: string;
    email: string;
    phone: string;
    contactPerson: string;
    address: string;
    district: string;
    state: string;
    pincode: string;
  },
): Promise<IEnterprise> => {
  // Check if user already has an enterprise
  const existingUser = await EnterpriseUser.findOne({ userId });
  if (existingUser) {
    throw new Error("User already belongs to an enterprise");
  }

  // Check if enterprise with same email/GSTIN exists
  const existingEnterprise = await Enterprise.findOne({
    $or: [
      { email: data.email.toLowerCase() },
      ...(data.gstin ? [{ gstin: data.gstin.toUpperCase() }] : []),
    ],
  });

  if (existingEnterprise) {
    throw new Error("Enterprise with this email or GSTIN already exists");
  }

  // Create enterprise
  const enterprise = new Enterprise({
    ...data,
    email: data.email.toLowerCase(),
    gstin: data.gstin?.toUpperCase(),
    status: "PENDING",
    creditLimit: 0,
    usedCredit: 0,
    paymentTerms: 30,
    discountPercentage: 0,
    isActive: false,
  });
  await enterprise.save();

  // Add user as enterprise admin
  await EnterpriseUser.create({
    enterpriseId: enterprise._id,
    userId,
    role: "ADMIN",
    permissions: ["ALL"],
    isActive: true,
  });

  return enterprise;
};

/**
 * Get enterprise by ID
 */
export const getEnterpriseById = async (
  enterpriseId: Types.ObjectId,
): Promise<IEnterprise | null> => {
  return Enterprise.findById(enterpriseId);
};

/**
 * Get user's enterprise
 */
export const getUserEnterprise = async (userId: Types.ObjectId) => {
  const enterpriseUser = await EnterpriseUser.findOne({
    userId,
    isActive: true,
  }).populate("enterpriseId");

  if (!enterpriseUser) {
    return null;
  }

  return {
    enterprise: enterpriseUser.enterpriseId,
    role: enterpriseUser.role,
    permissions: enterpriseUser.permissions,
  };
};

/**
 * Update enterprise details
 */
export const updateEnterprise = async (
  enterpriseId: Types.ObjectId,
  userId: Types.ObjectId,
  data: Partial<IEnterprise>,
): Promise<IEnterprise | null> => {
  // Verify user is admin
  const enterpriseUser = await EnterpriseUser.findOne({
    enterpriseId,
    userId,
    role: "ADMIN",
    isActive: true,
  });

  if (!enterpriseUser) {
    throw new Error("Only admin can update enterprise details");
  }

  // Don't allow updating sensitive fields
  const { status, creditLimit, usedCredit, isActive, ...updateData } =
    data as any;

  return Enterprise.findByIdAndUpdate(
    enterpriseId,
    { $set: updateData },
    { returnDocument: "after" },
  );
};

/**
 * Add user to enterprise
 */
export const addEnterpriseUser = async (
  enterpriseId: Types.ObjectId,
  adminUserId: Types.ObjectId,
  newUserData: {
    userId?: Types.ObjectId;
    email?: string;
    phone?: string;
    role: "ADMIN" | "MANAGER" | "USER";
    permissions: string[];
  },
): Promise<any> => {
  // Verify admin permissions
  const adminUser = await EnterpriseUser.findOne({
    enterpriseId,
    userId: adminUserId,
    role: { $in: ["ADMIN", "MANAGER"] },
    isActive: true,
  });

  if (!adminUser) {
    throw new Error("Insufficient permissions");
  }

  // Only admin can add other admins
  if (newUserData.role === "ADMIN" && adminUser.role !== "ADMIN") {
    throw new Error("Only admin can add other admins");
  }

  // Find user by ID, email, or phone
  let targetUser;
  if (newUserData.userId) {
    targetUser = await User.findById(newUserData.userId);
  } else if (newUserData.email) {
    targetUser = await User.findOne({ email: newUserData.email.toLowerCase() });
  } else if (newUserData.phone) {
    targetUser = await User.findOne({ mobileNumber: newUserData.phone });
  }

  if (!targetUser) {
    throw new Error("User not found");
  }

  // Check if user already in an enterprise
  const existingEnterpriseUser = await EnterpriseUser.findOne({
    userId: targetUser._id,
    isActive: true,
  });

  if (existingEnterpriseUser) {
    throw new Error("User already belongs to an enterprise");
  }

  // Add user
  const enterpriseUser = new EnterpriseUser({
    enterpriseId,
    userId: targetUser._id,
    role: newUserData.role,
    permissions: newUserData.permissions,
    isActive: true,
  });
  await enterpriseUser.save();

  return enterpriseUser;
};

/**
 * Remove user from enterprise
 */
export const removeEnterpriseUser = async (
  enterpriseId: Types.ObjectId,
  adminUserId: Types.ObjectId,
  targetUserId: Types.ObjectId,
): Promise<boolean> => {
  // Verify admin permissions
  const adminUser = await EnterpriseUser.findOne({
    enterpriseId,
    userId: adminUserId,
    role: "ADMIN",
    isActive: true,
  });

  if (!adminUser) {
    throw new Error("Only admin can remove users");
  }

  // Can't remove yourself
  if (adminUserId.equals(targetUserId)) {
    throw new Error("Cannot remove yourself");
  }

  const result = await EnterpriseUser.updateOne(
    { enterpriseId, userId: targetUserId },
    { isActive: false },
  );

  return result.modifiedCount > 0;
};

/**
 * Get enterprise users
 */
export const getEnterpriseUsers = async (
  enterpriseId: Types.ObjectId,
  page: number = 1,
  limit: number = 20,
) => {
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    EnterpriseUser.find({ enterpriseId, isActive: true })
      .populate("userId", "name email mobileNumber profileImage")
      .skip(skip)
      .limit(limit),
    EnterpriseUser.countDocuments({ enterpriseId, isActive: true }),
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Create booking using enterprise credit
 */
export const createCreditBooking = async (
  enterpriseId: Types.ObjectId,
  userId: Types.ObjectId,
  bookingData: any,
  session?: ClientSession,
): Promise<any> => {
  // Verify user belongs to enterprise
  const enterpriseUser = await EnterpriseUser.findOne({
    enterpriseId,
    userId,
    isActive: true,
  });

  if (!enterpriseUser) {
    throw new Error("User does not belong to this enterprise");
  }

  // Get enterprise
  const enterprise = await Enterprise.findById(enterpriseId);
  if (!enterprise || enterprise.status !== "APPROVED" || !enterprise.isActive) {
    throw new Error("Enterprise account is not active");
  }

  // Check credit limit
  const availableCredit = enterprise.creditLimit - enterprise.usedCredit;
  const bookingAmount = bookingData.finalFare || bookingData.fare;

  if (availableCredit < bookingAmount) {
    throw new Error("Insufficient enterprise credit");
  }

  // Apply enterprise discount
  const discountAmount = (bookingAmount * enterprise.discountPercentage) / 100;
  const finalAmount = bookingAmount - discountAmount;

  // Create booking
  const booking = new Booking({
    ...bookingData,
    enterpriseId,
    enterpriseDiscount: discountAmount,
    finalFare: finalAmount,
    paymentMethod: "ENTERPRISE_CREDIT",
    paymentStatus: "PENDING", // Will be settled later
  });
  await booking.save({ session });

  // Update used credit
  await Enterprise.findByIdAndUpdate(
    enterpriseId,
    { $inc: { usedCredit: finalAmount } },
    { session },
  );

  return booking;
};

/**
 * Get enterprise bookings
 */
export const getEnterpriseBookings = async (
  enterpriseId: Types.ObjectId,
  filters: {
    startDate?: Date;
    endDate?: Date;
    userId?: Types.ObjectId;
    status?: string;
  },
  page: number = 1,
  limit: number = 20,
) => {
  const skip = (page - 1) * limit;
  const query: any = { enterpriseId };

  if (filters.startDate || filters.endDate) {
    query.createdAt = {};
    if (filters.startDate) query.createdAt.$gte = filters.startDate;
    if (filters.endDate) query.createdAt.$lte = filters.endDate;
  }

  if (filters.userId) query.userId = filters.userId;
  if (filters.status) query.status = filters.status;

  const [bookings, total] = await Promise.all([
    Booking.find(query)
      .populate("userId", "name email")
      .populate("vehicleTypeId", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(query),
  ]);

  return {
    bookings,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get enterprise dashboard stats
 */
export const getEnterpriseDashboard = async (enterpriseId: Types.ObjectId) => {
  const enterprise = await Enterprise.findById(enterpriseId);
  if (!enterprise) {
    throw new Error("Enterprise not found");
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    totalBookings,
    thisMonthBookings,
    lastMonthBookings,
    activeUsers,
    totalSpent,
    thisMonthSpent,
  ] = await Promise.all([
    Booking.countDocuments({ enterpriseId }),
    Booking.countDocuments({ enterpriseId, createdAt: { $gte: startOfMonth } }),
    Booking.countDocuments({
      enterpriseId,
      createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
    }),
    EnterpriseUser.countDocuments({ enterpriseId, isActive: true }),
    Booking.aggregate([
      { $match: { enterpriseId: new Types.ObjectId(enterpriseId) } },
      { $group: { _id: null, total: { $sum: "$finalFare" } } },
    ]),
    Booking.aggregate([
      {
        $match: {
          enterpriseId: new Types.ObjectId(enterpriseId),
          createdAt: { $gte: startOfMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$finalFare" } } },
    ]),
  ]);

  return {
    enterprise: {
      name: enterprise.companyName,
      status: enterprise.status,
      creditLimit: enterprise.creditLimit,
      usedCredit: enterprise.usedCredit,
      availableCredit: enterprise.creditLimit - enterprise.usedCredit,
      discountPercentage: enterprise.discountPercentage,
      paymentTerms: enterprise.paymentTerms,
    },
    stats: {
      totalBookings,
      thisMonthBookings,
      lastMonthBookings,
      bookingGrowth:
        lastMonthBookings > 0
          ? ((thisMonthBookings - lastMonthBookings) / lastMonthBookings) * 100
          : 0,
      activeUsers,
      totalSpent: totalSpent[0]?.total || 0,
      thisMonthSpent: thisMonthSpent[0]?.total || 0,
    },
  };
};

/**
 * Admin: Approve enterprise
 */
export const approveEnterprise = async (
  enterpriseId: Types.ObjectId,
  adminId: Types.ObjectId,
  creditLimit: number,
  discountPercentage: number,
  paymentTerms: number,
): Promise<IEnterprise | null> => {
  return Enterprise.findByIdAndUpdate(
    enterpriseId,
    {
      status: "APPROVED",
      creditLimit,
      discountPercentage,
      paymentTerms,
      isActive: true,
      approvedBy: adminId,
      approvedAt: new Date(),
    },
    { returnDocument: "after" },
  );
};

/**
 * Admin: Reject enterprise
 */
export const rejectEnterprise = async (
  enterpriseId: Types.ObjectId,
  reason: string,
): Promise<IEnterprise | null> => {
  return Enterprise.findByIdAndUpdate(
    enterpriseId,
    {
      status: "REJECTED",
      rejectionReason: reason,
      isActive: false,
    },
    { returnDocument: "after" },
  );
};

/**
 * Admin: Suspend enterprise
 */
export const suspendEnterprise = async (
  enterpriseId: Types.ObjectId,
  reason: string,
): Promise<IEnterprise | null> => {
  return Enterprise.findByIdAndUpdate(
    enterpriseId,
    {
      status: "SUSPENDED",
      suspensionReason: reason,
      isActive: false,
    },
    { returnDocument: "after" },
  );
};

/**
 * Admin: Get all enterprises
 */
export const getAllEnterprises = async (
  filters: {
    status?: string;
    search?: string;
  },
  page: number = 1,
  limit: number = 20,
) => {
  const skip = (page - 1) * limit;
  const query: any = {};

  if (filters.status) query.status = filters.status;
  if (filters.search) {
    query.$or = [
      { companyName: { $regex: filters.search, $options: "i" } },
      { email: { $regex: filters.search, $options: "i" } },
      { gstin: { $regex: filters.search, $options: "i" } },
    ];
  }

  const [enterprises, total] = await Promise.all([
    Enterprise.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Enterprise.countDocuments(query),
  ]);

  return {
    enterprises,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Admin: Update enterprise credit limit
 */
export const updateCreditLimit = async (
  enterpriseId: Types.ObjectId,
  creditLimit: number,
): Promise<IEnterprise | null> => {
  return Enterprise.findByIdAndUpdate(
    enterpriseId,
    { creditLimit },
    { returnDocument: "after" },
  );
};
