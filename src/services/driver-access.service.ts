import { DriverStatus } from "../interfaces/driver";

/**
 * Driver login is invite-only: a Driver row must already exist (created by an
 * admin) before that number can be sent an OTP. The app no longer self-signs-up
 * on first verify, so this is the single place that decides who gets in — kept
 * pure so both the send-OTP and verify-OTP paths can share it and so it can be
 * tested without a database.
 */

/** The shape the gate needs — a Mongoose Driver doc satisfies it. */
export interface DriverAccessSubject {
  status?: DriverStatus | string | null;
  isActive?: boolean | null;
  isDeleted?: boolean | null;
}

export interface DriverAccessDenial {
  /** req.rCode for ResponseMiddleware: 5 => 404, 4 => 403. */
  rCode: 4 | 5;
  /** req.msg — also the key the app can branch on. */
  msg: string;
  /** Human-readable next step, surfaced by the driver app. */
  hint: string;
}

const CONTACT = "Please contact the HealWin team";

export const DRIVER_NOT_REGISTERED: DriverAccessDenial = {
  rCode: 5,
  msg: "driver_not_registered",
  hint: `This number isn't registered as a HealWin driver. ${CONTACT} to get onboarded.`,
};

/**
 * Returns the reason this number may not log in, or null when it may.
 *
 * A deleted or missing record answers identically, so the response never
 * discloses that a number was once onboarded and then removed.
 */
export const driverLoginDenial = (
  driver: DriverAccessSubject | null | undefined,
): DriverAccessDenial | null => {
  if (!driver || driver.isDeleted) return DRIVER_NOT_REGISTERED;

  if (driver.status === "suspended") {
    return {
      rCode: 4,
      msg: "driver_suspended",
      hint: `Your HealWin driver account is suspended. ${CONTACT} to have it reviewed.`,
    };
  }

  if (driver.status === "rejected") {
    return {
      rCode: 4,
      msg: "driver_rejected",
      hint: `Your HealWin driver application was not approved. ${CONTACT} if you think this is a mistake.`,
    };
  }

  // isActive is cleared by admin delete/deactivate; checked after the status
  // cases so a suspended driver still gets the message that explains why.
  if (driver.isActive === false) {
    return {
      rCode: 4,
      msg: "driver_account_inactive",
      hint: `Your HealWin driver account has been deactivated. ${CONTACT} to have it restored.`,
    };
  }

  // Every other status (draft ... approved) is mid-onboarding and must still be
  // able to sign in — that is how the driver finishes documents and vehicle.
  return null;
};
