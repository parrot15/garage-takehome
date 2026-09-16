import { z } from "zod";
import type { Brief, Fact } from "@/lib/brief/schema";
import { hasPhrase, words } from "@/lib/research/words";
import type { GoldDepartment } from "./gold";
import type { Report } from "./report";

const ChiefStateSchema = z.enum(["current", "historical", "missing", "n/a"]);
type ChiefState = z.infer<typeof ChiefStateSchema>;
const TallySchema = z.object({
  found: z.number(),
  total: z.number(),
  missing: z.array(z.string()),
});
type Tally = z.infer<typeof TallySchema>;
/** One department's scorecard; also the shape of a saved --json baseline. */
export const ScoreSchema = z.object({
  id: z.string(),
  name: z.string(),
  file: z.string().nullable(),
  execution: z.enum(["completed", "failed", "rejected", "missing"]),
  chief: ChiefStateSchema,
  chiefDetail: z.string().nullable(),
  contacts: TallySchema,
  vehicles: TallySchema,
  signals: TallySchema,
  /** Each reason to call as "kind: reason". */
  angles: z.array(z.string()),
  facts: z.number(),
  sources: z.number(),
  durationMs: z.number().nullable(),
  modelDurationMs: z.number().nullable(),
  /** Things a brief must never do. */
  critical: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type Score = z.infer<typeof ScoreSchema>;

type GoldVehicle = GoldDepartment["vehicles"][number];
type GoldContact = GoldDepartment["contacts"][number];
type GoldSignal = GoldDepartment["signals"][number];
type GoldForbidden = GoldDepartment["forbidden"][number];

const HISTORICAL = new Set([
  "historical",
  "former",
  "formerly",
  "retired",
  "retirement",
  "previous",
  "previously",
  "outgoing",
  "predecessor",
  "until",
  "prior",
]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);
const REJECTION = "different kind of organization";

/** Normalizes names while ignoring initials and generational suffixes. */
function nameTokens(name: string): string[] {
  return words(name).filter(
    (token) => token.length > 1 && !SUFFIXES.has(token),
  );
}

/** Matches every significant gold-name token while allowing extra candidate names. */
export function sameName(gold: string, candidate: string): boolean {
  const wanted = nameTokens(gold);
  const have = new Set(nameTokens(candidate));
  return wanted.length > 0 && wanted.every((token) => have.has(token));
}

const regex = (pattern: string) => new RegExp(pattern, "i");
const digits = (value: string) => value.replace(/\D/g, "");

/** Combines a fact's narrative and structured details for text matching. */
function factText(fact: Fact): string {
  return [
    fact.title,
    fact.statement,
    fact.person?.name,
    fact.person?.role,
    fact.vehicle?.unit,
    fact.vehicle?.make,
    fact.vehicle?.description,
    fact.vehicle?.replacementRelationship,
    fact.money?.amount,
    fact.money?.program,
    fact.money?.fiscalYear,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

/**
 * Detects historical qualifiers in a person's role or fact title.
 * Ignores the statement because it may describe a different predecessor.
 */
function presentedAsHistorical(fact: Fact): boolean {
  return words(`${fact.person?.role ?? ""} ${fact.title}`).some((word) =>
    HISTORICAL.has(word),
  );
}

/** Checks each supplied vehicle criterion against structured fields and fact text. */
export function matchesVehicle(fact: Fact, wanted: GoldVehicle): boolean {
  const text = factText(fact);
  const mentioned = words(text);
  const vehicle = fact.vehicle;
  if (
    wanted.modelYear !== undefined &&
    vehicle?.modelYear !== wanted.modelYear &&
    !mentioned.includes(String(wanted.modelYear))
  )
    return false;
  if (
    wanted.make &&
    !vehicle?.make?.toLowerCase().includes(wanted.make.toLowerCase()) &&
    !hasPhrase(mentioned, words(wanted.make))
  )
    return false;
  if (
    wanted.unit &&
    !vehicle?.unit?.toLowerCase().includes(wanted.unit.toLowerCase()) &&
    !hasPhrase(mentioned, words(wanted.unit))
  )
    return false;
  if (wanted.pattern && !regex(wanted.pattern).test(text)) return false;
  return true;
}

/** Finds a named person's matching email or phone suffix in structured contact fields. */
function hasContact(brief: Brief, contact: GoldContact): boolean {
  return brief.facts.some((fact) => {
    const person = fact.person;
    if (!person || !sameName(contact.name, person.name)) return false;
    const phone = person.phone ? digits(person.phone) : "";
    const email = person.email?.toLowerCase();
    return (
      contact.phones.some(
        (wanted) =>
          phone.length > 0 && phone.endsWith(digits(wanted).slice(-7)),
      ) || contact.emails.some((wanted) => wanted.toLowerCase() === email)
    );
  });
}

/** Finds an expected signal in facts or call reasons using the applicable filters. */
function hasSignal(brief: Brief, signal: GoldSignal): boolean {
  const test = regex(signal.pattern);
  const inFacts =
    signal.where !== "angles" &&
    brief.facts.some(
      (fact) =>
        (!signal.category || fact.category === signal.category) &&
        (!signal.status || fact.status === signal.status) &&
        test.test(factText(fact)),
    );
  const inAngles =
    signal.where !== "facts" &&
    brief.callAngles.some(
      (angle) =>
        (!signal.kind || angle.kind === signal.kind) && test.test(angle.reason),
    );
  return inFacts || inAngles;
}

/** Returns the first forbidden match with surrounding text, or null when none is found. */
function forbiddenHit(brief: Brief, rule: GoldForbidden): string | null {
  const test = regex(rule.pattern);
  const corpus: string[] = [];
  if (rule.where === "facts" || rule.where === "all")
    corpus.push(...brief.facts.map(factText));
  if (rule.where === "angles" || rule.where === "all")
    corpus.push(...brief.callAngles.map((angle) => angle.reason));
  if (rule.where === "questions" || rule.where === "all")
    corpus.push(...brief.questions.map((question) => question.text));
  if (rule.where === "all")
    corpus.push(brief.scope.name, brief.department.summary ?? "");
  for (const text of corpus) {
    const match = test.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 40);
      return text.slice(start, match.index + match[0].length + 40).trim();
    }
  }
  return null;
}

/** Counts matched expectations and records labels for those still missing. */
function tallyBy<T>(
  items: T[],
  label: (item: T) => string,
  test: (item: T) => boolean,
): Tally {
  const missing = items.filter((item) => !test(item)).map(label);
  return { found: items.length - missing.length, total: items.length, missing };
}

/**
 * Checks a report against a gold case for coverage, labels, and critical failures.
 * These checks do not verify claims against source passages.
 */
export function scoreReport(
  gold: GoldDepartment,
  report: Report | null,
  file: string | null = null,
): Score {
  const none = () => false;
  const score: Score = {
    id: gold.id,
    name: gold.name,
    file,
    execution: "missing",
    chief: gold.chief ? "missing" : "n/a",
    chiefDetail: null,
    contacts: tallyBy(gold.contacts, (contact) => contact.name, none),
    vehicles: tallyBy(gold.vehicles, (vehicle) => vehicle.label, none),
    signals: tallyBy(gold.signals, (signal) => signal.label, none),
    angles: [],
    facts: 0,
    sources: 0,
    durationMs: null,
    modelDurationMs: null,
    critical: [],
    warnings: [],
  };
  if (!report) return score;
  score.durationMs = report.durationMs;
  score.modelDurationMs = report.modelDurationMs ?? null;
  const failure = report.error?.message ?? "no output";
  if (gold.expectRejected) {
    if (
      report.execution === "failed" &&
      failure.toLowerCase().includes(REJECTION)
    ) {
      score.execution = "rejected";
    } else {
      score.execution = report.execution;
      score.critical.push(
        report.execution === "failed"
          ? `failed for the wrong reason: ${failure}`
          : "a Place ID that is not a department produced a brief",
      );
    }
    return score;
  }
  if (report.execution === "failed" || !report.output) {
    score.execution = "failed";
    score.critical.push(`run failed: ${failure}`);
    return score;
  }
  score.execution = "completed";
  const brief = report.output;
  score.facts = brief.facts.length;
  score.sources = brief.sources.length;
  score.angles = brief.callAngles.map(
    (angle) => `${angle.kind}: ${angle.reason}`,
  );
  if (!gold.scope.includes(brief.scope.relationship))
    score.critical.push(
      `scope is ${brief.scope.relationship}, expected ${gold.scope.join(" or ")}`,
    );
  if (gold.scopeName && !regex(gold.scopeName).test(brief.scope.name))
    score.critical.push(
      `scope name "${brief.scope.name}" does not match /${gold.scopeName}/`,
    );

  const people = brief.facts.filter(
    (fact) => fact.category === "leadership" && fact.person,
  );
  const chief = gold.chief;
  if (chief) {
    const match = people.find(
      (fact) => fact.person && sameName(chief.name, fact.person.name),
    );
    if (match?.person) {
      score.chief = presentedAsHistorical(match) ? "historical" : "current";
      score.chiefDetail = `${match.person.name} / ${match.person.role}`;
      if (chief.historicalOnly && score.chief === "current")
        score.warnings.push(
          `${chief.name} presented as current; the evidence supports only a historical role`,
        );
    }
  }
  for (const former of gold.formerLeaders) {
    const match = people.find(
      (fact) => fact.person && sameName(former.name, fact.person.name),
    );
    if (match?.person && !presentedAsHistorical(match))
      score.critical.push(
        `former leader ${match.person.name} presented as current (${match.person.role})`,
      );
  }
  score.contacts = tallyBy(
    gold.contacts,
    (contact) => contact.name,
    (contact) => hasContact(brief, contact),
  );
  score.vehicles = tallyBy(
    gold.vehicles,
    (vehicle) => vehicle.label,
    (vehicle) =>
      brief.facts.some(
        (fact) =>
          (fact.category === "fleet" || fact.category === "disposition") &&
          matchesVehicle(fact, vehicle),
      ),
  );
  score.signals = tallyBy(
    gold.signals,
    (signal) => signal.label,
    (signal) => hasSignal(brief, signal),
  );
  if (gold.angleKinds)
    for (const angle of brief.callAngles)
      if (!gold.angleKinds.includes(angle.kind))
        score.warnings.push(
          `unexpected reason to call (${angle.kind}): ${angle.reason}`,
        );
  for (const rule of gold.forbidden) {
    const hit = forbiddenHit(brief, rule);
    if (hit)
      score.critical.push(
        `forbidden /${rule.pattern}/${rule.note ? ` (${rule.note})` : ""}: "${hit}"`,
      );
  }
  return score;
}

const cell = (tally: Tally) =>
  tally.total ? `${tally.found}/${tally.total}` : "-";
const seconds = (ms: number | null) =>
  ms === null ? "-" : `${Math.round(ms / 1000)}s`;

/** Formats department outcomes and coverage as an aligned console table. */
export function formatTable(scores: Score[]): string {
  const header = [
    "Department",
    "Run",
    "Chief",
    "Contacts",
    "Vehicles",
    "Signals",
    "Reasons",
    "Facts",
    "Time",
    "Critical",
  ];
  const rows = scores.map((score) => [
    score.id,
    score.execution,
    score.chief,
    cell(score.contacts),
    cell(score.vehicles),
    cell(score.signals),
    score.execution === "completed"
      ? score.angles.map((angle) => angle.split(":")[0]).join(",") || "none"
      : "-",
    score.execution === "completed" ? String(score.facts) : "-",
    seconds(score.durationMs),
    String(score.critical.length),
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => (row[column] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((value, column) => value.padEnd(widths[column] ?? 0))
      .join("  ")
      .trimEnd();
  return [
    line(header),
    line(widths.map((width) => "-".repeat(width))),
    ...rows.map(line),
  ].join("\n");
}

/** Lists failures, warnings, missing expectations, and call reasons by department. */
export function formatDetails(scores: Score[]): string {
  const lines: string[] = [];
  for (const score of scores) {
    const notes = [
      ...score.critical.map((item) => `  FAIL ${item}`),
      ...score.warnings.map((item) => `  warn ${item}`),
    ];
    if (score.chief === "missing") notes.push("  miss chief");
    if (score.chief === "historical")
      notes.push(`  note chief shown as historical: ${score.chiefDetail}`);
    notes.push(
      ...score.contacts.missing.map((item) => `  miss contact: ${item}`),
      ...score.vehicles.missing.map((item) => `  miss vehicle: ${item}`),
      ...score.signals.missing.map((item) => `  miss signal: ${item}`),
      ...score.angles.map((item) => `  reason ${item}`),
    );
    if (notes.length)
      lines.push(
        `${score.id}${score.file ? ` (${score.file})` : ""}`,
        ...notes,
      );
  }
  return lines.join("\n");
}

/** Summarizes coverage, failures, and mean research time across scorecards. */
export function formatSummary(scores: Score[]): string {
  const chiefs = scores.filter((score) => score.chief !== "n/a");
  const count = (state: ChiefState) =>
    chiefs.filter((score) => score.chief === state).length;
  const sum = (pick: (score: Score) => Tally) =>
    scores.reduce(
      (total, score) => ({
        found: total.found + pick(score).found,
        total: total.total + pick(score).total,
      }),
      { found: 0, total: 0 },
    );
  const percent = (tally: { found: number; total: number }) =>
    tally.total ? ` (${Math.round((100 * tally.found) / tally.total)}%)` : "";
  const contacts = sum((score) => score.contacts);
  const vehicles = sum((score) => score.vehicles);
  const signals = sum((score) => score.signals);
  const critical = scores.reduce((n, score) => n + score.critical.length, 0);
  const failing = scores.filter((score) => score.critical.length).length;
  const missing = scores.filter((score) => score.execution === "missing");
  const timed = scores.filter(
    (score) => score.execution === "completed" && score.durationMs !== null,
  );
  const mean = timed.length
    ? Math.round(
        timed.reduce((n, score) => n + (score.durationMs ?? 0), 0) /
          timed.length /
          1000,
      )
    : null;
  return [
    `Chief: ${count("current")} current, ${count("historical")} historical, ${count("missing")} missing of ${chiefs.length}`,
    `Contacts: ${contacts.found}/${contacts.total}${percent(contacts)}`,
    `Vehicles: ${vehicles.found}/${vehicles.total}${percent(vehicles)}`,
    `Signals: ${signals.found}/${signals.total}${percent(signals)}`,
    `Critical failures: ${critical} in ${failing} of ${scores.length - missing.length} scored departments`,
    missing.length
      ? `Not run: ${missing.map((score) => score.id).join(", ")}`
      : "",
    mean === null
      ? ""
      : `Mean research time: ${mean} s over ${timed.length} completed runs`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Summarizes changed outcomes and coverage for departments present in both scorecards. */
export function formatComparison(current: Score[], baseline: Score[]): string {
  const before = new Map(baseline.map((score) => [score.id, score]));
  const lines: string[] = [];
  const tallies: [string, (score: Score) => Tally][] = [
    ["contacts", (score) => score.contacts],
    ["vehicles", (score) => score.vehicles],
    ["signals", (score) => score.signals],
  ];
  for (const score of current) {
    const previous = before.get(score.id);
    if (!previous) continue;
    const changes: string[] = [];
    if (previous.execution !== score.execution)
      changes.push(`run ${previous.execution} -> ${score.execution}`);
    if (previous.chief !== score.chief)
      changes.push(`chief ${previous.chief} -> ${score.chief}`);
    for (const [label, pick] of tallies) {
      const was = pick(previous);
      const now = pick(score);
      if (was.found !== now.found || was.total !== now.total)
        changes.push(`${label} ${cell(was)} -> ${cell(now)}`);
    }
    if (previous.critical.length !== score.critical.length)
      changes.push(
        `critical ${previous.critical.length} -> ${score.critical.length}`,
      );
    if (previous.facts !== score.facts)
      changes.push(`facts ${previous.facts} -> ${score.facts}`);
    if (changes.length) lines.push(`${score.id}: ${changes.join(", ")}`);
  }
  return lines.length ? lines.join("\n") : "No differences from the baseline.";
}
