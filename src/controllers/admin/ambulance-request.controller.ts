import { Request, Response, NextFunction } from "express";
import { Types } from "mongoose";
import AmbulanceRequest from "../../models/ambulance-request.model";
import AmbulanceStaff from "../../models/ambulance-staff.model";
import Ambulance from "../../models/ambulance.model";
import InventoryItem from "../../models/inventory-item.model";
import StockTransaction from "../../models/stock-transaction.model";
import { getNearbyAmbulances } from "../../services/ambulance-dispatch.service";
import { emitToUser } from "../../utils/socket.util";
import { sendToUser, sendDispatchPush } from "../../services/notification.service";

/**
 * Admin dispatch for patient ambulance requests. List incoming requests and
 * assign an ambulance + driver. On assignment the user is notified in real time
 * (socket `booking:accepted` / `booking:status`) and via FCM push, so the app
 * flips from "Finding an ambulance" to live tracking.
 */

const ACTIVE = ["SEARCHING", "ASSIGNED", "ARRIVED", "ON_TRIP"];

export const list = async (req: Request, _res: Response, next: NextFunction) => {
  // SOS emergencies are handled exclusively by the SOS Dashboard (SOSSubmission
  // + EmergencyDispatch). The Ambulance Requests queue must only show ordinary
  // patient ambulance bookings, so emergency-flagged requests are excluded here
  // permanently — even if one ever gets created, it never leaks into this list.
  const query: any = { emergency: { $ne: true } };
  if (req.query.status) query.status = req.query.status;
  else query.status = { $in: ACTIVE }; // default: open requests
  const items = await AmbulanceRequest.find(query)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("userId", "fullName mobileNumber")
    .lean();
  req.rData = { items };
  req.msg = "success";
  return next();
};

export const detail = async (req: Request, _res: Response, next: NextFunction) => {
  const item = await AmbulanceRequest.findById(req.params.id)
    .populate("userId", "fullName mobileNumber")
    .lean();
  if (!item) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }
  req.rData = { item };
  req.msg = "success";
  return next();
};

/**
 * GET /:id/nearby-ambulances — geo-ranked list of available ambulances for this
 * request's pickup, exactly like the SOS dashboard. Admin picks one and the
 * `assign` endpoint reserves it + rings the crew.
 */
export const nearby = async (req: Request, _res: Response, next: NextFunction) => {
  const reqDoc = await AmbulanceRequest.findById(req.params.id).lean();
  if (!reqDoc) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }
  const lat = reqDoc.pickup?.lat;
  const lng = reqDoc.pickup?.lng;
  if (lat == null || lng == null) {
    req.rData = { ambulances: [], patient: { lat, lng, address: reqDoc.pickup?.address } };
    req.msg = "no_pickup_location";
    return next();
  }
  const radiusKm = req.query.radiusKm != null ? Number(req.query.radiusKm) : 0; // 0 = no cap
  const ambulances = await getNearbyAmbulances(lat, lng, [], 15, radiusKm);
  req.rData = {
    ambulances,
    patient: { lat, lng, address: reqDoc.pickup?.address || "" },
  };
  req.msg = "success";
  return next();
};

/** POST /:id/assign — attach driver/ambulance, notify the user live + push. */
export const assign = async (req: Request, _res: Response, next: NextFunction) => {
  const b = req.body || {};
  const reqDoc = await AmbulanceRequest.findById(req.params.id);
  if (!reqDoc) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }

  // ===== Path A (preferred — same as SOS dispatch): admin picked an ambulance
  // from the geo-ranked nearby list. Atomically reserve it (status available →
  // on_dispatch, lock currentDispatchId) and auto-fill crew + vehicle from the
  // fleet record so the dispatch is consistent and double-assignment is
  // impossible.
  if (b.ambulanceId) {
    const reserved: any = await Ambulance.findOneAndUpdate(
      {
        _id: b.ambulanceId,
        status: "available",
        isActive: true,
        currentDispatchId: null,
      },
      { status: "on_dispatch", currentDispatchId: reqDoc._id },
      { returnDocument: "after" },
    );
    if (!reserved) {
      req.rCode = 0;
      req.msg = "ambulance_not_available";
      req.rData = {
        hint: "That ambulance is no longer available — refresh the nearby list and pick another.",
      };
      return next();
    }
    reqDoc.ambulanceId = reserved._id;
    reqDoc.vehicleNumber = reserved.registrationNumber || b.vehicleNumber || reqDoc.vehicleNumber;
    const driver: any = reserved.assignedDriverId
      ? await AmbulanceStaff.findById(reserved.assignedDriverId)
          .select("fullName mobileNumber")
          .lean()
      : null;
    if (driver) {
      reqDoc.driverStaffId = driver._id;
      reqDoc.driverName = driver.fullName || reqDoc.driverName;
      reqDoc.driverPhone = driver.mobileNumber || reqDoc.driverPhone;
    }
    // The ambulance's attendant rides along — record them so they're notified
    // and can track the trip (read-only), exactly like the SOS dispatch flow.
    if (reserved.assignedAttendantId) {
      reqDoc.attendantStaffId = reserved.assignedAttendantId;
    }
    if (b.etaMinutes != null) reqDoc.etaMinutes = Number(b.etaMinutes);
  } else {
    // ===== Path B (manual fallback): admin typed driver details directly.
    reqDoc.driverName = b.driverName;
    reqDoc.driverPhone = b.driverPhone;
    reqDoc.vehicleNumber = b.vehicleNumber;
    reqDoc.etaMinutes = b.etaMinutes != null ? Number(b.etaMinutes) : reqDoc.etaMinutes;

    // Resolve the ambulance crew member to notify. Preferred: the admin picked a
    // real driver from the crew dropdown (driverStaffId). Fallback: only a phone
    // was typed — match it against a registered driver/staff so the driver STILL
    // gets a dispatch alert. We match on the last 10 digits so country-code/
    // spacing differences ("+91 98765 43210" vs "9876543210") don't break it.
    if (b.driverStaffId) {
      reqDoc.driverStaffId = b.driverStaffId;
    } else if (b.driverPhone) {
      const last10 = String(b.driverPhone).replace(/\D/g, "").slice(-10);
      if (last10.length === 10) {
        const match: any = await AmbulanceStaff.findOne({
          mobileNumber: { $regex: `${last10}$` },
          isDeleted: { $ne: true },
        })
          .select("_id fullName mobileNumber")
          .lean();
        if (match) {
          reqDoc.driverStaffId = match._id;
          if (!reqDoc.driverName) reqDoc.driverName = match.fullName;
        }
      }
    }
  }

  reqDoc.status = "ASSIGNED";
  reqDoc.assignedAt = new Date();
  if (!reqDoc.otp) reqDoc.otp = String(Math.floor(1000 + Math.random() * 9000));
  reqDoc.statusHistory = [
    ...((reqDoc as any).statusHistory || []),
    {
      status: "ASSIGNED",
      at: new Date(),
      by: "admin",
      note: reqDoc.driverName ? `Assigned to ${reqDoc.driverName}` : "Ambulance assigned",
    },
  ] as any;
  await reqDoc.save();

  const userId = String(reqDoc.userId);
  const payload = {
    requestId: String(reqDoc._id),
    status: "ASSIGNED",
    driverName: reqDoc.driverName,
    vehicleNumber: reqDoc.vehicleNumber,
    etaMinutes: reqDoc.etaMinutes,
    otp: reqDoc.otp,
  };
  // Real-time: the app's socket listener refreshes the active ride on these.
  emitToUser(userId, "booking:accepted", payload);
  emitToUser(userId, "booking:status", payload);
  // Push (FCM) — reaches the device even if the app is backgrounded; tapping
  // it deep-links to tracking via data.route.
  await sendToUser(
    reqDoc.userId as any,
    "BOOKING",
    "Ambulance assigned",
    `${reqDoc.driverName || "A driver"} is on the way${reqDoc.vehicleNumber ? ` (${reqDoc.vehicleNumber})` : ""}.`,
    { route: "Tracking", requestId: String(reqDoc._id), screen: "Tracking" },
  ).catch(() => undefined);

  // Ring the assigned ambulance crew's app (driver/staff) — socket for an
  // instant in-app modal + FCM dispatch push so it pierces a backgrounded app.
  if (reqDoc.driverStaffId) {
    const staffId = String(reqDoc.driverStaffId);
    const dispatchPayload = {
      requestId: String(reqDoc._id),
      kind: "request",
      patientName: reqDoc.patientName || "Patient",
      patientPhone: reqDoc.recipientPhone || undefined,
      address: reqDoc.pickup?.address || "Patient location",
      patientLat: reqDoc.pickup?.lat,
      patientLng: reqDoc.pickup?.lng,
      etaMinutes: reqDoc.etaMinutes,
      priority: reqDoc.emergency ? "CRITICAL" : "HIGH",
    };
    emitToUser(staffId, "dispatch:incoming", dispatchPayload);
    const staff: any = await AmbulanceStaff.findById(staffId).select("fcmToken").lean();
    if (staff?.fcmToken) {
      sendDispatchPush(
        staff.fcmToken,
        reqDoc.emergency ? "🚨 Emergency Dispatch" : "New Ambulance Dispatch",
        `${reqDoc.patientName || "A patient"} needs pickup — ${reqDoc.pickup?.address || "tap to view"}.`,
        {
          requestId: String(reqDoc._id),
          kind: "request",
          action: "incoming_dispatch",
          route: "IncomingDispatch",
        },
      ).catch(() => undefined);
    }
  }

  // Ring the ATTENDANT too — the "patient inbound" (info-only) variant: they
  // acknowledge + ride along (they don't drive the lifecycle). Without this the
  // attendant never learned an ambulance-request dispatch was assigned to them.
  if (reqDoc.attendantStaffId) {
    const attId = String(reqDoc.attendantStaffId);
    emitToUser(attId, "dispatch:incoming_info", {
      requestId: String(reqDoc._id),
      kind: "request",
      patientName: reqDoc.patientName || "Patient",
      patientPhone: reqDoc.recipientPhone || undefined,
      address: reqDoc.pickup?.address || "Patient location",
      patientLat: reqDoc.pickup?.lat,
      patientLng: reqDoc.pickup?.lng,
      etaMinutes: reqDoc.etaMinutes,
      priority: reqDoc.emergency ? "CRITICAL" : "HIGH",
    });
    const att: any = await AmbulanceStaff.findById(attId).select("fcmToken").lean();
    if (att?.fcmToken) {
      sendDispatchPush(
        att.fcmToken,
        "Patient Inbound",
        `${reqDoc.patientName || "A patient"} pickup — ${reqDoc.pickup?.address || "tap to view"}.`,
        { requestId: String(reqDoc._id), kind: "request", action: "incoming_dispatch", route: "IncomingDispatch" },
      ).catch(() => undefined);
    }
  }

  req.rData = { item: reqDoc };
  req.msg = "success";
  return next();
};

/** Recompute inTransitTotal + grandTotal from the request's current state. */
const recomputeBill = (reqDoc: any) => {
  const expenses = Array.isArray(reqDoc.inTransitExpenses) ? reqDoc.inTransitExpenses : [];
  const inTransitTotal = expenses.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0);
  reqDoc.inTransitTotal = Math.round(inTransitTotal * 100) / 100;
  reqDoc.grandTotal = Math.round(((Number(reqDoc.amount) || 0) + reqDoc.inTransitTotal) * 100) / 100;
};

/**
 * PUT /:id/expenses — control room logs the in-transit medical expenses
 * (oxygen, medicines, procedures) for this ride. They're billed on top of the
 * ambulance fare; the patient app shows them as a separate section + new grand
 * total. The full list is replaced each call (idempotent edit).
 */
export const setExpenses = async (req: Request, _res: Response, next: NextFunction) => {
  const adminId = (req as any).adminId;
  const raw = Array.isArray(req.body?.expenses) ? req.body.expenses : [];

  const reqDoc = await AmbulanceRequest.findById(req.params.id as string);
  if (!reqDoc) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }

  // Snapshot the price/name from the chosen HMS inventory item (so a later
  // catalogue price change never rewrites a past bill). A line may also be a
  // free-text one-off (no inventoryItemId), in which case the typed rate stands.
  const itemIds = raw
    .map((e: any) => e?.inventoryItemId)
    .filter((id: any) => Types.ObjectId.isValid(id));
  const inv = itemIds.length
    ? await InventoryItem.find({ _id: { $in: itemIds }, isDeleted: false }).lean()
    : [];
  const invById = new Map(inv.map((i: any) => [String(i._id), i]));

  const expenses = raw
    .map((e: any) => {
      const src = e?.inventoryItemId ? invById.get(String(e.inventoryItemId)) : null;
      const item = String(e?.item || src?.name || "").trim();
      const qty = Math.max(0, Number(e?.qty) || 0);
      // Prefer the explicit rate; else the inventory selling price.
      const rate = Math.max(
        0,
        e?.rate != null && e?.rate !== "" ? Number(e.rate) : Number(src?.sellingPrice) || 0,
      );
      return {
        inventoryItemId: src ? (src._id as any) : undefined,
        item,
        qty,
        rate,
        amount: Math.round(qty * rate * 100) / 100,
      };
    })
    .filter((e: any) => e.item && e.qty > 0);

  // ----- Stock deduction (delta vs the previously-saved expenses) -----
  // setExpenses replaces the whole list, so we net out the change per inventory
  // item to stay idempotent across edits: more billed → issue ("out"), fewer →
  // return ("in"). Free-text lines (no inventoryItemId) don't touch stock.
  const qtyByItem = (list: any[]) => {
    const m = new Map<string, number>();
    for (const e of list) {
      if (!e.inventoryItemId) continue;
      const k = String(e.inventoryItemId);
      m.set(k, (m.get(k) || 0) + (Number(e.qty) || 0));
    }
    return m;
  };
  const prevQty = qtyByItem((reqDoc.inTransitExpenses as any[]) || []);
  const newQty = qtyByItem(expenses);
  const touched = new Set<string>([...prevQty.keys(), ...newQty.keys()]);
  for (const id of touched) {
    const delta = (newQty.get(id) || 0) - (prevQty.get(id) || 0); // +ve = issue more
    if (!delta) continue;
    const item = await InventoryItem.findById(id);
    if (!item) continue;
    item.currentStock -= delta;
    await item.save();
    await StockTransaction.create({
      itemId: item._id,
      type: delta > 0 ? "out" : "in",
      quantity: Math.abs(delta),
      balanceAfter: item.currentStock,
      reason: "Ambulance in-transit billing",
      issuedToType: "patient",
      issuedToRef: String(reqDoc._id),
      performedByAdminId: adminId,
    }).catch(() => undefined);
  }

  reqDoc.inTransitExpenses = expenses as any;
  recomputeBill(reqDoc);
  await reqDoc.save();

  // Push the new bill to the patient's tracking screen in real time.
  emitToUser(String(reqDoc.userId), "booking:status", {
    requestId: String(reqDoc._id),
    status: reqDoc.status,
    grandTotal: reqDoc.grandTotal,
  });

  req.rData = { item: reqDoc };
  req.msg = "success";
  return next();
};

/**
 * POST /:id/payment — control room marks the bill collected (e.g. crew took
 * Cash/UPI on the spot). Patient-side online pay sets the same fields.
 */
export const markPaid = async (req: Request, _res: Response, next: NextFunction) => {
  const reqDoc = await AmbulanceRequest.findById(req.params.id as string);
  if (!reqDoc) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }
  const paid = req.body?.paymentStatus !== "PENDING"; // default to marking PAID
  reqDoc.paymentStatus = paid ? "PAID" : "PENDING";
  reqDoc.paymentMethod = paid ? String(req.body?.method || "CASH") : undefined;
  reqDoc.paidAt = paid ? new Date() : undefined;
  await reqDoc.save();
  emitToUser(String(reqDoc.userId), "booking:status", {
    requestId: String(reqDoc._id),
    status: reqDoc.status,
    paymentStatus: reqDoc.paymentStatus,
  });
  req.rData = { item: reqDoc };
  req.msg = "success";
  return next();
};

/** POST /:id/status — advance ARRIVED / ON_TRIP / COMPLETED / CANCELLED. */
export const updateStatus = async (req: Request, _res: Response, next: NextFunction) => {
  const status = String(req.body?.status || "").toUpperCase();
  const allowed = ["ARRIVED", "ON_TRIP", "COMPLETED", "CANCELLED"];
  if (!allowed.includes(status)) {
    req.rCode = 0;
    req.msg = "validation_failed";
    req.rData = { hint: `status must be one of ${allowed.join(", ")}` };
    return next();
  }
  const reqDoc = await AmbulanceRequest.findById(req.params.id as string);
  if (!reqDoc) {
    req.rCode = 5;
    req.msg = "not_available";
    req.rData = {};
    return next();
  }
  reqDoc.status = status as any;
  if (status === "COMPLETED") reqDoc.completedAt = new Date();
  if (status === "CANCELLED") {
    // Admin/system cancellation (e.g. no ambulance available) is FREE.
    reqDoc.cancelledBy = "admin";
    reqDoc.cancelReason = req.body?.reason || req.body?.cancelReason || "Cancelled by control room";
    reqDoc.cancelledAt = new Date();
    reqDoc.cancellationCharge = 0;
  }
  (reqDoc as any).statusHistory = [
    ...((reqDoc as any).statusHistory || []),
    {
      status,
      at: new Date(),
      by: "admin",
      note: status === "CANCELLED" ? reqDoc.cancelReason : undefined,
    },
  ];
  await reqDoc.save();

  // Free the reserved ambulance once the trip ends or is cancelled.
  if ((status === "COMPLETED" || status === "CANCELLED") && reqDoc.ambulanceId) {
    await Ambulance.updateOne(
      { _id: reqDoc.ambulanceId },
      { status: "available", currentDispatchId: null },
    ).catch(() => undefined);
  }
  const userId = String(reqDoc.userId);
  emitToUser(userId, "booking:status", { requestId: String(reqDoc._id), status });
  // If cancelled, also tell the crew app (driver + attendant) to drop the dispatch.
  if (status === "CANCELLED") {
    if (reqDoc.driverStaffId) {
      emitToUser(String(reqDoc.driverStaffId), "dispatch:cancelled", {
        requestId: String(reqDoc._id),
        dispatchId: String(reqDoc._id),
        kind: "request",
      });
    }
    if (reqDoc.attendantStaffId) {
      emitToUser(String(reqDoc.attendantStaffId), "dispatch:cancelled", {
        requestId: String(reqDoc._id),
        dispatchId: String(reqDoc._id),
        kind: "request",
      });
    }
  }
  req.rData = { item: reqDoc };
  req.msg = "success";
  return next();
};
