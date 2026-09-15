import type { DraftBrief, Fact, Place, Source } from "@/lib/brief/schema";
import type {
  Candidate,
  EvidenceSource,
  ExtractedPage,
  ResearchProviders,
} from "@/lib/research/contracts";

export const TEST_DATE = "2026-09-12T12:00:00.000Z";
export function makePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: "test-place",
    name: "Maple Fire Department",
    address: "12 Main Street, Maple, Vermont",
    locality: "Maple",
    region: "Vermont",
    country: "US",
    latitude: 44,
    longitude: -72,
    phone: null,
    websiteUrl: "https://maple.example.org/fire",
    mapsUrl: "https://maps.google.com/?q=Maple+Fire+Department",
    businessStatus: null,
    resolvedAt: TEST_DATE,
    ...overrides,
  };
}
export function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    url: "https://maple.example.org/fire",
    title: "Maple fire apparatus",
    excerpt: "Maple Fire Department apparatus replacement",
    publishedAt: null,
    tracks: ["fleet", "disposition"],
    rank: 0,
    ...overrides,
  };
}
export function makePage(
  overrides: Partial<ExtractedPage> = {},
): ExtractedPage {
  return {
    url: "https://maple.example.org/fire",
    title: "Maple fire apparatus",
    text: "The Maple Fire Department plans to declare the 1996 Pierce Engine 4 as surplus after the new engine enters service. The sale has not been completed.",
    publishedAt: null,
    retrievedAt: TEST_DATE,
    retrieval: "live",
    truncated: false,
    ...overrides,
  };
}
export function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: "S1",
    url: makePage().url,
    title: "Maple apparatus",
    publisher: "maple.example.org",
    publishedAt: null,
    dateOrigin: "unknown",
    retrieval: "live",
    ...overrides,
  };
}
export function makeEvidenceSource(
  overrides: Partial<EvidenceSource> = {},
): EvidenceSource {
  return {
    ...makeSource(),
    retrievedAt: TEST_DATE,
    partial: false,
    tracks: ["fleet", "disposition"],
    passages: [{ id: "S1:P1", text: makePage().text, locator: null }],
    ...overrides,
  };
}
export function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    id: "F1",
    category: "disposition",
    title: "Planned engine disposition",
    statement:
      "The department plans to surplus its 1996 Pierce once the replacement enters service.",
    references: ["S1:P1"],
    eventDate: null,
    asOf: "September 2026",
    status: "planned_surplus",
    person: null,
    vehicle: {
      unit: "Engine 4",
      modelYear: 1996,
      make: "Pierce",
      description: "pumper",
      replacementRelationship: "After replacement enters service",
    },
    money: null,
    ...overrides,
  };
}
export function makeDraft(overrides: Partial<DraftBrief> = {}): DraftBrief {
  return {
    scope: {
      name: makePlace().name,
      relationship: "selected_place",
      explanation: null,
      references: [],
    },
    department: { kind: "unknown", summary: null, references: [] },
    facts: [makeFact()],
    callAngles: [
      {
        kind: "disposition",
        reason:
          "The department plans to surplus its 1996 Pierce Engine 4 once the replacement enters service.",
        factIds: ["F1"],
      },
    ],
    questions: [
      { text: "Who coordinates apparatus disposition?", factIds: [] },
    ],
    ...overrides,
  };
}
export function makeProviders(
  overrides: Partial<ResearchProviders> = {},
): ResearchProviders {
  return {
    resolvePlace: async () => makePlace(),
    search: async (query) => [makeCandidate({ tracks: [query.track] })],
    read: async () => ({ pages: [makePage()], failures: [] }),
    synthesize: async () => ({
      draft: makeDraft(),
      usage: { model: "test-model", inputTokens: 100, outputTokens: 100 },
    }),
    ...overrides,
  };
}

/** An OpenAI Responses API body whose one message carries a draft, given text, or a refusal. */
export function makeModelResponse(
  options: {
    draft?: DraftBrief;
    text?: string;
    refusal?: string;
    status?: string;
  } = {},
) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 1_784_000_000,
    status: options.status ?? "completed",
    model: "gpt-6-astra-2026-09-10",
    output: [
      {
        type: "message",
        id: "msg_test",
        role: "assistant",
        status: "completed",
        content: options.refusal
          ? [{ type: "refusal", refusal: options.refusal }]
          : [
              {
                type: "output_text",
                text:
                  options.text ?? JSON.stringify(options.draft ?? makeDraft()),
                annotations: [],
              },
            ],
      },
    ],
    usage: { input_tokens: 2300, output_tokens: 900, total_tokens: 3200 },
  };
}
