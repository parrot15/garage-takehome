import { describe, expect, it, vi } from "vitest";
import {
  makeCandidate,
  makeDraft,
  makeEvidenceSource,
  makeFact,
  makePage,
  makePlace,
  makeProviders,
  TEST_DATE,
} from "@/__test__/factories";
import type { Log, ResearchProviders } from "@/lib/research/contracts";
import { ResearchError } from "@/lib/server/errors";
import { finishBrief, researchDepartment } from "../orchestrator";
import { buildQueries } from "../queries";

const BASELINE = buildQueries(makePlace(), new Date(TEST_DATE)).length;

/** Deadline signals for a run: the ones a test wants to abort itself, in order, then inert ones. */
const deadlines = (...controlled: AbortSignal[]) => {
  const queue = [...controlled];
  return vi.fn((_ms: number) => queue.shift() ?? new AbortController().signal);
};

const run = (providers = makeProviders(), extra = {}) =>
  researchDepartment({
    placeId: "test-place",
    providers,
    now: () => new Date(TEST_DATE),
    runId: "test-run",
    ...extra,
  });

function backfillSetup() {
  const candidates = Array.from({ length: 34 }, (_, rank) =>
    makeCandidate({
      url: `https://source-${rank}.example.org/maple`,
      rank,
      tracks: ["leadership"],
    }),
  );
  const read = vi.fn<ResearchProviders["read"]>(async (batch) => ({
    pages: batch.map((candidate) =>
      makePage({
        url: candidate.url,
        text: `${candidate.url}: Maple Fire Department lists a chief and apparatus.`,
      }),
    ),
    failures: [],
  }));
  const search = vi.fn<ResearchProviders["search"]>(async () => candidates);
  const synthesize = vi.fn(makeProviders().synthesize);
  return {
    read,
    search,
    synthesize,
    providers: makeProviders({
      resolvePlace: async () => makePlace({ websiteUrl: null }),
      read,
      search,
      synthesize,
    }),
  };
}

describe("finishing a brief", () => {
  const run = { runId: "run-1", researchedAt: TEST_DATE, durationMs: 1234 };

  it("turns a validated draft into a live brief carrying the run identity and public sources", () => {
    const brief = finishBrief(
      makeDraft(),
      [makeEvidenceSource()],
      makePlace(),
      run,
    );
    expect(brief).toMatchObject({ ...run, mode: "live", place: makePlace() });
    expect(brief.facts).toHaveLength(1);
    expect(brief.sources[0]).not.toHaveProperty("passages");
  });

  it("refuses a draft whose every fact lost its citation", () => {
    const draft = makeDraft({ facts: [makeFact({ references: ["S9:P9"] })] });
    expect(() =>
      finishBrief(draft, [makeEvidenceSource()], makePlace(), run),
    ).toThrow(
      "We could not establish reliable citations for this brief. Please try again.",
    );
  });

  it("keeps an empty brief for an unresolved place instead of failing", () => {
    const draft = makeDraft({
      scope: {
        name: "Maple",
        relationship: "unresolved",
        explanation: null,
        references: [],
      },
      facts: [makeFact({ references: ["S9:P9"] })],
    });
    const brief = finishBrief(draft, [makeEvidenceSource()], makePlace(), run);
    expect(brief.facts).toEqual([]);
    expect(brief.scope.relationship).toBe("unresolved");
  });
});

describe("live research orchestration with controlled providers", () => {
  it("runs the real stages once and returns a validated sourced brief", async () => {
    const emit = vi.fn();
    const providers = makeProviders();
    const synthesize = vi.fn(providers.synthesize);
    const brief = await run({ ...providers, synthesize }, { emit });
    expect(brief.mode).toBe("live");
    expect(brief.facts).toHaveLength(1);
    expect(brief.sources[0]?.id).toBe(brief.facts[0]?.references[0]);
    expect(brief.facts[0]?.references).toEqual(["S1"]);
    expect(brief.sources[0]).not.toHaveProperty("passages");
    expect(synthesize.mock.calls[0]?.[0].sources[0]?.passages[0]?.id).toBe(
      "S1:P1",
    );
    expect(synthesize).toHaveBeenCalledTimes(1);
    expect(
      emit.mock.calls.map((call) =>
        call[0].type === "stage" ? call[0].stage : call[0].type,
      ),
    ).toEqual([
      "resolving",
      "identity",
      "searching",
      "reading",
      "synthesizing",
      "validating",
    ]);
  });
  it("starts every discovery intent, keeps locality in open-web queries, and looks inside the listed website", async () => {
    const search = vi.fn(makeProviders().search);
    await run(makeProviders({ search }));
    expect(search).toHaveBeenCalledTimes(BASELINE);
    const queries = search.mock.calls.map(([query]) => query);
    for (const query of queries) {
      if (query.includeDomains?.includes("maple.example.org")) continue;
      expect(query.query).toContain("Maple");
      expect(query.query).toContain("Vermont");
      expect(query.query).toMatch(/fire/i);
    }
    expect(
      queries.filter((query) =>
        query.includeDomains?.includes("maple.example.org"),
      ),
    ).toHaveLength(3);
    expect(queries.some((query) => query.category === "news")).toBe(true);
    expect(new Set(queries.map((query) => query.track)).size).toBe(5);
    expect(new Set(queries.map((query) => query.id)).size).toBe(queries.length);
    const chiefChange = queries.find((query) =>
      /new fire chief/.test(query.query),
    );
    expect(chiefChange?.track).toBe("leadership");
    expect(chiefChange?.startPublishedDate).toBeDefined();
    for (const query of queries) {
      if (query.includeDomains) expect(query.excludeDomains).toBeUndefined();
      else expect(query.excludeDomains).toContain("linkedin.com");
    }
  });
  it("keeps fire-specific topics inside the listed city domain", async () => {
    const place = makePlace({
      name: "Maple Fire and Rescue Station 2",
      websiteUrl: "https://www.maple.gov/departments/fire",
    });
    const queries = buildQueries(place, new Date(TEST_DATE));
    const siteQueries = queries.filter((query) =>
      query.includeDomains?.includes("maple.gov"),
    );
    expect(siteQueries).toHaveLength(3);
    for (const query of siteQueries) {
      expect(query.query).toMatch(/fire department|apparatus/);
      expect(query.includeDomains).toEqual(["maple.gov", "*.maple.gov"]);
    }
    expect(siteQueries.map((query) => query.track)).toEqual([
      "leadership",
      "fleet",
      "news",
    ]);
  });
  it("leaves out the address parts Google did not list", () => {
    const queries = buildQueries(
      makePlace({ locality: null, region: null, websiteUrl: null }),
      new Date(TEST_DATE),
    );
    for (const query of queries) {
      expect(query.query).not.toMatch(/null|not listed/i);
      expect(query.query).toContain("Maple Fire Department");
    }
  });
  it("skips website-scoped discovery when Google lists no website", async () => {
    const search = vi.fn(makeProviders().search);
    await run(
      makeProviders({
        resolvePlace: async () => makePlace({ websiteUrl: null }),
        search,
      }),
    );
    expect(search).toHaveBeenCalledTimes(BASELINE - 3);
    expect(
      search.mock.calls.every(([query]) =>
        (query.includeDomains ?? []).every((d) => !d.includes("maple")),
      ),
    ).toBe(true);
  });
  it("keeps a useful brief after an independent search failure and logs which queries failed", async () => {
    const providers = makeProviders();
    const log = vi.fn<Log>();
    const brief = await run(
      {
        ...providers,
        search: async (query, signal) =>
          query.track === "news"
            ? Promise.reject(new Error("provider down"))
            : providers.search(query, signal),
      },
      { log },
    );
    expect(brief.facts).toHaveLength(1);
    expect(
      log.mock.calls
        .map(([entry]) => entry)
        .filter((entry) => entry.event === "search_failed")
        .map((entry) => entry.query),
    ).toEqual(
      buildQueries(makePlace(), new Date(TEST_DATE))
        .filter((query) => query.track === "news")
        .map((query) => query.id),
    );
  });
  it.each([3, 9])(
    "backfills %i failed reads once, refilling the seventeen-source budget",
    async (failed) => {
      const setup = backfillSetup();
      setup.read.mockImplementationOnce(async (batch) => ({
        pages: batch.slice(failed).map((candidate) =>
          makePage({
            url: candidate.url,
            text: `${candidate.url}: ${makePage().text}`,
          }),
        ),
        failures: batch.slice(0, failed).map((candidate) => ({
          url: candidate.url,
          reason: "blocked",
        })),
      }));
      await run(setup.providers);
      expect(setup.search).toHaveBeenCalledTimes(BASELINE - 3);
      expect(setup.read).toHaveBeenCalledTimes(2);
      expect(setup.read.mock.calls[1]?.[0]).toHaveLength(failed);
      expect(setup.synthesize).toHaveBeenCalledTimes(1);
      const sources = setup.synthesize.mock.calls[0]?.[0].sources ?? [];
      expect(sources).toHaveLength(17);
      expect(new Set(sources.map((source) => source.url)).size).toBe(
        sources.length,
      );
    },
  );
  it("does not add a read batch when the selected sources succeeded", async () => {
    const setup = backfillSetup();
    await run(setup.providers);
    expect(setup.read).toHaveBeenCalledTimes(1);
    expect(setup.synthesize.mock.calls[0]?.[0].sources).toHaveLength(17);
  });
  it("preserves the first batch when backfill fails, without attempting another recovery", async () => {
    const setup = backfillSetup();
    setup.read
      .mockResolvedValueOnce({
        pages: [makePage({ url: "https://source-0.example.org/maple" })],
        failures: [
          { url: "https://source-1.example.org/maple", reason: "blocked" },
        ],
      })
      .mockRejectedValueOnce(new Error("Backfill unavailable"));
    const brief = await run(setup.providers);
    expect(setup.read).toHaveBeenCalledTimes(2);
    expect(setup.synthesize).toHaveBeenCalledTimes(1);
    expect(brief.sources.map((source) => source.url)).toEqual([
      "https://source-0.example.org/maple",
    ]);
  });
  it("stops after one unsuccessful backfill when no evidence can be read", async () => {
    const setup = backfillSetup();
    setup.read.mockImplementation(async (batch) => ({
      pages: [],
      failures: batch.map((candidate) => ({
        url: candidate.url,
        reason: "blocked",
      })),
    }));
    await expect(run(setup.providers)).rejects.toMatchObject({
      message: expect.stringContaining(
        "could not read enough reliable content",
      ),
    });
    expect(setup.read).toHaveBeenCalledTimes(2);
    expect(setup.read.mock.calls[1]?.[0]).toHaveLength(17);
    expect(setup.synthesize).not.toHaveBeenCalled();
  });
  it("does not swallow the overall research deadline during the fallback request", async () => {
    const setup = backfillSetup();
    const deadline = new AbortController();
    setup.read
      .mockResolvedValueOnce({
        pages: [makePage({ url: "https://source-0.example.org/maple" })],
        failures: [
          { url: "https://source-1.example.org/maple", reason: "blocked" },
        ],
      })
      .mockImplementationOnce(async (_batch, signal) => {
        deadline.abort(new DOMException("Research deadline", "TimeoutError"));
        signal.throwIfAborted();
        return { pages: [], failures: [] };
      });
    await expect(
      run(setup.providers, { timeout: deadlines(deadline.signal) }),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(setup.read).toHaveBeenCalledTimes(2);
    expect(setup.synthesize).not.toHaveBeenCalled();
  });
  it("skips optional recovery when it would leave too little time for synthesis", async () => {
    const setup = backfillSetup();
    setup.read.mockResolvedValueOnce({
      pages: [makePage({ url: "https://source-0.example.org/maple" })],
      failures: [
        { url: "https://source-1.example.org/maple", reason: "blocked" },
      ],
    });
    await run(setup.providers, { limits: { totalMs: 100_000 } });
    expect(setup.read).toHaveBeenCalledTimes(1);
    expect(setup.synthesize).toHaveBeenCalledTimes(1);
  });
  it("preserves useful first-read evidence when the short recovery timeout expires", async () => {
    const setup = backfillSetup();
    const recovery = new AbortController();
    const timeout = deadlines(new AbortController().signal, recovery.signal);
    setup.read
      .mockResolvedValueOnce({
        pages: [makePage({ url: "https://source-0.example.org/maple" })],
        failures: [
          { url: "https://source-1.example.org/maple", reason: "blocked" },
        ],
      })
      .mockImplementationOnce(async (_batch, signal) => {
        recovery.abort(new DOMException("Recovery deadline", "TimeoutError"));
        signal.throwIfAborted();
        return { pages: [], failures: [] };
      });
    const brief = await run(setup.providers, { timeout });
    expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([220000, 25000]);
    expect(setup.read).toHaveBeenCalledTimes(2);
    expect(setup.synthesize).toHaveBeenCalledTimes(1);
    expect(brief.sources.map((source) => source.url)).toEqual([
      "https://source-0.example.org/maple",
    ]);
  });
  it("limits recovery to time left after reserving the configured synthesis attempt", async () => {
    const setup = backfillSetup();
    const timeout = deadlines();
    setup.read.mockResolvedValueOnce({
      pages: [makePage({ url: "https://source-0.example.org/maple" })],
      failures: [
        { url: "https://source-1.example.org/maple", reason: "blocked" },
      ],
    });
    await run(setup.providers, {
      timeout,
      limits: { totalMs: 190000, synthesisReserveMs: 170000 },
    });
    expect(setup.read).toHaveBeenCalledTimes(2);
    const recoveryMs = timeout.mock.calls[1]?.[0] ?? 0;
    expect(recoveryMs).toBeGreaterThanOrEqual(15000);
    expect(recoveryMs).toBeLessThanOrEqual(20000);
  });
  it("keeps successful backfill pages when only its transient retry times out", async () => {
    const setup = backfillSetup();
    const recovery = new AbortController();
    setup.read
      .mockResolvedValueOnce({
        pages: [makePage({ url: "https://source-0.example.org/maple" })],
        failures: [
          { url: "https://source-1.example.org/maple", reason: "blocked" },
        ],
      })
      .mockImplementationOnce(async (batch) => {
        // Exa retains pages from its first response when the retry for other
        // URLs fails. The optional deadline must not erase those successes.
        recovery.abort(new DOMException("Recovery deadline", "TimeoutError"));
        return {
          pages: [
            makePage({
              url: batch[0]?.url,
              text: "Maple Fire Department lists Jane Doe as its current chief.",
            }),
          ],
          failures: [{ url: batch[1]?.url ?? "", reason: "timeout" }],
        };
      });
    await run(setup.providers, {
      timeout: deadlines(new AbortController().signal, recovery.signal),
    });
    expect(setup.read).toHaveBeenCalledTimes(2);
    expect(setup.synthesize).toHaveBeenCalledTimes(1);
    expect(setup.synthesize.mock.calls[0]?.[0].sources).toHaveLength(2);
  });
  it("applies the shared evidence character budget to original and recovered pages together", async () => {
    const setup = backfillSetup();
    const longPage = (url: string) =>
      makePage({
        url,
        text: Array.from(
          { length: 40 },
          () => `${url}: ${makePage().text.repeat(8)}`,
        ).join("\n\n"),
      });
    setup.read
      .mockImplementation(async (batch) => ({
        pages: batch.map((candidate) => longPage(candidate.url)),
        failures: [],
      }))
      .mockImplementationOnce(async (batch) => ({
        pages: batch.slice(4).map((candidate) => longPage(candidate.url)),
        failures: batch.slice(0, 4).map((candidate) => ({
          url: candidate.url,
          reason: "blocked",
        })),
      }));
    await run(setup.providers);
    const sources = setup.synthesize.mock.calls[0]?.[0].sources ?? [];
    expect(sources).toHaveLength(17);
    expect(
      sources.reduce(
        (total, source) =>
          total +
          source.passages.reduce(
            (sum, passage) => sum + passage.text.length,
            0,
          ),
        0,
      ),
    ).toBeLessThanOrEqual(220000);
    expect(sources.every((source) => source.partial)).toBe(true);
  });
  it("reports search as unavailable only when every search failed", async () => {
    await expect(
      run(
        makeProviders({
          resolvePlace: async () => makePlace({ websiteUrl: null }),
          search: async () => Promise.reject(new Error("provider down")),
        }),
      ),
    ).rejects.toMatchObject({
      message: "Search is temporarily unavailable. Please try again.",
      retryable: true,
    });
  });
  it("does not present all-failed extraction as a sparse successful brief", async () => {
    await expect(
      run(
        makeProviders({
          read: async () => ({
            pages: [],
            failures: [{ url: makeCandidate().url, reason: "blocked" }],
          }),
        }),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        "could not read enough reliable content",
      ),
      retryable: true,
    });
  });
  it("allows genuine sparse research without inventing facts", async () => {
    const brief = await run(
      makeProviders({
        synthesize: async () => ({
          draft: makeDraft({ facts: [], callAngles: [] }),
          usage: { model: "test", inputTokens: 100, outputTokens: 40 },
        }),
      }),
    );
    expect(brief.facts).toEqual([]);
    expect(brief.callAngles).toEqual([]);
  });
  it("returns unresolved identity without borrowing department-wide facts", async () => {
    const providers = makeProviders({
      synthesize: async () => ({
        draft: makeDraft({
          scope: {
            name: "Bigger department",
            relationship: "parent_department",
            explanation: null,
            references: [],
          },
        }),
        usage: { model: "test", inputTokens: 1, outputTokens: 1 },
      }),
    });
    const brief = await run(providers);
    expect(brief.scope.relationship).toBe("unresolved");
    expect(brief.facts).toHaveLength(0);
  });
  it("fails if the model fabricates every source reference", async () => {
    const draft = makeDraft();
    if (draft.facts[0]) draft.facts[0].references = ["invented"];
    await expect(
      run(
        makeProviders({
          synthesize: async () => ({
            draft,
            usage: { model: "test", inputTokens: 1, outputTokens: 1 },
          }),
        }),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        "could not establish reliable citations",
      ),
      retryable: true,
    });
  });
  it("does not retry an unresolved Place ID in other providers", async () => {
    const search = vi.fn();
    await expect(
      run(
        makeProviders({
          resolvePlace: async () => {
            throw new ResearchError("No place", { retryable: false });
          },
          search,
        }),
      ),
    ).rejects.toMatchObject({ message: "No place", retryable: false });
    expect(search).not.toHaveBeenCalled();
  });
});

describe("discovery that finds nothing, and what a run records", () => {
  it("returns an empty brief without reading or synthesizing when every search succeeds but finds nothing", async () => {
    const read = vi.fn(makeProviders().read);
    const synthesize = vi.fn(makeProviders().synthesize);
    const log = vi.fn<Log>();
    const brief = await run(
      makeProviders({
        resolvePlace: async () => makePlace({ websiteUrl: null }),
        search: async () => [],
        read,
        synthesize,
      }),
      { log },
    );
    expect(read).not.toHaveBeenCalled();
    expect(synthesize).not.toHaveBeenCalled();
    expect(brief).toMatchObject({
      mode: "live",
      facts: [],
      callAngles: [],
      questions: [],
      sources: [],
      scope: { relationship: "selected_place", name: "Maple Fire Department" },
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "evidence",
        candidates: 0,
        selected: 0,
        read: 0,
        failed: 0,
      }),
    );
  });
  it("names a run by a fresh UUID when the caller gives it none", async () => {
    const brief = await researchDepartment({
      placeId: "test-place",
      providers: makeProviders(),
    });
    expect(brief.runId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
  it("logs each stage with elapsed time, the evidence counts, the model usage, and the outcome", async () => {
    const log = vi.fn<Log>();
    await run(makeProviders(), { log });
    const entries = log.mock.calls.map(([entry]) => entry);
    expect(entries.map((entry) => entry.event)).toEqual([
      "resolving",
      "searching",
      "reading",
      "evidence",
      "synthesizing",
      "synthesis",
      "validating",
      "complete",
    ]);
    for (const entry of entries) expect(entry.runId).toBe("test-run");
    expect(entries.find((entry) => entry.event === "reading")).toMatchObject({
      elapsedMs: expect.any(Number),
    });
    expect(entries.find((entry) => entry.event === "synthesis")).toMatchObject({
      promptVersion: expect.stringMatching(/^department-brief-v\d+$/),
      model: "test-model",
      inputTokens: 100,
      outputTokens: 100,
    });
    expect(entries.find((entry) => entry.event === "complete")).toMatchObject({
      facts: 1,
      sources: 1,
      durationMs: expect.any(Number),
    });
  });
});
