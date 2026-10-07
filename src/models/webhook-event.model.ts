import mongoose, { Schema } from "mongoose";

/**
 * Every webhook the gateway ever sent us, kept verbatim.
 *
 * Two jobs. First, dedupe: Razorpay redelivers anything that did not 200, so
 * the same capture can arrive five times. `eventId` is unique, and the insert
 * is what claims the event — losing that race means someone else is already
 * handling it.
 *
 * Second, and the reason this is worth a collection rather than a Set: when a
 * customer says "I paid and nothing happened", the only honest answer comes
 * from the bytes the provider actually sent. Without this, a webhook that was
 * mis-parsed is indistinguishable from one that never arrived.
 */

export interface IWebhookEvent {
  provider: string;
  eventId: string;
  event: string;
  payload: any;
  handled: boolean;
  result?: string;
  error?: string;
  processedAt?: Date;
  createdAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>(
  {
    provider: { type: String, default: "razorpay", index: true },
    eventId: { type: String, required: true },
    event: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed },
    handled: { type: Boolean, default: false, index: true },
    result: String,
    error: String,
    processedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
// Six months is long enough to settle any dispute and short enough that the
// collection does not grow without bound.
WebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export default mongoose.model<IWebhookEvent>("WebhookEvent", WebhookEventSchema);
