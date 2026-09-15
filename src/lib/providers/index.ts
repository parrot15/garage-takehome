import "server-only";

import type { ResearchProviders } from "@/lib/research/contracts";
import { createExaProvider } from "./exa";
import { createPlaceResolver } from "./google";
import { createSynthesizer, type SynthesisConfig } from "./openai";

interface ProviderConfig extends SynthesisConfig {
  googlePlacesApiKey: string;
  exaApiKey: string;
  providerTimeoutMs: number;
}

/** Connects Google, Exa, and OpenAI using shared configuration and optional test dependencies. */
export function createProviders(
  config: ProviderConfig,
  dependencies: { fetch?: typeof fetch; now?: () => Date } = {},
): ResearchProviders {
  const fetchImpl = dependencies.fetch ?? fetch;
  const exa = createExaProvider(config, fetchImpl, dependencies.now);
  return {
    resolvePlace: createPlaceResolver(config, fetchImpl, dependencies.now),
    search: exa.search,
    read: exa.read,
    synthesize: createSynthesizer(config, fetchImpl),
  };
}
