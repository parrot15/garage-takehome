import { z } from "zod";
import {
  type DraftBrief,
  type Place,
  type ResearchEvent,
  SourceSchema,
  TRACKS,
  type Track,
} from "@/lib/brief/schema";

const PassageSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().min(1).max(16000),
  /** The enclosing heading supplies context for passages from long documents. */
  locator: z.string().min(1).max(250).nullable(),
});
export type Passage = z.infer<typeof PassageSchema>;
/** Internal research evidence. Extracted text never belongs in a public brief. */
export const EvidenceSourceSchema = SourceSchema.extend({
  retrievedAt: z.string().min(1).max(60),
  partial: z.boolean(),
  tracks: z.array(z.enum(TRACKS)),
  passages: z.array(PassageSchema).max(100),
});
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;

export interface SearchQuery {
  /** A stable name such as "leadership-change", so traces and replays can tell queries apart after their wording changes. */
  id: string;
  track: Track;
  query: string;
  startPublishedDate?: string;
  /** Restrict discovery to these hosts, such as the department's own site. */
  includeDomains?: string[];
  /** Keep these hosts out of open-web discovery, such as profile and directory aggregators. */
  excludeDomains?: string[];
  category?: "news";
  numResults?: number;
}
export interface Candidate {
  url: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
  tracks: Track[];
  rank: number;
}
export interface ExtractedPage {
  url: string;
  title: string;
  text: string;
  publishedAt: string | null;
  retrievedAt: string;
  retrieval: "live" | "unknown";
  truncated: boolean;
}
export interface ExtractionFailure {
  url: string;
  reason: "timeout" | "blocked" | "empty" | "unavailable";
}
export interface ReadResult {
  pages: ExtractedPage[];
  failures: ExtractionFailure[];
}
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  model: string;
}
export interface SynthesisResult {
  draft: DraftBrief;
  usage: ModelUsage;
}
export interface SynthesisInput {
  place: Place;
  sources: EvidenceSource[];
  researchDate: string;
}
/** Signals enforce the shared research deadline and optional read-backfill deadline. */
export interface ResearchProviders {
  resolvePlace(placeId: string, signal: AbortSignal): Promise<Place>;
  search(query: SearchQuery, signal: AbortSignal): Promise<Candidate[]>;
  read(candidates: Candidate[], signal: AbortSignal): Promise<ReadResult>;
  synthesize(
    input: SynthesisInput,
    signal: AbortSignal,
  ): Promise<SynthesisResult>;
}
export type EmitEvent = (event: ResearchEvent) => void;
export interface ResearchLog {
  event: string;
  runId: string;
  [key: string]: string | number | boolean | null | undefined;
}
export type Log = (entry: ResearchLog) => void;
