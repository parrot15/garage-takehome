import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";
import { DraftBriefSchema } from "@/lib/brief/schema";
import type { SynthesisInput, SynthesisResult } from "@/lib/research/contracts";
import { ResearchError } from "@/lib/server/errors";
import { ProviderHttpError, providerFailure } from "./http";
import { PROMPT_VERSION, SYNTHESIS_INSTRUCTIONS } from "./prompt";

const INVALID_BRIEF =
  "The research model returned a brief that could not be validated. Please try again.";

export interface SynthesisConfig {
  openaiApiKey: string;
  openaiModel: string;
  reasoningEffort: "low" | "medium" | "high";
  modelTimeoutMs: number;
}

/** Creates an OpenAI synthesizer that checks the draft schema and reports token usage. */
export function createSynthesizer(
  config: SynthesisConfig,
  fetchImpl: typeof fetch,
) {
  // The SDK owns the per-attempt deadline and one retry with Retry-After handling.
  const client = new OpenAI({
    apiKey: config.openaiApiKey,
    fetch: fetchImpl,
    maxRetries: 1,
    timeout: config.modelTimeoutMs,
  });
  return async (
    input: SynthesisInput,
    signal: AbortSignal,
  ): Promise<SynthesisResult> => {
    signal.throwIfAborted();
    try {
      const response = await client.responses.parse(
        {
          model: config.openaiModel,
          reasoning: { effort: config.reasoningEffort },
          store: false,
          max_output_tokens: 16_000,
          truncation: "disabled",
          metadata: { prompt_version: PROMPT_VERSION },
          instructions: SYNTHESIS_INSTRUCTIONS,
          input: JSON.stringify({
            research_date: input.researchDate,
            selected_place: input.place,
            evidence_sources: input.sources,
          }),
          text: {
            format: zodTextFormat(DraftBriefSchema, "department_brief"),
          },
        },
        { signal },
      );
      if (response.status !== "completed") {
        throw new ResearchError(
          "The brief could not be completed within the research limits. Please try again.",
        );
      }
      const refused = response.output.some(
        (item) =>
          item.type === "message" &&
          item.content.some((content) => content.type === "refusal"),
      );
      if (refused) {
        throw new ResearchError(
          "The research model could not prepare a brief from these sources. Please try another department.",
          { retryable: false },
        );
      }
      const draft = DraftBriefSchema.safeParse(response.output_parsed);
      if (!draft.success) throw new ResearchError(INVALID_BRIEF);
      return {
        draft: draft.data,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
          model: response.model,
        },
      };
    } catch (error) {
      signal.throwIfAborted();
      // The SDK's parser can fail before returning a response object.
      if (error instanceof SyntaxError || error instanceof ZodError) {
        throw new ResearchError(INVALID_BRIEF);
      }
      if (error instanceof OpenAI.APIConnectionTimeoutError) {
        throw new ResearchError(
          "The research model took too long to write this brief. Please try again.",
        );
      }
      if (error instanceof OpenAI.APIError && error.status !== undefined) {
        return providerFailure(
          new ProviderHttpError(error.status),
          "The research model",
        );
      }
      return providerFailure(error, "The research model");
    }
  };
}
