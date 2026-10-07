import PaymentOrder from "../models/payment-order.model";
import { fetchPayment, getClient } from "./razorpay.service";
import { settleCapturedPayment } from "./checkout.service";

/**
 * The safety net under every payment.
 *
 * Three ways a payment can end up taken but not applied, none of them rare:
 *
 *  - the app's confirm call never happens (the customer closes it, the phone
 *    dies, the network drops mid-sheet);
 *  - the webhook never arrives (misconfigured URL, a deploy during delivery,
 *    Razorpay exhausting its retries while we were down);
 *  - both arrive, the money is recorded, and the process dies before the
 *    thing paid for is actually applied.
 *
 * Each leaves a row this can finish. Nothing here invents money: it asks the
 * gateway what it holds for an order and settles only what the gateway says
 * was captured — the same path, and the same idempotency, as a webhook.
 */

let timer: NodeJS.Timeout | null = null;

/** How far back to look. Older than this is a human's problem, not a retry's. */
const WINDOW_HOURS = 48;
/** Leave a checkout alone for this long — the customer may still be paying. */
const SETTLE_DELAY_MINUTES = 10;

export interface ReconcileSummary {
  fulfilled: number;
  recovered: number;
}

/**
 * Finish what is already paid for.
 *
 * Re-settling a PAID row is safe: `settleCapturedPayment` skips the money and
 * runs only the fulfilment, which the handlers are written to tolerate twice.
 */
const finishPaidButUnfulfilled = async (since: Date): Promise<number> => {
  const rows = await PaymentOrder.find({
    status: "PAID",
    fulfilledAt: { $exists: false },
    createdAt: { $gte: since },
  })
    .limit(100)
    .lean();

  let done = 0;
  for (const row of rows as any[]) {
    if (!row.gatewayPaymentId) continue;
    try {
      const payment = await fetchPayment(row.gatewayPaymentId);
      if (!payment) continue;
      const res = await settleCapturedPayment(payment);
      if (res.paid) done += 1;
    } catch (e: any) {
      console.error(
        `[payments] could not finish ${row._id} (${row.purpose}):`,
        e?.message || e,
      );
    }
  }
  return done;
};

/**
 * Find money we were never told about.
 *
 * An order left at CREATED usually means the customer walked away — but
 * sometimes it means they paid and nothing reached us. Only the gateway knows
 * which, so we ask it, and only for orders old enough that an in-flight
 * checkout is not being interrupted.
 */
const recoverSilentCaptures = async (since: Date): Promise<number> => {
  const before = new Date(Date.now() - SETTLE_DELAY_MINUTES * 60_000);
  const rows = await PaymentOrder.find({
    status: "CREATED",
    gatewayOrderId: { $exists: true },
    createdAt: { $gte: since, $lte: before },
  })
    .limit(50)
    .lean();

  if (rows.length === 0) return 0;
  const client = await getClient();
  if (!client) return 0;

  let recovered = 0;
  for (const row of rows as any[]) {
    try {
      const res = await client.orders.fetchPayments(row.gatewayOrderId);
      const captured = (res?.items || []).find((p: any) => p.status === "captured");
      if (!captured) continue;
      const settled = await settleCapturedPayment(captured);
      if (settled.paid) {
        recovered += 1;
        console.log(
          `[payments] recovered ${captured.id} for ${row.purpose} — the gateway had it, we did not`,
        );
      }
    } catch (e: any) {
      console.error(`[payments] could not check ${row.gatewayOrderId}:`, e?.message || e);
    }
  }
  return recovered;
};

export const reconcilePayments = async (): Promise<ReconcileSummary> => {
  const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000);
  const fulfilled = await finishPaidButUnfulfilled(since);
  const recovered = await recoverSilentCaptures(since);
  if (fulfilled || recovered) {
    console.log(
      `[payments] reconciled — ${fulfilled} fulfilled, ${recovered} recovered from the gateway`,
    );
  }
  return { fulfilled, recovered };
};

export const startPaymentReconciler = () => {
  if (timer) return;
  const tick = () =>
    reconcilePayments().catch((e) =>
      console.error("[payments] reconcile failed:", e?.message || e),
    );
  // First run two minutes after boot — long enough for connections to settle,
  // short enough to catch anything missed during the restart itself.
  setTimeout(tick, 2 * 60_000);
  timer = setInterval(tick, 15 * 60_000);
};

export const stopPaymentReconciler = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

export default { reconcilePayments, startPaymentReconciler, stopPaymentReconciler };
