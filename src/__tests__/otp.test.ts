import helpers, { OTP_LENGTH } from "../utils/helpers";

/**
 * The OTP length is a cross-surface contract: the backend mints it, the
 * request validators enforce it, and the patient app, driver app and admin
 * panel size their input boxes to it. These pin the generator so a change
 * can't silently desync the front-ends again.
 */
describe("OTP length contract", () => {
  it("is 4 digits", () => {
    expect(OTP_LENGTH).toBe(4);
  });

  it("generateOTP always produces exactly OTP_LENGTH digits", () => {
    const { generateOTP } = helpers();
    for (let i = 0; i < 2000; i++) {
      const otp = generateOTP();
      expect(String(otp)).toHaveLength(OTP_LENGTH);
      // No leading zero to be lost when the code is stringified and compared.
      expect(otp).toBeGreaterThanOrEqual(10 ** (OTP_LENGTH - 1));
      expect(otp).toBeLessThan(10 ** OTP_LENGTH);
    }
  });

  it("honours an explicit length for any caller that needs one", () => {
    const { generateOTP } = helpers();
    expect(String(generateOTP(6))).toHaveLength(6);
  });
});
