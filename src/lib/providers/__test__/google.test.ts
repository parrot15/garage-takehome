import { describe, expect, it, vi } from "vitest";
import { createPlaceResolver } from "../google";

const googlePlace = {
  id: "a-place-id",
  displayName: { text: "Riverbend Fire Station 2" },
  formattedAddress: "123 Main St, Riverbend, NY, USA",
  addressComponents: [
    { longText: "Riverbend", types: ["locality"] },
    {
      longText: "New York",
      shortText: "NY",
      types: ["administrative_area_level_1"],
    },
    { longText: "United States", types: ["country"] },
  ],
  location: { latitude: 41, longitude: -74 },
  nationalPhoneNumber: "(212) 555-0123",
  websiteUri: "https://riverbend.gov/fire",
  googleMapsUri: "https://maps.google.com/?cid=1234",
  types: ["fire_station", "establishment"],
  businessStatus: "CLOSED_TEMPORARILY",
};
const config = {
  googlePlacesApiKey: "test-google-key",
  providerTimeoutMs: 5000,
};
const signal = () => new AbortController().signal;

describe("Google Places adapter", () => {
  it("uses the readable name, structured locality, and status", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(googlePlace));
    const resolve = createPlaceResolver(
      config,
      fetchImpl,
      () => new Date("2026-09-12T12:00:00Z"),
    );
    const place = await resolve("a-place-id", signal());
    expect(place).toMatchObject({
      name: "Riverbend Fire Station 2",
      locality: "Riverbend",
      region: "NY",
      latitude: 41,
      phone: "(212) 555-0123",
      businessStatus: "CLOSED_TEMPORARILY",
      resolvedAt: "2026-09-12T12:00:00.000Z",
    });
    const [url, options] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://places.googleapis.com/v1/places/a-place-id");
    expect(url).not.toContain(config.googlePlacesApiKey);
    const headers = new Headers(options?.headers);
    expect(headers.get("X-Goog-Api-Key")).toBe(config.googlePlacesApiKey);
    expect(headers.get("X-Goog-FieldMask")).not.toContain("reviews");
    expect(options).toMatchObject({ cache: "no-store" });
  });

  it("encodes the Place ID into one path segment without requiring ChIJ", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(googlePlace));
    await createPlaceResolver(config, fetchImpl)("custom:id+1", signal());
    expect(fetchImpl.mock.calls[0]?.[0]).toContain("custom%3Aid%2B1");
  });

  it("preserves sparse listings and builds a Google Maps link", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: "volunteer-id",
        displayName: { text: "Riverbend Hose Company" },
        formattedAddress: "Riverbend, NY",
        types: ["point_of_interest"],
      }),
    );
    const place = await createPlaceResolver(config, fetchImpl)(
      "volunteer-id",
      signal(),
    );
    expect(place).toMatchObject({
      websiteUrl: null,
      phone: null,
      latitude: null,
      longitude: null,
      locality: null,
    });
    expect(new URL(place.mapsUrl).searchParams.get("query_place_id")).toBe(
      "volunteer-id",
    );
  });

  it("drops unsafe website URLs while preserving the listing", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ ...googlePlace, websiteUri: "javascript:alert(1)" }),
      );
    const place = await createPlaceResolver(config, fetchImpl)(
      "a-place-id",
      signal(),
    );
    expect(place.websiteUrl).toBeNull();
  });

  it.each([400, 404])(
    "reports invalid input for HTTP %i without retry",
    async (status) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          Response.json(
            { error: { message: "secret provider payload" } },
            { status },
          ),
        );
      await expect(
        createPlaceResolver(config, fetchImpl)("missing", signal()),
      ).rejects.toMatchObject({
        message:
          "Google could not resolve that Place ID. Check it and try again.",
        retryable: false,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("distinguishes provider billing/auth failures and redacts its body", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { message: config.googlePlacesApiKey } },
          { status: 403 },
        ),
      );
    const result = createPlaceResolver(config, fetchImpl)(
      "a-place-id",
      signal(),
    );
    await expect(result).rejects.toMatchObject({
      message: expect.stringContaining("is not configured for this request"),
      retryable: false,
    });
    await expect(result).rejects.not.toThrow(config.googlePlacesApiKey);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects an obviously unrelated location", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        ...googlePlace,
        displayName: { text: "Moonlight Cafe" },
        types: ["cafe"],
      }),
    );
    await expect(
      createPlaceResolver(config, fetchImpl)("cafe", signal()),
    ).rejects.toMatchObject({
      message: expect.stringContaining("different kind of organization"),
      retryable: false,
    });
  });

  it("does not fabricate an identity from a malformed provider body", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: "a-place-id" }));
    await expect(
      createPlaceResolver(config, fetchImpl)("a-place-id", signal()),
    ).rejects.toMatchObject({
      message: expect.stringContaining("enough location details"),
      retryable: false,
    });
  });
});
