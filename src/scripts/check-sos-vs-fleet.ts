/**
 * Prints the distance between every PENDING SOS submission and every
 * ambulance with fresh location. Lets ops see at a glance whether the
 * "no ambulances showing" problem is filter strictness or just that the
 * test SOS and the test driver are in different cities.
 *
 * Run: cd backend && npx ts-node src/scripts/check-sos-vs-fleet.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import config from "../config";
import { SOSSubmission } from "../models/sos-submission.model";
import Ambulance from "../models/ambulance.model";

const STALE_MS = 5 * 60 * 1000;

const haversineKm = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

const run = async () => {
  await mongoose.connect(config.database.url);

  const ambs = await Ambulance.find({ isActive: true })
    .select("registrationNumber currentLocation lastLocationAt status")
    .lean();
  const fresh = ambs.filter(
    (a: any) =>
      a.currentLocation?.coordinates &&
      a.lastLocationAt &&
      Date.now() - new Date(a.lastLocationAt).getTime() < STALE_MS,
  );
  const subs = await SOSSubmission.find({
    status: { $in: ["PENDING", "IN_PROGRESS"] },
    "location.coordinates.0": { $exists: true },
  })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  console.log(
    `\n${fresh.length} ambulance(s) with fresh location (last ping < 5 min)\n`,
  );
  for (const a of fresh as any[]) {
    const [lng, lat] = a.currentLocation.coordinates;
    console.log(
      `  ${a.registrationNumber}  status=${a.status}  @ [${lat.toFixed(4)}, ${lng.toFixed(4)}]`,
    );
  }
  console.log(`\n${subs.length} active SOS submission(s) with GPS\n`);

  for (const s of subs as any[]) {
    const [lng, lat] = s.location.coordinates;
    console.log("=".repeat(60));
    console.log(
      `SOS ${s.name || "(anon)"}  ${s.phone || ""}  @ [${lat.toFixed(4)}, ${lng.toFixed(4)}]`,
    );
    console.log(`  address: ${s.address || "(none)"}`);
    if (fresh.length === 0) {
      console.log("  → no fresh ambulances to compare against");
      continue;
    }
    const ranked = fresh
      .map((a: any) => ({
        reg: a.registrationNumber,
        status: a.status,
        km: haversineKm(
          lat,
          lng,
          a.currentLocation.coordinates[1],
          a.currentLocation.coordinates[0],
        ),
      }))
      .sort((a, b) => a.km - b.km);
    for (const r of ranked.slice(0, 5)) {
      const within = r.km <= 10 ? " ✓ within 10 km" : "";
      console.log(
        `  ${r.reg.padEnd(14)}  ${r.status.padEnd(12)}  ${r.km.toFixed(1).padStart(8)} km${within}`,
      );
    }
  }
  console.log("");
  await mongoose.disconnect();
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
