import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Brief, Place } from "@/lib/brief/schema";
import type { Candidate, SearchQuery } from "@/lib/research/contracts";
import {
  buildQueries,
  homepageCandidate,
  officialHost,
} from "@/lib/research/queries";
import { READ_LIMIT, selectCandidates } from "@/lib/research/selection";
import { type GoldDepartment, loadGold } from "./gold";
import { type Report, ReportSchema } from "./report";
import { type Score, ScoreSchema, scoreReport } from "./scoring";

export interface LoadedReport {
  file: string;
  report: Report;
}

/** Lists a report path or the JSON files directly inside a directory. */
export function reportFiles(input: string): string[] {
  const resolved = path.resolve(input);
  if (!statSync(resolved).isDirectory()) return [resolved];
  return readdirSync(resolved)
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(resolved, name));
}

/** Loads valid reports, excluding synthesis replays unless requested. */
export function loadReports(
  inputs: string[],
  replays: boolean,
): LoadedReport[] {
  const loaded: LoadedReport[] = [];
  for (const file of inputs.flatMap(reportFiles)) {
    let value: unknown;
    try {
      value = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    const parsed = ReportSchema.safeParse(value);
    if (parsed.success && (replays || !parsed.data.replayOf))
      loaded.push({ file, report: parsed.data });
  }
  return loaded;
}

/** Selects the newest report per Place ID so each department is scored once. */
export function latestByPlace(
  loaded: LoadedReport[],
): Map<string, LoadedReport> {
  const latest = new Map<string, LoadedReport>();
  for (const entry of loaded) {
    const key = entry.report.input.placeId;
    const previous = latest.get(key);
    if (!previous || entry.report.startedAt > previous.report.startedAt)
      latest.set(key, entry);
  }
  return latest;
}

/** Lists saved run directories, returning an empty list when they cannot be read. */
export function allRunDirectories(
  root = path.resolve("artifacts/evaluations"),
): string[] {
  try {
    return readdirSync(root)
      .map((name) => path.join(root, name))
      .filter((directory) => statSync(directory).isDirectory());
  } catch {
    return [];
  }
}

/** Scores each gold department using its newest report among the supplied paths. */
export function scoreRuns(
  inputs: string[],
  replays: boolean,
  gold: GoldDepartment[] = loadGold().departments,
): Score[] {
  const latest = latestByPlace(loadReports(inputs, replays));
  return gold.map((department) => {
    const entry = latest.get(department.placeId);
    return scoreReport(
      department,
      entry?.report ?? null,
      entry ? path.relative(process.cwd(), entry.file) : null,
    );
  });
}

/** Loads a saved scorecard or scores the reports at the supplied path. */
export function baselineScores(
  input: string,
  replays: boolean,
  gold?: GoldDepartment[],
): Score[] {
  const resolved = path.resolve(input);
  if (!statSync(resolved).isDirectory()) {
    let value: unknown = null;
    try {
      value = JSON.parse(readFileSync(resolved, "utf8"));
    } catch {
      value = null;
    }
    const saved = z.array(ScoreSchema).safeParse(value);
    if (saved.success) return saved.data;
  }
  return scoreRuns([input], replays, gold);
}

/** A live run as the evaluation script saved it: its brief and its discovery results. */
export interface SavedLiveRun {
  output: Brief | null;
  input: { searches?: { query: SearchQuery; candidates: Candidate[] }[] };
}

export interface SelectionReplay {
  place: Place;
  official: string | null;
  /** Discovery results in production order: the listed website, then each query's results. */
  candidates: Candidate[];
  /** What the current selection would read from them. */
  selected: Candidate[];
}

/**
 * Applies current source selection to saved discoveries without provider calls.
 * Restores query order by stable ID or older query text, placing obsolete queries last.
 */
export function replaySelection(run: SavedLiveRun): SelectionReplay | null {
  if (!run.output || !run.input.searches) return null;
  const place = run.output.place;
  const order = buildQueries(place, new Date(run.output.researchedAt));
  const position = (query: SearchQuery) => {
    const index = order.findIndex((expected) =>
      query.id
        ? expected.id === query.id
        : expected.track === query.track && expected.query === query.query,
    );
    return index >= 0 ? index : order.length;
  };
  const candidates = [
    ...homepageCandidate(place),
    ...[...run.input.searches]
      .sort((a, b) => position(a.query) - position(b.query))
      .flatMap((search) => search.candidates),
  ];
  return {
    place,
    official: officialHost(place),
    candidates,
    selected: selectCandidates(candidates, place, READ_LIMIT),
  };
}
