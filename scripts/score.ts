import { parseArgs } from "node:util";
import { allRunDirectories, baselineScores, scoreRuns } from "./saved-runs";
import {
  formatComparison,
  formatDetails,
  formatSummary,
  formatTable,
} from "./scoring";

const HELP = `Score saved evaluation runs against evaluation/gold.json

  npm run score -- artifacts/evaluations/<run>
  npm run score -- artifacts/evaluations/<run> --baseline artifacts/evaluations/<earlier>
  npm run score                       # newest report per department across every saved run
  npm run score -- <run> --json       # machine-readable scores
  npm run --silent score -- --json > before.json   # save a scorecard to use as a baseline later
  npm run score -- <run> --replays    # also score synthesis-only replays

Each department scores the newest report for its Place ID among the given
directories or files. Replays of saved evidence are skipped unless --replays
is given, because they say nothing about retrieval. --baseline takes a run
directory, a report file, or a scorecard saved with --json. Critical failures (a former chief shown as current,
another organization's apparatus, a sold asset as a reason to call, a wrong
scope, a brief for a non-department) set a non-zero exit
code. The scorer checks presence and labelling, not truth; review claims
against their cited passages before accepting quality improvements.
`;

/** Scores saved runs, prints the requested report, and fails on critical findings. */
function main(): void {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      baseline: { type: "string" },
      json: { type: "boolean", default: false },
      replays: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });
  if (values.help) {
    process.stdout.write(HELP);
    return;
  }
  const scores = scoreRuns(
    positionals.length ? positionals : allRunDirectories(),
    values.replays,
  );
  if (values.json) {
    process.stdout.write(`${JSON.stringify(scores, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatTable(scores)}\n\n`);
    const details = formatDetails(scores);
    if (details) process.stdout.write(`${details}\n\n`);
    process.stdout.write(`${formatSummary(scores)}\n`);
    if (values.baseline)
      process.stdout.write(
        `\nCompared with ${values.baseline}:\n${formatComparison(scores, baselineScores(values.baseline, values.replays))}\n`,
      );
  }
  if (scores.some((item) => item.critical.length)) process.exitCode = 1;
}

try {
  main();
} catch (error: unknown) {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Scoring could not start."}\n`,
  );
  process.exitCode = 1;
}
