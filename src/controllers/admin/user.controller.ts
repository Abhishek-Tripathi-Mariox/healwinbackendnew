import { Request, Response } from "express";
import User from "../../models/Users";
import Booking from "../../models/booking.model";
import Wallet from "../../models/wallet.model";
import { CoinWallet } from "../../models/coin.model";
import UserAddress from "../../models/UserAddress";
import WalletTransaction from "../../models/wallet-transaction.model";

/**
 * Get all users with filters
 */
export const getAllUsers = async (req: Request, res: Response) => {
  const {
    status,
    search,
    dateFrom,
    dateTo,
    page = 0,
    limit = 20,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const parsedPage = Math.max(Number(page), 0);
  const parsedLimit = Math.min(Math.max(Number(limit), 1), 100);

  // Support deleted filter
  const query: Record<string, unknown> = {};
  if (status === "deleted") {
    query.isDeleted = true;
  } else {
    query.isDeleted = false;
  }

  if (status === "active") {
    query.isActive = true;
    query.isBlocked = false;
  }
  if (status === "inactive") {
    query.isActive = false;
    query.isBlocked = false;
  }
  if (status === "blocked") query.isBlocked = true;

  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = new Date(dateFrom as string);
    if (dateTo) createdAt.$lte = new Date(dateTo as string);
    query.createdAt = createdAt;
  }

  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { mobileNumber: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { referralCode: { $regex: search, $options: "i" } },
    ];
  }

  const sortableFields: Record<string, string> = {
    createdAt: "createdAt",
    name: "fullName",
    status: "isActive",
  };

  const sortField = sortableFields[String(sortBy)] || "createdAt";
  const sortDirection = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;

  const users = await User.find(query)
    .select("-__v")
    .sort({ [sortField]: sortDirection })
    .skip(parsedPage * parsedLimit)
    .limit(parsedLimit);

  const total = await User.countDocuments(query);

  const userIds = users.map((user) => user._id.toString());

  // Fetch addresses for all users
  const addresses = await UserAddress.find({
    userId: { $in: userIds },
    isActive: true,
  })
    .sort({ isSelected: -1, updatedAt: -1 })
    .lean();

  const addressMap = new Map<string, (typeof addresses)[number][]>();
  addresses.forEach((address) => {
    const key = address.userId.toString();
    if (!addressMap.has(key)) {
      addressMap.set(key, []);
    }
    addressMap.get(key)!.push(address);
  });

  // Fetch coin wallets for all users
  const coinWallets = await CoinWallet.find({
    userId: { $in: userIds },
  }).lean();

  const coinWalletMap = new Map<string, (typeof coinWallets)[number]>();
  coinWallets.forEach((wallet) => {
    coinWalletMap.set(wallet.userId.toString(), wallet);
  });

  // Fetch wallet balances for all users
  const wallets = await Wallet.find({
    userId: { $in: userIds },
  }).lean();

  const walletMap = new Map<string, (typeof wallets)[number]>();
  wallets.forEach((wallet) => {
    walletMap.set(wallet.userId.toString(), wallet);
  });

  const usersWithStats = await Promise.all(
    users.map(async (user) => {
      const bookingCount = await Booking.countDocuments({ userId: user._id });
      const completedCount = await Booking.countDocuments({
        userId: user._id,
        status: "COMPLETED",
      });

      // Calculate total spent from completed bookings
      const spentAggregation = await Booking.aggregate([
        { $match: { userId: user._id, status: "COMPLETED" } },
        { $group: { _id: null, totalSpent: { $sum: "$finalFare" } } },
      ]);
      const totalSpent = spentAggregation[0]?.totalSpent ?? 0;

      const userAddresses = addressMap.get(user._id.toString()) || [];
      const primaryAddress =
        userAddresses.find((a) => a.isSelected) || userAddresses[0] || null;
      const coinWallet = coinWalletMap.get(user._id.toString());
      const wallet = walletMap.get(user._id.toString());

      return {
        ...user.toObject(),
        bookingCount,
        completedBookings: completedCount,
        totalSpent,
        coinBalance: coinWallet?.balance ?? 0,
        walletBalance: wallet?.balance ?? 0,
        addressCount: userAddresses.length,
        primaryAddress: primaryAddress
          ? {
              id: primaryAddress._id,
              address: primaryAddress.address,
              area: primaryAddress.area,
              district: primaryAddress.district,
              state: primaryAddress.state,
              country: primaryAddress.country,
              pinCode: primaryAddress.pinCode,
              latitude: primaryAddress.latitude,
              longitude: primaryAddress.longitude,
              addressType: primaryAddress.addressType,
            }
          : null,
        allAddresses: userAddresses.map((a) => ({
          id: a._id,
          addressType: a.addressType,
          houseNo: a.houseNo,
          area: a.area,
          address: a.address,
          district: a.district,
          state: a.state,
          country: a.country,
          pinCode: a.pinCode,
          latitude: a.latitude,
          longitude: a.longitude,
          isSelected: a.isSelected,
        })),
      };
    }),
  );

  if (sortBy === "bookings") {
    usersWithStats.sort((a, b) =>
      sortDirection === 1
        ? a.bookingCount - b.bookingCount
        : b.bookingCount - a.bookingCount,
    );
  }

  res.locals.data = {
    users: usersWithStats,
    total,
    page: parsedPage,
    limit: parsedLimit,
    totalPages: Math.ceil(total / parsedLimit),
  };
};

/**
 * Get user by ID
 */
export const getUserById = async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await User.findById(id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  // Get additional data
  const [wallet, coinWallet, addresses, bookingStats] = await Promise.all([
    Wallet.findOne({ userId: id }),
    CoinWallet.findOne({ userId: id }),
    UserAddress.find({ userId: id, isActive: true }),
    Booking.aggregate([
      { $match: { userId: user._id } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalSpent: { $sum: "$finalFare" },
        },
      },
    ]),
  ]);

  res.locals.data = {
    user,
    wallet: wallet || { balance: 0, lockedBalance: 0 },
    coinWallet: coinWallet || { balance: 0, totalEarned: 0, totalRedeemed: 0 },
    addresses,
    bookingStats,
  };
};

/**
 * Update user status
 */
export const updateUserStatus = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { isActive, reason } = req.body;

  const user = await User.findByIdAndUpdate(id, { isActive }, { returnDocument: "after" });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  // TODO: Log the action and send notification

  res.locals.data = {
    message: `User ${isActive ? "activated" : "deactivated"} successfully`,
    user,
  };
};

/**
 * Update user profile information
 */
export const updateUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const allowedFields = [
    "fullName",
    "email",
    "gender",
    "dob",
    "notificationAllowed",
  ];

  const updatePayload: Record<string, unknown> = {};
  allowedFields.forEach((field) => {
    if (req.body[field] !== undefined) {
      updatePayload[field] = req.body[field];
    }
  });

  const user = await User.findByIdAndUpdate(id, updatePayload, { returnDocument: "after" });

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.locals.data = {
    message: "User profile updated",
    user,
  };
};

/**
 * Block a user
 */
export const blockUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  const blockReason = reason?.trim() || "Blocked by admin";

  const user = await User.findByIdAndUpdate(
    id,
    {
      isBlocked: true,
      blockReason,
      blockedAt: new Date(),
      isActive: false,
    },
    { returnDocument: "after" },
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.locals.data = {
    message: "User blocked successfully",
    user,
  };
};

/**
 * Unblock a user
 */
export const unblockUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await User.findByIdAndUpdate(
    id,
    {
      isBlocked: false,
      blockReason: null,
      blockedAt: null,
      isActive: true,
    },
    { returnDocument: "after" },
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.locals.data = {
    message: "User unblocked successfully",
    user,
  };
};

/**
 * Soft delete a user
 */
export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await User.findByIdAndUpdate(
    id,
    {
      isDeleted: true,
      isActive: false,
      isBlocked: false,
      blockReason: null,
      blockedAt: null,
    },
    { returnDocument: "after" },
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.locals.data = {
    message: "User deleted successfully",
    user,
  };
};

/**
 * Restore a deleted user
 */
export const restoreUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await User.findByIdAndUpdate(
    id,
    {
      isDeleted: false,
      isActive: true,
    },
    { returnDocument: "after" },
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  res.locals.data = {
    message: "User restored successfully",
    user,
  };
};

/**
 * Get user bookings
 */
export const getUserBookings = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, page = 0, limit = 20 } = req.query;

  const query: any = { userId: id };
  if (status) query.status = status;

  const bookings = await Booking.find(query)
    .populate("driverId", "fullName mobileNumber")
    .populate("vehicleTypeId", "name")
    .sort({ createdAt: -1 })
    .skip(Number(page) * Number(limit))
    .limit(Number(limit));

  const total = await Booking.countDocuments(query);

  res.locals.data = {
    bookings,
    total,
    page: Number(page),
    limit: Number(limit),
  };
};

/**
 * Get user wallet
 */
export const getUserWallet = async (req: Request, res: Response) => {
  const { id } = req.params;

  const wallet = await Wallet.findOne({ userId: id });
  const coinWallet = await CoinWallet.findOne({ userId: id });

  res.locals.data = {
    wallet: wallet || { balance: 0, lockedBalance: 0 },
    coinWallet: coinWallet || { balance: 0, totalEarned: 0, totalRedeemed: 0 },
  };
};

/**
 * Add balance to user wallet (Admin)
 */
export const addWalletBalance = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, reason } = req.body;

  if (!amount || amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Valid amount is required",
    });
  }

  const wallet = await Wallet.findOneAndUpdate(
    { userId: id },
    { $inc: { balance: amount } },
    { returnDocument: "after", upsert: true },
  );

  // TODO: Create wallet transaction record

  res.locals.data = {
    message: `₹${amount} added to wallet`,
    wallet,
  };
};

/**
 * Get user stats summary
 */
export const getUserStats = async (req: Request, res: Response) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [
    totalUsers,
    activeUsers,
    blockedUsers,
    deletedUsers,
    newToday,
    newThisMonth,
    totalBookings,
    revenueAggregation,
  ] = await Promise.all([
    User.countDocuments({ isDeleted: false }),
    User.countDocuments({ isDeleted: false, isActive: true, isBlocked: false }),
    User.countDocuments({ isDeleted: false, isBlocked: true }),
    User.countDocuments({ isDeleted: true }),
    User.countDocuments({ createdAt: { $gte: today }, isDeleted: false }),
    User.countDocuments({ createdAt: { $gte: thisMonth }, isDeleted: false }),
    Booking.countDocuments({}),
    Booking.aggregate([
      { $match: { status: "COMPLETED" } },
      { $group: { _id: null, totalRevenue: { $sum: "$finalFare" } } },
    ]),
  ]);

  const totalRevenue = revenueAggregation[0]?.totalRevenue ?? 0;

  res.locals.data = {
    totalUsers,
    activeUsers,
    inactiveUsers: totalUsers - activeUsers - blockedUsers,
    blockedUsers,
    deletedUsers,
    newToday,
    newThisMonth,
    totalBookings,
    totalRevenue,
  };
};

/**
 * Get user transactions
 */
export const getUserTransactions = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = 0, limit = 20, type } = req.query;

  const query: Record<string, unknown> = { userId: id };
  if (type === "CREDIT" || type === "DEBIT") {
    query.type = type;
  }

  const transactions = await WalletTransaction.find(query)
    .sort({ createdAt: -1 })
    .skip(Number(page) * Number(limit))
    .limit(Number(limit));

  const total = await WalletTransaction.countDocuments(query);

  res.locals.data = {
    transactions,
    total,
    page: Number(page),
    limit: Number(limit),
  };
};

/**
 * Get user addresses
 */
export const getUserAddresses = async (req: Request, res: Response) => {
  const { id } = req.params;

  const addresses = await UserAddress.find({ userId: id, isActive: true }).sort(
    { isSelected: -1, updatedAt: -1 },
  );

  res.locals.data = { addresses };
};

/**
 * Add user address (Admin)
 */
export const addUserAddress = async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    fullName,
    mobileNumber,
    houseNo,
    area,
    district,
    state,
    country = "India",
    pinCode,
    addressType,
    latitude,
    longitude,
    isSelected,
  } = req.body;

  // Check user exists
  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  // Build the address string
  const addressParts = [houseNo, area, district, state].filter(Boolean);
  const address = pinCode
    ? `${addressParts.join(", ")} - ${pinCode}`
    : addressParts.join(", ");

  // If isSelected, unselect others
  if (isSelected) {
    await UserAddress.updateMany(
      { userId: id, isActive: true },
      { isSelected: false },
    );
  }

  const newAddress = await UserAddress.create({
    userId: id,
    fullName: fullName || user.fullName,
    mobileNumber: mobileNumber || user.mobileNumber,
    houseNo,
    area,
    address,
    district,
    state,
    country,
    pinCode,
    addressType,
    latitude,
    longitude,
    isSelected: isSelected || false,
    isActive: true,
  });

  res.locals.data = {
    message: "Address added successfully",
    address: newAddress,
  };
};

/**
 * Update user address (Admin)
 */
export const updateUserAddress = async (req: Request, res: Response) => {
  const { id, addressId } = req.params;
  const {
    fullName,
    mobileNumber,
    houseNo,
    area,
    district,
    state,
    country,
    pinCode,
    addressType,
    latitude,
    longitude,
    isSelected,
  } = req.body;

  const address = await UserAddress.findOne({
    _id: addressId,
    userId: id,
    isActive: true,
  });

  if (!address) {
    return res.status(404).json({
      success: false,
      message: "Address not found",
    });
  }

  // Build the address string if components changed
  const newHouseNo = houseNo !== undefined ? houseNo : address.houseNo;
  const newArea = area !== undefined ? area : address.area;
  const newDistrict = district !== undefined ? district : address.district;
  const newState = state !== undefined ? state : address.state;
  const newPinCode = pinCode !== undefined ? pinCode : address.pinCode;

  const addressParts = [newHouseNo, newArea, newDistrict, newState].filter(
    Boolean,
  );
  const addressString = newPinCode
    ? `${addressParts.join(", ")} - ${newPinCode}`
    : addressParts.join(", ");

  // If isSelected, unselect others
  if (isSelected === true) {
    await UserAddress.updateMany(
      { userId: id, isActive: true, _id: { $ne: addressId } },
      { isSelected: false },
    );
  }

  const updatedAddress = await UserAddress.findByIdAndUpdate(
    addressId,
    {
      ...(fullName !== undefined && { fullName }),
      ...(mobileNumber !== undefined && { mobileNumber }),
      ...(houseNo !== undefined && { houseNo }),
      ...(area !== undefined && { area }),
      address: addressString,
      ...(district !== undefined && { district }),
      ...(state !== undefined && { state }),
      ...(country !== undefined && { country }),
      ...(pinCode !== undefined && { pinCode }),
      ...(addressType !== undefined && { addressType }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(isSelected !== undefined && { isSelected }),
    },
    { returnDocument: "after" },
  );

  res.locals.data = {
    message: "Address updated successfully",
    address: updatedAddress,
  };
};

/**
 * Delete user address (Admin)
 */
export const deleteUserAddress = async (req: Request, res: Response) => {
  const { id, addressId } = req.params;

  const address = await UserAddress.findOneAndUpdate(
    { _id: addressId, userId: id, isActive: true },
    { isActive: false },
    { returnDocument: "after" },
  );

  if (!address) {
    return res.status(404).json({
      success: false,
      message: "Address not found",
    });
  }

  res.locals.data = {
    message: "Address deleted successfully",
  };
};

/**
 * Set address as primary (Admin)
 */
export const setAddressPrimary = async (req: Request, res: Response) => {
  const { id, addressId } = req.params;

  // Unselect all addresses for this user
  await UserAddress.updateMany(
    { userId: id, isActive: true },
    { isSelected: false },
  );

  // Set the selected address as primary
  const address = await UserAddress.findOneAndUpdate(
    { _id: addressId, userId: id, isActive: true },
    { isSelected: true },
    { returnDocument: "after" },
  );

  if (!address) {
    return res.status(404).json({
      success: false,
      message: "Address not found",
    });
  }

  res.locals.data = {
    message: "Address set as primary",
    address,
  };
};
