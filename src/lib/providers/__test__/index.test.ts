import { describe, expect, it } from "vitest";
import { makeDraft, makeModelResponse, TEST_DATE } from "@/__test__/factories";
import { researchDepartment } from "@/lib/research/orchestrator";
import { createProviders } from "../index";

const config = {
  googlePlacesApiKey: "google-key",
  exaApiKey: "exa-key",
  openaiApiKey: "openai-key",
  openaiModel: "gpt-6-astra",
  reasoningEffort: "low" as const,
  providerTimeoutMs: 5_000,
  modelTimeoutMs: 5_000,
};
const homepage = "https://www.maple.example.org/fire";
const apparatus = "https://www.maple.example.org/fire/apparatus";

interface Sent {
  url: string;
  headers: Headers;
  body: { urls?: string[] } | null;
}

/** Answers each provider the way it answers in production, and records what was sent. */
function scriptedFetch(sent: Sent[]): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    const body: Sent["body"] =
      typeof init?.body === "string" ? JSON.parse(init.body) : null;
    sent.push({ url, headers: new Headers(init?.headers), body });
    if (url.startsWith("https://places.googleapis.com/v1/places/"))
      return Response.json({
        id: "test-place",
        displayName: { text: "Maple Fire Department" },
        formattedAddress: "12 Main Street, Maple, VT",
        addressComponents: [
          { longText: "Maple", types: ["locality"] },
          {
            longText: "Vermont",
            shortText: "VT",
            types: ["administrative_area_level_1"],
          },
        ],
        websiteUri: homepage,
        types: ["fire_station"],
      });
    if (url === "https://api.exa.ai/search")
      return Response.json({
        results: [
          {
            url: apparatus,
            title: "Apparatus",
            highlights: ["Maple Fire Department apparatus"],
          },
        ],
      });
    if (url === "https://api.exa.ai/contents") {
      const urls = body?.urls ?? [];
      return Response.json({
        results: urls.map((page) => ({
          id: page,
          url: page,
          title: `Page ${page}`,
          text: `${page}: Maple Fire Department plans to declare the 1996 Pierce Engine 4 surplus after the new engine enters service.`,
        })),
        statuses: urls.map((page) => ({
          id: page,
          status: "success",
          source: "livecrawl",
        })),
      });
    }
    if (url === "https://api.openai.com/v1/responses")
      return Response.json(makeModelResponse({ draft: makeDraft() }));
    throw new Error(`Unexpected request: ${url}`);
  };
}

describe("createProviders", () => {
  it("wires one fetch and one clock into Google, Exa, and OpenAI and produces a cited brief", async () => {
    const sent: Sent[] = [];
    const providers = createProviders(config, {
      fetch: scriptedFetch(sent),
      now: () => new Date(TEST_DATE),
    });
    const brief = await researchDepartment({
      placeId: "test-place",
      providers,
      now: () => new Date(TEST_DATE),
      runId: "run-1",
    });
    expect(brief.place).toMatchObject({
      name: "Maple Fire Department",
      locality: "Maple",
      region: "VT",
      websiteUrl: homepage,
      resolvedAt: TEST_DATE,
    });
    expect(brief.facts.map((fact) => fact.references)).toEqual([["S1"]]);
    expect(
      brief.sources.map((source) => [source.url, source.retrieval]),
    ).toEqual([[homepage, "live"]]);

    const hosts = sent.map((request) => new URL(request.url).host);
    expect(
      hosts.filter((host) => host === "places.googleapis.com"),
    ).toHaveLength(1);
    // Fourteen searches and one read of every selected page.
    expect(hosts.filter((host) => host === "api.exa.ai")).toHaveLength(15);
    expect(hosts.filter((host) => host === "api.openai.com")).toHaveLength(1);
    expect(
      sent
        .find((request) => request.url.includes("places.googleapis.com"))
        ?.headers.get("x-goog-api-key"),
    ).toBe("google-key");
    expect(
      sent
        .find((request) => request.url === "https://api.exa.ai/search")
        ?.headers.get("x-api-key"),
    ).toBe("exa-key");
    expect(
      sent
        .find((request) => request.url.includes("api.openai.com"))
        ?.headers.get("authorization"),
    ).toBe("Bearer openai-key");
    expect(
      sent.find((request) => request.url === "https://api.exa.ai/contents")
        ?.body?.urls,
    ).toEqual([homepage, apparatus]);
  });
});
