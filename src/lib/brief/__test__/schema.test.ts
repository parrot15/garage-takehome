import { describe, expect, it } from "vitest";
import {
  makeDraft,
  makeFact,
  makePlace,
  makeSource,
  TEST_DATE,
} from "@/__test__/factories";
import { SAMPLE_BRIEF } from "@/lib/sample";
import {
  ANGLE_KINDS,
  BriefSchema,
  DraftBriefSchema,
  PlaceSchema,
  PublicErrorSchema,
  parseBriefRequest,
  ResearchEventSchema,
  SourceSchema,
  TRACKS,
} from "../schema";

const PASTE_MESSAGE = "Paste the Place ID itself, without a URL or spaces.";

describe("parseBriefRequest", () => {
  it("accepts a Place ID and trims the whitespace around it", () => {
    expect(
      parseBriefRequest({ placeId: "  ChIJpcN7ecgAyIkRrOcWzZx3Yyc " }),
    ).toEqual({ ok: true, placeId: "ChIJpcN7ecgAyIkRrOcWzZx3Yyc" });
  });
  it.each([
    ["an empty field", "", "Enter a Google Place ID."],
    ["only whitespace", "   ", "Enter a Google Place ID."],
    [
      "a value past the length limit",
      "a".repeat(301),
      "That Place ID is too long.",
    ],
    ["a pasted URL", "https://maps.google.com/?cid=1", PASTE_MESSAGE],
    ["an inner space", "ChIJ abc", PASTE_MESSAGE],
    ["a query character", "ChIJ?x=1", PASTE_MESSAGE],
    ["a fragment", "ChIJ#top", PASTE_MESSAGE],
    ["a backslash", "ChIJ\\x", PASTE_MESSAGE],
    ["a control character", `ChIJ${String.fromCharCode(7)}x`, PASTE_MESSAGE],
  ])("explains %s in the app's own words", (_name, placeId, message) => {
    expect(parseBriefRequest({ placeId })).toEqual({ ok: false, message });
  });
  it.each([
    ["no body", undefined],
    ["a null body", null],
    ["a bare string", "ChIJpcN7ecgAyIkRrOcWzZx3Yyc"],
    ["an object without the field", {}],
    ["a numeric field", { placeId: 42 }],
    [
      "an unexpected extra field",
      { placeId: "ChIJpcN7ecgAyIkRrOcWzZx3Yyc", extra: true },
    ],
  ])("rejects %s with a message to show", (_name, input) => {
    const result = parseBriefRequest(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });
  it("keeps the length limit at the field's maxLength", () => {
    expect(parseBriefRequest({ placeId: "a".repeat(300) }).ok).toBe(true);
  });
});

describe("the model contract", () => {
  const vehicle = {
    unit: null,
    modelYear: 2005,
    make: null,
    description: "engine",
    replacementRelationship: null,
  };
  const angle = makeDraft().callAngles[0];
  const question = { text: "Who decides?", factIds: [] };
  const facts = (count: number) =>
    Array.from({ length: count }, (_, i) => makeFact({ id: `F${i + 1}` }));

  it("accepts a complete draft", () => {
    expect(DraftBriefSchema.parse(makeDraft())).toEqual(makeDraft());
  });
  it("requires every field so structured outputs carry no optional keys", () => {
    const { money: _money, ...withoutMoney } = makeFact();
    expect(
      DraftBriefSchema.safeParse(makeDraft({ facts: [withoutMoney as never] }))
        .success,
    ).toBe(false);
  });
  it.each([
    ["28 facts", { facts: facts(28) }, true],
    ["29 facts", { facts: facts(29) }, false],
    ["two reasons to call", { callAngles: [angle, angle] }, true],
    ["three reasons to call", { callAngles: [angle, angle, angle] }, false],
    ["three questions", { questions: [question, question, question] }, true],
    [
      "four questions",
      { questions: [question, question, question, question] },
      false,
    ],
    [
      "a fact with no citation",
      { facts: [makeFact({ references: [] })] },
      false,
    ],
    [
      "a fact citing nine passages",
      {
        facts: [
          makeFact({
            references: Array.from({ length: 9 }, (_, i) => `S1:P${i + 1}`),
          }),
        ],
      },
      false,
    ],
    [
      "a reason to call resting on no fact",
      { callAngles: [{ kind: "aging", reason: "Old engine.", factIds: [] }] },
      false,
    ],
    ["a generic question with no fact", { questions: [question] }, true],
    [
      "a statement past 550 characters",
      { facts: [makeFact({ statement: "s".repeat(551) })] },
      false,
    ],
    [
      "a title past 100 characters",
      { facts: [makeFact({ title: "t".repeat(101) })] },
      false,
    ],
    [
      "a status outside the vocabulary",
      { facts: [makeFact({ status: "for_sale" as never })] },
      false,
    ],
    [
      "a reason kind outside the vocabulary",
      {
        callAngles: [
          { kind: "urgent" as never, reason: "Now.", factIds: ["F1"] },
        ],
      },
      false,
    ],
    [
      "a model year before 1900",
      { facts: [makeFact({ vehicle: { ...vehicle, modelYear: 1899 } })] },
      false,
    ],
    [
      "a fractional model year",
      { facts: [makeFact({ vehicle: { ...vehicle, modelYear: 2005.5 } })] },
      false,
    ],
    [
      "an unknown model year",
      { facts: [makeFact({ vehicle: { ...vehicle, modelYear: null } })] },
      true,
    ],
  ])("%s: accepted %s", (_name, overrides, accepted) => {
    expect(
      DraftBriefSchema.safeParse(makeDraft(overrides as never)).success,
    ).toBe(accepted);
  });
  it("lists every research track and reason kind once", () => {
    expect(new Set(TRACKS).size).toBe(TRACKS.length);
    expect(new Set(ANGLE_KINDS).size).toBe(ANGLE_KINDS.length);
  });
});

describe("the public brief contract", () => {
  const brief = () => ({
    ...SAMPLE_BRIEF,
    runId: "run-1",
    mode: "live" as const,
    place: makePlace(),
    researchedAt: TEST_DATE,
    durationMs: 12,
  });
  it("accepts a live brief and the historical example alike", () => {
    expect(BriefSchema.safeParse(brief()).success).toBe(true);
    expect(BriefSchema.safeParse(SAMPLE_BRIEF).success).toBe(true);
  });
  it.each([
    ["a mode outside live or sample", { mode: "draft" }],
    ["a negative duration", { durationMs: -1 }],
    ["no research date", { researchedAt: "" }],
    [
      "more public sources than the cap allows",
      {
        sources: Array.from({ length: 25 }, (_, i) =>
          makeSource({ id: `S${i + 1}` }),
        ),
      },
    ],
  ])("rejects %s", (_name, overrides) => {
    expect(BriefSchema.safeParse({ ...brief(), ...overrides }).success).toBe(
      false,
    );
  });
});

describe("place and source metadata", () => {
  it("keeps unlisted place details as null rather than placeholders", () => {
    const place = makePlace({
      locality: null,
      region: null,
      country: null,
      phone: null,
      websiteUrl: null,
      businessStatus: null,
      latitude: null,
      longitude: null,
    });
    expect(PlaceSchema.parse(place)).toEqual(place);
    expect(PlaceSchema.safeParse({ ...place, mapsUrl: "" }).success).toBe(
      false,
    );
    expect(
      PlaceSchema.safeParse({ ...place, name: "n".repeat(301) }).success,
    ).toBe(false);
  });
  it("limits a source to the metadata a card shows", () => {
    expect(SourceSchema.parse(makeSource())).toEqual(makeSource());
    expect(
      SourceSchema.safeParse(makeSource({ dateOrigin: "guessed" as never }))
        .success,
    ).toBe(false);
    expect(
      SourceSchema.safeParse(makeSource({ retrieval: "cached" as never }))
        .success,
    ).toBe(false);
    expect(SourceSchema.safeParse(makeSource({ url: "" })).success).toBe(false);
  });
});

describe("streamed events", () => {
  it.each([
    ["a stage", { type: "stage", stage: "reading" }],
    ["the resolved identity", { type: "identity", place: makePlace() }],
    ["the finished brief", { type: "complete", brief: SAMPLE_BRIEF }],
    [
      "a safe error",
      {
        type: "error",
        error: { message: "Try again.", retryable: true, requestId: "r" },
      },
    ],
  ])("accepts %s", (_name, event) => {
    expect(ResearchEventSchema.safeParse(event).success).toBe(true);
  });
  it.each([
    ["an unknown event type", { type: "progress", percent: 50 }],
    ["a stage outside the run's stages", { type: "stage", stage: "guessing" }],
    [
      "a brief whose facts still cite passages",
      { type: "complete", brief: { ...SAMPLE_BRIEF, facts: [makeFact()] } },
    ],
    [
      "an error without a retry decision",
      { type: "error", error: { message: "x" } },
    ],
  ])("rejects %s", (_name, event) => {
    expect(ResearchEventSchema.safeParse(event).success).toBe(false);
  });
  it("lets an error omit its request id but not its message", () => {
    expect(
      PublicErrorSchema.safeParse({ message: "x", retryable: false }).success,
    ).toBe(true);
    expect(
      PublicErrorSchema.safeParse({ message: "", retryable: false }).success,
    ).toBe(false);
    expect(
      PublicErrorSchema.safeParse({ message: "m".repeat(501), retryable: true })
        .success,
    ).toBe(false);
  });
});
