import config from "../config";

export interface DistanceMatrixRow {
  destinationIndex: number;
  distanceMeters: number;
  durationSeconds: number;
  status: "OK" | "ZERO_RESULTS" | "NOT_FOUND" | "ERROR" | "FALLBACK";
}

interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Single origin x N destinations. Returns one row per destination in input order.
 */
export const distanceMatrix = async (
  origin: LatLng,
  destinations: LatLng[],
): Promise<DistanceMatrixRow[]> => {
  if (destinations.length === 0) return [];

  const apiKey = config.googleMaps?.apiKey;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is not configured");
  }

  const originStr = `${origin.lat},${origin.lng}`;
  const destStr = destinations.map((d) => `${d.lat},${d.lng}`).join("|");

  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json",
  );
  url.searchParams.set("origins", originStr);
  url.searchParams.set("destinations", destStr);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "metric");
  // Asking for a departure time is what makes Google return
  // `duration_in_traffic`. It also moves the call onto a pricier SKU, so it
  // is opt-in — see ROAD_DISTANCE_TRAFFIC.
  if (config.googleMaps?.roadDistanceTraffic) {
    url.searchParams.set("departure_time", "now");
  }
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Distance Matrix HTTP ${res.status}`);
  }
  const json: any = await res.json();
  if (json.status !== "OK") {
    throw new Error(`Distance Matrix API status: ${json.status}`);
  }

  const row = json.rows?.[0];
  if (!row) {
    return destinations.map((_, i) => ({
      destinationIndex: i,
      distanceMeters: 0,
      durationSeconds: 0,
      status: "ERROR" as const,
    }));
  }

  return destinations.map((_, i) => {
    const el = row.elements?.[i];
    if (!el || el.status !== "OK") {
      return {
        destinationIndex: i,
        distanceMeters: 0,
        durationSeconds: 0,
        status: (el?.status || "ERROR") as any,
      };
    }
    return {
      destinationIndex: i,
      distanceMeters: el.distance?.value ?? 0,
      // With a departure time Google returns both; the traffic figure is the
      // one worth having, and it is absent unless that was asked for.
      durationSeconds:
        el.duration_in_traffic?.value ?? el.duration?.value ?? 0,
      status: "OK" as const,
    };
  });
};

/**
 * Road distance for dispatch ranking: cached, batched, and never throwing.
 *
 * `distanceMatrix` above throws on a missing key, an HTTP error or a bad API
 * status. That is right for a booking quote and wrong here — this sits on the
 * SOS path, where a Google outage must degrade to straight-line ranking, not
 * empty the ambulance list. Every failure returns nulls and the caller keeps
 * the haversine figure it already has.
 *
 * Caching is what makes this affordable. The dispatch screen re-polls every
 * 10 seconds, but a crew only reports its position once a minute, so without
 * a cache five of every six calls would buy an answer that cannot have
 * changed. Keys are rounded to ~11 m, finer than the GPS being cached.
 */
export interface RoadLeg {
  km: number;
  minutes: number;
}

interface CacheEntry {
  leg: RoadLeg;
  expiresAt: number;
}

// In-process, deliberately: Redis is optional in this deployment and a cache
// miss must never be able to fail a dispatch lookup. Bounded below.
const legCache = new Map<string, CacheEntry>();
const MAX_CACHE_ENTRIES = 5000;

/** ~11 m of precision — below the accuracy of the fixes being cached. */
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
const legKey = (o: LatLng, d: LatLng) =>
  `${round4(o.lat)},${round4(o.lng)}|${round4(d.lat)},${round4(d.lng)}`;

// Google accepts at most 25 destinations in one Distance Matrix request.
const MAX_DESTINATIONS_PER_CALL = 25;

/**
 * One origin to many destinations. Returns an array the same length and in the
 * same order as `destinations`, holding null wherever no road route could be
 * obtained.
 */
export const roadLegs = async (
  origin: LatLng,
  destinations: LatLng[],
): Promise<(RoadLeg | null)[]> => {
  const out: (RoadLeg | null)[] = destinations.map(() => null);
  if (!destinations.length) return out;
  if (!config.googleMaps?.apiKey) return out;

  const now = Date.now();
  const ttlMs = Math.max(0, config.googleMaps.roadDistanceCacheSeconds) * 1000;

  // Serve what the cache already knows; collect the rest to ask Google about.
  const pending: { index: number; dest: LatLng }[] = [];
  destinations.forEach((dest, index) => {
    const hit = legCache.get(legKey(origin, dest));
    if (hit && hit.expiresAt > now) out[index] = hit.leg;
    else pending.push({ index, dest });
  });
  if (!pending.length) return out;

  for (let i = 0; i < pending.length; i += MAX_DESTINATIONS_PER_CALL) {
    const batch = pending.slice(i, i + MAX_DESTINATIONS_PER_CALL);
    let rows: DistanceMatrixRow[];
    try {
      rows = await distanceMatrix(
        origin,
        batch.map((b) => b.dest),
      );
    } catch (err: any) {
      // Logged, not thrown. The caller falls back to straight-line distance,
      // and an operator seeing approximate ranking beats one seeing none.
      console.warn(`[roadLegs] falling back to straight line: ${err?.message}`);
      return out;
    }
    rows.forEach((row, j) => {
      if (row.status !== "OK") return;
      const leg: RoadLeg = {
        km: Math.round((row.distanceMeters / 1000) * 100) / 100,
        minutes: Math.max(1, Math.round(row.durationSeconds / 60)),
      };
      const target = batch[j];
      out[target.index] = leg;
      if (ttlMs > 0) {
        // Cheapest possible eviction: once full, drop the oldest insertion.
        // Entries expire on their own; this only bounds memory if a very
        // large fleet churns through keys faster than the TTL.
        if (legCache.size >= MAX_CACHE_ENTRIES) {
          const oldest = legCache.keys().next().value;
          if (oldest !== undefined) legCache.delete(oldest);
        }
        legCache.set(legKey(origin, target.dest), { leg, expiresAt: now + ttlMs });
      }
    });
  }
  return out;
};

/** Test seam — the cache is process-wide and would leak between cases. */
export const __clearRoadLegCache = () => legCache.clear();
