import { describe, expect, it } from "vitest";
import { makeCandidate, makePlace } from "@/__test__/factories";
import { TRACKS } from "@/lib/brief/schema";
import { selectCandidates, selectFallbackCandidates } from "../selection";

describe("source selection", () => {
  it("reads each query's top result before any query's second result", () => {
    const candidates = TRACKS.flatMap((track) =>
      [0, 1, 2].map((rank) =>
        makeCandidate({
          url: `https://city.example.org/${track}/${rank}`,
          tracks: [track],
          rank,
        }),
      ),
    );
    const selected = selectCandidates(
      candidates,
      makePlace({ websiteUrl: null }),
      7,
    );
    expect(selected.map((c) => c.url)).toEqual([
      ...TRACKS.map((track) => `https://city.example.org/${track}/0`),
      "https://city.example.org/leadership/1",
      "https://city.example.org/fleet/1",
    ]);
  });
  it("reads pages that name the town or department before pages that name neither", () => {
    const place = makePlace({
      name: "Wise Avenue Volunteer Fire Co",
      locality: "Dundalk",
      websiteUrl: null,
    });
    const selected = selectCandidates(
      [
        makeCandidate({
          url: "https://www.wcax.com/pownal-fire-department-receives-funding",
          title: "Pownal Fire Department receives federal funding",
          excerpt: "Pownal, Vermont",
          tracks: ["news"],
          rank: 0,
        }),
        makeCandidate({
          url: "https://www.fentonfire.com/locations/maryland/",
          title: "Fenton Fire Equipment locations",
          excerpt: "Dealer locations in Maryland.",
          tracks: ["disposition"],
          rank: 0,
        }),
        makeCandidate({
          url: "https://www.eastcountytimes.com/obituaries/former-chief",
          title: "Former Wise Avenue VFC fire chief passes away",
          excerpt: "",
          tracks: ["news"],
          rank: 2,
        }),
        makeCandidate({
          url: "https://nonprofitlight.com/md/baltimore/company-inc",
          title: "Wise Avenue Volunteer Fire Company Inc",
          excerpt: "Dundalk, MD nonprofit profile",
          tracks: ["funding"],
          rank: 1,
        }),
      ],
      place,
      3,
    );
    expect(selected.map((c) => c.url)).toEqual([
      "https://nonprofitlight.com/md/baltimore/company-inc",
      "https://www.eastcountytimes.com/obituaries/former-chief",
      "https://www.wcax.com/pownal-fire-department-receives-funding",
    ]);
  });
  it("orders a merged duplicate by the query where it ranked best, not where it was first seen", () => {
    const candidates = [
      makeCandidate({ url: "https://a.example.org/maple", rank: 0 }),
      makeCandidate({ url: "https://deep.example.org/maple", rank: 5 }),
      makeCandidate({ url: "https://b.example.org/maple", rank: 0 }),
      makeCandidate({ url: "https://early.example.org/maple", rank: 1 }),
      makeCandidate({ url: "https://c.example.org/maple", rank: 0 }),
      makeCandidate({ url: "https://deep.example.org/maple", rank: 1 }),
    ];
    expect(
      selectCandidates(candidates, makePlace(), 4).map((c) => c.url),
    ).toEqual([
      "https://a.example.org/maple",
      "https://b.example.org/maple",
      "https://c.example.org/maple",
      "https://early.example.org/maple",
    ]);
  });
  it("merges cross-track duplicates but preserves distinct municipal files", () => {
    const candidates = [
      makeCandidate({
        url: "https://city.example.org/view?fileID=1&utm_source=mail",
        tracks: ["fleet"],
      }),
      makeCandidate({
        url: "https://city.example.org/view?fileID=1",
        tracks: ["disposition"],
      }),
      makeCandidate({
        url: "https://city.example.org/view?fileID=2",
        tracks: ["funding"],
      }),
    ];
    const selected = selectCandidates(candidates, makePlace(), 10);
    expect(selected).toHaveLength(2);
    expect(selected[0]?.tracks).toContain("fleet");
    expect(selected[0]?.tracks).toContain("disposition");
  });
  it("never reads unsafe URLs", () => {
    expect(
      selectCandidates(
        [
          makeCandidate(),
          makeCandidate({ url: "javascript:alert(1)" }),
          makeCandidate({ url: "https://news.example.org/new" }),
        ],
        makePlace(),
        3,
      ).map((candidate) => candidate.url),
    ).toEqual([makeCandidate().url, "https://news.example.org/new"]);
  });
  it("caps the listed website's share so external records still get read", () => {
    const place = makePlace({ websiteUrl: "https://www.wavfc.org/" });
    const candidates = [
      ...Array.from({ length: 16 }, (_, i) =>
        makeCandidate({
          url: `https://wavfc.org/page-${i}`,
          tracks: [TRACKS[i % TRACKS.length] as (typeof TRACKS)[number]],
          rank: i,
        }),
      ),
      makeCandidate({
        url: "https://www.piercemfg.com/customers/new-deliveries/wise-avenue",
        excerpt: "Dundalk, Maryland pumper delivery",
        tracks: ["fleet"],
        rank: 2,
      }),
      makeCandidate({
        url: "https://www.baltimorecountymd.gov/departments/fire/stations",
        excerpt: "Dundalk station roster",
        tracks: ["leadership"],
        rank: 3,
      }),
      makeCandidate({
        url: "https://www.eastcountytimes.com/push-in-ceremony",
        excerpt: "Dundalk push-in ceremony",
        tracks: ["news"],
        rank: 0,
      }),
    ];
    const selected = selectCandidates(candidates, place, 16);
    const urls = selected.map((c) => c.url);
    expect(urls).toContain(
      "https://www.piercemfg.com/customers/new-deliveries/wise-avenue",
    );
    expect(urls).toContain(
      "https://www.baltimorecountymd.gov/departments/fire/stations",
    );
    expect(urls).toContain("https://www.eastcountytimes.com/push-in-ceremony");
    expect(urls.filter((url) => url.includes("wavfc.org")).length).toBe(13);
    expect(selected).toHaveLength(16);
  });
  it("treats http, https, and www spellings as one document and keeps the secure one", () => {
    const selected = selectCandidates(
      [
        makeCandidate({ url: "http://www.wavfc.org/", tracks: ["leadership"] }),
        makeCandidate({ url: "https://wavfc.org/", tracks: ["fleet"] }),
        makeCandidate({
          url: "https://wavfc.org/apparatus/",
          tracks: ["fleet"],
        }),
      ],
      makePlace({ websiteUrl: "http://www.wavfc.org/" }),
      10,
    );
    expect(selected.map((c) => c.url)).toEqual([
      "https://wavfc.org/",
      "https://wavfc.org/apparatus/",
    ]);
    expect(selected[0]?.tracks).toEqual(["leadership", "fleet"]);
  });
  it("still fills the budget from the listed website when nothing else exists", () => {
    const selected = selectCandidates(
      Array.from({ length: 12 }, (_, i) =>
        makeCandidate({
          url: `https://maple.example.org/fire/page-${i}`,
          tracks: ["fleet"],
        }),
      ),
      makePlace(),
      8,
    );
    expect(selected).toHaveLength(8);
  });
  it("trusts the top result of a site-scoped topic query even under a misleading title", () => {
    const place = makePlace({ websiteUrl: "https://www.wavfc.org/" });
    const selected = selectCandidates(
      [
        makeCandidate({
          url: "https://wavfc.org/history/",
          title: "History – WAVFC",
          excerpt: "Dundalk company history",
          tracks: ["fleet"],
          rank: 1,
        }),
        makeCandidate({
          url: "https://wavfc.org/safety-tips/",
          title: "Safety Tips – WAVFC",
          excerpt: "",
          tracks: ["fleet"],
          rank: 0,
        }),
      ],
      place,
      1,
    );
    expect(selected.map((c) => c.url)).toEqual([
      "https://wavfc.org/safety-tips/",
    ]);
  });
});

describe("read backfill selection", () => {
  it("prefers other hosts but allows another page after an empty or unavailable result", () => {
    const attempted = [
      makeCandidate({ url: "https://city.example.org/maple/empty" }),
      makeCandidate({ url: "https://paper.example.org/maple/missing" }),
    ];
    const candidates = [
      makeCandidate({
        url: "https://city.example.org/maple/apparatus",
        rank: 0,
      }),
      makeCandidate({ url: "https://paper.example.org/maple/fleet", rank: 1 }),
      makeCandidate({ url: "https://new.example.org/maple/fleet", rank: 5 }),
    ];
    const selected = selectFallbackCandidates(
      candidates,
      attempted,
      [
        { url: "https://city.example.org/maple/empty", reason: "empty" },
        {
          url: "https://paper.example.org/maple/missing",
          reason: "unavailable",
        },
      ],
      makePlace(),
      4,
    );
    expect(selected.map((candidate) => candidate.url)).toEqual([
      "https://new.example.org/maple/fleet",
      "https://city.example.org/maple/apparatus",
      "https://paper.example.org/maple/fleet",
    ]);
  });
  it("recovers failed important topics from other hosts without rereading aliases", () => {
    const attempted = [
      makeCandidate({
        url: "https://city.example.org/chief",
        tracks: ["leadership", "news"],
      }),
      makeCandidate({ url: "http://www.news.example.org/maple-fleet" }),
    ];
    const alternate = makeCandidate({
      url: "https://budget.example.org/maple-fire",
      tracks: ["leadership"],
      rank: 5,
    });
    const news = makeCandidate({
      url: "https://local.example.org/maple-announcement",
      tracks: ["news"],
      rank: 0,
    });
    const selected = selectFallbackCandidates(
      [
        ...attempted,
        makeCandidate({
          url: "https://city.example.org/staff",
          tracks: ["leadership"],
        }),
        makeCandidate({
          url: "https://news.example.org/maple-fleet?utm_source=search",
          tracks: ["leadership"],
        }),
        makeCandidate({
          url: "https://unrelated.example.org/other-chief",
          title: "Other department chief",
          excerpt: "Other city",
          tracks: ["leadership"],
        }),
        makeCandidate({
          url: "javascript:void(0)",
          tracks: ["leadership"],
        }),
        news,
        alternate,
        { ...alternate, tracks: ["news"] },
      ],
      attempted,
      [{ url: "https://city.example.org/chief", reason: "blocked" }],
      makePlace(),
      4,
    );
    expect(selected.map((c) => c.url)).toEqual([alternate.url, news.url]);
    expect(selected[0]?.tracks).toEqual(["leadership", "news"]);
  });

  it("fills the open slots and only retries topics that lost a page", () => {
    const attempted = [makeCandidate({ tracks: ["fleet"] })];
    const candidates = Array.from({ length: 8 }, (_, rank) =>
      makeCandidate({
        url: `https://other.example.org/maple-${rank}`,
        tracks: ["fleet"],
        rank,
      }),
    );
    candidates.unshift(
      makeCandidate({
        url: "https://other.example.org/maple-chief",
        tracks: ["leadership"],
      }),
    );
    const failures = [
      { url: makeCandidate().url, reason: "unavailable" as const },
    ];
    const select = (limit: number) =>
      selectFallbackCandidates(
        candidates,
        attempted,
        failures,
        makePlace(),
        limit,
      );
    expect(select(8)).toHaveLength(8);
    expect(select(2)).toHaveLength(2);
    expect(select(0)).toEqual([]);
    expect(select(4).every((c) => c.tracks.includes("fleet"))).toBe(true);
    expect(
      selectFallbackCandidates(candidates, attempted, [], makePlace(), 4),
    ).toEqual([]);
  });
});
