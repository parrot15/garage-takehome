import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { makeCandidate, makePlace, TEST_DATE } from "@/__test__/factories";
import { buildQueries } from "@/lib/research/queries";
import {
  allRunDirectories,
  baselineScores,
  latestByPlace,
  loadReports,
  replaySelection,
  reportFiles,
  scoreRuns,
} from "../saved-runs";
import {
  makeBrief,
  makeGoldDepartment,
  makePublicFact,
  makeReport,
} from "./fixtures";

const gold = [makeGoldDepartment({ chief: { name: "Jane Doe" } })];
const withChief = makeBrief({
  facts: [
    makePublicFact({
      category: "leadership",
      title: "Fire Chief",
      status: "reported",
      vehicle: null,
      person: {
        name: "Jane Doe",
        role: "Fire Chief",
        phone: null,
        email: null,
      },
    }),
  ],
});

describe("saved runs", () => {
  let root: string;
  const at = (...parts: string[]) => path.join(root, ...parts);
  const write = async (relative: string, value: unknown) => {
    const file = at(relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      typeof value === "string" ? value : JSON.stringify(value),
    );
    return file;
  };
  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "brief-runs-"));
    await write(
      "run-1/maple.json",
      makeReport({ startedAt: "2026-09-10T00:00:00.000Z" }),
    );
    await write(
      "run-1/replay.json",
      makeReport({
        replayOf: "x.json",
        startedAt: "2026-09-16T00:00:00.000Z",
        output: withChief,
      }),
    );
    await write("run-1/notes.txt", "not json");
    await write("run-1/broken.json", "{");
    await write("run-1/other.json", { unrelated: true });
    await write(
      "run-2/maple.json",
      makeReport({ startedAt: "2026-09-12T00:00:00.000Z", output: withChief }),
    );
  });

  it("lists a directory's JSON files, or the one file named", () => {
    expect(
      reportFiles(at("run-1"))
        .map((file) => path.basename(file))
        .sort(),
    ).toEqual(["broken.json", "maple.json", "other.json", "replay.json"]);
    expect(reportFiles(at("run-2", "maple.json"))).toEqual([
      at("run-2", "maple.json"),
    ]);
  });
  it("loads only well-formed reports, leaving replays out unless asked", () => {
    expect(
      loadReports([at("run-1")], false).map((entry) =>
        path.basename(entry.file),
      ),
    ).toEqual(["maple.json"]);
    expect(
      loadReports([at("run-1")], true)
        .map((entry) => path.basename(entry.file))
        .sort(),
    ).toEqual(["maple.json", "replay.json"]);
  });
  it("keeps the newest report per Place ID across directories", () => {
    const latest = latestByPlace(
      loadReports([at("run-1"), at("run-2")], false),
    );
    expect([...latest.keys()]).toEqual(["test-place"]);
    expect(latest.get("test-place")?.file).toBe(at("run-2", "maple.json"));
  });
  it("scores each gold department against its newest run and marks the rest missing", () => {
    const scores = scoreRuns([at("run-1"), at("run-2")], false, [
      ...gold,
      makeGoldDepartment({ id: "oak", placeId: "oak-place", name: "Oak FD" }),
    ]);
    expect(
      scores.map((score) => [score.id, score.execution, score.chief]),
    ).toEqual([
      ["maple", "completed", "current"],
      ["oak", "missing", "n/a"],
    ]);
    expect(scores[0]?.file).toBe(
      path.relative(process.cwd(), at("run-2", "maple.json")),
    );
  });
  it("scores the replay only when replays are included", () => {
    expect(scoreRuns([at("run-1")], false, gold)[0]?.chief).toBe("missing");
    expect(scoreRuns([at("run-1")], true, gold)[0]?.chief).toBe("current");
  });
  it("reads a baseline from a saved scorecard or from a run", async () => {
    const scores = scoreRuns([at("run-1")], false, gold);
    const file = await write("before.json", scores);
    expect(baselineScores(file, false, gold)).toEqual(scores);
    expect(baselineScores(at("run-1"), false, gold)).toEqual(scores);
  });
  it("finds run directories under a root and none where there is no root", () => {
    expect(
      allRunDirectories(root)
        .map((directory) => path.basename(directory))
        .sort(),
    ).toEqual(["run-1", "run-2"]);
    expect(allRunDirectories(at("missing"))).toEqual([]);
  });
});

describe("replaySelection", () => {
  const place = makePlace();
  const queries = buildQueries(place, new Date(TEST_DATE));
  const found = (id: string, track = queries[0]?.track ?? "leadership") =>
    makeCandidate({
      url: `https://maple.example.org/${id}`,
      tracks: [track],
      rank: 0,
    });
  const brief = makeBrief({ place, researchedAt: TEST_DATE });

  it("replays saved discovery through the current selection in production query order", () => {
    const searches = [...queries].reverse().map((query) => ({
      query,
      candidates: [found(query.id, query.track)],
    }));
    const replay = replaySelection({ output: brief, input: { searches } });
    expect(replay?.official).toBe("maple.example.org");
    expect(replay?.candidates.map((candidate) => candidate.url)).toEqual([
      "https://maple.example.org/fire",
      ...queries.map((query) => `https://maple.example.org/${query.id}`),
    ]);
    expect(replay?.selected).toHaveLength(12);
  });
  it("matches searches saved before queries had ids by their wording, sorting unknown ones last", () => {
    const [first, second] = queries as [
      (typeof queries)[number],
      (typeof queries)[number],
    ];
    const replay = replaySelection({
      output: brief,
      input: {
        searches: [
          {
            query: {
              id: "",
              track: "news",
              query: "old wording no longer built",
            },
            candidates: [found("old", "news")],
          },
          {
            query: { ...second, id: "" },
            candidates: [found("second", second.track)],
          },
          { query: first, candidates: [found("first", first.track)] },
        ],
      },
    });
    expect(replay?.candidates.map((candidate) => candidate.url)).toEqual([
      "https://maple.example.org/fire",
      "https://maple.example.org/first",
      "https://maple.example.org/second",
      "https://maple.example.org/old",
    ]);
  });
  it("declines a report that is not a completed live run", () => {
    expect(
      replaySelection({ output: null, input: { searches: [] } }),
    ).toBeNull();
    expect(replaySelection({ output: brief, input: {} })).toBeNull();
  });
});
