import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { PlaceSchema, parseBriefRequest } from "@/lib/brief/schema";
import { PROMPT_VERSION } from "@/lib/providers/prompt";
import {
  EvidenceSourceSchema,
  type ResearchProviders,
  type SynthesisInput,
} from "@/lib/research/contracts";
import { finishBrief, researchDepartment } from "@/lib/research/orchestrator";
import { SAMPLE_PLACE_IDS } from "@/lib/sample";
import type { ServerConfig } from "@/lib/server/env";
import { publicError } from "@/lib/server/errors";
import { type GoldDepartment, loadGold } from "./gold";
import type { EvaluationReport } from "./report";

/** sample1 and sample2 name the supplied Place IDs in order. */
export const SAMPLE_CASES = new Map(
  SAMPLE_PLACE_IDS.map((placeId, index): [string, string] => [
    `sample${index + 1}`,
    placeId,
  ]),
);

/** A case to run: what its report is called, and the Place ID it researches. */
export type EvaluationCase = [caseId: string, placeId: string];

/** Resolves the requested sample or gold cases; `all` selects both samples. */
export function resolveCases(
  selection: string | undefined,
  gold: GoldDepartment[] = loadGold().departments,
): EvaluationCase[] {
  const goldCases = new Map(
    gold.map((department) => [department.id, department.placeId] as const),
  );
  if (!selection || selection === "all") return [...SAMPLE_CASES];
  if (selection === "gold") return [...goldCases];
  const sample = SAMPLE_CASES.get(selection);
  if (sample) return [[selection, sample]];
  const place = goldCases.get(selection);
  if (place) return [[selection, place]];
  throw new Error(
    `Unknown case: ${selection}. Use sample1, sample2, all, gold, a gold id (${[...goldCases.keys()].join(", ")}), or --place-id.`,
  );
}

export interface EvaluationOptions {
  cases: EvaluationCase[];
  /** The report file whose saved synthesis input to replay, resolved. */
  replay: string | null;
  help: boolean;
}

/** Parses case selection, custom Place IDs, or an exclusive synthesis replay. */
export function parseOptions(
  args: string[],
  gold?: GoldDepartment[],
): EvaluationOptions {
  const { values } = parseArgs({
    args,
    options: {
      case: { type: "string" },
      "place-id": { type: "string" },
      replay: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.replay !== undefined) {
    if (values.case !== undefined || values["place-id"] !== undefined)
      throw new Error("Use --replay without --case or --place-id.");
    return {
      cases: [],
      replay: path.resolve(values.replay),
      help: values.help,
    };
  }
  if (values["place-id"] !== undefined) {
    const request = parseBriefRequest({ placeId: values["place-id"] });
    if (!request.ok) throw new Error(`--place-id: ${request.message}`);
    return {
      cases: [["custom", request.placeId]],
      replay: null,
      help: values.help,
    };
  }
  return {
    cases: resolveCases(values.case, gold),
    replay: null,
    help: values.help,
  };
}

const ReplayReportSchema = z.object({
  input: z.object({
    syntheses: z
      .array(
        z.object({
          place: PlaceSchema,
          sources: z.array(EvidenceSourceSchema).min(1),
          researchDate: z.iso.datetime(),
        }),
      )
      .min(1),
  }),
});

/** Loads the first saved synthesis input with its original evidence and research date. */
export async function loadReplay(file: string): Promise<SynthesisInput> {
  const contents = await readFile(file, "utf8");
  let report: unknown;
  try {
    report = JSON.parse(contents);
  } catch {
    throw new Error("Replay report must contain valid JSON.");
  }
  const parsed = ReplayReportSchema.safeParse(report);
  const [synthesis] = parsed.success ? parsed.data.input.syntheses : [];
  if (!synthesis)
    throw new Error(
      "Replay requires a report containing saved synthesis input.",
    );
  // Run the same original evidence even if the saved run timed out at synthesis.
  return synthesis;
}

/**
 * Runs live research or replays synthesis, recording evidence, drafts, usage, and failures.
 * Preserves uncited input passages and raw drafts for offline review.
 */
export async function runCase(
  caseId: string,
  placeId: string,
  providers: ResearchProviders,
  config: ServerConfig,
  replay: { file: string; input: SynthesisInput } | null = null,
): Promise<EvaluationReport> {
  const report: EvaluationReport = {
    caseId,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    promptVersion: PROMPT_VERSION,
    configuredModel: config.openaiModel,
    reasoningEffort: config.reasoningEffort,
    modelTimeoutMs: config.modelTimeoutMs,
    providerTimeoutMs: config.providerTimeoutMs,
    researchTimeoutMs: config.researchTimeoutMs,
    modelDurationMs: 0,
    replayOf: replay?.file ?? null,
    execution: "failed",
    error: null,
    usage: [],
    rawDrafts: [],
    input: { placeId, searches: [], reads: [], syntheses: [] },
    output: null,
    events: [],
  };
  const { input } = report;
  const started = performance.now();
  /** Records model input, raw output, usage, and elapsed time around synthesis. */
  const synthesize: ResearchProviders["synthesize"] = async (
    evidence,
    signal,
  ) => {
    input.syntheses.push(structuredClone(evidence));
    const modelStarted = performance.now();
    try {
      const result = await providers.synthesize(evidence, signal);
      report.usage.push(result.usage);
      report.rawDrafts.push(structuredClone(result.draft));
      return result;
    } finally {
      report.modelDurationMs += Math.round(performance.now() - modelStarted);
    }
  };
  try {
    if (replay) {
      const { place, sources, researchDate } = replay.input;
      const result = await synthesize(
        replay.input,
        AbortSignal.timeout(config.researchTimeoutMs),
      );
      report.output = finishBrief(result.draft, sources, place, {
        runId: randomUUID(),
        researchedAt: researchDate,
        durationMs: Math.round(performance.now() - started),
      });
    } else {
      report.output = await researchDepartment({
        placeId,
        providers: {
          ...providers,
          async search(query, signal) {
            const candidates = await providers.search(query, signal);
            input.searches.push(structuredClone({ query, candidates }));
            return candidates;
          },
          async read(candidates, signal) {
            const result = await providers.read(candidates, signal);
            input.reads.push(
              structuredClone({
                candidates,
                returnedUrls: result.pages.map((page) => page.url),
                failures: result.failures,
              }),
            );
            return result;
          },
          synthesize,
        },
        limits: {
          totalMs: config.researchTimeoutMs,
          synthesisReserveMs: config.modelTimeoutMs,
        },
        log: (entry) => report.events.push(entry),
      });
    }
    report.execution = "completed";
  } catch (error) {
    report.error = publicError(error);
  }
  report.durationMs = Math.round(performance.now() - started);
  return report;
}
