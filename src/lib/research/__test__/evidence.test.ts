import { describe, expect, it } from "vitest";
import { makeCandidate, makePage, makePlace } from "@/__test__/factories";
import {
  type Candidate,
  EvidenceSourceSchema,
  type ExtractedPage,
} from "../contracts";
import { buildEvidence, choosePassages, splitPassages } from "../evidence";

describe("evidence preparation", () => {
  it("stores source-owned passage text with valid references", () => {
    const sources = buildEvidence([makePage()], [makeCandidate()], makePlace());
    expect(sources[0]?.passages[0]).toMatchObject({
      id: "S1:P1",
      text: makePage().text,
    });
    expect(EvidenceSourceSchema.safeParse(sources[0]).success).toBe(true);
  });
  it("keeps estimated publication dates distinct from retrieval times", () => {
    const source = buildEvidence(
      [makePage({ publishedAt: "2024-01-01" })],
      [makeCandidate()],
      makePlace(),
    )[0];
    expect(source).toMatchObject({
      publishedAt: "2024-01-01",
      dateOrigin: "estimated",
      retrievedAt: "2026-09-12T12:00:00.000Z",
    });
  });
  it("rejects empty and unsafe source bodies", () => {
    expect(
      buildEvidence(
        [makePage({ text: "   " }), makePage({ url: "javascript:alert(1)" })],
        [makeCandidate()],
        makePlace(),
      ),
    ).toEqual([]);
  });
  it("deduplicates copied bodies, not just URLs", () => {
    expect(
      buildEvidence(
        [makePage(), makePage({ url: "https://news.example.org/copy" })],
        [makeCandidate()],
        makePlace(),
      ),
    ).toHaveLength(1);
  });
  it("packs neighbouring paragraphs into one passage under the heading in force", () => {
    const passages = splitPassages(
      "# Officers\n\nThomas Jugan\n\nFire Chief\n\nLance Meehan\n\nAssistant Chief\n\n# Apparatus\n\nEngine 271, a 2017 Rosenbauer.",
    );
    expect(passages).toEqual([
      {
        text: "# Officers\n\nThomas Jugan\n\nFire Chief\n\nLance Meehan\n\nAssistant Chief",
        locator: "Officers",
      },
      {
        text: "# Apparatus\n\nEngine 271, a 2017 Rosenbauer.",
        locator: "Apparatus",
      },
    ]);
  });
  it("keeps the relevant passages of a long document in document order", () => {
    const text = [
      ...Array.from(
        { length: 30 },
        (_, i) =>
          `Section ${i}: ${"General unrelated municipal material. ".repeat(10)}`,
      ),
      "# Fire apparatus",
      "Maple Fire Department will replace Engine 5 in 2027.",
      "The outgoing pumper will be retained for training and reserve use.",
      "Council adjourned.",
    ].join("\n\n");
    const chosen = choosePassages(splitPassages(text), makePlace(), 1400);
    const material = chosen.blocks.map((b) => b.text).join("\n");
    expect(material).toContain("will replace Engine 5");
    expect(material).toContain("retained for training");
    expect(chosen.partial).toBe(true);
    expect(
      chosen.blocks.reduce((sum, block) => sum + block.text.length, 0),
    ).toBeLessThanOrEqual(1400);
  });
  it("cuts a long PDF flattened to one paragraph at sentence ends and keeps its useful part", () => {
    const text =
      "Unrelated municipal business. ".repeat(1400) +
      " Maple Fire Department will replace its 2004 pumper. The outgoing apparatus will be retained for training and reserve use. " +
      "Unrelated municipal business. ".repeat(500);
    const sources = buildEvidence(
      [makePage({ text })],
      [makeCandidate()],
      makePlace(),
      { maxCharacters: 18000 },
    );
    expect(sources).toHaveLength(1);
    expect(sources[0]?.passages.map((p) => p.text).join(" ")).toContain(
      "retained for training and reserve use",
    );
    expect(sources[0]?.partial).toBe(true);
    for (const passage of sources[0]?.passages ?? []) {
      expect(passage.text.length).toBeLessThanOrEqual(4000);
      expect(passage.text.endsWith(".")).toBe(true);
    }
    expect(
      sources[0]?.passages.reduce((sum, p) => sum + p.text.length, 0),
    ).toBeLessThanOrEqual(18000);
  });
  it("ranks a passage by distinct topic words and the department's name, not by repeating fire", () => {
    const useful =
      "Maple Fire Department's budget funds a pumper purchase; the chief will replace Engine 5.";
    const text = [
      "# Overview",
      "Fire fire fire fire fire fire fire fire fire fire fire fire fire fire fire fire fire fire.",
      "# Fire Department",
      useful,
      "# Parks",
      "Parks and recreation. ".repeat(60),
    ].join("\n\n");
    const chosen = choosePassages(
      splitPassages(text),
      makePlace(),
      useful.length + 30,
    );
    expect(chosen.blocks.map((block) => block.text)).toEqual([
      `# Fire Department\n\n${useful}`,
    ]);
  });
  it("gives a long page the room that short pages leave, whichever was read first", () => {
    const roster = makePage({
      url: "https://county.example.org/roster",
      text: Array.from(
        { length: 40 },
        (_, i) =>
          `Engine ${i} is a 20${String(i).padStart(2, "0")} Pierce pumper assigned to Station ${i}.`,
      ).join("\n\n"),
    });
    const short = (n: number) =>
      makePage({
        url: `https://news.example.org/${n}`,
        text: `Maple Fire Department news item ${n}.`,
      });
    const sources = buildEvidence(
      [roster, short(1), short(2), short(3)],
      [makeCandidate()],
      makePlace(),
      { maxCharacters: 4_000 },
    );
    expect(sources.map((source) => source.partial)).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });
  it("marks provider truncation as partial review", () =>
    expect(
      buildEvidence(
        [makePage({ truncated: true })],
        [makeCandidate()],
        makePlace(),
      )[0]?.partial,
    ).toBe(true));
  it("keeps a short but useful leadership page", () => {
    const sources = buildEvidence(
      [makePage({ text: "Maple Fire Department lists Chief Lee." })],
      [makeCandidate()],
      makePlace(),
    );
    expect(sources[0]?.passages[0]?.text).toContain("Chief Lee");
  });
});

describe("passage packing and source bookkeeping", () => {
  it("cuts a paragraph with no sentence or line break at the passage maximum", () => {
    expect(splitPassages("a".repeat(9_000)).map((b) => b.text.length)).toEqual([
      4_000, 4_000, 1_000,
    ]);
  });
  it("normalises Windows line endings and trims a heading to a locator", () => {
    const blocks = splitPassages(
      `# ${"H".repeat(300)}\r\n\r\nBody text.\r\n\r\n# Next\r\n\r\nMore.`,
    );
    expect(blocks.map((b) => b.locator?.length)).toEqual([250, 4]);
    expect(blocks[1]?.text).toBe("# Next\n\nMore.");
  });
  it("keeps only the first hundred relevant passages of a document that has more", () => {
    const blocks = Array.from({ length: 120 }, (_, i) => ({
      text: `Engine ${i} entry ${"x".repeat(1_300)}`,
      locator: null,
    }));
    const chosen = choosePassages(blocks, makePlace(), 10_000_000);
    expect(chosen.partial).toBe(true);
    expect(chosen.blocks.map((b) => b.text)).toEqual(
      blocks.slice(0, 100).map((b) => b.text),
    );
  });
  it("titles a page by its own title, then the discovery title, then the site", () => {
    const build = (page: Partial<ExtractedPage>, candidates: Candidate[]) =>
      buildEvidence([makePage(page)], candidates, makePlace())[0];
    expect(
      build({ title: "Own" }, [makeCandidate({ title: "Found" })])?.title,
    ).toBe("Own");
    expect(
      build({ title: "" }, [makeCandidate({ title: "Found" })])?.title,
    ).toBe("Found");
    expect(build({ title: "" }, [])?.title).toBe("maple.example.org");
  });
  it("joins a page to its discovery record through the canonical address", () => {
    const source = buildEvidence(
      [makePage({ url: "https://maple.example.org/fire?utm_source=x#top" })],
      [
        makeCandidate({
          url: "https://maple.example.org/fire",
          tracks: ["funding"],
        }),
      ],
      makePlace(),
    )[0];
    expect(source).toMatchObject({
      id: "S1",
      url: "https://maple.example.org/fire",
      publisher: "maple.example.org",
      tracks: ["funding"],
    });
  });
  it("treats two spellings of one body as one source", () => {
    expect(
      buildEvidence(
        [
          makePage({ text: "Chief  Lee\n\nleads   Maple today." }),
          makePage({
            url: "https://mirror.example.org/",
            text: "Chief Lee leads Maple today.",
          }),
        ],
        [],
        makePlace(),
      ),
    ).toHaveLength(1);
  });
  it("truncates a long publication date and marks an undated page unknown", () => {
    const [dated, undated] = buildEvidence(
      [
        makePage({ publishedAt: `2024-01-01T00:00:00.000Z${"x".repeat(100)}` }),
        makePage({
          url: "https://b.example.org/",
          text: "A different body for the second page here.",
          publishedAt: null,
        }),
      ],
      [],
      makePlace(),
    );
    expect(dated?.publishedAt).toHaveLength(80);
    expect(dated?.dateOrigin).toBe("estimated");
    expect(undated).toMatchObject({ publishedAt: null, dateOrigin: "unknown" });
  });
  it("splits the character budget evenly when every page is long", () => {
    const long = (n: number) =>
      makePage({
        url: `https://p${n}.example.org/`,
        text: Array.from(
          { length: 30 },
          (_, i) => `Engine ${i} of page ${n} ${"y".repeat(400)}`,
        ).join("\n\n"),
      });
    const sources = buildEvidence(
      [long(1), long(2), long(3)],
      [],
      makePlace(),
      {
        maxCharacters: 9_000,
      },
    );
    expect(sources).toHaveLength(3);
    for (const source of sources) {
      expect(source.partial).toBe(true);
      expect(
        source.passages.reduce((n, p) => n + p.text.length, 0),
      ).toBeLessThanOrEqual(3_000);
    }
  });
});
