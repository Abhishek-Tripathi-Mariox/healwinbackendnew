import config from "../config";

export interface ReverseGeocodeResult {
  line1: string;
  city: string;
  state: string;
  pincode: string;
  formatted: string;
}

/**
 * Reverse geocode coordinates into structured address fields using the SERVER
 * Google key (Geocoding API). This must run server-side: the app's mobile key
 * is restricted to the Maps SDK and the Geocoding web service rejects it, so
 * the in-app call returns nothing — hence the city/state/pincode never fill.
 * Returns null on any failure so the caller can fall back.
 */
export const reverseGeocode = async (
  lat: number,
  lng: number,
): Promise<ReverseGeocodeResult | null> => {
  const apiKey = config.googleMaps?.apiKey;
  if (!apiKey) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json: any = await res.json();
    if (json.status !== "OK" || !json.results?.length) return null;

    const result = json.results[0];
    const comps: Array<{ types?: string[]; long_name?: string }> =
      result.address_components || [];
    const get = (type: string) =>
      comps.find((c) => c.types?.includes(type))?.long_name || "";

    const pincode = get("postal_code");
    const state = get("administrative_area_level_1");
    // In India the town/city is usually `locality`; fall back to the smaller
    // admin areas when locality is absent.
    const city =
      get("locality") ||
      get("administrative_area_level_3") ||
      get("administrative_area_level_2");
    const line1 =
      [get("street_number"), get("route") || get("sublocality") || get("neighborhood")]
        .filter(Boolean)
        .join(" ")
        .trim() || result.formatted_address;

    return { line1, city, state, pincode, formatted: result.formatted_address };
  } catch {
    return null;
  }
};
