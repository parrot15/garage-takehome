import type { EvidenceSource } from "@/lib/research/contracts";
import { modelYearsOld, RESERVE_AGE_YEARS } from "./apparatus-age";
import {
  type Department,
  type DraftBrief,
  duplicates,
  type Fact,
  type Place,
  type Scope,
  type Source,
  SourceSchema,
} from "./schema";

const CLOSED_STATUSES = new Set(["sold", "donated", "cancelled"]);
const UNKNOWN_DEPARTMENT: Department = {
  kind: "unknown",
  summary: null,
  references: [],
};
const normalize = (text: string) =>
  text.toLowerCase().replace(/\s+/g, " ").trim();

/** Maps passage IDs to source IDs, excluding ambiguous passages and sources. */
function passageSources(sources: EvidenceSource[]): Map<string, string> {
  const repeatedSources = duplicates(sources.map((source) => source.id));
  const repeatedPassages = duplicates(
    sources.flatMap((source) => source.passages.map((passage) => passage.id)),
  );
  const passages = new Map<string, string>();
  for (const source of sources) {
    if (repeatedSources.has(source.id)) continue;
    for (const passage of source.passages)
      if (!repeatedPassages.has(passage.id))
        passages.set(passage.id, source.id);
  }
  return passages;
}

/**
 * Accepts the selected place's name or a cited parent department as the scope.
 * Otherwise marks the scope unresolved, keeping only a cited explanation.
 */
function resolveScope(
  scope: Scope,
  place: Place,
  cited: (refs: string[]) => boolean,
): Scope {
  const supported = cited(scope.references);
  if (scope.relationship === "parent_department" && supported) return scope;
  if (
    scope.relationship === "selected_place" &&
    normalize(scope.name) === normalize(place.name)
  )
    return {
      name: place.name,
      relationship: "selected_place",
      explanation: null,
      references: [],
    };
  return {
    name: place.name,
    relationship: "unresolved",
    explanation: supported ? scope.explanation : null,
    references: supported ? scope.references : [],
  };
}

/**
 * Removes untraceable claims and call angles that violate vehicle status or age rules.
 * Checks references and scope, not whether the cited text proves each claim.
 */
export function validateDraft(
  input: DraftBrief,
  sources: EvidenceSource[],
  place: Place,
): DraftBrief {
  const passages = passageSources(sources);
  const cited = (refs: string[]) =>
    refs.length > 0 && refs.every((ref) => passages.has(ref));
  const scope = resolveScope(input.scope, place, cited);
  // An unestablished organization must not leave department-wide claims behind.
  if (scope.relationship === "unresolved")
    return {
      scope,
      department: UNKNOWN_DEPARTMENT,
      facts: [],
      callAngles: [],
      questions: [],
    };
  // An ambiguous ID could attach a reason to a different physical vehicle; reject every occurrence.
  const repeated = duplicates(input.facts.map((fact) => fact.id));
  const facts = input.facts.filter(
    (fact) => !repeated.has(fact.id) && cited(fact.references),
  );
  const byId = new Map(facts.map((fact) => [fact.id, fact]));
  const callAngles = input.callAngles.filter((angle) => {
    const supports = angle.factIds.map((id) => byId.get(id));
    if (!supports.every((fact): fact is Fact => fact !== undefined))
      return false;
    if (
      angle.kind !== "context" &&
      supports.some((fact) => CLOSED_STATUSES.has(fact.status))
    )
      return false;
    // Reserve apparatus can inform fleet planning, but is not an open sale.
    if (
      supports.some((fact) => fact.status === "retained") &&
      !["aging", "replacement", "context"].includes(angle.kind)
    )
      return false;
    if (angle.kind === "aging")
      return supports.some((fact) => {
        const age = modelYearsOld(
          fact.vehicle?.modelYear ?? null,
          place.resolvedAt,
        );
        return age !== null && age >= RESERVE_AGE_YEARS;
      });
    return true;
  });
  const questions = input.questions.filter((question) =>
    question.factIds.every((id) => byId.has(id)),
  );
  return {
    scope,
    department: cited(input.department.references)
      ? input.department
      : UNKNOWN_DEPARTMENT,
    facts,
    callAngles,
    questions,
  };
}

/**
 * Replaces passage references with source IDs and includes only cited public metadata.
 *
 * @throws If a passage reference is unknown or ambiguous.
 */
export function projectBrief(
  draft: DraftBrief,
  sources: EvidenceSource[],
): DraftBrief & { sources: Source[] } {
  const passages = passageSources(sources);
  const cited = new Set<string>();
  const references = (passageIds: string[]) => {
    const ids = new Set<string>();
    for (const passageId of passageIds) {
      const sourceId = passages.get(passageId);
      if (!sourceId)
        throw new Error(
          `Unknown or ambiguous evidence reference: ${passageId}`,
        );
      ids.add(sourceId);
      cited.add(sourceId);
    }
    return sources
      .filter((source) => ids.has(source.id))
      .map((source) => source.id);
  };
  const scope = {
    ...draft.scope,
    references: references(draft.scope.references),
  };
  const department = {
    ...draft.department,
    references: references(draft.department.references),
  };
  const facts = draft.facts.map((fact) => ({
    ...fact,
    references: references(fact.references),
  }));
  return {
    scope,
    department,
    facts,
    callAngles: draft.callAngles,
    questions: draft.questions,
    sources: sources
      .filter((source) => cited.has(source.id))
      .map((source) => SourceSchema.parse(source)),
  };
}
