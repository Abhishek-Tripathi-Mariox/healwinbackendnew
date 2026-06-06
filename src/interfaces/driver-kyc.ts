import { Types } from "mongoose";

export interface IDriverKyc {
  driverId: Types.ObjectId;

  aadhaar?: {
    number: string;
    frontImage: string;
    backImage: string;
  };

  pan?: {
    number: string;
    frontImage: string;
    backImage?: string;
  };

  drivingLicense?: {
    number: string;
    frontImage: string;
    backImage: string;
    expiryDate: string;
  };

  selfie?: string;

  vehicleRc?: {
    image: string;
    vehicleNumber: string;
  };

  vehicleImages?: string[];
  district?: string;
  bodyType?: string;
  fuelType?: string;

  isVerified?: boolean;
  verifiedAt?: Date;

  status?: "documents_uploaded";
}
