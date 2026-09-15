import { describe, expect, it } from "vitest";
import { BriefSchema } from "@/lib/brief/schema";
import { SAMPLE_BRIEF } from "../sample";

describe("historical example", () => {
  it("links each historical fact directly to the memo", () => {
    expect(BriefSchema.safeParse(SAMPLE_BRIEF).success).toBe(true);
    expect(SAMPLE_BRIEF.scope.references).toEqual(["S1"]);
    for (const fact of SAMPLE_BRIEF.facts)
      expect(fact.references).toEqual(["S1"]);
  });

  it("contains only source metadata, with no embedded quotations or summaries", () => {
    expect(
      SAMPLE_BRIEF.sources.map((source) => Object.keys(source).sort()),
    ).toEqual([
      [
        "dateOrigin",
        "id",
        "publishedAt",
        "publisher",
        "retrieval",
        "title",
        "url",
      ],
    ]);
  });
});
