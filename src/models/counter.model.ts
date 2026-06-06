import mongoose, { Schema, Types } from "mongoose";

/**
 * Tiny atomic sequence counter. Used to mint human-readable, gap-free,
 * collision-free identifiers (e.g. the HMS patient ID `HWP-000123`)
 * without races: a single `findOneAndUpdate({$inc})` is atomic in Mongo.
 */
export interface ICounter {
  _id: string; // sequence name, e.g. "hospital_patient"
  seq: number;
}

const CounterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model<ICounter>("Counter", CounterSchema);

/**
 * Atomically increments `name` and returns the new value. Upserts on first use.
 */
export const nextSequence = async (name: string): Promise<number> => {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { returnDocument: "after", upsert: true },
  ).lean<{ _id: string; seq: number } & { _id: Types.ObjectId }>();
  return (doc as any).seq as number;
};

export default Counter;
