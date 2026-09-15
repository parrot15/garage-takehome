import "server-only";

import { z } from "zod";
import { ResearchError } from "./errors";

const nonempty = z.string().trim().min(1);
/** Builds a bounded integer timeout schema with a default for unset values. */
const milliseconds = (min: number, max: number, fallback: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const schema = z.object({
  googlePlacesApiKey: nonempty,
  exaApiKey: nonempty,
  openaiApiKey: nonempty,
  openaiModel: nonempty.default("gpt-6-astra"),
  reasoningEffort: z.enum(["low", "medium", "high"]).default("low"),
  providerTimeoutMs: milliseconds(1000, 60000, 25000),
  modelTimeoutMs: milliseconds(10000, 120000, 90000),
  researchTimeoutMs: milliseconds(30000, 180000, 150000),
});
export type ServerConfig = z.infer<typeof schema>;

/** The environment variable behind each setting. */
const VARIABLES = {
  googlePlacesApiKey: "GOOGLE_PLACES_API_KEY",
  exaApiKey: "EXA_API_KEY",
  openaiApiKey: "OPENAI_API_KEY",
  openaiModel: "OPENAI_MODEL",
  reasoningEffort: "OPENAI_REASONING_EFFORT",
  providerTimeoutMs: "PROVIDER_TIMEOUT_MS",
  modelTimeoutMs: "MODEL_TIMEOUT_MS",
  researchTimeoutMs: "RESEARCH_TIMEOUT_MS",
} satisfies Record<keyof ServerConfig, string>;

type Environment = Readonly<Record<string, string | undefined>>;

/** Rejects invalid configuration without exposing settings or credentials. */
function notConfigured(): never {
  throw new ResearchError(
    "Research is not configured yet. Please try again once the service is ready.",
    { status: 503, retryable: false },
  );
}

/**
 * Validates server environment settings and applies defaults to unset or blank values.
 * Throws a public configuration error when credentials or settings are invalid.
 */
export function getServerConfig(
  environment: Environment = process.env,
): ServerConfig {
  const settings = Object.fromEntries(
    Object.entries(VARIABLES).map(([setting, variable]) => [
      setting,
      // Blank counts as unset, so a default can apply.
      environment[variable]?.trim() || undefined,
    ]),
  );
  const result = schema.safeParse(settings);
  return result.success ? result.data : notConfigured();
}
