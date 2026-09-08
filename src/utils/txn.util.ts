import mongoose, { ClientSession } from "mongoose";

/**
 * True when Mongo is telling us this deployment simply has no transactions
 * (standalone server rather than a replica set / mongos).
 */
export const isTxnUnsupported = (err: any): boolean => {
  const msg = String(err?.message || err);
  return (
    msg.includes("Transaction numbers are only allowed on a replica set") ||
    msg.includes("transactions are not supported") ||
    msg.includes("does not support retryable writes") ||
    err?.codeName === "IllegalOperation"
  );
};

/**
 * Run `work` inside a transaction where the deployment supports one, and
 * plainly — the same code, no session — where it does not. This project runs
 * against standalone MongoDB in development and a replica set in production,
 * so multi-document writes have to be correct on a replica set without
 * crashing on a standalone box.
 *
 * `work` receives the session (or undefined) and must thread it through every
 * write it performs, otherwise those writes fall outside the transaction and
 * the atomicity is imaginary.
 *
 * NOTE the fallback is genuinely weaker: on standalone Mongo a crash midway
 * still leaves partial writes behind. Order the writes inside `work` so the
 * partial state is the recoverable one.
 */
export const withTransaction = async <T>(
  work: (session?: ClientSession) => Promise<T>,
): Promise<T> => {
  const session = await mongoose.startSession();
  try {
    let out!: T;
    await session.withTransaction(async () => {
      out = await work(session);
    });
    return out;
  } catch (err) {
    if (!isTxnUnsupported(err)) throw err;
    return await work(undefined);
  } finally {
    await session.endSession();
  }
};
