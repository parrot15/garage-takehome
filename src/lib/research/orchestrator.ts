import { randomUUID } from "node:crypto";
import {
  type Brief,
  BriefSchema,
  type DraftBrief,
  type Place,
  type ResearchStage,
} from "@/lib/brief/schema";
import { projectBrief, validateDraft } from "@/lib/brief/validate";
import { PROMPT_VERSION } from "@/lib/providers/prompt";
import { ResearchError } from "@/lib/server/errors";
import type {
  Candidate,
  EmitEvent,
  EvidenceSource,
  Log,
  ResearchProviders,
  SearchQuery,
} from "./contracts";
import { buildEvidence } from "./evidence";
import { buildQueries, homepageCandidate } from "./queries";
import {
  READ_LIMIT,
  selectCandidates,
  selectFallbackCandidates,
} from "./selection";

const DEFAULT_LIMITS = {
  totalMs: 220000,
  synthesisReserveMs: 170000,
  readLimit: READ_LIMIT,
  maxEvidenceCharacters: 220000,
};
const BACKFILL_MIN_MS = 15_000;
const BACKFILL_MAX_MS = 25_000;
interface ResearchOptions {
  placeId: string;
  providers: ResearchProviders;
  emit?: EmitEvent;
  now?: () => Date;
  /** Makes the run's deadline signals; a test passes its own to end a run or its recovery on cue. */
  timeout?: (ms: number) => AbortSignal;
  runId?: string;
  log?: Log;
  limits?: Partial<typeof DEFAULT_LIMITS>;
}

/** Creates an empty draft anchored to the selected place. */
function emptyDraft(place: Place): DraftBrief {
  return {
    scope: {
      name: place.name,
      relationship: "selected_place",
      explanation: null,
      references: [],
    },
    department: { kind: "unknown", summary: null, references: [] },
    facts: [],
    callAngles: [],
    questions: [],
  };
}

/** Searches all queries concurrently, retaining successful candidates and reporting failed queries. */
async function searchAll(
  queries: SearchQuery[],
  search: (query: SearchQuery) => Promise<Candidate[]>,
): Promise<{ candidates: Candidate[]; failures: SearchQuery[] }> {
  const outcomes = await Promise.allSettled(
    queries.map((query) => search(query)),
  );
  return {
    candidates: outcomes.flatMap((outcome) =>
      outcome.status === "fulfilled" ? outcome.value : [],
    ),
    failures: queries.filter(
      (_, index) => outcomes[index]?.status === "rejected",
    ),
  };
}

/** What a run is called and when it ran; a replay of its evidence carries its own. */
interface RunIdentity {
  runId: string;
  researchedAt: string;
  durationMs: number;
}

/**
 * Validates a draft and builds a brief with only its cited public sources.
 * Rejects complete citation loss unless the department identity is unresolved.
 */
export function finishBrief(
  draft: DraftBrief,
  sources: EvidenceSource[],
  place: Place,
  run: RunIdentity,
): Brief {
  const validated = validateDraft(draft, sources, place);
  if (
    draft.facts.length > 0 &&
    validated.facts.length === 0 &&
    validated.scope.relationship !== "unresolved"
  )
    throw new ResearchError(
      "We could not establish reliable citations for this brief. Please try again.",
    );
  return BriefSchema.parse({
    ...projectBrief(validated, sources),
    ...run,
    mode: "live",
    place,
  });
}

/**
 * Researches a Place ID through discovery, reading, and synthesis under one deadline.
 * Allows one recovery read batch without spending the reserved synthesis time.
 */
export async function researchDepartment(
  options: ResearchOptions,
): Promise<Brief> {
  const { providers, placeId } = options;
  const started = (options.now ?? (() => new Date()))();
  const startClock = performance.now();
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const timeout = options.timeout ?? ((ms: number) => AbortSignal.timeout(ms));
  const signal = timeout(limits.totalMs);
  const runId = options.runId ?? randomUUID();
  const emit = options.emit ?? (() => {});
  const log = options.log ?? (() => {});
  /** Checks the deadline before emitting and logging progress. */
  const stage = (name: ResearchStage) => {
    signal.throwIfAborted();
    emit({ type: "stage", stage: name });
    log({
      event: name,
      runId,
      elapsedMs: Math.round(performance.now() - startClock),
    });
  };

  stage("resolving");
  const place = await providers.resolvePlace(placeId, signal);
  signal.throwIfAborted();
  emit({ type: "identity", place });

  stage("searching");
  const searches = await searchAll(buildQueries(place, started), (query) =>
    providers.search(query, signal),
  );
  signal.throwIfAborted();
  for (const query of searches.failures)
    log({ event: "search_failed", runId, query: query.id });
  const candidates = [...homepageCandidate(place), ...searches.candidates];
  const selected = selectCandidates(candidates, place, limits.readLimit);
  if (!selected.length && searches.failures.length)
    throw new ResearchError(
      "Search is temporarily unavailable. Please try again.",
    );

  stage("reading");
  const read = selected.length
    ? await providers.read(selected, signal)
    : { pages: [], failures: [] };
  signal.throwIfAborted();
  const fallback = selectFallbackCandidates(
    candidates,
    selected,
    read.failures,
    place,
    limits.readLimit - read.pages.length,
  );
  const remainingMs = limits.totalMs - (performance.now() - startClock);
  const recoveryMs = Math.min(
    BACKFILL_MAX_MS,
    Math.floor(remainingMs - limits.synthesisReserveMs),
  );
  if (fallback.length && recoveryMs >= BACKFILL_MIN_MS) {
    const recoverySignal = AbortSignal.any([signal, timeout(recoveryMs)]);
    selected.push(...fallback);
    try {
      const recovered = await providers.read(fallback, recoverySignal);
      // The provider can retain successful pages when its retry times out.
      // Only the overall deadline invalidates that result.
      signal.throwIfAborted();
      read.pages.push(...recovered.pages);
      read.failures.push(...recovered.failures);
    } catch {
      signal.throwIfAborted();
      // Failed recovery must not erase the evidence already obtained.
      log({ event: "read_backfill_failed", runId });
    }
  }
  const sources = buildEvidence(read.pages, selected, place, {
    maxCharacters: limits.maxEvidenceCharacters,
  });
  log({
    event: "evidence",
    runId,
    candidates: candidates.length,
    selected: selected.length,
    read: sources.length,
    failed: read.failures.length,
  });
  if (selected.length && !sources.length)
    throw new ResearchError(
      "We found possible sources, but could not read enough reliable content to prepare a brief. Please try again.",
    );

  let draft = emptyDraft(place);
  if (sources.length) {
    stage("synthesizing");
    const result = await providers.synthesize(
      { place, sources, researchDate: started.toISOString() },
      signal,
    );
    log({
      event: "synthesis",
      runId,
      promptVersion: PROMPT_VERSION,
      ...result.usage,
    });
    draft = result.draft;
  }

  stage("validating");
  const brief = finishBrief(draft, sources, place, {
    runId,
    researchedAt: started.toISOString(),
    durationMs: Math.round(performance.now() - startClock),
  });
  log({
    event: "complete",
    runId,
    durationMs: brief.durationMs,
    facts: brief.facts.length,
    sources: brief.sources.length,
  });
  return brief;
}
