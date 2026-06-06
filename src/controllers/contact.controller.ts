import { Request, Response } from "express";
import { ContactContent } from "../models/contact-content.model";
import { ContactMessage } from "../models/contact-message.model";
import { FAQ } from "../models/content.model";

// GET /contact - Get public contact page content
export const getContactContent = async (_req: Request, res: Response) => {
  let content = await ContactContent.findOne().select("-updatedBy -__v");
  if (!content) {
    content = await ContactContent.create({});
  }
  res.locals.data = content;
};

// POST /contact/message - Submit a contact form message
export const submitMessage = async (req: Request, res: Response) => {
  const { name, email, phone, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    res.status(400);
    throw new Error("Name, email, subject, and message are required.");
  }

  const newMessage = await ContactMessage.create({
    name,
    email,
    phone: phone || "",
    subject,
    message,
  });

  res.locals.data = {
    message:
      "Your message has been sent successfully. We'll get back to you soon!",
    id: newMessage._id,
  };
};

// GET /contact/faqs - Get public FAQs
export const getPublicFAQs = async (req: Request, res: Response) => {
  const { category } = req.query;
  const query: Record<string, any> = { isActive: true };
  if (category) query.category = category;
  const faqs = await FAQ.find(query).sort({ sortOrder: 1, category: 1 });
  res.locals.data = faqs;
};
