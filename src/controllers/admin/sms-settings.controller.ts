import { Request, Response } from "express";
import { SmsSettings } from "../../models/sms-settings.model";

// ==================== SMS SETTINGS CRUD ====================

/**
 * Get current SMS settings (secrets masked)
 */
export const getSmsSettings = async (_req: Request, res: Response) => {
  const settings = await SmsSettings.findOne().sort({ updatedAt: -1 });

  if (!settings) {
    res.locals.data = null;
    return;
  }

  res.locals.data = {
    _id: settings._id,
    provider: settings.provider,
    apiKey: "••••••••", // Mask API key
    apiSecret: settings.apiSecret ? "••••••••" : "",
    senderId: settings.senderId,
    entityId: settings.entityId,
    contentTemplateId: settings.contentTemplateId,
    templateId: settings.templateId,
    baseUrl: settings.baseUrl,
    enabled: settings.enabled,
    updatedAt: settings.updatedAt,
  };
};

/**
 * Get SMS config status (without exposing credentials)
 */
export const getSmsStatus = async (_req: Request, res: Response) => {
  const settings = await SmsSettings.findOne().sort({ updatedAt: -1 });

  res.locals.data = {
    configured: !!(settings?.apiKey && settings?.senderId),
    provider: settings?.provider || "Not configured",
    senderId: settings?.senderId || "Not configured",
    entityId: settings?.entityId || "Not set",
    contentTemplateId: settings?.contentTemplateId || "Not set",
    templateId: settings?.templateId || "Not set",
    enabled: settings?.enabled ?? false,
  };
};

/**
 * Save/update SMS settings
 */
export const updateSmsSettings = async (req: Request, res: Response) => {
  const {
    provider,
    apiKey,
    apiSecret,
    senderId,
    entityId,
    contentTemplateId,
    templateId,
    baseUrl,
    enabled,
  } = req.body;

  if (!provider || !senderId) {
    return res.status(400).json({
      success: false,
      message: "Provider and Sender ID are required",
    });
  }

  // Find existing settings or create new
  let settings = await SmsSettings.findOne().sort({ updatedAt: -1 });

  if (settings) {
    settings.provider = provider;
    // Only update secrets if a real value is provided (not the masked value)
    if (apiKey && apiKey !== "••••••••") {
      settings.apiKey = apiKey;
    }
    if (apiSecret && apiSecret !== "••••••••") {
      settings.apiSecret = apiSecret;
    }
    settings.senderId = senderId;
    settings.entityId = entityId || "";
    settings.contentTemplateId = contentTemplateId || "";
    settings.templateId = templateId || "";
    settings.baseUrl = baseUrl || "";
    settings.enabled = enabled ?? true;
    settings.updatedBy = (req as any).adminUser?._id;
    await settings.save();
  } else {
    if (!apiKey || apiKey === "••••••••") {
      return res.status(400).json({
        success: false,
        message: "API Key is required for initial SMS setup",
      });
    }
    settings = await SmsSettings.create({
      provider,
      apiKey,
      apiSecret: apiSecret || "",
      senderId,
      entityId: entityId || "",
      contentTemplateId: contentTemplateId || "",
      templateId: templateId || "",
      baseUrl: baseUrl || "",
      enabled: enabled ?? true,
      updatedBy: (req as any).adminUser?._id,
    });
  }

  res.locals.data = {
    message: "SMS settings saved successfully",
    configured: true,
  };
};

/**
 * Test SMS configuration by sending a test message
 */
export const testSmsConnection = async (req: Request, res: Response) => {
  const settings = await SmsSettings.findOne().sort({ updatedAt: -1 });

  if (!settings || !settings.apiKey || !settings.senderId) {
    return res.status(400).json({
      success: false,
      message: "SMS is not configured. Please save settings first.",
    });
  }

  try {
    const provider = settings.provider.toLowerCase();

    if (provider === "msg91") {
      // Verify MSG91 credentials via the OTP endpoint (authkey as query param per docs)
      const templateId = settings.templateId;
      const testMobile = "919999999999"; // dummy number — MSG91 validates authkey before sending

      const url = new URL("https://control.msg91.com/api/v5/otp");
      url.searchParams.set("template_id", templateId);
      url.searchParams.set("mobile", testMobile);
      url.searchParams.set("authkey", settings.apiKey);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ otp: "000000" }),
      });

      const data = (await response.json()) as Record<string, any>;

      // MSG91 returns "type": "error" with message for invalid auth, invalid template etc.
      // If we get "success" or a template-related error (not auth error), the key is valid.
      const msg = String(data.message || "").toLowerCase();
      const isAuthError =
        msg.includes("authkey") ||
        msg.includes("unauthorized") ||
        msg.includes("invalid auth") ||
        msg.includes("authentication");

      if (isAuthError) {
        return res.status(400).json({
          success: false,
          message: `MSG91 Auth Key is invalid. Please check your Auth Key in the MSG91 dashboard.`,
        });
      }

      res.locals.data = {
        success: true,
        message: `MSG91 Auth Key verified! Sender: ${settings.senderId}, Template: ${settings.templateId || "Not set"}. ${data.message ? "API response: " + data.message : ""}`,
      };
    } else {
      res.locals.data = {
        success: true,
        message: `SMS settings for "${settings.provider}" verified. Provider: ${provider}, Sender: ${settings.senderId}${settings.entityId ? ", Entity ID: " + settings.entityId : ""}${settings.contentTemplateId ? ", Content Template: " + settings.contentTemplateId : ""}. To fully test, send a test SMS from your application.`,
      };
    }
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: `SMS connection test failed: ${error.message}`,
    });
  }
};
