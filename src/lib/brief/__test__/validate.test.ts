import { describe, expect, it } from "vitest";
import {
  makeDraft,
  makeEvidenceSource,
  makeFact,
  makePlace,
} from "@/__test__/factories";
import { BriefSchema, duplicates } from "../schema";
import { projectBrief, validateDraft } from "../validate";

const validate = (draft = makeDraft()) =>
  validateDraft(draft, [makeEvidenceSource()], makePlace());

describe("brief provenance validation", () => {
  it("drops facts that cite unknown passages and the reasons that depend on them", () => {
    const result = validate(
      makeDraft({ facts: [makeFact({ references: ["S99:P1"] })] }),
    );
    expect(result.facts).toEqual([]);
    expect(result.callAngles).toEqual([]);
    expect(result.questions).toHaveLength(1);
  });
  it("keeps a supported brief exactly as given", () =>
    expect(validate()).toEqual(makeDraft()));
  it.each(["retained", "sold", "donated", "cancelled"] as const)(
    "does not recommend an open disposition opportunity for %s",
    (status) => {
      const result = validate(makeDraft({ facts: [makeFact({ status })] }));
      expect(result.callAngles).toEqual([]);
      expect(result.facts).toHaveLength(1);
    },
  );
  it.each(["aging", "replacement", "context"] as const)(
    "keeps a %s reason that explicitly describes reserve use",
    (kind) => {
      const draft = makeDraft({
        facts: [makeFact({ status: "retained" })],
        callAngles: [
          {
            kind,
            reason:
              "The 1996 Pierce remains in reserve after its replacement arrived.",
            factIds: ["F1"],
          },
        ],
      });
      expect(validate(draft).callAngles).toEqual(draft.callAngles);
    },
  );
  it.each(["listing", "disposition", "funding"] as const)(
    "does not treat retained apparatus as a %s opportunity",
    (kind) => {
      const draft = makeDraft({
        facts: [makeFact({ status: "retained" })],
        callAngles: [
          { kind, reason: "An open sale opportunity.", factIds: ["F1"] },
        ],
      });
      expect(validate(draft).callAngles).toEqual([]);
    },
  );
  it.each(["sold", "donated", "cancelled"] as const)(
    "does not rescue a closed %s asset by citing a reserve vehicle alongside it",
    (status) => {
      const draft = makeDraft({
        facts: [
          makeFact({ status }),
          makeFact({ id: "F2", status: "retained" }),
        ],
        callAngles: [
          {
            kind: "replacement",
            reason: "Two outgoing engines.",
            factIds: ["F1", "F2"],
          },
        ],
      });
      expect(validate(draft).callAngles).toEqual([]);
    },
  );
  it("keeps a useful background brief with no timely reason to call", () => {
    const draft = makeDraft({ callAngles: [] });
    expect(validate(draft)).toEqual(draft);
  });
  it("accepts an age-based reason to call only for a documented model year fifteen or more years old", () => {
    const aging = (modelYear: number) =>
      validate(
        makeDraft({
          facts: [
            makeFact({
              status: "reported",
              vehicle: {
                unit: "Engine 4",
                modelYear,
                make: "Pierce",
                description: "pumper",
                replacementRelationship: null,
              },
            }),
          ],
          callAngles: [
            {
              kind: "aging",
              reason:
                "Engine 4 is a 1996 Pierce pumper, thirty model years old.",
              factIds: ["F1"],
            },
          ],
        }),
      ).callAngles;
    expect(aging(1996)).toHaveLength(1);
    expect(aging(2020)).toHaveLength(0);
  });
  it("rejects ambiguous fact IDs and every reason depending on them", () => {
    const result = validate(
      makeDraft({
        facts: [makeFact(), makeFact({ statement: "Different assertion" })],
      }),
    );
    expect(result.facts).toHaveLength(0);
    expect(result.callAngles).toHaveLength(0);
  });
  it("requires cited evidence to broaden the selected organization", () => {
    const parent = {
      name: "Another department",
      relationship: "parent_department" as const,
      explanation: "Same city",
      references: [] as string[],
    };
    const unsupported = validate(makeDraft({ scope: parent }));
    expect(unsupported.scope).toEqual({
      name: makePlace().name,
      relationship: "unresolved",
      explanation: null,
      references: [],
    });
    expect(unsupported.facts).toEqual([]);
    expect(unsupported.callAngles).toEqual([]);
    const supported = validate(
      makeDraft({ scope: { ...parent, references: ["S1:P1"] } }),
    );
    expect(supported.scope.relationship).toBe("parent_department");
    expect(supported.scope.name).toBe("Another department");
    expect(supported.facts).toHaveLength(1);
  });
  it("rejects a renamed selected place without evidence", () =>
    expect(
      validate(
        makeDraft({
          scope: {
            name: "Wrong Fire Department",
            relationship: "selected_place",
            references: [],
            explanation: null,
          },
        }),
      ).scope.relationship,
    ).toBe("unresolved"));
  it("accepts the selected place under its own name regardless of case and spacing", () =>
    expect(
      validate(
        makeDraft({
          scope: {
            name: "  maple  FIRE department ",
            relationship: "selected_place",
            explanation: "The listing is the department itself.",
            references: [],
          },
        }),
      ).scope,
    ).toEqual(makeDraft().scope));
  it("keeps a cited explanation when the organization stays unresolved", () => {
    const scope = {
      name: "Maple Fire District",
      relationship: "unresolved" as const,
      explanation: "The station belongs to a district the sources do not name.",
      references: ["S1:P1"],
    };
    const result = validate(makeDraft({ scope }));
    expect(result.scope).toEqual({ ...scope, name: makePlace().name });
    expect(result.facts).toEqual([]);
  });
  it("drops an unsupported department summary and keeps a supported one", () => {
    const unsupported = validate(
      makeDraft({
        department: {
          kind: "volunteer",
          summary: "A volunteer company.",
          references: ["S9:P9"],
        },
      }),
    );
    expect(unsupported.department).toEqual({
      kind: "unknown",
      summary: null,
      references: [],
    });
    const supported = validate(
      makeDraft({
        department: {
          kind: "volunteer",
          summary: "A volunteer company that owns its apparatus.",
          references: ["S1:P1"],
        },
      }),
    );
    expect(supported.department.kind).toBe("volunteer");
  });
});

describe("public source projection", () => {
  const first = makeEvidenceSource({
    publishedAt: "2025-02-10",
    dateOrigin: "estimated",
    retrieval: "unknown",
    passages: [
      { id: "S1:P1", text: "First paragraph", locator: "Apparatus" },
      { id: "S1:P2", text: "Second paragraph", locator: "Apparatus" },
    ],
  });
  const second = makeEvidenceSource({
    id: "S2",
    url: "https://maple.example.org/organization",
    title: "Organization",
    dateOrigin: "source",
    publishedAt: "2026-08-01",
    passages: [
      { id: "S2:P1", text: "Department organization", locator: "Officers" },
    ],
  });
  const unused = makeEvidenceSource({
    id: "S3",
    passages: [{ id: "S3:P1", text: "Uncited material", locator: null }],
  });
  const draft = makeDraft({
    scope: {
      name: "Maple Fire Department",
      relationship: "parent_department",
      explanation: "The selected station belongs to the department.",
      references: ["S2:P1"],
    },
    department: {
      kind: "volunteer",
      summary: "A volunteer department.",
      references: ["S2:P1", "S1:P2"],
    },
    facts: [makeFact({ references: ["S2:P1", "S1:P2", "S1:P1", "S2:P1"] })],
    questions: [{ text: "Has the disposition plan changed?", factIds: ["F1"] }],
  });

  it("maps scope, organization and facts to deduplicated sources in evidence order", () => {
    const result = projectBrief(draft, [first, second, unused]);
    expect(result.scope.references).toEqual(["S2"]);
    expect(result.department.references).toEqual(["S1", "S2"]);
    expect(result.facts[0]?.references).toEqual(["S1", "S2"]);
    expect(result.sources.map((source) => source.id)).toEqual(["S1", "S2"]);
    expect(result.callAngles).toEqual(draft.callAngles);
    expect(result.questions).toEqual(draft.questions);
    expect(draft.facts[0]?.references).toEqual([
      "S2:P1",
      "S1:P2",
      "S1:P1",
      "S2:P1",
    ]);
  });

  it("preserves all source metadata and freshness without exposing research evidence", () => {
    const result = projectBrief(draft, [first, second, unused]);
    expect(result.sources).toEqual(
      [first, second].map((source) => ({
        id: source.id,
        url: source.url,
        title: source.title,
        publisher: source.publisher,
        publishedAt: source.publishedAt,
        dateOrigin: source.dateOrigin,
        retrieval: source.retrieval,
      })),
    );
    const output = JSON.stringify(result);
    expect(output).not.toContain("First paragraph");
    expect(output).not.toContain("S1:P");
    for (const field of [
      "passages",
      "locator",
      "sourceId",
      "textKind",
      "retrievedAt",
      "partial",
      "tracks",
    ])
      expect(result.sources[0]).not.toHaveProperty(field);
  });

  it("retains sources cited only by scope or organization", () => {
    const result = projectBrief(
      { ...draft, facts: [], callAngles: [], questions: [] },
      [first, second],
    );
    expect(result.sources.map((source) => source.id)).toEqual(["S1", "S2"]);
  });

  it("returns no sources when no research claims remain", () => {
    const result = projectBrief(makeDraft({ facts: [], callAngles: [] }), [
      first,
    ]);
    expect(result.sources).toEqual([]);
  });

  it("rejects unknown references instead of silently producing an uncited claim", () => {
    expect(() =>
      projectBrief(
        makeDraft({ facts: [makeFact({ references: ["S99:P1"] })] }),
        [first],
      ),
    ).toThrow("Unknown or ambiguous evidence reference");
  });

  it.each([
    [first, { ...second, passages: first.passages }],
    [first, { ...second, id: first.id }],
  ])(
    "rejects ambiguous evidence in validation and projection",
    (...sources) => {
      const validated = validateDraft(makeDraft(), sources, makePlace());
      expect(validated.facts).toEqual([]);
      expect(validated.callAngles).toEqual([]);
      expect(() => projectBrief(makeDraft(), sources)).toThrow(
        "Unknown or ambiguous evidence reference",
      );
    },
  );

  const publicBrief = () => ({
    ...projectBrief(draft, [first, second, unused]),
    runId: "test-run",
    mode: "live",
    place: makePlace(),
    researchedAt: makePlace().resolvedAt,
    durationMs: 10,
  });

  it("accepts the projected brief with reasons and questions anchored to the same facts", () => {
    expect(BriefSchema.safeParse(publicBrief()).success).toBe(true);
  });

  it("rejects unresolved passage references at the public boundary", () => {
    const brief = publicBrief();
    brief.facts = [makeFact()];
    expect(BriefSchema.safeParse(brief).success).toBe(false);
  });

  it.each(["scope", "department"] as const)(
    "rejects an unknown %s source",
    (key) => {
      const brief = publicBrief();
      brief[key].references = ["S99"];
      expect(BriefSchema.safeParse(brief).success).toBe(false);
    },
  );

  it.each(["callAngles", "questions"] as const)(
    "rejects an unknown fact in %s",
    (key) => {
      const brief = publicBrief();
      expect(
        BriefSchema.safeParse({
          ...brief,
          [key]: brief[key].map((item) => ({ ...item, factIds: ["F99"] })),
        }).success,
      ).toBe(false);
    },
  );

  it.each(["sources", "facts"] as const)(
    "rejects duplicate public %s IDs",
    (key) => {
      const brief = publicBrief();
      const items = brief[key];
      const parsed = BriefSchema.safeParse({
        ...brief,
        [key]: [...items, items[0]],
      });
      expect(parsed.success).toBe(false);
    },
  );
});

describe("duplicates", () => {
  it("names each value that occurs more than once, once", () =>
    expect([...duplicates(["S1", "S2", "S1", "S3", "S1", "S2"])]).toEqual([
      "S1",
      "S2",
    ]));
});

describe("reasons and questions after facts are dropped", () => {
  const vehicle = {
    unit: "Engine 4",
    modelYear: null,
    make: "Pierce",
    description: "pumper",
    replacementRelationship: null,
  };
  const aging = {
    kind: "aging" as const,
    reason: "Old apparatus.",
    factIds: ["F1"],
  };
  it("drops an aging reason whose fact names no vehicle or model year", () => {
    expect(
      validate(
        makeDraft({
          facts: [makeFact({ vehicle: null })],
          callAngles: [aging],
        }),
      ).callAngles,
    ).toEqual([]);
    expect(
      validate(
        makeDraft({ facts: [makeFact({ vehicle })], callAngles: [aging] }),
      ).callAngles,
    ).toEqual([]);
  });
  it("drops a question that leans on a dropped fact and keeps a generic one", () => {
    const result = validate(
      makeDraft({
        facts: [makeFact({ references: ["S9:P9"] })],
        callAngles: [],
        questions: [
          { text: "What replaces Engine 4?", factIds: ["F1"] },
          { text: "Who decides?", factIds: [] },
        ],
      }),
    );
    expect(result.questions).toEqual([{ text: "Who decides?", factIds: [] }]);
  });
  it("treats a department description with no citations as unsupported", () => {
    expect(
      validate(
        makeDraft({
          department: {
            kind: "career",
            summary: "A career department.",
            references: [],
          },
        }),
      ).department,
    ).toEqual({ kind: "unknown", summary: null, references: [] });
  });
});
