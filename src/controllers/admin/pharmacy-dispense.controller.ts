import { Request, Response, NextFunction } from "express";
import PharmacyDispense from "../../models/pharmacy-dispense.model";
import InventoryItem from "../../models/inventory-item.model";
import StockTransaction from "../../models/stock-transaction.model";
import { issueFefo } from "../../services/inventory-batch.service";
import HospitalPatient from "../../models/hospital-patient.model";
import EmrEncounter from "../../models/emr-encounter.model";
import Admission from "../../models/admission.model";
import { findAllergyConflicts } from "./emr.controller";
import { appendToOpenInvoice } from "./billing.controller";

/**
 * Pharmacy counter — the queue of prescriptions raised by doctors, and
 * fulfilling them against real HMS stock.
 */

/** GET /admin/pharmacy-dispense?status= — the counter's worklist. */
export const list = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
  );
  const query: any = {};
  // Default to the open queue — that is what the counter actually works from.
  query.status = req.query.status || { $in: ["pending", "partial"] };
  if (req.query.patientId) query.patientId = req.query.patientId;

  // A pharmacist assigned to an outlet works only that outlet's queue (plus
  // requests not tied to any outlet, i.e. the hospital's own counter).
  const myPharmacyId = (req as any).admin?.pharmacyId;
  if (myPharmacyId) {
    query.$or = [
      { pharmacyId: myPharmacyId },
      { pharmacyId: null },
      { pharmacyId: { $exists: false } },
    ];
  }

  const [items, total] = await Promise.all([
    PharmacyDispense.find(query)
      .sort({ createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("patientId", "patientId fullName phone")
      .populate("doctorId", "fullName")
      .lean(),
    PharmacyDispense.countDocuments(query),
  ]);

  req.rData = {
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
  req.msg = "dispense_list";
  return next();
};

/**
 * POST /admin/pharmacy-dispense/:id/fulfil — hand the medicine over.
 *
 * body: { lines: [{ index, quantity }] } — quantity actually issued per line.
 * Omitted lines fall back to the prescribed quantity.
 *
 * Each line with an `itemId` draws stock FEFO and writes a StockTransaction so
 * the ledger shows who it went to. Lines without an itemId (free-typed drugs)
 * are recorded as dispensed but touch no stock.
 *
 * A line is skipped (not failed) when stock is short — the request goes
 * "partial" so the counter can chase the shortfall rather than losing the
 * whole prescription.
 */
export const fulfil = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const adminId = (req as any).adminId;
  const doc = await PharmacyDispense.findById(req.params.id as string);
  if (!doc) {
    req.rCode = 5;
    req.msg = "dispense_not_found";
    req.rData = {};
    return next();
  }
  if (doc.status === "dispensed" || doc.status === "cancelled") {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `request already ${doc.status}` };
    return next();
  }

  // Allergy safety gate — hand-over is the physical-administration moment, so
  // a known conflict blocks outright unless explicitly overridden with a
  // documented reason. Mirrors the encounter dispense path this queue replaced;
  // without it, dispensing from the queue would have been a way around the check.
  if (!req.body?.overrideAllergyWarning) {
    const patient: any = await HospitalPatient.findById(doc.patientId)
      .select("healthHistory.allergies")
      .lean();
    const allergyWarnings = findAllergyConflicts(
      patient?.healthHistory?.allergies,
      doc.lines.map((l) => l.drug),
    );
    if (allergyWarnings.length > 0) {
      req.rCode = 0;
      req.msg = "allergy_warning";
      req.rData = {
        allergyWarnings,
        hint: "Patient has a recorded allergy that may conflict. Resubmit with overrideAllergyWarning: true (and a documented reason) to proceed.",
      };
      return next();
    }
  }

  // Bill IPD dispensing against the active admission, not the patient — the
  // admission's pharmacy lines are looked up by admissionId, so using the
  // patient id here would drop the charge off the stay's bill entirely.
  let issuedToRef = String(doc.patientId);
  if (doc.encounterId) {
    const enc: any = await EmrEncounter.findById(doc.encounterId)
      .select("encounterType")
      .lean();
    if (enc?.encounterType === "IPD") {
      const active: any = await Admission.findOne({
        patientId: doc.patientId,
        status: "admitted",
      })
        .select("_id")
        .lean();
      if (active) issuedToRef = String(active._id);
    }
  }

  const overrides = new Map<number, number>();
  for (const l of Array.isArray(req.body?.lines) ? req.body.lines : []) {
    const i = Number(l?.index);
    const q = Number(l?.quantity);
    if (Number.isInteger(i) && Number.isFinite(q) && q >= 0) overrides.set(i, q);
  }

  const shortfalls: string[] = [];
  // What actually left the shelf this call — used to bill and to stamp the
  // ledger rows as billed.
  const issuedTx: {
    txId: any;
    name: string;
    quantity: number;
    sellingPrice: number;
  }[] = [];
  const admissionForBilling =
    issuedToRef !== String(doc.patientId) ? issuedToRef : undefined;

  for (let i = 0; i < doc.lines.length; i++) {
    const line = doc.lines[i];
    const already = line.dispensedQuantity || 0;
    const target = overrides.has(i) ? overrides.get(i)! : line.quantity;
    const toIssue = Math.max(0, target - already);
    if (toIssue <= 0) continue;

    if (!line.itemId) {
      // Not stocked here — record the hand-over without touching inventory.
      line.dispensedQuantity = already + toIssue;
      continue;
    }

    const item: any = await InventoryItem.findById(line.itemId);
    if (!item) {
      shortfalls.push(`${line.drug}: item no longer exists`);
      continue;
    }
    if ((item.currentStock || 0) < toIssue) {
      shortfalls.push(
        `${line.drug}: need ${toIssue}, only ${item.currentStock || 0} in stock`,
      );
      continue;
    }

    const result = await issueFefo({ itemId: line.itemId, quantity: toIssue });
    line.dispensedQuantity = already + toIssue;

    const tx = await StockTransaction.create({
      itemId: line.itemId,
      type: "out",
      quantity: toIssue,
      balanceAfter: result.currentStock,
      // Real cost of the batches actually drawn — without it the COGS and
      // wastage reports understate every pharmacy issue.
      amount: result.costOfGoodsIssued,
      reason: "Prescription dispensed",
      issuedToType: "patient",
      issuedToRef,
      performedByAdminId: adminId,
    });
    issuedTx.push({
      txId: tx._id,
      name: item.name,
      quantity: toIssue,
      sellingPrice: Number(item.sellingPrice) || Number(item.unitCost) || 0,
    });
  }

  // Bill what was actually handed over, onto the patient's open invoice. Each
  // StockTransaction is stamped with the invoice so generate() will not pull
  // the same medicine in a second time. Best-effort: never undo a dispense.
  try {
    const billable = issuedTx.filter((t) => t.sellingPrice > 0);
    if (billable.length) {
      const invoice = await appendToOpenInvoice({
        patientId: doc.patientId,
        admissionId: admissionForBilling,
        encounterId: doc.encounterId,
        doctorId: doc.doctorId,
        adminId,
        lines: billable.map((t) => ({
          section: "pharmacy" as const,
          description: `${t.name} × ${t.quantity}`,
          quantity: t.quantity,
          unitPrice: t.sellingPrice,
          amount: Math.round(t.quantity * t.sellingPrice * 100) / 100,
        })),
      });
      if (invoice) {
        await StockTransaction.updateMany(
          { _id: { $in: issuedTx.map((t) => t.txId) } },
          { $set: { invoiceId: invoice._id } },
        );
      }
    }
  } catch (e) {
    console.error("pharmacy auto-bill failed:", e);
  }

  const allDone = doc.lines.every(
    (l) => (l.dispensedQuantity || 0) >= (l.quantity || 0),
  );
  const anyDone = doc.lines.some((l) => (l.dispensedQuantity || 0) > 0);
  doc.status = allDone ? "dispensed" : anyDone ? "partial" : "pending";
  if (allDone) {
    doc.dispensedByAdminId = adminId;
    doc.dispensedAt = new Date();
  }
  await doc.save();

  req.rData = { dispense: doc, shortfalls };
  req.msg = allDone ? "dispensed" : "partially_dispensed";
  return next();
};

/** POST /admin/pharmacy-dispense/:id/cancel */
export const cancel = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const doc = await PharmacyDispense.findById(req.params.id as string);
  if (!doc) {
    req.rCode = 5;
    req.msg = "dispense_not_found";
    req.rData = {};
    return next();
  }
  doc.status = "cancelled";
  doc.notes = req.body?.reason || doc.notes;
  await doc.save();
  req.rData = { dispense: doc };
  req.msg = "dispense_cancelled";
  return next();
};
