import { Request, Response, NextFunction } from "express";
import Ambulance from "../../models/ambulance.model";
import {
  AmbulanceStock,
  AmbulanceStockTransaction,
} from "../../models/ambulance-stock.model";

/** GET /admin/ambulance-stock/:ambulanceId — on-hand stock + recent movements. */
export const ambulanceStock = async (req: Request, _res: Response, next: NextFunction) => {
  const ambulanceId = req.params.ambulanceId as string;
  const [amb, rows, recent] = await Promise.all([
    Ambulance.findById(ambulanceId).select("registrationNumber ambulanceType").lean(),
    AmbulanceStock.find({ ambulanceId })
      .populate("itemId", "name unit category sellingPrice unitCost")
      .sort({ quantity: -1 })
      .lean(),
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
    onHandValue: items.reduce((s, i) => s + i.onHandValue, 0),
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
 * GET /admin/ambulance-stock/reports — spend analytics:
 *  - byAmbulance: per vehicle → on-hand value, total consumed ₹, restock count
 *  - byPatient:   per patient → total spend ₹ on ambulance supplies
 */
export const reports = async (req: Request, _res: Response, next: NextFunction) => {
  const [consumedAgg, onHandAgg, byPatient, ambs] = await Promise.all([
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
      { $sort: { totalSpend: -1 } },
      { $limit: 200 },
    ]),
    Ambulance.find({}).select("registrationNumber ambulanceType").lean(),
  ]);

  const ambMap = new Map(
    ambs.map((a: any) => [String(a._id), { reg: a.registrationNumber, type: a.ambulanceType }]),
  );
  const consumedMap = new Map(consumedAgg.map((c: any) => [String(c._id), c]));
  const onHandMap = new Map(onHandAgg.map((o: any) => [String(o._id), o]));

  const ids = new Set<string>([...consumedMap.keys(), ...onHandMap.keys()]);
  const byAmbulance = [...ids].map((id) => {
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
  byAmbulance.sort((a, b) => b.consumedValue - a.consumedValue);

  req.rData = {
    byAmbulance,
    byPatient: byPatient.map((p: any) => ({
      patientId: p._id ? String(p._id) : null,
      patientName: p.patientName || "Patient",
      totalSpend: Math.round(p.totalSpend || 0),
      items: p.items,
      lastAt: p.lastAt,
    })),
    totals: {
      consumedValue: Math.round(
        consumedAgg.reduce((s: number, c: any) => s + (c.consumedValue || 0), 0),
      ),
    },
  };
  req.msg = "success";
  return next();
};
