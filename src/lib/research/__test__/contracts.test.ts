import { describe, expect, it } from "vitest";
import { makeEvidenceSource } from "@/__test__/factories";
import { EvidenceSourceSchema } from "../contracts";

const passage = (index: number) => ({
  id: `S1:P${index}`,
  text: `Passage ${index}`,
  locator: null,
});

describe("research evidence contract", () => {
  it("accepts a source with its passages, tracks, and retrieval bookkeeping", () => {
    const source = makeEvidenceSource({
      passages: [{ id: "S1:P1", text: "Engine 4", locator: "Apparatus" }],
    });
    expect(EvidenceSourceSchema.parse(source)).toEqual(source);
  });
  it.each([
    [
      "more than a hundred passages",
      { passages: Array.from({ length: 101 }, (_, i) => passage(i + 1)) },
    ],
    [
      "a passage longer than the model budget allows",
      { passages: [{ ...passage(1), text: "x".repeat(16_001) }] },
    ],
    ["an empty passage", { passages: [{ ...passage(1), text: "" }] }],
    [
      "a locator longer than a heading",
      { passages: [{ ...passage(1), locator: "h".repeat(251) }] },
    ],
    ["a topic outside the research tracks", { tracks: ["weather" as never] }],
    ["no retrieval time", { retrievedAt: "" }],
  ])("rejects %s", (_name, overrides) => {
    expect(
      EvidenceSourceSchema.safeParse(makeEvidenceSource(overrides)).success,
    ).toBe(false);
  });
  it("keeps exactly a hundred passages", () => {
    const source = makeEvidenceSource({
      passages: Array.from({ length: 100 }, (_, i) => passage(i + 1)),
    });
    expect(EvidenceSourceSchema.safeParse(source).success).toBe(true);
  });
});
