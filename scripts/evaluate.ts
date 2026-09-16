import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createProviders } from "@/lib/providers";
import { getServerConfig } from "@/lib/server/env";
import { loadReplay, parseOptions, runCase } from "./evaluation";

const HELP = `Live department brief evaluation

Runs the complete Google → Exa → OpenAI workflow with the credentials in
.env.local and saves every discovery result, extraction outcome, synthesis
input, and the final brief under artifacts/evaluations/. Provider charges apply.

  npm run eval -- --case all
  npm run eval -- --case sample1
  npm run eval -- --place-id YOUR_GOOGLE_PLACE_ID
  npm run eval -- --case gold      # every department in evaluation/gold.json
  npm run eval -- --replay artifacts/evaluations/<run>/custom.json

Score a run against the gold set with: npm run score -- artifacts/evaluations/<run>

--replay calls only OpenAI, using the saved synthesis evidence and research date.
Set OPENAI_REASONING_EFFORT=low or medium to compare identical evidence. It still
incurs model charges. New reports preserve the raw draft before validation.

A completed run is not a semantic pass until a person has reviewed each claim
against its cited passages (see README.md).
`;

/** Runs selected evaluations sequentially and saves private reports for review. */
async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }
  const replay = options.replay
    ? { file: options.replay, input: await loadReplay(options.replay) }
    : null;
  try {
    process.loadEnvFile(path.resolve(".env.local"));
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
      throw error;
  }
  const config = getServerConfig();
  const providers = createProviders(config);
  const directory = path.resolve(
    "artifacts/evaluations",
    `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
  );
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let failed = false;
  const cases = replay
    ? [["replay", replay.input.place.id] as const]
    : options.cases;
  for (const [caseId, placeId] of cases) {
    const report = await runCase(caseId, placeId, providers, config, replay);
    await writeFile(
      path.join(directory, `${caseId}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600 },
    );
    failed ||= report.execution === "failed";
    process.stdout.write(
      `${caseId}: ${report.execution}${report.error ? ` (${report.error.message})` : ""}, ${report.durationMs} ms, ${report.output?.facts.length ?? 0} facts, ${report.output?.sources.length ?? 0} sources\n`,
    );
  }
  process.stdout.write(
    `Reports: ${directory}\nHuman review of each claim against its cited passages is still required.\n`,
  );
  if (failed) process.exitCode = 1;
}

main().catch((error: unknown) => {
  // Only argument and configuration errors reach here; provider errors are scrubbed per report.
  process.stderr.write(
    `${error instanceof Error ? error.message : "Evaluation could not start."}\n`,
  );
  process.exitCode = 1;
});
