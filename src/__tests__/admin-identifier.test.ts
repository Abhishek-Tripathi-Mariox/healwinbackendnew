import { adminIdentifierFilter } from "../controllers/admin/admin-auth.controller";

/**
 * Which field a typed login identifier is matched against. Getting this wrong
 * either locks someone out of their own account or, worse, matches the wrong
 * one — so every shape a person might type is pinned here.
 */
describe("admin login identifier", () => {
  it("reads a plain Indian mobile as a phone", () => {
    expect(adminIdentifierFilter("9876543210")).toEqual({ phone: "9876543210" });
  });

  it("accepts the ways a number gets pasted", () => {
    // From a contacts app, a spreadsheet, or typed with the country code.
    expect(adminIdentifierFilter("+919876543210")).toEqual({ phone: "9876543210" });
    expect(adminIdentifierFilter("09876543210")).toEqual({ phone: "9876543210" });
    expect(adminIdentifierFilter("98765 43210")).toEqual({ phone: "9876543210" });
    expect(adminIdentifierFilter("98765-43210")).toEqual({ phone: "9876543210" });
    expect(adminIdentifierFilter("  9876543210  ")).toEqual({ phone: "9876543210" });
  });

  it("reads an email as an email, lower-cased", () => {
    // The column is stored lower-case, so the query has to match that.
    expect(adminIdentifierFilter("Admin@HealWin.com")).toEqual({
      email: "admin@healwin.com",
    });
  });

  it("does not mistake an email for a phone just because it has digits", () => {
    expect(adminIdentifierFilter("9876543210@gmail.com")).toEqual({
      email: "9876543210@gmail.com",
    });
  });

  it("treats a number that is not a valid Indian mobile as an email", () => {
    // Better to look it up as an email and fail to find it than to silently
    // match some other account's phone.
    expect(adminIdentifierFilter("12345")).toEqual({ email: "12345" });
    expect(adminIdentifierFilter("1234567890")).toEqual({ email: "1234567890" });
    expect(adminIdentifierFilter("98765432101")).toEqual({ email: "98765432101" });
  });
});
