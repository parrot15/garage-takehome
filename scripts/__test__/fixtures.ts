import {
  makeDraft,
  makeFact,
  makePlace,
  makeSource,
  TEST_DATE,
} from "@/__test__/factories";
import { type Brief, BriefSchema, type Fact } from "@/lib/brief/schema";
import { DepartmentSchema, type GoldDepartment } from "../gold";
import type { Report } from "../report";

/** A public fact: the factory's fact with its passage references resolved to a source. */
export const makePublicFact = (overrides: Partial<Fact> = {}): Fact =>
  makeFact({ references: ["S1"], ...overrides });

export function makeBrief(overrides: Partial<Brief> = {}): Brief {
  return BriefSchema.parse({
    runId: "run",
    mode: "live",
    place: makePlace(),
    ...makeDraft({ facts: [makePublicFact()], callAngles: [] }),
    sources: [makeSource()],
    researchedAt: TEST_DATE,
    durationMs: 1000,
    ...overrides,
  });
}

export function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    caseId: "test",
    startedAt: TEST_DATE,
    durationMs: 60000,
    promptVersion: "department-brief-v9",
    configuredModel: "gpt-6-astra",
    reasoningEffort: "low",
    modelTimeoutMs: 170000,
    providerTimeoutMs: 25000,
    researchTimeoutMs: 220000,
    modelDurationMs: 40000,
    replayOf: null,
    execution: "completed",
    error: null,
    input: { placeId: "test-place" },
    output: makeBrief(),
    ...overrides,
  };
}

export const makeGoldDepartment = (
  overrides: Record<string, unknown> = {},
): GoldDepartment =>
  DepartmentSchema.parse({
    id: "maple",
    placeId: "test-place",
    name: "Maple Fire Department",
    locality: "Maple",
    region: "VT",
    ...overrides,
  });
