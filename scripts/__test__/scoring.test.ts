import { describe, expect, it } from "vitest";
import {
  makeDraft,
  makeFact as makeEvidenceFact,
  makeEvidenceSource,
} from "@/__test__/factories";
import { SAMPLE_PLACE_IDS } from "@/lib/sample";
import { loadGold, parseGold } from "../gold";
import { ReportSchema } from "../report";
import {
  formatComparison,
  formatSummary,
  formatTable,
  matchesVehicle,
  ScoreSchema,
  sameName,
  scoreReport,
} from "../scoring";
import {
  makeBrief as brief,
  makeGoldDepartment as department,
  makePublicFact as makeFact,
  makeReport as report,
} from "./fixtures";

const person = (
  name: string,
  role: string,
  statement = `${name} is listed as ${role}.`,
) =>
  makeFact({
    id: `F-${name}`,
    category: "leadership",
    title: name,
    statement,
    status: "reported",
    vehicle: null,
    person: { name, role, phone: null, email: null },
  });

describe("saved report loading", () => {
  it("scores current reports and skips nothing they carry", () => {
    expect(ReportSchema.safeParse(report()).success).toBe(true);
  });

  it("rejects a report from before source projection, whose facts cite passages", () => {
    const previous = {
      ...report(),
      output: {
        ...brief(),
        facts: [makeEvidenceFact({ references: ["S1:P1"] })],
        sources: [makeEvidenceSource()],
      },
    };
    expect(ReportSchema.safeParse(previous).success).toBe(false);
  });
});

describe("gold file", () => {
  it("validates and covers the assignment Place IDs", () => {
    const gold = loadGold();
    const ids = gold.departments.map((entry) => entry.placeId);
    expect(ids).toEqual(expect.arrayContaining([...SAMPLE_PLACE_IDS]));
    expect(gold.departments.some((entry) => entry.expectRejected)).toBe(true);
  });
  it("rejects duplicate Place IDs and bad patterns", () => {
    const entry = department();
    expect(() =>
      parseGold({
        version: 1,
        verifiedOn: "2026-09-16",
        departments: [entry, { ...entry, id: "other" }],
      }),
    ).toThrow(/duplicate placeId/);
    expect(() => department({ forbidden: [{ pattern: "(" }] })).toThrow();
  });
});

describe("name matching", () => {
  it("reads accented names as their plain letters", () => {
    expect(sameName("José Peña", "JOSE PENA, Jr.")).toBe(true);
    expect(sameName("Jose Pena", "José Peña")).toBe(true);
  });
  it("ignores initials, suffixes, and nicknames in parentheses", () => {
    expect(sameName("Glenn Johnson", "Glenn E. Johnson, Jr.")).toBe(true);
    expect(sameName("Josh Rogers", "Michael (Josh) Rogers")).toBe(true);
    expect(sameName("Mark Niemeyer", "Aaron Hummel")).toBe(false);
  });
});

describe("scoreReport", () => {
  it("scores the chief as current, historical, or missing", () => {
    const gold = department({ chief: { name: "Aaron Hummel" } });
    const current = scoreReport(
      gold,
      report({
        output: brief({ facts: [person("Aaron Hummel", "Fire Chief")] }),
      }),
    );
    expect(current.chief).toBe("current");
    const historical = scoreReport(
      gold,
      report({
        output: brief({
          facts: [
            person("Aaron Hummel", "Fire Chief, historical 2020 listing"),
          ],
        }),
      }),
    );
    expect(historical.chief).toBe("historical");
    expect(scoreReport(gold, report()).chief).toBe("missing");
  });

  it("flags a former leader presented as current", () => {
    const gold = department({
      chief: { name: "Aaron Hummel" },
      formerLeaders: [{ name: "Mark Niemeyer" }],
    });
    const asCurrent = scoreReport(
      gold,
      report({
        output: brief({ facts: [person("Mark Niemeyer", "Fire Chief")] }),
      }),
    );
    expect(asCurrent.critical).toEqual([
      expect.stringContaining("former leader Mark Niemeyer"),
    ]);
    const asHistorical = scoreReport(
      gold,
      report({
        output: brief({
          facts: [
            person("Mark Niemeyer", "Fire Chief (retired November 2025)"),
          ],
        }),
      }),
    );
    expect(asHistorical.critical).toEqual([]);
  });

  it("counts vehicles by year, make, unit, and pattern", () => {
    const fact = makeFact();
    expect(
      matchesVehicle(fact, { label: "a", modelYear: 1996, make: "Pierce" }),
    ).toBe(true);
    expect(matchesVehicle(fact, { label: "b", unit: "Engine 4" })).toBe(true);
    expect(matchesVehicle(fact, { label: "c", modelYear: 2010 })).toBe(false);
    expect(matchesVehicle(fact, { label: "d", pattern: "Seagrave" })).toBe(
      false,
    );
    const score = scoreReport(
      department({
        vehicles: [
          { label: "1996 Pierce", modelYear: 1996, make: "Pierce" },
          { label: "2010 KME", modelYear: 2010, make: "KME" },
        ],
      }),
      report(),
    );
    expect(score.vehicles).toEqual({
      found: 1,
      total: 2,
      missing: ["2010 KME"],
    });
  });

  it("finds signals in facts or reasons to call and reports contacts", () => {
    const gold = department({
      signals: [
        {
          label: "surplus reason",
          kind: "disposition",
          pattern: "surplus",
          where: "angles",
        },
        {
          label: "listing",
          category: "disposition",
          status: "listed",
          pattern: "1991",
        },
      ],
      contacts: [{ name: "Ryan Bresette", phones: ["802-272-0892"] }],
    });
    const contact = makeFact({
      ...person("Ryan Bresette", "Fire Chief"),
      person: {
        name: "Ryan Bresette",
        role: "Fire Chief",
        phone: "(802) 272-0892",
        email: null,
      },
    });
    const score = scoreReport(
      gold,
      report({
        output: brief({
          facts: [makeFact(), contact],
          callAngles: makeDraft().callAngles,
        }),
      }),
    );
    expect(score.signals).toEqual({ found: 1, total: 2, missing: ["listing"] });
    expect(score.contacts).toEqual({ found: 1, total: 1, missing: [] });
  });

  it("treats forbidden text and wrong scope as critical", () => {
    const gold = department({
      scope: ["parent_department"],
      forbidden: [{ pattern: "Sutphen", note: "another town" }],
    });
    const score = scoreReport(
      gold,
      report({
        output: brief({
          facts: [
            makeFact({ statement: "Engine 1711 is a 2021 Sutphen pumper." }),
          ],
        }),
      }),
    );
    expect(score.critical).toEqual([
      "scope is selected_place, expected parent_department",
      expect.stringContaining("forbidden /Sutphen/ (another town)"),
    ]);
  });

  it("warns about unexpected reasons to call and unsupported current roles", () => {
    const gold = department({
      angleKinds: ["aging"],
      chief: { name: "Wayne Kugel", historicalOnly: true },
    });
    const score = scoreReport(
      gold,
      report({
        output: brief({
          facts: [makeFact(), person("Wayne Kugel", "Fire Chief")],
          callAngles: makeDraft().callAngles,
        }),
      }),
    );
    expect(score.warnings).toEqual([
      expect.stringContaining("Wayne Kugel presented as current"),
      expect.stringContaining("unexpected reason to call (disposition)"),
    ]);
    expect(score.critical).toEqual([]);
  });

  it("handles rejections, failures, and missing runs", () => {
    const pizza = department({ expectRejected: true });
    const rejected = report({
      execution: "failed",
      error: {
        message:
          "This Place ID appears to identify a different kind of organization. Please use a fire department or station Place ID.",
        retryable: false,
      },
      output: null,
    });
    expect(scoreReport(pizza, rejected).execution).toBe("rejected");
    expect(scoreReport(pizza, rejected).critical).toEqual([]);
    expect(scoreReport(pizza, report()).critical).toEqual([
      "a Place ID that is not a department produced a brief",
    ]);
    const failed = scoreReport(
      department(),
      report({
        execution: "failed",
        error: { message: "timed out", retryable: true },
        output: null,
      }),
    );
    expect(failed.execution).toBe("failed");
    expect(failed.critical).toEqual(["run failed: timed out"]);
    const missing = scoreReport(department(), null);
    expect(missing.execution).toBe("missing");
    expect(missing.critical).toEqual([]);
  });
});

describe("formatting", () => {
  it("renders a table, a summary, and a comparison", () => {
    const before = scoreReport(
      department({ chief: { name: "Aaron Hummel" } }),
      report(),
    );
    const after = scoreReport(
      department({ chief: { name: "Aaron Hummel" } }),
      report({
        output: brief({ facts: [person("Aaron Hummel", "Fire Chief")] }),
      }),
    );
    expect(formatTable([after])).toMatch(/Department\s+Run\s+Chief/);
    expect(formatTable([after])).toContain("maple");
    expect(formatSummary([after])).toContain(
      "Chief: 1 current, 0 historical, 0 missing of 1",
    );
    expect(formatComparison([after], [before])).toBe(
      "maple: chief missing -> current",
    );
    expect(formatComparison([after], [after])).toBe(
      "No differences from the baseline.",
    );
  });
  it("round-trips a scorecard through JSON for use as a baseline", () => {
    const score = scoreReport(
      department({ chief: { name: "Aaron Hummel" } }),
      report(),
    );
    expect(ScoreSchema.parse(JSON.parse(JSON.stringify(score)))).toEqual(score);
  });
});
