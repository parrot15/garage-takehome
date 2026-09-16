import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  makeDraft,
  makeEvidenceSource,
  makePlace,
  makeProviders,
  TEST_DATE,
} from "@/__test__/factories";
import { SAMPLE_PLACE_IDS } from "@/lib/sample";
import { getServerConfig } from "@/lib/server/env";
import {
  loadReplay,
  parseOptions,
  resolveCases,
  runCase,
  SAMPLE_CASES,
} from "../evaluation";
import { ReportSchema } from "../report";
import { makeGoldDepartment } from "./fixtures";

const gold = [
  makeGoldDepartment({ id: "maple", placeId: "maple-place" }),
  makeGoldDepartment({ id: "oak", placeId: "oak-place", name: "Oak FD" }),
];
const config = getServerConfig({
  GOOGLE_PLACES_API_KEY: "k",
  EXA_API_KEY: "k",
  OPENAI_API_KEY: "k",
});

describe("resolveCases", () => {
  it("runs both supplied Place IDs by default, together, or by name", () => {
    expect(resolveCases(undefined, gold)).toEqual([
      ["sample1", SAMPLE_PLACE_IDS[0]],
      ["sample2", SAMPLE_PLACE_IDS[1]],
    ]);
    expect(resolveCases("all", gold)).toEqual([...SAMPLE_CASES]);
    expect(resolveCases("sample2", gold)).toEqual([
      ["sample2", SAMPLE_PLACE_IDS[1]],
    ]);
  });
  it("runs the whole gold set or one of its departments", () => {
    expect(resolveCases("gold", gold)).toEqual([
      ["maple", "maple-place"],
      ["oak", "oak-place"],
    ]);
    expect(resolveCases("oak", gold)).toEqual([["oak", "oak-place"]]);
  });
  it("names the known cases when asked for an unknown one", () => {
    expect(() => resolveCases("pine", gold)).toThrow(
      /Unknown case: pine.*maple, oak/,
    );
  });
});

describe("parseOptions", () => {
  it("chooses cases, a custom Place ID, or a replay, but never two at once", () => {
    expect(parseOptions([], gold)).toEqual({
      cases: [...SAMPLE_CASES],
      replay: null,
      help: false,
    });
    expect(parseOptions(["--case", "oak"], gold).cases).toEqual([
      ["oak", "oak-place"],
    ]);
    expect(parseOptions(["--place-id", " ChIJcustom "], gold)).toEqual({
      cases: [["custom", "ChIJcustom"]],
      replay: null,
      help: false,
    });
    expect(parseOptions(["--replay", "runs/custom.json"], gold)).toEqual({
      cases: [],
      replay: path.resolve("runs/custom.json"),
      help: false,
    });
    expect(parseOptions(["--help"], gold).help).toBe(true);
    expect(() =>
      parseOptions(["--replay", "x.json", "--case", "all"], gold),
    ).toThrow("Use --replay without --case or --place-id.");
    expect(() =>
      parseOptions(["--place-id", "https://maps.google.com/x"], gold),
    ).toThrow(/--place-id: Paste the Place ID itself/);
  });
});

describe("loadReplay", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "brief-eval-"));
  });
  const write = async (name: string, contents: string) => {
    const file = path.join(dir, name);
    await writeFile(file, contents);
    return file;
  };
  it("returns the first saved synthesis input of a report", async () => {
    const synthesis = {
      place: makePlace(),
      sources: [makeEvidenceSource()],
      researchDate: TEST_DATE,
    };
    const file = await write(
      "report.json",
      JSON.stringify({
        input: {
          syntheses: [
            synthesis,
            { ...synthesis, researchDate: "2026-01-01T00:00:00.000Z" },
          ],
        },
      }),
    );
    expect(await loadReplay(file)).toEqual(synthesis);
  });
  it.each([
    ["invalid JSON", "{", "Replay report must contain valid JSON."],
    [
      "a report without synthesis input",
      JSON.stringify({ input: { syntheses: [] } }),
      "Replay requires a report containing saved synthesis input.",
    ],
    [
      "a synthesis input without a place",
      JSON.stringify({
        input: {
          syntheses: [
            { sources: [makeEvidenceSource()], researchDate: TEST_DATE },
          ],
        },
      }),
      "Replay requires a report containing saved synthesis input.",
    ],
  ])("rejects %s", async (name, contents, message) => {
    const file = await write(`${name.replace(/\W+/g, "-")}.json`, contents);
    await expect(loadReplay(file)).rejects.toThrow(message);
  });
});

describe("runCase", () => {
  it("records every provider exchange, the raw draft, usage, and events around a completed brief", async () => {
    const report = await runCase(
      "maple",
      "maple-place",
      makeProviders(),
      config,
    );
    expect(report).toMatchObject({
      caseId: "maple",
      execution: "completed",
      error: null,
      replayOf: null,
      promptVersion: expect.stringMatching(/^department-brief-v/),
      configuredModel: "gpt-6-astra",
      reasoningEffort: "low",
      modelTimeoutMs: 170000,
      providerTimeoutMs: 25000,
      researchTimeoutMs: 220000,
    });
    expect(report.output?.facts).toHaveLength(1);
    expect(report.input.placeId).toBe("maple-place");
    expect(report.input.searches).toHaveLength(14);
    expect(report.input.searches.map((search) => search.query.id)).toContain(
      "leadership-chief",
    );
    expect(report.input.searches[0]?.candidates[0]?.tracks).toEqual([
      report.input.searches[0]?.query.track,
    ]);
    expect(report.input.reads).toEqual([
      {
        candidates: expect.any(Array),
        returnedUrls: ["https://maple.example.org/fire"],
        failures: [],
      },
    ]);
    expect(report.input.syntheses).toHaveLength(1);
    expect(report.input.syntheses[0]?.sources[0]?.passages).toHaveLength(1);
    expect(report.rawDrafts).toEqual([makeDraft()]);
    expect(report.usage).toEqual([
      { model: "test-model", inputTokens: 100, outputTokens: 100 },
    ]);
    expect(report.events.map((event) => event.event)).toContain("complete");
    expect(report.modelDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.durationMs).toBeGreaterThanOrEqual(report.modelDurationMs);
    expect(
      ReportSchema.safeParse(JSON.parse(JSON.stringify(report))).success,
    ).toBe(true);
  });
  it("scrubs a failed run to its public error and keeps what was gathered", async () => {
    const report = await runCase(
      "maple",
      "maple-place",
      makeProviders({
        synthesize: async () => {
          throw new Error("OPENAI_SECRET");
        },
      }),
      config,
    );
    expect(report.execution).toBe("failed");
    expect(report.output).toBeNull();
    expect(report.error).toEqual({
      message: "We couldn't finish this research. Please try again.",
      retryable: true,
    });
    expect(JSON.stringify(report)).not.toContain("OPENAI_SECRET");
    expect(report.input.searches.length).toBeGreaterThan(0);
    expect(report.input.syntheses).toHaveLength(1);
  });
  it("replays saved evidence through synthesis alone, finishing it like a live run", async () => {
    const synthesize = vi.fn(makeProviders().synthesize);
    const search = vi.fn(makeProviders().search);
    const input = {
      place: makePlace(),
      sources: [makeEvidenceSource()],
      researchDate: TEST_DATE,
    };
    const report = await runCase(
      "replay",
      "maple-place",
      makeProviders({ synthesize, search }),
      config,
      { file: "saved.json", input },
    );
    expect(search).not.toHaveBeenCalled();
    expect(synthesize).toHaveBeenCalledExactlyOnceWith(
      input,
      expect.any(AbortSignal),
    );
    expect(report).toMatchObject({
      execution: "completed",
      replayOf: "saved.json",
    });
    expect(report.output).toMatchObject({
      mode: "live",
      researchedAt: TEST_DATE,
      facts: [expect.objectContaining({ references: ["S1"] })],
    });
    expect(report.input.searches).toEqual([]);
    expect(report.input.syntheses).toEqual([input]);
  });
});
