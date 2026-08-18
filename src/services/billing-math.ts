/**
 * Pure money math for hospital invoices.
 *
 * Extracted from billing.controller so it can be tested without a database:
 * this is the code that decides what a patient owes, and it had no test
 * coverage at all. It must stay free of Mongoose/IO — the controller passes a
 * plain object (a Mongoose doc satisfies the shape) and mutates in place.
 */

export interface MoneyLine {
  amount: number;
}

export interface MoneyPayment {
  amount: number;
  isRefund?: boolean;
}

export interface InvoiceTotals {
  lineItems: MoneyLine[];
  payments: MoneyPayment[];
  taxPercent?: number;
  discount?: number;
  status?: string;
  subtotal?: number;
  taxAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  total?: number;
  amountPaid?: number;
  balanceDue?: number;
}

/** Round to paise. Money must never carry float dust. */
export const money = (n: number): number => Math.round((n || 0) * 100) / 100;

/**
 * Recompute every derived monetary field and the payment status.
 *
 * status is left alone for "cancelled" and "draft" — those are deliberate
 * states a payment total must not silently flip.
 */
export const recomputeTotals = <T extends InvoiceTotals>(inv: T): T => {
  inv.subtotal = money(
    (inv.lineItems || []).reduce((s, li) => s + (li.amount || 0), 0),
  );
  inv.taxAmount = money((inv.subtotal * (inv.taxPercent || 0)) / 100);
  // Intra-state GST split: CGST = SGST = half. The remainder goes to SGST so
  // the two always add back to taxAmount exactly (odd paise would drift).
  inv.cgstAmount = money(inv.taxAmount / 2);
  inv.sgstAmount = money(inv.taxAmount - inv.cgstAmount);
  inv.total = money(inv.subtotal + inv.taxAmount - (inv.discount || 0));

  inv.amountPaid = money(
    (inv.payments || []).reduce(
      (s, p) => s + (p.isRefund ? -(p.amount || 0) : p.amount || 0),
      0,
    ),
  );
  inv.balanceDue = money(inv.total - inv.amountPaid);

  if (inv.status !== "cancelled" && inv.status !== "draft") {
    if ((inv.payments || []).some((p) => p.isRefund)) inv.status = "refunded";
    else if (inv.amountPaid <= 0) inv.status = "unpaid";
    else if (inv.balanceDue > 0) inv.status = "partial";
    else inv.status = "paid";
  }
  return inv;
};

/**
 * What is still collectable on an invoice. Used to reject an overpayment
 * before it corrupts the ledger (a typo used to flip a bill to "paid" with a
 * negative balance).
 */
export const outstandingOf = (inv: {
  total?: number;
  amountPaid?: number;
}): number => money((inv.total || 0) - (inv.amountPaid || 0));
