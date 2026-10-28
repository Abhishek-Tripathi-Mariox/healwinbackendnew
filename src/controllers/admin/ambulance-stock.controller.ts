import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import Ambulance from "../../models/ambulance.model";
import {
  AmbulanceStock,
  AmbulanceStockTransaction,
} from "../../models/ambulance-stock.model";
import { adjustAmbulanceStock, restockAmbulance } from "../../services/ambulance-stock.service";

/**
 * POST /admin/ambulance-stock/:ambulanceId/issue — load stock onto a vehicle
 * directly, without waiting for the crew to ask.
 *
 * Until now the ONLY way anything reached a vehicle was fulfilling a crew
 * stock request, so stocking a new ambulance, or topping one up before a
 * shift, meant someone had to raise a request on the crew app first and then
 * approve their own request. The ward side has had this since the beginning
 * (POST /admin/ward-stock/:wardId/issue); this is its ambulance twin and uses
 * the same service, so central inventory, FEFO batches and both journals
 * behave identically.
 */
export const issueToAmbulance = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const ambulanceId = req.params.ambulanceId as string;
  if (!Types.ObjectId.isValid(ambulanceId)) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }
  const amb = await Ambulance.findById(ambulanceId).select("_id registrationNumber").lean();
  if (!amb) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }

  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const lines = items
    .map((i: any) => ({ itemId: i.itemId, name: i.name, qty: Number(i.qty) || 0 }))
    .filter((i: any) => i.qty > 0 && (i.itemId || i.name));
  if (lines.length === 0) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "Add at least one item with a quantity." };
    return next();
  }

  const result = await restockAmbulance({
    ambulanceId: amb._id,
    performedByAdminId: (req as any).adminId,
    items: lines,
  });

  req.rData = result;
  // Partial success is the normal case when central stock has run short, so
  // it is reported rather than hidden behind a bare "success".
  req.msg = result.skipped.length
    ? `${result.moved} item(s) loaded. Not loaded: ${result.skipped.join(", ")}`
    : `${result.moved} item(s) loaded onto ${amb.registrationNumber}.`;
  return next();
};

/**
 * POST /admin/ambulance-stock/:ambulanceId/adjust — correct the on-hand count.
 *
 * For a stock-take, breakage or expiry on the vehicle. Central inventory is
 * NOT touched: those units already left the store.
 */
export const adjustAmbulance = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const ambulanceId = req.params.ambulanceId as string;
  const { itemId, delta, note } = req.body || {};
  if (!Types.ObjectId.isValid(ambulanceId) || !Types.ObjectId.isValid(String(itemId))) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "Pick a vehicle and an item." };
    return next();
  }
  const amount = Math.round(Number(delta) || 0);
  if (!amount) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "Enter how many to add (+) or remove (−)." };
    return next();
  }
  if (!String(note || "").trim()) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: "Say why the count is being corrected." };
    return next();
  }

  const result = await adjustAmbulanceStock({
    ambulanceId,
    itemId,
    delta: amount,
    note: String(note).trim(),
    performedByAdminId: (req as any).adminId,
  });
  if (!result) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = { hint: "That item could not be found." };
    return next();
  }
  req.rData = result;
  req.msg = `${result.itemName} is now ${result.balanceAfter} on this vehicle.`;
  return next();
};

/** GET /admin/ambulance-stock/:ambulanceId?page=&limit= — on-hand stock + recent movements. */
export const ambulanceStock = async (req: Request, _res: Response, next: NextFunction) => {
  const ambulanceId = req.params.ambulanceId as string;
  // The value aggregate below casts this itself, and an id that isn't an
  // ObjectId would throw there rather than come back as "no such vehicle".
  if (!Types.ObjectId.isValid(ambulanceId)) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
  );
  const [amb, rows, total, valueAgg, recent] = await Promise.all([
    Ambulance.findById(ambulanceId).select("registrationNumber ambulanceType").lean(),
    AmbulanceStock.find({ ambulanceId })
      .populate("itemId", "name unit category sellingPrice unitCost")
      .sort({ quantity: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AmbulanceStock.countDocuments({ ambulanceId }),
    // On-hand value is the whole vehicle's, not the page's — summing the page
    // would make the badge shrink as you page through the same stock.
    AmbulanceStock.aggregate([
      { $match: { ambulanceId: new Types.ObjectId(ambulanceId) } },
      {
        $lookup: {
          from: "inventoryitems",
          localField: "itemId",
          foreignField: "_id",
          as: "item",
        },
      },
      { $unwind: "$item" },
      {
        $group: {
          _id: null,
          value: {
            $sum: { $multiply: ["$quantity", { $ifNull: ["$item.sellingPrice", 0] }] },
          },
        },
      },
    ]),
    AmbulanceStockTransaction.find({ ambulanceId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  const items = rows.map((r: any) => {
    const it = r.itemId || {};
    const price = it.sellingPrice ?? 0;
    return {
      itemId: String(it._id || r.itemId),
      name: it.name || "Item",
      unit: it.unit || "",
      category: it.category || "",
      quantity: r.quantity,
      sellingPrice: price,
      onHandValue: r.quantity * price,
    };
  });

  req.rData = {
    ambulance: amb
      ? { _id: String((amb as any)._id), registrationNumber: (amb as any).registrationNumber, type: (amb as any).ambulanceType }
      : null,
    items,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    onHandValue: Math.round(valueAgg[0]?.value || 0),
    recent: recent.map((t: any) => ({
      _id: String(t._id),
      itemName: t.itemName,
      type: t.type,
      quantity: t.quantity,
      balanceAfter: t.balanceAfter,
      amount: t.amount ?? null,
      reason: t.reason,
      patientName: t.patientName ?? null,
      at: t.createdAt,
    })),
  };
  req.msg = "success";
  return next();
};

/**
 * GET /admin/ambulance-stock/reports?tab=&page=&limit= — spend analytics:
 *  - byAmbulance: per vehicle → on-hand value, total consumed ₹, restock count
 *  - byPatient:   per patient → total spend ₹ on ambulance supplies
 *
 * Both tables page independently; `tab` says which one the caller is showing so
 * only that one's page is requested (the other is returned empty).
 */
export const reports = async (req: Request, _res: Response, next: NextFunction) => {
  const page = Math.max(1, parseInt((req.query.page as string) || "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt((req.query.limit as string) || "20", 10)),
  );
  const skip = (page - 1) * limit;
  const tab = req.query.tab === "patients" ? "patients" : "ambulances";

  const [consumedAgg, onHandAgg, patientFacet, ambs] = await Promise.all([
    AmbulanceStockTransaction.aggregate([
      { $match: { type: "out" } },
      {
        $group: {
          _id: "$ambulanceId",
          consumedValue: { $sum: { $ifNull: ["$amount", 0] } },
          consumedQty: { $sum: "$quantity" },
        },
      },
    ]),
    AmbulanceStock.aggregate([
      { $match: { quantity: { $gt: 0 } } },
      { $group: { _id: "$ambulanceId", lines: { $sum: 1 }, qty: { $sum: "$quantity" } } },
    ]),
    AmbulanceStockTransaction.aggregate([
      { $match: { type: "out", patientId: { $ne: null } } },
      {
        $group: {
          _id: "$patientId",
          patientName: { $first: "$patientName" },
          totalSpend: { $sum: { $ifNull: ["$amount", 0] } },
          items: { $sum: "$quantity" },
          lastAt: { $max: "$createdAt" },
        },
      },
      {
        // $facet so the patient count and the page come out of one pass —
        // the tile has to say how many patients there are in total, not how
        // many are on screen.
        $facet: {
          rows: [
            { $sort: { totalSpend: -1 } },
            // On the ambulances tab only the COUNT of patients is wanted,
            // not their rows. `$limit: 0` was used to skip them — but Mongo
            // rejects a zero limit outright ("the limit must be positive"),
            // so the whole report 400'd and the page rendered empty. A match
            // that cannot succeed costs nothing and is valid.
            ...(tab === "patients"
              ? [{ $skip: skip }, { $limit: limit }]
              : [{ $match: { _id: { $exists: false } } }]),
          ],
          count: [{ $count: "total" }],
        },
      },
    ]),
    Ambulance.find({ isActive: { $ne: false } })
      .select("registrationNumber ambulanceType")
      .sort({ registrationNumber: 1 })
      .lean(),
  ]);
  const byPatient: any[] = patientFacet[0]?.rows ?? [];
  const patientTotal: number = patientFacet[0]?.count?.[0]?.total ?? 0;

  const ambMap = new Map(
    ambs.map((a: any) => [String(a._id), { reg: a.registrationNumber, type: a.ambulanceType }]),
  );
  const consumedMap = new Map(consumedAgg.map((c: any) => [String(c._id), c]));
  const onHandMap = new Map(onHandAgg.map((o: any) => [String(o._id), o]));

  /**
   * Every vehicle on the fleet, not only the ones that already hold stock.
   *
   * This used to be built from the stock aggregates alone, so an ambulance
   * that had never been loaded simply did not appear — and on a fresh
   * system the page was blank. That also hid the question an inventory
   * screen most needs to answer ("which of my ambulances are empty?"), and
   * left no row to click to load the first item onto one.
   */
  const ids = new Set<string>([
    ...ambMap.keys(),
    // Keep a vehicle that has stock history but has since been deactivated —
    // its consumption is still real spend and should not vanish from the
    // totals.
    ...consumedMap.keys(),
    ...onHandMap.keys(),
  ]);
  const allAmbulances = [...ids].map((id) => {
    const c: any = consumedMap.get(id);
    const o: any = onHandMap.get(id);
    const meta = ambMap.get(id) || { reg: id, type: "" };
    return {
      ambulanceId: id,
      registrationNumber: meta.reg,
      type: meta.type,
      onHandLines: o?.lines || 0,
      onHandQty: o?.qty || 0,
      consumedValue: Math.round(c?.consumedValue || 0),
      consumedQty: c?.consumedQty || 0,
    };
  });
  // Busiest first, then whatever is actually stocked; the empty vehicles
  // settle at the bottom, which is where they are easiest to spot.
  allAmbulances.sort(
    (a, b) =>
      b.consumedValue - a.consumedValue ||
      b.onHandQty - a.onHandQty ||
      a.registrationNumber.localeCompare(b.registrationNumber),
  );

  req.rData = {
    byAmbulance:
      tab === "ambulances" ? allAmbulances.slice(skip, skip + limit) : [],
    byPatient: byPatient.map((p: any) => ({
      patientId: p._id ? String(p._id) : null,
      patientName: p.patientName || "Patient",
      totalSpend: Math.round(p.totalSpend || 0),
      items: p.items,
      lastAt: p.lastAt,
    })),
    pagination: {
      page,
      limit,
      total: tab === "patients" ? patientTotal : allAmbulances.length,
      pages:
        Math.ceil(
          (tab === "patients" ? patientTotal : allAmbulances.length) / limit,
        ) || 1,
    },
    totals: {
      consumedValue: Math.round(
        consumedAgg.reduce((s: number, c: any) => s + (c.consumedValue || 0), 0),
      ),
      // Tiles have to count the whole fleet, not the page — an on-hand group
      // only exists for a vehicle that has stock, so its size is the answer.
      ambulancesStocked: onHandAgg.length,
      patientsBilled: patientTotal,
    },
  };
  req.msg = "success";
  return next();
};
