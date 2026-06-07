import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";

import * as UserService from "../services/user.service";
import * as UserAddressService from "../services/address.service";
import fileUploadService from "../utils/s3";
import { Express } from "express";

export const updateDeviceToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { userId, deviceToken, deviceType } = req.body;

  await UserService.updateUsers(userId, { deviceToken, deviceType });

  req.msg = "success";
  req.rData = {};
  next();
};

export const getDetails = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = (req as any).userId;

  const user = await UserService.fetch(userId);

  if (!user) {
    req.msg = "user_not_found";
    req.rCode = 5;
    req.rData = {};
  } else {
    req.msg = "success";
    req.rData = user;
  }

  next();
};

export const editUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = (req as any).userId;

  // Only upload when multer actually received a file. Previously this always
  // ran for the empty-array case (profile edit without image) and threw
  // "Invalid file buffer".
  const files = req.files as Express.Multer.File[] | undefined;
  if (Array.isArray(files) && files.length > 0) {
    const images = await fileUploadService.uploadFileToAws(files);
    req.body.profileImage = images.images;
  }

  await UserService.updateUsers(userId, req.body);
  const userData = await UserService.fetch(userId);

  req.rData = userData ?? {};
  req.msg = "success";
  next();
};

/**
 * Address
 */

export const addUserAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { houseNo, area, district, state, pinCode } = req.body;

  req.body.address = `${houseNo}, ${area}, ${district}, ${state} - ${pinCode}`;

  const userId = (req as any).userId;

  req.body.userId = userId;

  let address = await UserAddressService.addUserAddress(req.body);

  req.rData = address;
  req.msg = "success";
  next();
};

export const updateUserAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params as Record<string, string>;
  const { houseNo, area, district, state, pinCode } = req.body;

  if (houseNo || area || district || state || pinCode) {
    req.body.address = `${houseNo}, ${area}, ${district}, ${state} - ${pinCode}`;
  }

  const updatedAddress = await UserAddressService.updateUserAddress(
    id,
    req.body,
  );

  if (!updatedAddress) {
    req.rCode = 5;
    req.msg = "address_not_found";
    return next();
  }

  req.rData = updatedAddress;
  req.msg = "success";
  next();
};

export const getUserAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const rawPage = req.query.page;
  const rawLimit = req.query.limit;
  const rawIsActive = req.query.isActive;

  const page =
    rawPage && rawPage !== "" && rawPage !== "null"
      ? Math.max(Number(rawPage), 1)
      : 1;

  // ✅ Normalize limit
  const limit =
    rawLimit && rawLimit !== "" && rawLimit !== "null"
      ? Math.max(Number(rawLimit), 1)
      : 10;

  const userId = (req as any).userId;

  const query: any = { userId };
  query.isActive = rawIsActive ? rawIsActive : true;

  const data = await UserAddressService.getUserAddress(
    query,
    Number(page),
    Number(limit),
  );

  const total = await UserAddressService.countUserAddress(query);

  req.rData = { page, limit, total, data };
  req.msg = "success";
  next();
};

export const deleteUserAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { addressId } = req.body;

  await UserAddressService.deleteUserAddress(addressId);

  req.msg = "success";
  next();
};

export const selectAddress = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = (req as any).userId;
  const { id } = req.params as Record<string, string>;

  const query = {
    userId,
    _id: { $ne: new Types.ObjectId(id) },
  };

  const addresses = await UserAddressService.getUserAddress(query, 1, 100);

  for (const item of addresses) {
    await UserAddressService.updateUserAddress(item._id, {
      isSelected: false,
    });
  }

  await UserAddressService.updateUserAddress(id, { isSelected: true });

  req.msg = "success";
  next();
};

export const getUserAddressDetail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { id } = req.params as Record<string, string>;

  const address = await UserAddressService.fetch(id);

  req.rData = address;
  req.msg = "success";
  next();
};

export const activateDeactivateNotification = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const userId = (req as any).userId;

  const user = await UserService.fetch(userId);

  if (user) {
    const notificationAllowed = !user.notificationAllowed;
    await UserService.updateUsers(userId, { notificationAllowed });
  }

  req.msg = "status_changed";
  next();
};
