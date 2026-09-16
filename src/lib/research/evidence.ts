import type { Place } from "@/lib/brief/schema";
import type {
  Candidate,
  EvidenceSource,
  ExtractedPage,
  Passage,
} from "./contracts";
import { identityWords, namesPlace } from "./identity";
import { canonicalUrl, siteHost } from "./urls";
import { words } from "./words";

interface Block {
  text: string;
  locator: string | null;
}
interface EvidenceOptions {
  maxCharacters?: number;
}
/** Keep neighbouring paragraphs together so research preserves their context. */
const PASSAGE_TARGET = 1_200;
const PASSAGE_MAX = 4_000;
/** Room for a roster or an annual report to arrive whole; a city budget is still trimmed. */
const SOURCE_MAX = 60_000;
const SOURCE_PASSAGES = 100;
/**
 * Words that mark a passage of a long document as being about a fire
 * department's people, apparatus, or money. Each distinct word counts once.
 * "Fire" is left out on purpose: it is in every passage of such a document
 * and would decide nothing.
 */
const TOPIC_WORDS = {
  people: ["chief", "officer", "officers", "president"],
  apparatus: [
    "apparatus",
    "engine",
    "engines",
    "pumper",
    "pumpers",
    "ladder",
    "aerial",
    "tanker",
    "tender",
    "brush",
    "ambulance",
    "truck",
    "trucks",
    "vehicle",
    "vehicles",
    "fleet",
  ],
  money: [
    "grant",
    "grants",
    "budget",
    "bond",
    "surplus",
    "auction",
    "bid",
    "bids",
    "sale",
    "sold",
    "listed",
    "delivered",
    "replace",
    "replaced",
    "replacement",
    "retired",
    "purchase",
    "purchased",
    "purchasing",
  ],
};
const TOPIC = new Set(Object.values(TOPIC_WORDS).flat());

/** Splits oversized paragraphs, preferring sentence or line boundaries. */
function pieces(paragraph: string): string[] {
  const out: string[] = [];
  let rest = paragraph;
  while (rest.length > PASSAGE_MAX) {
    const window = rest.slice(0, PASSAGE_MAX);
    const boundary = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("\n"),
    );
    const end = boundary > PASSAGE_MAX / 2 ? boundary + 1 : PASSAGE_MAX;
    out.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  out.push(rest);
  return out;
}

/** Groups neighbouring paragraphs into passages with their enclosing headings. */
export function splitPassages(text: string): Block[] {
  const blocks: Block[] = [];
  let heading: string | null = null;
  let current: Block | null = null;
  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const title = paragraph.match(/^#{1,6}\s+(.+)$/m)?.[1];
    if (title) {
      if (current) blocks.push(current);
      current = null;
      heading = title.slice(0, 250);
    }
    for (const piece of pieces(paragraph)) {
      if (current && current.text.length + piece.length > PASSAGE_TARGET) {
        blocks.push(current);
        current = null;
      }
      current = current
        ? { locator: current.locator, text: `${current.text}\n\n${piece}` }
        : { text: piece, locator: heading };
    }
  }
  if (current) blocks.push(current);
  return blocks
    .map((block) => ({ ...block, text: block.text.trim() }))
    .filter((block) => block.text);
}

/** Scores passages by distinct topic words and matching department identity. */
function score(block: Block, identity: string[]): number {
  const text = words(block.text);
  const topics = new Set(text.filter((word) => TOPIC.has(word)));
  return topics.size + (namesPlace(text, identity) ? 3 : 0);
}

/** Distributes the character budget across pages, reallocating unused room from short pages. */
function shares(needs: number[], total: number): number[] {
  const order = needs
    .map((need, index) => ({ need: Math.min(need, SOURCE_MAX), index }))
    .sort((a, b) => a.need - b.need);
  const result = new Array<number>(needs.length).fill(0);
  let remaining = total;
  order.forEach(({ need, index }, position) => {
    const share = Math.min(
      need,
      Math.floor(remaining / (order.length - position)),
    );
    result[index] = share;
    remaining -= share;
  });
  return result;
}

/** Keeps a whole page when it fits, otherwise selects relevant passages in document order. */
export function choosePassages(
  blocks: Block[],
  place: Place,
  budget: number,
): { blocks: Block[]; partial: boolean } {
  const total = blocks.reduce((sum, block) => sum + block.text.length, 0);
  if (total <= budget && blocks.length <= SOURCE_PASSAGES)
    return { blocks, partial: false };
  const chosen = new Set<Block>();
  let used = 0;
  const identity = identityWords(place);
  const ranked = blocks
    .map((block) => ({ block, score: score(block, identity) }))
    .sort((a, b) => b.score - a.score);
  for (const { block, score: relevance } of ranked) {
    // Once every passage on topic is in, filler from the document's start adds nothing.
    if (relevance === 0 && chosen.size) break;
    if (chosen.size >= SOURCE_PASSAGES || used + block.text.length > budget)
      continue;
    chosen.add(block);
    used += block.text.length;
  }
  return { blocks: blocks.filter((block) => chosen.has(block)), partial: true };
}

/** Builds bounded evidence sources with passage IDs, deduplicated text, and retrieval metadata. */
export function buildEvidence(
  pages: ExtractedPage[],
  candidates: Candidate[],
  place: Place,
  options: EvidenceOptions = {},
): EvidenceSource[] {
  const maxCharacters = options.maxCharacters ?? 140_000;
  const byUrl = new Map(candidates.map((c) => [canonicalUrl(c.url), c]));
  const seen = new Set<string>();
  const usable = pages.filter((page) => {
    // A mirror or a second spelling of one document must not become two sources.
    const body = page.text.replace(/\s+/g, " ").trim();
    if (!canonicalUrl(page.url) || body.length < 20 || seen.has(body))
      return false;
    seen.add(body);
    return true;
  });
  const budgets = shares(
    usable.map((page) => page.text.length),
    maxCharacters,
  );
  const sources: EvidenceSource[] = [];
  for (const [index, page] of usable.entries()) {
    const url = canonicalUrl(page.url);
    if (!url) continue;
    const { blocks, partial } = choosePassages(
      splitPassages(page.text),
      place,
      budgets[index] ?? 0,
    );
    if (!blocks.length) continue;
    const id = `S${sources.length + 1}`;
    const passages: Passage[] = blocks.map((block, position) => ({
      id: `${id}:P${position + 1}`,
      text: block.text,
      locator: block.locator,
    }));
    const candidate = byUrl.get(url);
    sources.push({
      id,
      url,
      title: (page.title || candidate?.title || siteHost(url)).slice(0, 500),
      publisher: siteHost(url),
      publishedAt: page.publishedAt?.slice(0, 80) ?? null,
      dateOrigin: page.publishedAt ? "estimated" : "unknown",
      retrievedAt: page.retrievedAt,
      retrieval: page.retrieval,
      partial: page.truncated || partial,
      tracks: candidate?.tracks ?? [],
      passages,
    });
  }
  return sources;
}
