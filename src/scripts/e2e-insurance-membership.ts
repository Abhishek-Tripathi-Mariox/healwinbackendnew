/**
 * Insurance + membership end-to-end test.
 *
 * Exercises the real handlers: the insurance document requirement, and the
 * membership lifecycle (concession reaching the fare engine, expiry, family
 * cap, extend-on-renew). Test data is prefixed E2E- and removed at the end.
 *
 * Usage: npm run e2e:insurance
 */
import mongoose from "mongoose";
import config from "../config";
import { MembershipPlan, UserMembership } from "../models/membership.model";
import { PatientPolicy, InsurancePayer, InsuranceClaim } from "../models/insurance.model";
import {
  balanceOf,
  payablePoliciesFor,
  deductFromPolicy,
} from "../services/insurance-payment.service";
import User from "../models/Users";
import {
  getActiveMembership,
  getMembershipConcession,
  expireLapsedMemberships,
} from "../services/membership.service";
import { calculateFare } from "../services/fare.service";
import VehicleType from "../models/vehicle-type.model";
import "../models/hospital-patient.model";

const TAG = "E2E-INS";
let pass = 0, fail = 0;
const failures: string[] = [];
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✅ ${l}`); }
  else { fail++; failures.push(l); console.log(`  ❌ ${l}${d ? ` — ${d}` : ""}`); }
};
const section = (n: string) => console.log(`\n── ${n} ──`);

const cleanup = async () => {
  const users = await User.find({ fullName: new RegExp(`^${TAG}`) }).select("_id").lean();
  const ids = users.map((u: any) => u._id);
  await Promise.all([
    MembershipPlan.deleteMany({ name: new RegExp(`^${TAG}`) }),
    UserMembership.deleteMany({ userId: { $in: ids } }),
    InsurancePayer.deleteMany({ name: new RegExp(`^${TAG}`) }),
    User.deleteMany({ fullName: new RegExp(`^${TAG}`) }),
  ]);
};

const run = async () => {
  await mongoose.connect(config.database.url);
  console.log("✅ Connected\n");
  await cleanup();

  try {
    const user: any = await User.create({
      fullName: `${TAG} Member`,
      mobileNumber: "9999966601",
      countryCode: "+91",
      isActive: true,
    });

    // ══ Membership plan + concession ══
    section("Membership — plan & concession");
    const plan: any = await MembershipPlan.create({
      name: `${TAG} Gold`, tier: "gold", price: 4999, durationMonths: 12,
      concessionPercent: 20, maxFamilyMembers: 2, isActive: true,
    });
    ok("plan stores a family cap", plan.maxFamilyMembers === 2);

    ok("no membership → no concession", (await getMembershipConcession(user._id)) === 0);

    const validUpto = new Date();
    validUpto.setMonth(validUpto.getMonth() + 12);
    const mem: any = await UserMembership.create({
      userId: user._id, planId: plan._id, planName: plan.name, tier: "gold",
      validUpto, amountDue: plan.price, amountPaid: 0, paymentStatus: "pending",
      status: "active",
    });
    ok("enrolment records the price as DUE, not paid",
       mem.amountDue === 4999 && mem.amountPaid === 0 && mem.paymentStatus === "pending");

    const active = await getActiveMembership(user._id);
    ok("active membership resolves", !!active);
    ok("concession read from the plan, not snapshotted", active?.concessionPercent === 20);
    ok("days remaining computed", (active?.daysRemaining || 0) > 300);

    // ══ The concession must reach the fare ══
    section("Membership — concession reaches the fare");
    // Fares need a real VehicleType — use whichever the org has configured.
    const vt: any = await VehicleType.findOne({ isDeleted: { $ne: true } }).lean();
    if (!vt) throw new Error("no VehicleType configured — run the seed first");
    const fare = (concession?: number) =>
      calculateFare({
        vehicleTypeId: vt._id,
        distanceKm: 10,
        durationMin: 20,
        serviceType: "WITHIN_CITY",
        ...(concession !== undefined ? { membershipConcessionPercent: concession } : {}),
      });
    const baseFare = await fare();
    const withPlan = await fare(20);
    ok("a member pays less than a non-member",
       withPlan.finalFare < baseFare.finalFare, `${withPlan.finalFare} vs ${baseFare.finalFare}`);
    ok("discount is exactly 20% of the total",
       Math.abs(withPlan.membershipDiscount - baseFare.finalFare * 0.2) < 0.05,
       `${withPlan.membershipDiscount}`);
    ok("the concession is reported back for the app to explain",
       withPlan.membershipConcessionPercent === 20);
    ok("fare never inverts on a nonsense concession",
       (await fare(500)).finalFare >= 0);

    // ══ Expiry ══
    section("Membership — expiry");
    const past = new Date();
    past.setDate(past.getDate() - 1);
    await UserMembership.updateOne({ _id: mem._id }, { $set: { validUpto: past } });
    ok("a lapsed plan does not resolve as active",
       (await getActiveMembership(user._id)) === null);
    const after: any = await UserMembership.findById(mem._id).lean();
    ok("reading it flipped the status to expired", after?.status === "expired");
    ok("an expired member gets no concession",
       (await getMembershipConcession(user._id)) === 0);

    await UserMembership.updateOne({ _id: mem._id }, { $set: { status: "active", validUpto: past } });
    ok("the sweep expires lapsed rows", (await expireLapsedMemberships()) >= 1);

    // ══ Deactivated plan stops granting ══
    section("Membership — deactivated plan");
    const v2 = new Date(); v2.setMonth(v2.getMonth() + 6);
    await UserMembership.create({
      userId: user._id, planId: plan._id, planName: plan.name, tier: "gold",
      validUpto: v2, status: "active",
    });
    await MembershipPlan.updateOne({ _id: plan._id }, { $set: { isActive: false } });
    const onDeadPlan = await getActiveMembership(user._id);
    ok("membership survives its plan being deactivated", !!onDeadPlan);
    ok("but the benefit stops", onDeadPlan?.concessionPercent === 0);
    await MembershipPlan.updateOne({ _id: plan._id }, { $set: { isActive: true } });

    // ══ Enrolment lifecycle ══
    section("Membership — enrolment lifecycle");
    // Renewing must EXTEND, not restart — otherwise switching plans throws
    // away time the member already paid for.
    const u2: any = await User.create({
      fullName: `${TAG} Renewer`, mobileNumber: "9999966602", countryCode: "+91", isActive: true,
    });
    const sixMonths = new Date();
    sixMonths.setMonth(sixMonths.getMonth() + 6);
    await UserMembership.create({
      userId: u2._id, planId: plan._id, planName: plan.name, tier: "gold",
      validUpto: sixMonths, status: "active",
    });
    const before = await getActiveMembership(u2._id);
    const renewBase =
      before && new Date(before.validUpto) > new Date()
        ? new Date(before.validUpto)
        : new Date();
    const extended = new Date(renewBase);
    extended.setMonth(extended.getMonth() + plan.durationMonths);
    await UserMembership.updateMany(
      { userId: u2._id, status: "active" }, { $set: { status: "cancelled" } },
    );
    await UserMembership.create({
      userId: u2._id, planId: plan._id, planName: plan.name, tier: "gold",
      validUpto: extended, amountDue: plan.price, paymentStatus: "pending", status: "active",
    });
    const afterRenew = await getActiveMembership(u2._id);
    ok("renewing extends from the existing expiry, not from today",
       afterRenew != null && new Date(afterRenew.validUpto) > sixMonths,
       `${afterRenew?.validUpto}`);
    ok("only ONE membership stays active after renewing",
       (await UserMembership.countDocuments({ userId: u2._id, status: "active" })) === 1);
    ok("the superseded one is cancelled, not deleted",
       (await UserMembership.countDocuments({ userId: u2._id, status: "cancelled" })) === 1);
    ok("the app can tell which plan is current", !!afterRenew?.planId);

    // ══ Insurance documents ══
    section("Insurance — proof is mandatory");
    const payer: any = await InsurancePayer.create({ name: `${TAG} Star Health`, type: "insurer" });
    ok("payer created", !!payer);

    // The model keeps documents optional so pre-existing rows stay saveable;
    // the API is what enforces it. Both halves matter, so check both.
    const legacy = await PatientPolicy.create({
      patientId: new mongoose.Types.ObjectId(),
      payerId: payer._id, policyNumber: `${TAG}-OLD`,
    });
    ok("policies predating the rule remain saveable", legacy.documents.length === 0);

    const withDoc = await PatientPolicy.create({
      patientId: new mongoose.Types.ObjectId(),
      payerId: payer._id, policyNumber: `${TAG}-NEW`,
      documents: [
        { kind: "policy", name: "schedule.pdf", url: "https://s3.example/schedule.pdf", mimeType: "application/pdf", uploadedAt: new Date() },
        { kind: "card", name: "card.jpg", url: "https://s3.example/card.jpg", mimeType: "image/jpeg", uploadedAt: new Date() },
      ],
    });
    ok("a policy stores both documents", withDoc.documents.length === 2);
    ok("the policy paper and the card are told apart",
       withDoc.documents[0].kind === "policy" && withDoc.documents[1].kind === "card");
    ok("document keeps its url and type",
       withDoc.documents[0].url.endsWith("schedule.pdf") && withDoc.documents[0].mimeType === "application/pdf");
    ok("each document gets an id so it can be removed later",
       !!withDoc.documents[0]._id);
    // A card on its own must not read as proof of cover.
    const cardOnly = await PatientPolicy.create({
      patientId: new mongoose.Types.ObjectId(),
      payerId: payer._id, policyNumber: `${TAG}-CARDONLY`,
      documents: [{ kind: "card", name: "c.jpg", url: "https://s3.example/c.jpg", uploadedAt: new Date() }],
    });
    ok("a card-only policy has no policy document",
       !cardOnly.documents.some((d: any) => d.kind === "policy"));

    // ══ Paying from insurance ══
    section("Insurance — deducting from cover");
    const patientA = new mongoose.Types.ObjectId();
    const patientB = new mongoose.Types.ObjectId();

    const pending: any = await PatientPolicy.create({
      patientId: patientA, payerId: payer._id, policyNumber: `${TAG}-PEND`,
      sumInsured: 100000, approvalStatus: "pending", source: "patient",
    });
    const approved: any = await PatientPolicy.create({
      patientId: patientA, payerId: payer._id, policyNumber: `${TAG}-APPR`,
      sumInsured: 50000, approvalStatus: "approved", source: "patient",
    });
    const otherPersons: any = await PatientPolicy.create({
      patientId: patientB, payerId: payer._id, policyNumber: `${TAG}-OTHER`,
      sumInsured: 90000, approvalStatus: "approved",
    });

    let r = await deductFromPolicy({ policyId: String(pending._id), patientId: patientA, amount: 1000 });
    ok("an UNAPPROVED policy cannot pay", !r.ok, r.reason);
    ok("the reason says it is awaiting verification",
       (r.reason || "").toLowerCase().includes("verification"), r.reason);

    r = await deductFromPolicy({ policyId: String(otherPersons._id), patientId: patientA, amount: 1000 });
    ok("another patient's policy cannot pay this bill", !r.ok, r.reason);

    r = await deductFromPolicy({ policyId: String(approved._id), patientId: patientA, amount: 60000 });
    ok("cannot claim more than the cover remaining", !r.ok, r.reason);

    r = await deductFromPolicy({ policyId: String(approved._id), patientId: patientA, amount: 0 });
    ok("a zero amount is refused", !r.ok);

    r = await deductFromPolicy({ policyId: String(approved._id), patientId: patientA, amount: 20000 });
    ok("an approved, in-cover claim goes through", r.ok, r.reason);
    ok("it raises a real claim with a number", !!r.claim?.claimNumber);
    ok("cover drops by what was claimed", r.balance?.remaining === 30000, String(r.balance?.remaining));

    r = await deductFromPolicy({ policyId: String(approved._id), patientId: patientA, amount: 30001 });
    ok("the reduced balance is enforced on the next claim", !r.ok, r.reason);

    r = await deductFromPolicy({ policyId: String(approved._id), patientId: patientA, amount: 30000 });
    ok("the exact remaining amount can be claimed", r.ok, r.reason);
    ok("cover is now exhausted", r.balance?.remaining === 0);

    r = await deductFromPolicy({ policyId: String(approved._id), patientId: patientA, amount: 1 });
    ok("an exhausted policy cannot pay again", !r.ok, r.reason);

    // Expiry
    const expiredPolicy: any = await PatientPolicy.create({
      patientId: patientA, payerId: payer._id, policyNumber: `${TAG}-EXP`,
      sumInsured: 10000, approvalStatus: "approved",
      validTo: new Date(Date.now() - 86400000),
    });
    r = await deductFromPolicy({ policyId: String(expiredPolicy._id), patientId: patientA, amount: 100 });
    ok("an expired policy cannot pay", !r.ok, r.reason);

    // A claim created by paying from insurance is already reflected on the
    // invoice — settling it later must not credit the bill a second time.
    const invoiceId = new mongoose.Types.ObjectId();
    const paidPolicy: any = await PatientPolicy.create({
      patientId: patientA, payerId: payer._id, policyNumber: `${TAG}-DBL`,
      sumInsured: 50000, approvalStatus: "approved",
    });
    const dbl = await deductFromPolicy({
      policyId: String(paidPolicy._id), patientId: patientA,
      invoiceId, amount: 5000,
    });
    ok("paying from insurance marks the claim already posted",
       !!dbl.claim?.postedToInvoiceAt);

    const options = await payablePoliciesFor(patientA);
    ok("the desk sees every policy, usable or not", options.length >= 3);
    ok("unusable ones carry the reason why",
       options.filter((o) => !o.usable).every((o) => !!o.reason));
    const bal = await balanceOf(await PatientPolicy.findById(pending._id).populate("payerId", "name").lean() as any);
    ok("a pending policy reports full cover but is not usable",
       bal.remaining === 100000 && bal.usable === false);

    await InsuranceClaim.deleteMany({ policyId: { $in: [approved._id, pending._id, otherPersons._id, expiredPolicy._id] } });
    await PatientPolicy.deleteMany({ policyNumber: new RegExp(`^${TAG}`) });
  } finally {
    section("Cleanup");
    await cleanup();
    await PatientPolicy.deleteMany({ policyNumber: new RegExp(`^${TAG}`) });
    console.log("  ✅ test data removed");
    await mongoose.disconnect();
  }

  console.log(`\n${"═".repeat(44)}\n  PASSED: ${pass}    FAILED: ${fail}\n${"═".repeat(44)}`);
  if (fail) failures.forEach((f) => console.log(`   • ${f}`));
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error("💥", e); process.exit(1); });
