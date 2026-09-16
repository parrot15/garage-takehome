import type { Place } from "@/lib/brief/schema";
import type { Candidate, ExtractionFailure } from "./contracts";
import { identityWords, namesPlace } from "./identity";
import { officialHost } from "./queries";
import { canonicalUrl, siteHost } from "./urls";
import { words } from "./words";

/**
 * Pages read per brief: one for each of the fourteen queries' top results,
 * plus three for second pages on the topics that matter most.
 */
export const READ_LIMIT = 17;
/** The listed website is rich but must not crowd out records held elsewhere. */
const OFFICIAL_SHARE = 0.45;

/** Identifies a document independently of scheme and www while preserving query parameters. */
function documentKey(url: string): string {
  const parsed = new URL(url);
  return `${siteHost(url)}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`;
}

/** Tokenizes a candidate's title, search excerpt, and URL for identity matching. */
function candidateWords(candidate: Candidate): string[] {
  return words(`${candidate.title} ${candidate.excerpt} ${candidate.url}`);
}

/**
 * Merges duplicate documents, combining topics and keeping the best rank.
 * Records the discovery position that supplied that rank for later tie-breaking.
 */
function merge(
  candidates: Candidate[],
): { candidate: Candidate; order: number }[] {
  const byKey = new Map<string, { candidate: Candidate; order: number }>();
  candidates.forEach((candidate, order) => {
    const url = canonicalUrl(candidate.url);
    if (!url) return;
    const key = documentKey(url);
    const previous = byKey.get(key);
    byKey.set(
      key,
      previous
        ? {
            candidate: {
              ...previous.candidate,
              // Prefer the secure spelling of a document seen under two schemes.
              url: previous.candidate.url.startsWith("https:")
                ? previous.candidate.url
                : url,
              tracks: [
                ...new Set([...previous.candidate.tracks, ...candidate.tracks]),
              ],
              rank: Math.min(previous.candidate.rank, candidate.rank),
            },
            order:
              candidate.rank < previous.candidate.rank ? order : previous.order,
          }
        : { candidate: { ...candidate, url }, order },
    );
  });
  return [...byKey.values()];
}

/** Returns one candidate per document with merged topics and the best rank. */
function dedupe(candidates: Candidate[]): Candidate[] {
  return merge(candidates).map((entry) => entry.candidate);
}

/**
 * Prioritizes department-matching and official pages by search rank, limiting
 * the listed site's share when alternatives exist.
 */
export function selectCandidates(
  candidates: Candidate[],
  place: Place,
  limit: number,
): Candidate[] {
  const official = officialHost(place);
  const identity = identityWords(place);
  const tier = (candidate: Candidate) =>
    siteHost(candidate.url) === official ||
    namesPlace(candidateWords(candidate), identity)
      ? 0
      : 1;
  const ranked = merge(candidates)
    .map((entry) => ({ ...entry, tier: tier(entry.candidate) }))
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.candidate.rank - b.candidate.rank ||
        a.order - b.order,
    )
    .map((entry) => entry.candidate);
  const officialLimit = Math.ceil(limit * OFFICIAL_SHARE);
  const selected: Candidate[] = [];
  let onSite = 0;
  for (const candidate of ranked) {
    if (selected.length >= limit) break;
    if (siteHost(candidate.url) === official) {
      if (onSite >= officialLimit) continue;
      onSite += 1;
    }
    selected.push(candidate);
  }
  // If the official share left the budget short, fill from the remaining site pages.
  for (const candidate of ranked) {
    if (selected.length >= limit) break;
    if (!selected.includes(candidate)) selected.push(candidate);
  }
  return selected;
}

/**
 * Selects unused candidates for failed topics within the remaining read budget.
 * Skips blocked hosts and prefers hosts without failed reads.
 */
export function selectFallbackCandidates(
  candidates: Candidate[],
  attempted: Candidate[],
  failures: ExtractionFailure[],
  place: Place,
  limit: number,
): Candidate[] {
  if (!failures.length || limit <= 0) return [];
  const attemptedKeys = new Set(
    dedupe(attempted).map((c) => documentKey(c.url)),
  );
  const failedKeys = new Set(failures.map((f) => documentKey(f.url)));
  const failedHosts = new Set(failures.map((f) => siteHost(f.url)));
  const blockedHosts = new Set(
    failures.filter((f) => f.reason === "blocked").map((f) => siteHost(f.url)),
  );
  const identity = identityWords(place);
  const failedTracks = new Set(
    attempted
      .filter((c) => failedKeys.has(documentKey(c.url)))
      .flatMap((c) => c.tracks),
  );
  const priority = (candidate: Candidate) =>
    candidate.tracks.some(
      (track) =>
        failedTracks.has(track) &&
        ["leadership", "fleet", "disposition"].includes(track),
    )
      ? 0
      : 1;
  return dedupe(candidates)
    .filter(
      (c) =>
        !attemptedKeys.has(documentKey(c.url)) &&
        !blockedHosts.has(siteHost(c.url)) &&
        namesPlace(candidateWords(c), identity) &&
        c.tracks.some((track) => failedTracks.has(track)),
    )
    .sort(
      (a, b) =>
        Number(failedHosts.has(siteHost(a.url))) -
          Number(failedHosts.has(siteHost(b.url))) ||
        priority(a) - priority(b) ||
        a.rank - b.rank,
    )
    .slice(0, limit);
}
