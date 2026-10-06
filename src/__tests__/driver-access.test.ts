import {
  DRIVER_NOT_REGISTERED,
  driverLoginDenial,
} from "../services/driver-access.service";

/**
 * Driver login is invite-only: only a number an admin already added may get an
 * OTP, and verifying never creates the record. These pin the gate that both the
 * send-OTP and verify-OTP paths call.
 */
describe("driver login gate", () => {
  it("refuses a number that has no driver record", () => {
    expect(driverLoginDenial(null)).toBe(DRIVER_NOT_REGISTERED);
    expect(driverLoginDenial(undefined)).toBe(DRIVER_NOT_REGISTERED);
  });

  it("answers for a deleted driver exactly as for an unknown number", () => {
    // Same reply either way, so the response can't be used to probe which
    // numbers were once on the roster.
    expect(
      driverLoginDenial({ status: "approved", isActive: true, isDeleted: true }),
    ).toBe(DRIVER_NOT_REGISTERED);
  });

  it("lets an approved driver through", () => {
    expect(
      driverLoginDenial({
        status: "approved",
        isActive: true,
        isDeleted: false,
      }),
    ).toBeNull();
  });

  it("lets a half-onboarded driver through so they can finish in the app", () => {
    for (const status of [
      "draft",
      "documents_uploaded",
      "vehicle_added",
      "under_verification",
    ]) {
      expect(
        driverLoginDenial({ status, isActive: true, isDeleted: false }),
      ).toBeNull();
    }
  });

  it("blocks a suspended driver with its own reason", () => {
    const denial = driverLoginDenial({
      status: "suspended",
      isActive: true,
      isDeleted: false,
    });
    expect(denial?.msg).toBe("driver_suspended");
    expect(denial?.rCode).toBe(4);
  });

  it("blocks a rejected driver with its own reason", () => {
    expect(
      driverLoginDenial({ status: "rejected", isActive: true, isDeleted: false })
        ?.msg,
    ).toBe("driver_rejected");
  });

  it("blocks a deactivated driver", () => {
    expect(
      driverLoginDenial({ status: "approved", isActive: false, isDeleted: false })
        ?.msg,
    ).toBe("driver_account_inactive");
  });

  it("prefers the suspension reason over the generic inactive one", () => {
    // Suspending also clears isActive in some flows; the driver should still be
    // told they are suspended, not just "deactivated".
    expect(
      driverLoginDenial({
        status: "suspended",
        isActive: false,
        isDeleted: false,
      })?.msg,
    ).toBe("driver_suspended");
  });

  it("treats a record with no flags set as loggable-in", () => {
    // Older rows predate isActive/isDeleted defaults; absent must not mean
    // blocked, or every legacy driver is locked out.
    expect(driverLoginDenial({ status: "approved" })).toBeNull();
  });

  it("gives every denial a message key and an actionable hint", () => {
    const subjects = [
      null,
      { status: "suspended" },
      { status: "rejected" },
      { status: "approved", isActive: false },
    ];
    for (const s of subjects) {
      const denial = driverLoginDenial(s);
      expect(denial).not.toBeNull();
      expect(denial!.msg).toMatch(/^driver_/);
      expect(denial!.hint).toContain("HealWin team");
    }
  });
});
