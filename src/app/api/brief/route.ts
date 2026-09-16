import { createProviders } from "@/lib/providers";
import { createBriefHandler } from "@/lib/server/brief-handler";
import { getServerConfig } from "@/lib/server/env";

export const runtime = "nodejs";
export const maxDuration = 240;
/** Streams a researched brief using the configured providers and structured server logging. */
export const POST = createBriefHandler({
  getConfig: getServerConfig,
  createProviders,
  log: (entry) => console.info(JSON.stringify(entry)),
});
