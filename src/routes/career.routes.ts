import { Router } from "express";
import * as CareerController from "../controllers/career.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";
import upload from "../middlewares/upload.middleware";
import { cacheResponse } from "../middlewares/cache.middleware";

const careerRouter = Router();

careerRouter.get(
  "/",
  cacheResponse(300),
  ErrorHandlerMiddleware(CareerController.listCareers),
  ResponseMiddleware,
);

careerRouter.get(
  "/:id",
  cacheResponse(300),
  ErrorHandlerMiddleware(CareerController.getCareer),
  ResponseMiddleware,
);

/* OTP endpoints */
careerRouter.post(
  "/otp/send",
  ErrorHandlerMiddleware(CareerController.sendOtp),
  ResponseMiddleware,
);

careerRouter.post(
  "/otp/verify",
  ErrorHandlerMiddleware(CareerController.verifyOtp),
  ResponseMiddleware,
);

careerRouter.post(
  "/resume/submit",
  upload.single("resume"),
  ErrorHandlerMiddleware(CareerController.submitResume),
  ResponseMiddleware,
);

careerRouter.post(
  "/:id/apply",
  upload.fields([
    { name: "resume", maxCount: 1 },
    { name: "passportPhoto", maxCount: 1 },
    { name: "idProof", maxCount: 1 },
    { name: "educationalCertificates", maxCount: 1 },
    { name: "professionalRegistration", maxCount: 1 },
    { name: "experienceCertificates", maxCount: 1 },
    { name: "otherDocuments", maxCount: 1 },
  ]),
  ErrorHandlerMiddleware(CareerController.applyToCareer),
  ResponseMiddleware,
);

export default careerRouter;
