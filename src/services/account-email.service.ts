import config from "../config";
import { sendEmail } from "./email.service";

/**
 * Account emails — the ones that carry credentials or a way back into an
 * account.
 *
 * Kept apart from the careers/notification templates on purpose: these are the
 * messages where getting it wrong locks someone out or lets someone else in,
 * so the link, the expiry and what is safe to include are decided in one
 * place rather than at each call site.
 */

const brand = () => config.brand.name;
const panel = () => config.adminPanelUrl;

/** Shared shell, so every account email looks like it came from the same place. */
const wrap = (heading: string, body: string, action?: { label: string; url: string }) => `
<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
  <div style="background:#12305b;padding:20px 24px;border-radius:12px 12px 0 0">
    <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.3px">${brand().toUpperCase()}</div>
    <div style="color:#c7d9f1;font-size:12px;margin-top:2px">${config.brand.tagline}</div>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px">
    <h2 style="margin:0 0 12px;font-size:17px">${heading}</h2>
    ${body}
    ${
      action
        ? `<p style="margin:22px 0 6px">
             <a href="${action.url}" style="background:#12305b;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;display:inline-block;font-weight:600">${action.label}</a>
           </p>
           <p style="font-size:12px;color:#64748b;margin:10px 0 0">
             If the button does not work, paste this into your browser:<br>
             <span style="word-break:break-all">${action.url}</span>
           </p>`
        : ""
    }
    <hr style="border:0;border-top:1px solid #e2e8f0;margin:22px 0">
    <p style="font-size:11px;color:#94a3b8;margin:0">
      This message was sent by ${brand()}. If you were not expecting it, please tell your administrator.
    </p>
  </div>
</div>`;

/**
 * A new panel account.
 *
 * The password is included because this is the only moment it exists in
 * readable form — it is stored hashed and cannot be recovered later. The
 * alternative, a set-password link, is better practice but needs a token flow
 * the panel does not have for invitations yet.
 */
export const sendPanelCredentials = async (data: {
  fullName: string;
  email: string;
  password: string;
  roleName: string;
  employeeCode?: string;
}): Promise<{ sent: boolean; error?: string }> => {
  const html = wrap(
    `Welcome to ${brand()}, ${data.fullName.split(" ")[0]}`,
    `<p style="margin:0 0 14px;font-size:14px;line-height:1.6">
       An account has been created for you on the ${brand()} admin panel.
       You can sign in with the details below.
     </p>
     <table style="width:100%;border-collapse:collapse;font-size:14px;background:#f8fafc;border-radius:8px">
       <tr><td style="padding:9px 12px;color:#64748b;width:120px">Panel</td>
           <td style="padding:9px 12px"><a href="${panel()}" style="color:#12305b">${panel()}</a></td></tr>
       <tr><td style="padding:9px 12px;color:#64748b">Email</td>
           <td style="padding:9px 12px;font-weight:600">${data.email}</td></tr>
       <tr><td style="padding:9px 12px;color:#64748b">Password</td>
           <td style="padding:9px 12px;font-family:monospace;font-weight:600">${data.password}</td></tr>
       <tr><td style="padding:9px 12px;color:#64748b">Role</td>
           <td style="padding:9px 12px">${data.roleName}</td></tr>
       ${
         data.employeeCode
           ? `<tr><td style="padding:9px 12px;color:#64748b">Employee ID</td>
                  <td style="padding:9px 12px;font-family:monospace">${data.employeeCode}</td></tr>`
           : ""
       }
     </table>
     <p style="margin:16px 0 0;font-size:13px;color:#b45309">
       Please change this password after your first sign-in, from
       <strong>My Profile</strong>.
     </p>`,
    { label: "Sign in", url: panel() },
  );

  try {
    await sendEmail({
      to: data.email,
      subject: `Your ${brand()} panel account`,
      html,
    });
    return { sent: true };
  } catch (err: any) {
    // The account exists either way — the caller reports this rather than
    // failing the creation, so nobody is left half-made because SMTP is down.
    return { sent: false, error: err?.message || "Email could not be sent" };
  }
};

/** A password reset link. The token is never logged or returned to a caller. */
export const sendPasswordReset = async (data: {
  fullName: string;
  email: string;
  token: string;
  expiresInMinutes: number;
}): Promise<{ sent: boolean; error?: string }> => {
  const url = `${panel()}/reset-password?token=${encodeURIComponent(data.token)}`;
  const html = wrap(
    "Reset your password",
    `<p style="margin:0 0 14px;font-size:14px;line-height:1.6">
       Hello ${data.fullName.split(" ")[0]}, we received a request to reset the
       password for <strong>${data.email}</strong>.
     </p>
     <p style="margin:0;font-size:14px;line-height:1.6">
       This link works once and expires in ${data.expiresInMinutes} minutes.
       If you did not ask for it, you can ignore this email — your password
       stays as it is.
     </p>`,
    { label: "Choose a new password", url },
  );

  try {
    await sendEmail({ to: data.email, subject: `Reset your ${brand()} password`, html });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err?.message || "Email could not be sent" };
  }
};

/** Told after the fact, so an unexpected reset is noticed. */
export const sendPasswordChanged = async (data: {
  fullName: string;
  email: string;
  byAdmin?: string;
}): Promise<{ sent: boolean }> => {
  const html = wrap(
    "Your password was changed",
    `<p style="margin:0;font-size:14px;line-height:1.6">
       Hello ${data.fullName.split(" ")[0]}, the password for
       <strong>${data.email}</strong> was just changed${data.byAdmin ? ` by ${data.byAdmin}` : ""}.
       If this was not you, contact your administrator straight away — your
       existing sessions have already been signed out.
     </p>`,
  );
  try {
    await sendEmail({ to: data.email, subject: `Your ${brand()} password was changed`, html });
    return { sent: true };
  } catch {
    return { sent: false };
  }
};
