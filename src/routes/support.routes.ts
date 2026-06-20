import { Router } from "express";
import AuthMiddleware from "../middlewares/auth.middleware";

const { verifyUserToken } = AuthMiddleware();
import * as supportController from "../controllers/support.controller";

const router = Router();

// Apply auth middleware
router.use(verifyUserToken);

// Create a support ticket
router.post("/tickets", supportController.createTicket);

// Get user's tickets
router.get("/tickets", supportController.getUserTickets);

// Get ticket by ID
router.get("/tickets/:ticketId", supportController.getTicketById);

// Add message to ticket
router.post("/tickets/:ticketId/messages", supportController.addMessage);

// Close ticket
router.post("/tickets/:ticketId/close", supportController.closeTicket);

// Help & Support contact (helpline number + email from env config)
router.get("/contact-info", supportController.getContactInfo);

// Get FAQs
router.get("/faqs", supportController.getFAQs);

// Get help topics/categories
router.get("/topics", supportController.getHelpTopics);

export default router;
