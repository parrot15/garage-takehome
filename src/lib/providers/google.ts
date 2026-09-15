import "server-only";

import { z } from "zod";
import { type Place, PlaceSchema } from "@/lib/brief/schema";
import { safeLinkUrl } from "@/lib/research/urls";
import { words } from "@/lib/research/words";
import { ResearchError } from "@/lib/server/errors";
import { ProviderHttpError, providerFailure, requestJson } from "./http";

const FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "location",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "types",
  "businessStatus",
].join(",");

const GooglePlaceSchema = z.object({
  id: z.string().min(1).max(300),
  displayName: z.object({ text: z.string().min(1).max(300) }),
  formattedAddress: z.string().min(1).max(500),
  addressComponents: z
    .array(
      z.object({
        longText: z.string().optional(),
        shortText: z.string().optional(),
        types: z.array(z.string()),
      }),
    )
    .default([]),
  location: z
    .object({
      latitude: z.number().min(-90).max(90).nullish(),
      longitude: z.number().min(-180).max(180).nullish(),
    })
    .optional(),
  nationalPhoneNumber: z.string().max(80).nullish(),
  internationalPhoneNumber: z.string().max(80).nullish(),
  websiteUri: z.string().nullish(),
  googleMapsUri: z.string().nullish(),
  types: z.array(z.string()).default([]),
  businessStatus: z.string().max(100).nullish(),
});

type GooglePlace = z.infer<typeof GooglePlaceSchema>;

/** Returns the first available address component in the requested type order. */
function addressPart(
  components: GooglePlace["addressComponents"],
  types: string[],
  short = false,
): string | null {
  for (const type of types) {
    const component = components.find((part) => part.types.includes(type));
    const value = short
      ? component?.shortText || component?.longText
      : component?.longText || component?.shortText;
    if (value?.trim()) return value.trim();
  }
  return null;
}

const NON_DEPARTMENT_TYPES = new Set([
  "restaurant",
  "cafe",
  "bar",
  "lodging",
  "shopping_mall",
  "supermarket",
  "school",
  "university",
  "hospital",
  "tourist_attraction",
]);

/** Words that name a fire department in the languages of its likely listings. */
const DEPARTMENT_WORDS = new Set([
  "fire",
  "rescue",
  "hose",
  "brigade",
  "pompiers",
  "bombero",
  "bomberos",
  "bombera",
  "bomberas",
]);

/** Rejects clearly unrelated place categories while allowing incomplete department listings. */
function rejectClearlyUnrelatedPlace(place: GooglePlace): void {
  // Google's category can be incomplete, especially for volunteer organizations.
  // Reject clear category mismatches without requiring every department to be tagged.
  const namedDepartment = words(place.displayName.text).some((word) =>
    DEPARTMENT_WORDS.has(word),
  );
  if (
    !place.types.includes("fire_station") &&
    !namedDepartment &&
    place.types.some((type) => NON_DEPARTMENT_TYPES.has(type))
  ) {
    throw new ResearchError(
      "This Place ID appears to identify a different kind of organization. Please use a fire department or station Place ID.",
      { retryable: false },
    );
  }
}

/** Creates a Google Places resolver that validates location details and rejects clear category mismatches. */
export function createPlaceResolver(
  config: { googlePlacesApiKey: string; providerTimeoutMs: number },
  fetchImpl: typeof fetch,
  now: () => Date = () => new Date(),
) {
  return async (placeId: string, signal: AbortSignal): Promise<Place> => {
    try {
      const response = await requestJson(fetchImpl, {
        url: `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        init: {
          headers: {
            "X-Goog-Api-Key": config.googlePlacesApiKey,
            "X-Goog-FieldMask": FIELD_MASK,
          },
        },
        signal,
        timeoutMs: config.providerTimeoutMs,
      });
      const parsed = GooglePlaceSchema.safeParse(response);
      if (!parsed.success) {
        throw new ResearchError(
          "Google did not return enough location details to identify this department reliably. Check the Place ID or try another station.",
          { retryable: false },
        );
      }
      const data = parsed.data;
      rejectClearlyUnrelatedPlace(data);
      const fallbackMaps = new URL("https://www.google.com/maps/search/");
      fallbackMaps.searchParams.set("api", "1");
      fallbackMaps.searchParams.set("query", data.displayName.text);
      fallbackMaps.searchParams.set("query_place_id", data.id);
      return PlaceSchema.parse({
        id: data.id,
        name: data.displayName.text,
        address: data.formattedAddress,
        locality: addressPart(data.addressComponents, [
          "locality",
          "postal_town",
          "sublocality_level_1",
          "administrative_area_level_3",
          "administrative_area_level_2",
        ]),
        region: addressPart(
          data.addressComponents,
          ["administrative_area_level_1"],
          true,
        ),
        country: addressPart(data.addressComponents, ["country"]),
        latitude: data.location?.latitude ?? null,
        longitude: data.location?.longitude ?? null,
        phone:
          data.nationalPhoneNumber || data.internationalPhoneNumber || null,
        websiteUrl: data.websiteUri ? safeLinkUrl(data.websiteUri) : null,
        mapsUrl:
          (data.googleMapsUri && safeLinkUrl(data.googleMapsUri)) ||
          fallbackMaps.toString(),
        businessStatus: data.businessStatus || null,
        resolvedAt: now().toISOString(),
      });
    } catch (error) {
      if (
        error instanceof ProviderHttpError &&
        [400, 404].includes(error.status)
      ) {
        throw new ResearchError(
          "Google could not resolve that Place ID. Check it and try again.",
          { retryable: false },
        );
      }
      return providerFailure(error, "Google Places");
    }
  };
}
