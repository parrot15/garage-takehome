import "server-only";

import { z } from "zod";
import type {
  Candidate,
  ExtractedPage,
  ExtractionFailure,
  ReadResult,
  SearchQuery,
} from "@/lib/research/contracts";
import { canonicalUrl, safeLinkUrl, siteHost } from "@/lib/research/urls";
import { words } from "@/lib/research/words";
import { ResearchError } from "@/lib/server/errors";
import { isTransientStatus, providerFailure, requestJson } from "./http";

const MAX_PAGE_CHARACTERS = 500_000;
const DEFAULT_RESULTS = 6;
const MAX_RESULTS = 10;
const ResultSchema = z.object({
  id: z.string().optional(),
  url: z.string(),
  title: z.string().nullish(),
  publishedDate: z.string().nullish(),
  text: z.string().nullish(),
  highlights: z.array(z.string()).nullish(),
});
const StatusSchema = z.object({
  id: z.string(),
  status: z.string(),
  source: z.string().optional(),
  error: z
    .object({
      tag: z.string().optional(),
      httpStatusCode: z.number().nullable().optional(),
    })
    .nullish(),
});
const EnvelopeSchema = z.object({
  results: z.array(ResultSchema),
  statuses: z.array(StatusSchema).optional(),
});
type Status = z.infer<typeof StatusSchema>;
/** Live asks Exa to crawl the page now; cache accepts only a copy it already holds. */
type ReadMode = "live" | "cache";

/** Validates Exa's response structure before its results and statuses are used. */
function parseEnvelope(response: unknown) {
  const parsed = EnvelopeSchema.safeParse(response);
  if (!parsed.success) {
    throw new ResearchError(
      "The search provider returned an unreadable response. Please try again.",
    );
  }
  return parsed.data;
}

/** Keeps a parseable publication date within the metadata length limit. */
function publicationDate(value: string | null | undefined): string | null {
  return value && value.length <= 80 && Number.isFinite(Date.parse(value))
    ? value
    : null;
}

/** Maps an Exa page failure to the reason recorded in research traces. */
function failureReason(status: Status): ExtractionFailure["reason"] {
  if (status.error?.tag?.includes("TIMEOUT")) return "timeout";
  if (
    status.error?.httpStatusCode === 403 ||
    status.error?.tag === "SOURCE_NOT_AVAILABLE"
  ) {
    return "blocked";
  }
  return "unavailable";
}

/** Identifies crawl failures eligible for one live retry. */
function transientCrawlFailure(status: Status): boolean {
  const code = status.error?.httpStatusCode;
  const tag = status.error?.tag ?? "";
  return code != null
    ? isTransientStatus(code)
    : tag.includes("TIMEOUT") || tag.includes("UNKNOWN");
}

/** Identifies missing or removed pages that should not use a cached copy. */
function gone(status: Status): boolean {
  const code = status.error?.httpStatusCode;
  return (
    code === 404 ||
    code === 410 ||
    (status.error?.tag ?? "").includes("NOT_FOUND")
  );
}

/** How a page that refused the crawler begins, in place of the page. */
const REFUSAL_HEADINGS = [
  "access denied",
  "403 forbidden",
  "404 not found",
  "page not found",
  "just a moment",
  "verify you are human",
  "verify that you are human",
  "attention required cloudflare",
].map(words);

/** Detects access-denied and missing-page headings at the start of extracted text. */
function refusal(text: string): boolean {
  const head = words(text.slice(0, 200));
  return REFUSAL_HEADINGS.some((heading) =>
    heading.every((word, index) => head[index] === word),
  );
}

/** Classifies empty responses and pages containing refusal messages. */
function unusableText(text: string, title: string): "empty" | "blocked" | null {
  if (text.trim().length < 20) return "empty";
  return refusal(title) || (text.length < 4_000 && refusal(text))
    ? "blocked"
    : null;
}

/** Matches response URLs to requested pages after canonicalization. */
function sameUrl(left: string | undefined, right: string): boolean {
  return Boolean(left && canonicalUrl(left) === canonicalUrl(right));
}

/** Creates Exa search and page-reading methods with bounded retries and cache recovery. */
export function createExaProvider(
  config: { exaApiKey: string; providerTimeoutMs: number },
  fetchImpl: typeof fetch,
  now: () => Date = () => new Date(),
) {
  /** Sends an authenticated JSON request within the provider deadline. */
  const post = (path: string, body: unknown, signal: AbortSignal) =>
    requestJson(fetchImpl, {
      url: `https://api.exa.ai/${path}`,
      init: {
        method: "POST",
        headers: {
          "x-api-key": config.exaApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      signal,
      timeoutMs: config.providerTimeoutMs,
    });

  /** Discovers candidate pages; search highlights guide selection but never serve as evidence. */
  async function search(
    query: SearchQuery,
    signal: AbortSignal,
  ): Promise<Candidate[]> {
    const results = Math.min(
      MAX_RESULTS,
      Math.max(1, query.numResults ?? DEFAULT_RESULTS),
    );
    try {
      const response = parseEnvelope(
        await post(
          "search",
          {
            query: query.query,
            type: "auto",
            numResults: results,
            startPublishedDate: query.startPublishedDate,
            includeDomains: query.includeDomains,
            excludeDomains: query.excludeDomains,
            category: query.category,
            // Discovery only. The evidence registry accepts separately fetched text.
            contents: { highlights: true, text: false },
          },
          signal,
        ),
      );
      return response.results.slice(0, results).flatMap((result, rank) => {
        const url = safeLinkUrl(result.url);
        return url
          ? [
              {
                url,
                title: result.title?.trim().slice(0, 500) || siteHost(url),
                excerpt: (result.highlights?.join("\n") ?? "").slice(0, 2_000),
                publishedAt: publicationDate(result.publishedDate),
                tracks: [query.track],
                rank,
              },
            ]
          : [];
      });
    } catch (error) {
      return providerFailure(error, "Web search");
    }
  }

  /**
   * Requests page text in live or cache mode, keyed by the requested URL.
   * Tracks failures eligible for another crawl or cache recovery.
   */
  async function fetchPages(
    batch: Candidate[],
    signal: AbortSignal,
    mode: ReadMode,
  ) {
    const response = parseEnvelope(
      await post(
        "contents",
        {
          urls: batch.map((candidate) => candidate.url),
          ...(mode === "live"
            ? {
                maxAgeHours: 0,
                livecrawlTimeout: Math.min(15_000, config.providerTimeoutMs),
              }
            : { maxAgeHours: -1 }),
          text: { verbosity: "full", maxCharacters: MAX_PAGE_CHARACTERS },
          // No provider summaries or query snippets may become source evidence.
          highlights: false,
        },
        signal,
      ),
    );
    const pages = new Map<string, ExtractedPage>();
    const failures = new Map<string, ExtractionFailure>();
    const retry: Candidate[] = [];
    const stale: Candidate[] = [];
    for (const candidate of batch) {
      const fail = (reason: ExtractionFailure["reason"], cacheable = true) => {
        failures.set(candidate.url, { url: candidate.url, reason });
        if (mode === "live" && cacheable) stale.push(candidate);
      };
      const status = response.statuses?.find((item) =>
        sameUrl(item.id, candidate.url),
      );
      const result = response.results.find(
        (item) =>
          sameUrl(item.id, candidate.url) || sameUrl(item.url, candidate.url),
      );
      const freshness = status?.source?.toLowerCase() ?? "";
      if (status && status.status !== "success") {
        fail(failureReason(status), !gone(status));
        if (mode === "live" && transientCrawlFailure(status))
          retry.push(candidate);
        continue;
      }
      if (!result) {
        fail("unavailable");
        continue;
      }
      const text = result.text?.trim() ?? "";
      const title = result.title?.trim().slice(0, 500) || candidate.title;
      const unusable = unusableText(text, title);
      if (unusable) {
        fail(unusable);
        continue;
      }
      pages.set(candidate.url, {
        // Keep the requested link to preserve exact query/track joins on redirects.
        url: candidate.url,
        title,
        text: text.slice(0, MAX_PAGE_CHARACTERS),
        publishedAt: publicationDate(result.publishedDate),
        retrievedAt: now().toISOString(),
        // A stored copy, whether served unasked or on the fallback, has no known crawl date.
        retrieval:
          mode === "live" &&
          ["live", "livecrawl", "crawled"].includes(freshness)
            ? "live"
            : "unknown",
        truncated: text.length >= MAX_PAGE_CHARACTERS,
      });
    }
    return { pages, failures, retry, stale };
  }

  /** Reads candidate pages, preserving successes through live retries and cache recovery. */
  async function read(
    candidates: Candidate[],
    signal: AbortSignal,
  ): Promise<ReadResult> {
    if (candidates.length === 0) return { pages: [], failures: [] };
    try {
      const { pages, failures, retry, stale } = await fetchPages(
        candidates,
        signal,
        "live",
      );
      const pending = new Map(
        stale.map((candidate) => [candidate.url, candidate]),
      );
      if (retry.length) {
        // A failed second request cannot erase the pages the first one returned.
        const again = await fetchPages(retry, signal, "live").catch(() => null);
        for (const [url, page] of again?.pages ?? []) {
          pages.set(url, page);
          failures.delete(url);
          pending.delete(url);
        }
        for (const [url, failure] of again?.failures ?? []) {
          failures.set(url, failure);
          if (!again?.stale.some((candidate) => candidate.url === url))
            pending.delete(url);
        }
      }
      if (pending.size) {
        // Official sites that refuse crawlers hold what the AE needs most, so
        // pages that still failed get one request for Exa's stored copy. The
        // copy is labelled freshness unknown; a failed cache request changes nothing.
        const cached = await fetchPages(
          [...pending.values()],
          signal,
          "cache",
        ).catch(() => null);
        for (const [url, page] of cached?.pages ?? []) {
          pages.set(url, page);
          failures.delete(url);
        }
      }
      return { pages: [...pages.values()], failures: [...failures.values()] };
    } catch (error) {
      return providerFailure(error, "Source retrieval");
    }
  }

  return { search, read };
}
