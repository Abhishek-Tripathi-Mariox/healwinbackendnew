import { Request, Response } from "express";
import { ContactContent } from "../../models/contact-content.model";
import { ContactMessage } from "../../models/contact-message.model";

// ==================== CONTACT CONTENT (Singleton) ====================

// GET - Get contact page content
export const getContactContent = async (_req: Request, res: Response) => {
  let content = await ContactContent.findOne().populate(
    "updatedBy",
    "name email",
  );
  if (!content) {
    content = await ContactContent.create({});
    content = await content.populate("updatedBy", "name email");
  }
  res.locals.data = content;
};

// PUT - Update contact page content
export const updateContactContent = async (req: Request, res: Response) => {
  const {
    companyName,
    companyTagline,
    officeAddress,
    emergencyHelpline,
    supportEmail,
    workingHoursEmergency,
    workingHoursOffice,
    contactDirectories,
    footerDescription,
    footerOfficeLabel,
    heroTitle,
    heroHighlight,
    heroSubtitle,
  } = req.body;

  const adminId = (req as any).admin?._id || (req as any).admin?.id;

  const update: Record<string, any> = {};
  if (companyName !== undefined) update.companyName = companyName;
  if (companyTagline !== undefined) update.companyTagline = companyTagline;
  if (officeAddress !== undefined) update.officeAddress = officeAddress;
  if (emergencyHelpline !== undefined)
    update.emergencyHelpline = emergencyHelpline;
  if (supportEmail !== undefined) update.supportEmail = supportEmail;
  if (workingHoursEmergency !== undefined)
    update.workingHoursEmergency = workingHoursEmergency;
  if (workingHoursOffice !== undefined)
    update.workingHoursOffice = workingHoursOffice;
  if (contactDirectories !== undefined)
    update.contactDirectories = contactDirectories;
  if (footerDescription !== undefined)
    update.footerDescription = footerDescription;
  if (footerOfficeLabel !== undefined)
    update.footerOfficeLabel = footerOfficeLabel;
  if (heroTitle !== undefined) update.heroTitle = heroTitle;
  if (heroHighlight !== undefined) update.heroHighlight = heroHighlight;
  if (heroSubtitle !== undefined) update.heroSubtitle = heroSubtitle;
  if (adminId) update.updatedBy = adminId;

  const content = await ContactContent.findOneAndUpdate({}, update, {
    returnDocument: "after",
    upsert: true,
    runValidators: true,
  }).populate("updatedBy", "name email");

  res.locals.data = content;
};

// ==================== CONTACT MESSAGES ====================

// GET - Get all contact messages with filters
export const getAllMessages = async (req: Request, res: Response) => {
  const { status, q, page = "1", limit = "20" } = req.query;

  const filter: Record<string, any> = {};
  if (status && status !== "all") filter.status = status;
  if (q) {
    const regex = new RegExp(q as string, "i");
    filter.$or = [
      { name: regex },
      { email: regex },
      { subject: regex },
      { message: regex },
    ];
  }

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
  const [messages, total] = await Promise.all([
    ContactMessage.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit as string))
      .populate("repliedBy", "name email"),
    ContactMessage.countDocuments(filter),
  ]);

  res.locals.data = {
    messages,
    pagination: {
      total,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      pages: Math.ceil(total / parseInt(limit as string)),
    },
  };
};

// GET - Get message stats
export const getMessageStats = async (_req: Request, res: Response) => {
  const [total, newCount, readCount, repliedCount, archivedCount] =
    await Promise.all([
      ContactMessage.countDocuments(),
      ContactMessage.countDocuments({ status: "new" }),
      ContactMessage.countDocuments({ status: "read" }),
      ContactMessage.countDocuments({ status: "replied" }),
      ContactMessage.countDocuments({ status: "archived" }),
    ]);

  res.locals.data = {
    total,
    new: newCount,
    read: readCount,
    replied: repliedCount,
    archived: archivedCount,
  };
};

// GET - Get single message
export const getMessageById = async (req: Request, res: Response) => {
  const message = await ContactMessage.findById(req.params.id).populate(
    "repliedBy",
    "name email",
  );
  if (!message) {
    res.status(404);
    throw new Error("Message not found");
  }
  // Auto-mark as read if new
  if (message.status === "new") {
    message.status = "read";
    await message.save();
  }
  res.locals.data = message;
};

// PUT - Update message status / add notes
export const updateMessage = async (req: Request, res: Response) => {
  const { status, adminNotes } = req.body;
  const adminId = (req as any).admin?._id || (req as any).admin?.id;

  const update: Record<string, any> = {};
  if (status) update.status = status;
  if (adminNotes !== undefined) update.adminNotes = adminNotes;
  if (status === "replied" && adminId) {
    update.repliedBy = adminId;
    update.repliedAt = new Date();
  }

  const message = await ContactMessage.findByIdAndUpdate(
    req.params.id,
    update,
    { returnDocument: "after", runValidators: true },
  ).populate("repliedBy", "name email");

  if (!message) {
    res.status(404);
    throw new Error("Message not found");
  }

  res.locals.data = message;
};

// DELETE - Delete a message
export const deleteMessage = async (req: Request, res: Response) => {
  const message = await ContactMessage.findByIdAndDelete(req.params.id);
  if (!message) {
    res.status(404);
    throw new Error("Message not found");
  }
  res.locals.data = { message: "Message deleted successfully" };
};
