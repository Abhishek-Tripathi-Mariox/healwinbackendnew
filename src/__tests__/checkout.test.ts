import { isPlaceholder, signatureMatches } from "../services/razorpay.service";
import { ambulancePayable, outstanding, round2 } from "../services/checkout.service";

/**
 * The two things that decide whether money is right: what we charge, and
 * whether we believe the gateway's callback. Both are pure here so they can be
 * pinned without a database or a network.
 */

describe("payment signature", () => {
  const secret = "rzp_test_secret";
  // Razorpay signs `order_id|payment_id` with the key secret.
  const payload = "order_ABC123|pay_XYZ789";
  // Computed with the same HMAC, so the test asserts the format we actually
  // receive rather than re-deriving it the way the implementation does.
  const good =
    require("crypto").createHmac("sha256", secret).update(payload).digest("hex");

  it("accepts the gateway's own signature", () => {
    expect(signatureMatches(secret, payload, good)).toBe(true);
  });

  it("rejects a signature for a different order", () => {
    expect(signatureMatches(secret, "order_OTHER|pay_XYZ789", good)).toBe(false);
  });

  it("rejects a signature made with the wrong secret", () => {
    const forged = require("crypto")
      .createHmac("sha256", "not_the_secret")
      .update(payload)
      .digest("hex");
    expect(signatureMatches(secret, payload, forged)).toBe(false);
  });

  it("rejects an empty or truncated signature instead of throwing", () => {
    // timingSafeEqual throws on a length mismatch, so a short signature must
    // be turned away before it gets there.
    expect(signatureMatches(secret, payload, "")).toBe(false);
    expect(signatureMatches(secret, payload, good.slice(0, 10))).toBe(false);
    expect(signatureMatches(secret, payload, undefined as any)).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    // Otherwise an unconfigured gateway would verify "" against "" and pass.
    expect(signatureMatches("", payload, good)).toBe(false);
    expect(signatureMatches("", payload, "")).toBe(false);
  });
});

describe("what is owed", () => {
  it("subtracts what has already been paid", () => {
    expect(outstanding(1200, 500)).toBe(700);
  });

  it("never goes negative when someone overpaid", () => {
    expect(outstanding(1200, 1500)).toBe(0);
  });

  it("keeps paise exact across the subtraction", () => {
    // 0.1 + 0.2 arithmetic on a bill is how a ₹0.01 balance appears and the
    // ride never shows as paid.
    expect(outstanding(1200.3, 1200.1)).toBe(0.2);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe("ambulance payable", () => {
  it("charges the grand total, which is what the app shows", () => {
    // grandTotal = fare + in-transit medical expenses.
    expect(ambulancePayable({ status: "COMPLETED", amount: 1500, grandTotal: 1850 })).toBe(1850);
  });

  it("falls back to the fare before any expenses are logged", () => {
    expect(ambulancePayable({ status: "ON_TRIP", amount: 1500 })).toBe(1500);
  });

  it("charges only the cancellation fee on a cancelled ride", () => {
    // The fare for a trip that never happened is not a debt.
    expect(
      ambulancePayable({
        status: "CANCELLED",
        amount: 1500,
        grandTotal: 1850,
        cancellationCharge: 200,
      }),
    ).toBe(200);
  });

  it("charges nothing for a cancellation with no fee set", () => {
    expect(ambulancePayable({ status: "CANCELLED", amount: 1500 })).toBe(0);
  });

  it("treats a missing fare as zero rather than NaN", () => {
    expect(ambulancePayable({ status: "SEARCHING" })).toBe(0);
  });
});

describe("placeholder credentials", () => {
  it("recognises the values shipped in .env.example", () => {
    // These look configured but authenticate against nothing, which turns a
    // missing-key problem into a confusing gateway error.
    expect(isPlaceholder("rzp_test_xxxxxxxxxxxxx")).toBe(true);
    expect(isPlaceholder("your_razorpay_secret")).toBe(true);
    expect(isPlaceholder("your-webhook-secret")).toBe(true);
    expect(isPlaceholder("changeme")).toBe(true);
    expect(isPlaceholder("<your key here>")).toBe(true);
  });

  it("does not reject a real key", () => {
    // Razorpay's own documented sample id format, and a realistic secret.
    expect(isPlaceholder("rzp_test_1DP5mmOlF5G5ag")).toBe(false);
    expect(isPlaceholder("rzp_live_8Kq2VnR4pLmT9c")).toBe(false);
    expect(isPlaceholder("ThisIsA32CharLookingSecretValue1")).toBe(false);
  });
});
