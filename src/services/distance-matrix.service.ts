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
      durationSeconds: el.duration?.value ?? 0,
      status: "OK" as const,
    };
  });
};
