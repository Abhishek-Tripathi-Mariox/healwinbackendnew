/**
 * Lightweight geo helpers for ambulance live-distance tracking.
 * Straight-line (haversine) distance + a simple city-traffic ETA estimate.
 */

export interface LatLngLike {
  lat?: number;
  lng?: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km (1 decimal). Returns null if either point is incomplete. */
export const haversineKm = (
  a?: LatLngLike | null,
  b?: LatLngLike | null,
): number | null => {
  if (
    !a ||
    !b ||
    typeof a.lat !== "number" ||
    typeof a.lng !== "number" ||
    typeof b.lat !== "number" ||
    typeof b.lng !== "number" ||
    (a.lat === 0 && a.lng === 0) ||
    (b.lat === 0 && b.lng === 0)
  ) {
    return null;
  }
  const R = 6371; // Earth radius in km
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) *
      Math.cos(toRad(b.lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return Math.round(R * c * 10) / 10;
};

/** Rough ETA in minutes from a distance in km (~3 min/km city traffic, min 1). */
export const etaMinutesFromKm = (km?: number | null): number | null =>
  km == null ? null : Math.max(1, Math.ceil(km * 3));
