import { SmsSettings, ISmsSettings } from "../models/sms-settings.model";

/**
 * Get SMS settings from the database.
 */
const getSettings = async (): Promise<ISmsSettings | null> => {
  return SmsSettings.findOne().sort({ updatedAt: -1 });
};

/**
 * Send OTP via MSG91 Flow API.
 *
 * MSG91 Flow API endpoint:
 *   POST https://control.msg91.com/api/v5/flow
 *   Headers: authkey, Content-Type, Accept
 *   Body: { template_id, sender, otp, recipients: [{ mobiles }], var1, var2 }
 */
const sendViaMsg91 = async (
  settings: ISmsSettings,
  mobile: string,
  otp: string,
): Promise<{ success: boolean; message: string }> => {
  // Ensure 91 country code prefix
  const fullMobile = mobile.length === 10 ? `91${mobile}` : mobile;

  const body = {
    template_id: settings.templateId,
    sender: "HEALWN",
    // sender: settings.senderId,
    // otp,
    recipients: [{ mobiles: fullMobile, OTP: otp, time: "10" }],
  };

  console.log(
    "[SMS] MSG91 Flow request:",
    JSON.stringify(body),
    "| mobile:",
    fullMobile,
  );

  const response = await fetch("https://control.msg91.com/api/v5/flow", {
    method: "POST",
    headers: {
      authkey: settings.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as {
    type?: string;
    message?: string;
    request_id?: string;
  };

  console.log(
    "[SMS] MSG91 Flow response:",
    JSON.stringify(data),
    "| mobile:",
    fullMobile,
    "| status:",
    response.status,
  );

  if (data.type === "success") {
    return { success: true, message: "OTP sent successfully via MSG91" };
  }

  return {
    success: false,
    message: data.message || "Failed to send OTP via MSG91",
  };
};

/**
 * Send OTP SMS using whatever provider is configured in the admin panel.
 * Returns { success, message }.
 */
export const sendOtpSms = async (
  mobile: string,
  otp: string,
): Promise<{ success: boolean; message: string }> => {
  const settings = await getSettings();

  if (!settings || !settings.enabled) {
    console.warn("[SMS] SMS service not configured or disabled");
    return { success: false, message: "SMS service not configured" };
  }

  if (!settings.apiKey || !settings.templateId) {
    console.warn("[SMS] Missing API key or template ID");
    return { success: false, message: "SMS API key or template ID missing" };
  }

  const provider = settings.provider.toLowerCase();

  switch (provider) {
    case "msg91":
      return sendViaMsg91(settings, mobile, otp);
    default:
      console.warn(`[SMS] Unsupported provider: ${provider}`);
      return {
        success: false,
        message: `SMS provider "${provider}" is not yet implemented`,
      };
  }
};

/**
 * Verify OTP via MSG91's verify API (optional — we can verify locally too).
 */
export const verifyOtpViaMsg91 = async (
  mobile: string,
  otp: string,
): Promise<{ success: boolean; message: string }> => {
  const settings = await getSettings();

  if (!settings || settings.provider.toLowerCase() !== "msg91") {
    return { success: false, message: "MSG91 not configured" };
  }

  const fullMobile = mobile.length === 10 ? `91${mobile}` : mobile;

  const url = new URL("https://control.msg91.com/api/v5/otp/verify");
  url.searchParams.set("mobile", fullMobile);
  url.searchParams.set("otp", otp);
  url.searchParams.set("authkey", settings.apiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
  });

  const data = (await response.json()) as { type?: string; message?: string };

  if (data.type === "success") {
    return { success: true, message: "OTP verified successfully" };
  }

  return {
    success: false,
    message: data.message || "OTP verification failed",
  };
};

/**
 * Resend OTP via MSG91's resend API.
 */
export const resendOtpViaMsg91 = async (
  mobile: string,
  retryType: "text" | "voice" = "text",
): Promise<{ success: boolean; message: string }> => {
  const settings = await getSettings();

  if (!settings || settings.provider.toLowerCase() !== "msg91") {
    return { success: false, message: "MSG91 not configured" };
  }

  const fullMobile = mobile.length === 10 ? `91${mobile}` : mobile;

  const url = new URL("https://control.msg91.com/api/v5/otp/retry");
  url.searchParams.set("mobile", fullMobile);
  url.searchParams.set("retrytype", retryType);
  url.searchParams.set("authkey", settings.apiKey);

  const response = await fetch(url.toString(), {
    method: "POST",
  });

  const data = (await response.json()) as { type?: string; message?: string };

  if (data.type === "success") {
    return { success: true, message: "OTP resent successfully" };
  }

  return {
    success: false,
    message: data.message || "Failed to resend OTP",
  };
};
