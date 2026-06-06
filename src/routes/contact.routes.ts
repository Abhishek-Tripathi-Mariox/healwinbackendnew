import { Router } from "express";
import * as ContactController from "../controllers/contact.controller";
import ErrorHandlerMiddleware from "../middlewares/error-handler.middleware";
import ResponseMiddleware from "../middlewares/response.middleware";

const router = Router();

// GET /contact - Get public contact page content
router.get(
  "/",
  ErrorHandlerMiddleware(ContactController.getContactContent),
  ResponseMiddleware,
);

// POST /contact/message - Submit a contact form message
router.post(
  "/message",
  ErrorHandlerMiddleware(ContactController.submitMessage),
  ResponseMiddleware,
);

// GET /contact/faqs - Get public FAQs
router.get(
  "/faqs",
  ErrorHandlerMiddleware(ContactController.getPublicFAQs),
  ResponseMiddleware,
);

export default router;
