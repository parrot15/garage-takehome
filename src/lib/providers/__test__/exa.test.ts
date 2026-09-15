import { describe, expect, it, type Mock, vi } from "vitest";
import { makeCandidate } from "@/__test__/factories";
import { createExaProvider } from "../exa";

const config = { exaApiKey: "test-exa-key", providerTimeoutMs: 20_000 };
const signal = () => new AbortController().signal;
const candidate = (url: string) => makeCandidate({ url });
/** An Exa contents response: the pages it returned and the status of each requested URL. */
const contents = (results: object[], statuses: object[] = []) =>
  Response.json({ results, statuses });
const succeeded = (id: string, source = "crawled") => ({
  id,
  status: "success",
  source,
});
const failed = (id: string, error?: object) => ({ id, status: "error", error });
const text =
  "The outgoing 1996 pumper will be disposed of only after the replacement enters service.";
const sentBody = (fetchImpl: Mock<typeof fetch>, call = 0) =>
  JSON.parse(String(fetchImpl.mock.calls[call]?.[1]?.body));

describe("Exa discovery", () => {
  it("titles an untitled result by the site that published it", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        results: [{ url: "https://www.city.gov/fire/apparatus" }],
      }),
    );
    const [found] = await createExaProvider(config, fetchImpl).search(
      { id: "fleet-1", track: "fleet", query: "Riverbend apparatus" },
      signal(),
    );
    expect(found?.title).toBe("city.gov");
  });
  it("requests a bounded result count and carries the research track and date filter", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        results: [
          {
            url: "https://city.gov/fire",
            title: "Fire department",
            highlights: ["Apparatus request"],
            publishedDate: "2025-04-01",
          },
          { url: "javascript:alert(1)", title: "Unsafe" },
        ],
      }),
    );
    const result = await createExaProvider(config, fetchImpl).search(
      {
        id: "news-1",
        track: "news",
        query: "Riverbend NY fire news",
        startPublishedDate: "2025-01-01T00:00:00.000Z",
      },
      signal(),
    );
    expect(result).toEqual([
      {
        url: "https://city.gov/fire",
        title: "Fire department",
        excerpt: "Apparatus request",
        publishedAt: "2025-04-01",
        tracks: ["news"],
        rank: 0,
      },
    ]);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://api.exa.ai/search");
    expect(sentBody(fetchImpl)).toMatchObject({
      type: "auto",
      numResults: 6,
      startPublishedDate: "2025-01-01T00:00:00.000Z",
      contents: { highlights: true, text: false },
    });
    expect(sentBody(fetchImpl)).not.toHaveProperty("includeDomains");
    expect(sentBody(fetchImpl)).not.toHaveProperty("excludeDomains");
    expect(sentBody(fetchImpl)).not.toHaveProperty("category");
  });

  it("keeps listed hosts out of open-web discovery", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ results: [] }));
    await createExaProvider(config, fetchImpl).search(
      {
        id: "leadership-2",
        track: "leadership",
        query: "Riverbend NY fire chief",
        excludeDomains: ["linkedin.com", "exa.ai"],
      },
      signal(),
    );
    expect(sentBody(fetchImpl)).toMatchObject({
      excludeDomains: ["linkedin.com", "exa.ai"],
    });
  });

  it("scopes discovery to the department's own site and news, within a bounded count", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        results: Array.from({ length: 12 }, (_, index) => ({
          url: `https://wavfc.org/page-${index}`,
          title: `Page ${index}`,
        })),
      }),
    );
    const result = await createExaProvider(config, fetchImpl).search(
      {
        id: "news-3",
        track: "news",
        query: "news announcements",
        includeDomains: ["wavfc.org", "*.wavfc.org"],
        category: "news",
        numResults: 50,
      },
      signal(),
    );
    expect(result).toHaveLength(10);
    expect(sentBody(fetchImpl)).toMatchObject({
      numResults: 10,
      includeDomains: ["wavfc.org", "*.wavfc.org"],
      category: "news",
    });
  });

  it("leaves undated staff/fleet searches unfiltered", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ results: [] }));
    await createExaProvider(config, fetchImpl).search(
      {
        id: "leadership-4",
        track: "leadership",
        query: "Riverbend NY fire chief",
      },
      signal(),
    );
    expect(sentBody(fetchImpl)).not.toHaveProperty("startPublishedDate");
  });

  it("does not turn malformed results into an honest-looking empty search", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ results: [{ unexpected: "not a result" }] }),
      );
    await expect(
      createExaProvider(config, fetchImpl).search(
        { id: "fleet-5", track: "fleet", query: "Riverbend fleet" },
        signal(),
      ),
    ).rejects.toMatchObject({
      message:
        "The search provider returned an unreadable response. Please try again.",
      retryable: true,
    });
  });
});

describe("Exa extraction", () => {
  it("requests fresh full text and retains document query parameters and qualifications", async () => {
    const url = "https://city.gov/AgendaCenter/ViewFile/Item/1378?fileID=8976";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      contents(
        [
          {
            id: url,
            url,
            title: "Fire chief memo",
            text,
            publishedDate: "2025-04-01",
          },
        ],
        [succeeded(url)],
      ),
    );
    const result = await createExaProvider(
      config,
      fetchImpl,
      () => new Date("2026-09-12T12:00:00Z"),
    ).read([candidate(url)], signal());
    expect(result.failures).toEqual([]);
    expect(result.pages[0]).toMatchObject({
      url,
      text,
      title: "Fire chief memo",
      retrieval: "live",
      truncated: false,
      retrievedAt: "2026-09-12T12:00:00.000Z",
    });
    const body = sentBody(fetchImpl);
    expect(body).toMatchObject({
      urls: [url],
      maxAgeHours: 0,
      text: { verbosity: "full", maxCharacters: 500_000 },
      highlights: false,
    });
    expect(body).not.toHaveProperty("livecrawl");
    expect(body).not.toHaveProperty("summary");
  });

  it("treats per-URL failures inside HTTP 200 as failures", async () => {
    const urls = [
      "https://city.gov/one",
      "https://city.gov/two",
      "https://city.gov/three",
    ] as const;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
      contents(
        [{ url: urls[0], text }],
        [
          failed(urls[0], {
            tag: "CRAWL_LIVECRAWL_TIMEOUT",
            httpStatusCode: 504,
          }),
          failed(urls[1], {
            tag: "SOURCE_NOT_AVAILABLE",
            httpStatusCode: 403,
          }),
          failed(urls[2], { tag: "CRAWL_NOT_FOUND", httpStatusCode: 404 }),
        ],
      ),
    );
    const result = await createExaProvider(config, fetchImpl).read(
      urls.map(candidate),
      signal(),
    );
    expect(result.pages).toEqual([]);
    expect(result.failures.map((failure) => failure.reason)).toEqual([
      "timeout",
      "blocked",
      "unavailable",
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sentBody(fetchImpl, 1).urls).toEqual([urls[0]]);
    // The removed page is not asked for from the cache; the others are.
    expect(sentBody(fetchImpl, 2)).toMatchObject({
      urls: [urls[0], urls[1]],
      maxAgeHours: -1,
    });
  });

  it("retries only failed transient URLs and merges recovered pages into the baseline", async () => {
    const good = "https://company.org/about";
    const county = "https://county.gov/fire/stations";
    const missing = "https://company.org/";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        contents(
          [{ id: good, url: good, text }],
          [
            succeeded(good),
            failed(county, { tag: "CRAWL_UNKNOWN_ERROR", httpStatusCode: 500 }),
            failed(missing, {
              tag: "CRAWL_EMPTY_CONTENT",
              httpStatusCode: 422,
            }),
          ],
        ),
      )
      .mockResolvedValueOnce(
        contents(
          [
            { id: county, url: county, text },
            { url: "https://unrequested.gov/record", text },
          ],
          [succeeded(county)],
        ),
      )
      .mockResolvedValueOnce(
        contents([], [failed(missing, { tag: "CRAWL_NOT_CACHED" })]),
      );
    const result = await createExaProvider(config, fetchImpl).read(
      [good, county, missing].map(candidate),
      signal(),
    );
    expect(result.pages.map((page) => [page.url, page.retrieval])).toEqual([
      [good, "live"],
      [county, "live"],
    ]);
    expect(result.failures).toEqual([{ url: missing, reason: "unavailable" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sentBody(fetchImpl, 0).urls).toEqual([good, county, missing]);
    expect(sentBody(fetchImpl, 1).urls).toEqual([county]);
    expect(sentBody(fetchImpl, 2)).toMatchObject({
      urls: [missing],
      maxAgeHours: -1,
    });
  });

  it.each([
    { httpStatusCode: 408 },
    { httpStatusCode: 429 },
    { httpStatusCode: 500 },
    { httpStatusCode: 503 },
    { tag: "CRAWL_TIMEOUT" },
    { tag: "CRAWL_LIVECRAWL_TIMEOUT" },
    { tag: "CRAWL_UNKNOWN_ERROR" },
  ])(
    "retries a transient status once live, then asks the cache: %j",
    async (error) => {
      const url = "https://county.gov/fire/stations";
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => contents([], [failed(url, error)]));
      const result = await createExaProvider(config, fetchImpl).read(
        [candidate(url)],
        signal(),
      );
      expect(result.pages).toEqual([]);
      expect(result.failures).toHaveLength(1);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(sentBody(fetchImpl, 1).maxAgeHours).toBe(0);
      expect(sentBody(fetchImpl, 2).maxAgeHours).toBe(-1);
    },
  );

  it.each([403, 409, 422])(
    "does not retry a permanent %i error live but asks the cache once",
    async (httpStatusCode) => {
      const url = "https://county.gov/fire/stations";
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          contents(
            [],
            [failed(url, { tag: "CRAWL_UNKNOWN_ERROR", httpStatusCode })],
          ),
        );
      await createExaProvider(config, fetchImpl).read(
        [candidate(url)],
        signal(),
      );
      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(sentBody(fetchImpl, 1)).toMatchObject({
        urls: [url],
        maxAgeHours: -1,
      });
      expect(sentBody(fetchImpl, 1)).not.toHaveProperty("livecrawlTimeout");
    },
  );

  it.each([
    { tag: "CRAWL_UNKNOWN_ERROR", httpStatusCode: 404 },
    { tag: "CRAWL_UNKNOWN_ERROR", httpStatusCode: 410 },
    { tag: "CRAWL_NOT_FOUND", httpStatusCode: null },
  ])("does not ask the cache for a removed page: %j", async (error) => {
    const url = "https://county.gov/fire/stations";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(contents([], [failed(url, error)]));
    const result = await createExaProvider(config, fetchImpl).read(
      [candidate(url)],
      signal(),
    );
    expect(result.failures).toEqual([{ url, reason: "unavailable" }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry missing results or unclassified failures live", async () => {
    const urls = [
      "https://county.gov/missing",
      "https://county.gov/unknown",
    ] as const;
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(contents([], [failed(urls[1])]));
    const result = await createExaProvider(config, fetchImpl).read(
      urls.map(candidate),
      signal(),
    );
    expect(result.failures).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sentBody(fetchImpl, 1)).toMatchObject({ urls, maxAgeHours: -1 });
  });

  const partialResponse = () =>
    contents(
      [{ url: "https://city.gov/good", text }],
      [
        succeeded("https://city.gov/good"),
        failed("https://city.gov/retry", {
          tag: "CRAWL_TIMEOUT",
          httpStatusCode: 504,
        }),
      ],
    );
  const partialCandidates = () =>
    ["https://city.gov/good", "https://city.gov/retry"].map(candidate);

  it("keeps baseline evidence if the retry request fails", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(partialResponse())
      .mockImplementation(
        async () => new Response("unavailable", { status: 503 }),
      );
    const result = await createExaProvider(config, fetchImpl).read(
      partialCandidates(),
      signal(),
    );
    expect(result.pages.map((page) => page.url)).toEqual([
      "https://city.gov/good",
    ]);
    expect(result.failures).toEqual([
      { url: "https://city.gov/retry", reason: "timeout" },
    ]);
  });

  it("accepts cached content returned by a retry, labelled freshness unknown", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(partialResponse())
      .mockResolvedValueOnce(
        contents(
          [{ url: "https://city.gov/retry", text }],
          [succeeded("https://city.gov/retry", "cached")],
        ),
      );
    const result = await createExaProvider(config, fetchImpl).read(
      partialCandidates(),
      signal(),
    );
    expect(result.pages.map((page) => [page.url, page.retrieval])).toEqual([
      ["https://city.gov/good", "live"],
      ["https://city.gov/retry", "unknown"],
    ]);
    expect(result.failures).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps baseline evidence when the provider deadline stops a stalled retry", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(partialResponse())
      .mockImplementationOnce(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            );
          }),
      )
      .mockResolvedValueOnce(contents([]));
    const result = await createExaProvider(
      { ...config, providerTimeoutMs: 20 },
      fetchImpl,
    ).read(partialCandidates(), signal());
    expect(result.pages.map((page) => page.url)).toEqual([
      "https://city.gov/good",
    ]);
    expect(result.failures).toEqual([
      { url: "https://city.gov/retry", reason: "timeout" },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("keeps an explicitly cached response with unknown freshness", async () => {
    const urls = ["https://city.gov/one", "https://city.gov/two"] as const;
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      contents(
        urls.map((url) => ({ url, text })),
        [succeeded(urls[0], "livecrawl"), succeeded(urls[1], "cached")],
      ),
    );
    const result = await createExaProvider(config, fetchImpl).read(
      urls.map(candidate),
      signal(),
    );
    expect(result.pages.map((page) => page.retrieval)).toEqual([
      "live",
      "unknown",
    ]);
    expect(result.failures).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("recovers a page that refuses live crawls from the cache, labelled freshness unknown", async () => {
    const url =
      "https://www.cityofboise.org/departments/fire/about-boise-fire/meet-the-chief-and-command-staff/";
    const refused = () =>
      contents(
        [],
        [failed(url, { tag: "CRAWL_UNKNOWN_ERROR", httpStatusCode: 500 })],
      );
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(refused())
      .mockResolvedValueOnce(refused())
      .mockResolvedValueOnce(
        contents(
          [
            {
              id: url,
              url,
              title: "Meet the Chief and Command Staff",
              text: "Aaron Hummel currently serves as Fire Chief of the Boise Fire Department.",
            },
          ],
          [succeeded(url, "cached")],
        ),
      );
    const result = await createExaProvider(config, fetchImpl).read(
      [candidate(url)],
      signal(),
    );
    expect(result.failures).toEqual([]);
    expect(result.pages[0]).toMatchObject({
      url,
      title: "Meet the Chief and Command Staff",
      retrieval: "unknown",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const body = sentBody(fetchImpl, 2);
    expect(body).toMatchObject({
      urls: [url],
      maxAgeHours: -1,
      text: { verbosity: "full", maxCharacters: 500_000 },
      highlights: false,
    });
    expect(body).not.toHaveProperty("livecrawlTimeout");
  });

  it("keeps live failure reasons when the cache has nothing or only a challenge page", async () => {
    const blocked = "https://city.gov/blocked";
    const challenged = "https://city.gov/challenged";
    const refusal = { tag: "SOURCE_NOT_AVAILABLE", httpStatusCode: 403 };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        contents([], [failed(blocked, refusal), failed(challenged, refusal)]),
      )
      .mockResolvedValueOnce(
        contents(
          [
            {
              id: challenged,
              url: challenged,
              title: "Just a moment...",
              text: "Verify you are human.",
            },
          ],
          [
            failed(blocked, { tag: "CRAWL_NOT_CACHED" }),
            succeeded(challenged, "cached"),
          ],
        ),
      );
    const result = await createExaProvider(config, fetchImpl).read(
      [blocked, challenged].map(candidate),
      signal(),
    );
    expect(result.pages).toEqual([]);
    expect(result.failures).toEqual([
      { url: blocked, reason: "blocked" },
      { url: challenged, reason: "blocked" },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps live evidence when the cache request itself fails", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(partialResponse())
      .mockResolvedValueOnce(
        contents(
          [],
          [
            failed("https://city.gov/retry", {
              tag: "CRAWL_TIMEOUT",
              httpStatusCode: 504,
            }),
          ],
        ),
      )
      .mockImplementation(
        async () => new Response("unavailable", { status: 503 }),
      );
    const result = await createExaProvider(config, fetchImpl).read(
      partialCandidates(),
      signal(),
    );
    expect(result.pages.map((page) => page.url)).toEqual([
      "https://city.gov/good",
    ]);
    expect(result.failures).toEqual([
      { url: "https://city.gov/retry", reason: "timeout" },
    ]);
  });

  it("does not pretend missing freshness metadata proves a live fetch", async () => {
    const url = "https://city.gov/fire";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ results: [{ url, text }] }));
    const result = await createExaProvider(config, fetchImpl).read(
      [candidate(url)],
      signal(),
    );
    expect(result.pages[0]?.retrieval).toBe("unknown");
  });

  it("joins canonical redirects by requested id without adding unrelated results", async () => {
    const requested = "https://city.gov/old-record";
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      contents(
        [
          { id: requested, url: "https://city.gov/new-record.pdf", text },
          {
            id: "https://other-city.gov/fire",
            url: "https://other-city.gov/fire",
            text: "Unrelated result must not be added to the registry.",
          },
        ],
        [succeeded(requested, "live")],
      ),
    );
    const result = await createExaProvider(config, fetchImpl).read(
      [candidate(requested)],
      signal(),
    );
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]?.url).toBe(requested);
  });

  it("rejects challenge pages and absent text instead of using snippets", async () => {
    const urls = ["https://city.gov/blocked", "https://city.gov/empty"];
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      contents(
        [
          {
            url: urls[0],
            title: "Just a moment...",
            text: "Verify you are human. Cloudflare security challenge.",
          },
          {
            url: urls[1],
            title: "Chief",
            highlights: ["This discovery snippet is not source text."],
          },
        ],
        urls.map((id) => succeeded(id, "live")),
      ),
    );
    const result = await createExaProvider(config, fetchImpl).read(
      urls.map(candidate),
      signal(),
    );
    expect(result.pages).toEqual([]);
    expect(result.failures.map((failure) => failure.reason)).toEqual([
      "blocked",
      "empty",
    ]);
  });

  it("flags provider text limits so downstream review cannot appear complete", async () => {
    const url = "https://city.gov/budget.pdf";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ results: [{ url, text: "a".repeat(500_000) }] }),
      );
    const result = await createExaProvider(config, fetchImpl).read(
      [candidate(url)],
      signal(),
    );
    expect(result.pages[0]?.truncated).toBe(true);
  });

  it("rejects malformed top-level responses and never exposes error contents", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ unexpected: "secret text" }));
    await expect(
      createExaProvider(config, fetchImpl).read(
        [candidate("https://city.gov/fire")],
        signal(),
      ),
    ).rejects.toMatchObject({
      message:
        "The search provider returned an unreadable response. Please try again.",
      retryable: true,
    });
  });

  it("does not call the provider for an empty candidate list", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      createExaProvider(config, fetchImpl).read([], signal()),
    ).resolves.toEqual({ pages: [], failures: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("Exa retry outcomes", () => {
  it("does not ask the cache for a page whose retry reports it gone", async () => {
    const url = "https://county.gov/fire/stations";
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        contents(
          [],
          [failed(url, { tag: "CRAWL_UNKNOWN_ERROR", httpStatusCode: 500 })],
        ),
      )
      .mockResolvedValueOnce(
        contents(
          [],
          [failed(url, { tag: "CRAWL_NOT_FOUND", httpStatusCode: 404 })],
        ),
      );
    const result = await createExaProvider(config, fetchImpl).read(
      [candidate(url)],
      signal(),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sentBody(fetchImpl, 1).maxAgeHours).toBe(0);
    expect(result.pages).toEqual([]);
    expect(result.failures).toEqual([{ url, reason: "unavailable" }]);
  });
});
