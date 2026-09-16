import { z } from "zod";
import {
  BriefSchema,
  type DraftBrief,
  PublicErrorSchema,
} from "@/lib/brief/schema";
import type {
  Candidate,
  ExtractionFailure,
  ModelUsage,
  ResearchLog,
  SearchQuery,
  SynthesisInput,
} from "@/lib/research/contracts";
import type { ServerConfig } from "@/lib/server/env";

/** What one live run recorded of its providers' work, for replay and offline analysis. */
interface Trace {
  placeId: string;
  searches: { query: SearchQuery; candidates: Candidate[] }[];
  reads: {
    candidates: Candidate[];
    returnedUrls: string[];
    failures: ExtractionFailure[];
  }[];
  syntheses: SynthesisInput[];
}

/** Validates the configuration, timing, outcome, and brief fields used by offline scoring. */
export const ReportSchema = z.object({
  caseId: z.string(),
  startedAt: z.string(),
  durationMs: z.number(),
  promptVersion: z.string(),
  configuredModel: z.string(),
  reasoningEffort: z.enum(["low", "medium", "high"]) satisfies z.ZodType<
    ServerConfig["reasoningEffort"]
  >,
  modelTimeoutMs: z.number(),
  providerTimeoutMs: z.number(),
  researchTimeoutMs: z.number(),
  modelDurationMs: z.number(),
  replayOf: z.string().nullable(),
  execution: z.enum(["completed", "failed"]),
  error: PublicErrorSchema.nullable(),
  input: z.object({ placeId: z.string() }),
  output: BriefSchema.nullable(),
});
export type Report = z.infer<typeof ReportSchema>;

/** Extends the scored report with provider traces, raw drafts, usage, and research events. */
export interface EvaluationReport extends Report {
  input: Trace;
  usage: ModelUsage[];
  rawDrafts: DraftBrief[];
  events: ResearchLog[];
}
