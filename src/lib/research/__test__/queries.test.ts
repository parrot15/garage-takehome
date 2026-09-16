import { describe, expect, it } from "vitest";
import { makePlace, TEST_DATE } from "@/__test__/factories";
import { TRACKS } from "@/lib/brief/schema";
import { buildQueries, homepageCandidate, officialHost } from "../queries";

const now = new Date(TEST_DATE);
const eighteenMonthsAgo = "2025-03-12T12:00:00.000Z";

describe("officialHost", () => {
  it("names the listed site without its www prefix", () => {
    expect(
      officialHost(makePlace({ websiteUrl: "https://www.wavfc.org/about" })),
    ).toBe("wavfc.org");
  });
  it.each([null, "javascript:alert(1)", "not a url"])(
    "has no host for %s",
    (websiteUrl) => {
      expect(officialHost(makePlace({ websiteUrl }))).toBeNull();
    },
  );
});

describe("homepageCandidate", () => {
  it("offers the listed website at the top rank on every topic it can serve", () => {
    expect(
      homepageCandidate(
        makePlace({
          websiteUrl: "https://maple.example.org/fire/?utm_source=mail#top",
        }),
      ),
    ).toEqual([
      {
        url: "https://maple.example.org/fire/",
        title: "Maple Fire Department",
        excerpt: "Website listed for the selected location",
        publishedAt: null,
        tracks: ["leadership", "fleet", "news"],
        rank: 0,
      },
    ]);
  });
  it.each([null, "ftp://maple.example.org/"])(
    "offers nothing for a website of %s",
    (websiteUrl) => {
      expect(homepageCandidate(makePlace({ websiteUrl }))).toEqual([]);
    },
  );
});

describe("buildQueries", () => {
  const queries = buildQueries(makePlace(), now);
  const byId = (id: string) => {
    const query = queries.find((candidate) => candidate.id === id);
    if (!query) throw new Error(`No query ${id}`);
    return query;
  };
  const openWeb = queries.filter((query) => !query.id.startsWith("site-"));

  it("builds fourteen queries with stable ids that traces and replays can rely on", () => {
    expect(queries.map((query) => query.id)).toEqual([
      "leadership-chief",
      "leadership-officers",
      "leadership-change",
      "fleet-roster",
      "fleet-deliveries",
      "disposition-surplus",
      "disposition-marketplace",
      "funding-grants",
      "funding-budget",
      "news-department",
      "news-locality",
      "site-leadership",
      "site-fleet",
      "site-news",
    ]);
  });
  it("gives every track at least two queries", () => {
    for (const track of TRACKS)
      expect(
        queries.filter((query) => query.track === track).length,
      ).toBeGreaterThanOrEqual(2);
  });
  it("names the town in every open-web query and the department in the topic queries", () => {
    for (const query of openWeb) {
      expect(query.query).toContain("Maple");
      expect(query.query).toContain("Vermont");
    }
    for (const id of ["leadership-chief", "fleet-roster", "funding-grants"])
      expect(byId(id).query).toContain(
        "Maple Fire Department Maple Vermont US",
      );
    expect(byId("disposition-marketplace").query).not.toContain("US");
  });
  it("dates the change-of-chief and news queries eighteen months back and nothing else", () => {
    for (const query of queries)
      expect(query.startPublishedDate).toBe(
        ["leadership-change", "news-department", "news-locality"].includes(
          query.id,
        )
          ? eighteenMonthsAgo
          : undefined,
      );
  });
  it("asks Exa's news category for department news only, with more results for both news queries", () => {
    expect(byId("news-department")).toMatchObject({
      category: "news",
      numResults: 8,
    });
    expect(byId("news-locality")).toMatchObject({ numResults: 8 });
    expect(byId("news-locality").category).toBeUndefined();
    for (const query of queries)
      if (!query.id.startsWith("news-")) {
        expect(query.category).toBeUndefined();
        expect(query.numResults).toBeUndefined();
      }
  });
  it("restricts the marketplace query to surplus hosts and keeps aggregators out of every other open-web query", () => {
    const marketplace = byId("disposition-marketplace");
    expect(marketplace.includeDomains).toEqual(
      expect.arrayContaining(["govdeals.com", "shopgarage.com"]),
    );
    expect(marketplace.excludeDomains).toBeUndefined();
    for (const query of openWeb)
      if (query.id !== "disposition-marketplace") {
        expect(query.includeDomains).toBeUndefined();
        expect(query.excludeDomains).toEqual(
          expect.arrayContaining(["linkedin.com", "zoominfo.com"]),
        );
      }
  });
  it("scopes three generic topic queries to the listed host and its subdomains", () => {
    const site = queries.filter((query) => query.id.startsWith("site-"));
    expect(site.map((query) => query.track)).toEqual([
      "leadership",
      "fleet",
      "news",
    ]);
    for (const query of site) {
      expect(query.includeDomains).toEqual([
        "maple.example.org",
        "*.maple.example.org",
      ]);
      expect(query.excludeDomains).toBeUndefined();
      expect(query.query).not.toContain("Maple");
    }
  });
  it("builds only the open-web queries when no website is listed", () => {
    const without = buildQueries(makePlace({ websiteUrl: null }), now);
    expect(without.map((query) => query.id)).toEqual(
      openWeb.map((query) => query.id),
    );
  });
  it("falls back to the department's name when Google listed no town, region, or country", () => {
    const sparse = buildQueries(
      makePlace({ locality: null, region: null, country: null }),
      now,
    );
    for (const query of sparse.filter((q) => !q.id.startsWith("site-"))) {
      expect(query.query).toContain("Maple Fire Department");
      expect(query.query).not.toMatch(/null|undefined/);
    }
  });
});
