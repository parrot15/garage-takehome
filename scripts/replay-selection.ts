import { readFileSync } from "node:fs";
import { replaySelection, type SavedLiveRun } from "./saved-runs";

/** Prints the sources current selection would read from a saved run, without provider calls. */
function main(): void {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write("Usage: replay-selection <live-run.json>\n");
    process.exitCode = 2;
    return;
  }
  const replay = replaySelection(
    JSON.parse(readFileSync(file, "utf8")) as SavedLiveRun,
  );
  if (!replay) {
    process.stderr.write("This file is not a completed live run.\n");
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `official host: ${replay.official ?? "none"}; ${replay.candidates.length} candidates -> ${replay.selected.length} selected\n`,
  );
  for (const candidate of replay.selected)
    process.stdout.write(
      `rank ${candidate.rank}  ${candidate.url.slice(0, 96)}  ${JSON.stringify(candidate.tracks)}\n`,
    );
}

// Piping into `head` closes stdout early; that is not an error worth a trace.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});
main();
