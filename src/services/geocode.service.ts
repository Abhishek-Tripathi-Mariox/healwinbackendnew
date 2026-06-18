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

export interface PlaceSuggestion {
  description: string;
  placeId?: string;
  lat?: number;
  lng?: number;
}

/**
 * Forward address search (type-to-find) via the SERVER key. Tries Places
 * Autocomplete first, falling back to a forward geocode. Server-side so the
 * app's restricted key isn't the one calling these web services. Returns [].
 */
export const searchPlaces = async (query: string): Promise<PlaceSuggestion[]> => {
  const apiKey = config.googleMaps?.apiKey;
  const q = query.trim();
  if (!apiKey || q.length < 3) return [];

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
    url.searchParams.set("input", q);
    url.searchParams.set("components", "country:in");
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    const json: any = await res.json();
    if (json.status === "OK" && Array.isArray(json.predictions)) {
      return json.predictions.map((p: any) => ({
        description: p.description,
        placeId: p.place_id,
      }));
    }
  } catch {
    /* fall through */
  }

  try {
    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", q);
    url.searchParams.set("components", "country:IN");
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    const json: any = await res.json();
    if (json.status === "OK" && Array.isArray(json.results)) {
      return json.results.slice(0, 5).map((r: any) => ({
        description: r.formatted_address,
        lat: r.geometry?.location?.lat,
        lng: r.geometry?.location?.lng,
      }));
    }
  } catch {
    /* ignore */
  }
  return [];
};

export interface ResolvedPlace {
  lat: number;
  lng: number;
  address: string;
}

/** Resolve a chosen suggestion (placeId or description) to coords + address. */
export const resolvePlace = async (opts: {
  placeId?: string;
  description?: string;
}): Promise<ResolvedPlace | null> => {
  const apiKey = config.googleMaps?.apiKey;
  if (!apiKey) return null;

  if (opts.placeId) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
      url.searchParams.set("place_id", opts.placeId);
      url.searchParams.set("fields", "formatted_address,geometry");
      url.searchParams.set("key", apiKey);
      const res = await fetch(url.toString());
      const json: any = await res.json();
      const loc = json?.result?.geometry?.location;
      if (loc) {
        return {
          lat: loc.lat,
          lng: loc.lng,
          address: json.result.formatted_address || opts.description || "",
        };
      }
    } catch {
      /* fall through */
    }
  }

  if (opts.description) {
    try {
      const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
      url.searchParams.set("address", opts.description);
      url.searchParams.set("key", apiKey);
      const res = await fetch(url.toString());
      const json: any = await res.json();
      const r = json?.results?.[0];
      if (r?.geometry?.location) {
        return {
          lat: r.geometry.location.lat,
          lng: r.geometry.location.lng,
          address: r.formatted_address,
        };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
};
