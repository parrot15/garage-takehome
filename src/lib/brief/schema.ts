import { z } from "zod";

export const TRACKS = [
  "leadership",
  "fleet",
  "disposition",
  "funding",
  "news",
] as const;
const TrackSchema = z.enum(TRACKS);
export type Track = z.infer<typeof TrackSchema>;
/** Upper bounds for the model contract and validated brief. */
const FACT_LIMIT = 28;
const SOURCE_LIMIT = 24;
const ANGLE_LIMIT = 2;
const QUESTION_LIMIT = 3;

const text = (max: number) => z.string().min(1).max(max);
const optionalText = (max: number) => text(max).nullable();
const refs = z.array(text(40)).max(8);

/** Defines the resolved Google Place identity used throughout a research run. */
export const PlaceSchema = z.object({
  id: text(300),
  name: text(300),
  address: text(500),
  locality: optionalText(200),
  region: optionalText(100),
  country: optionalText(100),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  phone: optionalText(80),
  websiteUrl: optionalText(2048),
  mapsUrl: text(2048),
  businessStatus: optionalText(100),
  resolvedAt: text(60),
});
export type Place = z.infer<typeof PlaceSchema>;

/** Only the metadata needed to identify and open an original source. */
export const SourceSchema = z.object({
  id: text(40),
  url: text(2048),
  title: text(500),
  publisher: text(300),
  publishedAt: optionalText(80),
  dateOrigin: z.enum(["estimated", "source", "unknown"]),
  retrieval: z.enum(["live", "unknown"]),
});
export type Source = z.infer<typeof SourceSchema>;

const FactStatusSchema = z.enum([
  "reported",
  "proposed",
  "approved",
  "ordered",
  "delivered",
  "in_service",
  "retained",
  "retired",
  "planned_surplus",
  "listed",
  "sold",
  "donated",
  "cancelled",
  "unknown",
]);

/** A documented person or office. Contact details are only what the source lists. */
const PersonSchema = z.object({
  name: text(120),
  role: text(140),
  phone: optionalText(60),
  email: optionalText(200),
});
export type Person = z.infer<typeof PersonSchema>;
/** One physical vehicle. Unit labels are reused, so the model year and make identify it. */
const VehicleSchema = z.object({
  unit: optionalText(80),
  modelYear: z.number().int().min(1900).max(2100).nullable(),
  make: optionalText(80),
  description: text(180),
  replacementRelationship: optionalText(200),
});
export type Vehicle = z.infer<typeof VehicleSchema>;
/** Money as the source states it; no currency conversion or arithmetic. */
const MoneySchema = z.object({
  amount: optionalText(60),
  program: optionalText(160),
  fiscalYear: optionalText(40),
});
export type Money = z.infer<typeof MoneySchema>;

const FactSchema = z.object({
  id: text(40),
  category: TrackSchema,
  title: text(100),
  statement: text(550),
  references: refs.min(1),
  eventDate: optionalText(100),
  asOf: optionalText(100),
  status: FactStatusSchema,
  person: PersonSchema.nullable(),
  vehicle: VehicleSchema.nullable(),
  money: MoneySchema.nullable(),
});
export type Fact = z.infer<typeof FactSchema>;

export const ANGLE_KINDS = [
  "listing",
  "disposition",
  "replacement",
  "funding",
  "aging",
  "leadership",
  "news",
  "context",
] as const;
/** One reason to call: a single cited sentence, ranked by kind. */
const AngleSchema = z.object({
  kind: z.enum(ANGLE_KINDS),
  reason: text(240),
  factIds: refs.min(1),
});
export type CallAngle = z.infer<typeof AngleSchema>;
const QuestionSchema = z.object({ text: text(300), factIds: refs });
const ScopeSchema = z.object({
  name: text(300),
  relationship: z.enum(["selected_place", "parent_department", "unresolved"]),
  explanation: optionalText(300),
  references: refs,
});
export type Scope = z.infer<typeof ScopeSchema>;
const DEPARTMENT_KINDS = [
  "volunteer",
  "career",
  "combination",
  "unknown",
] as const;
/** How the department is organized, when the evidence says so. */
const DepartmentSchema = z.object({
  kind: z.enum(DEPARTMENT_KINDS),
  summary: optionalText(300),
  references: refs,
});
export type Department = z.infer<typeof DepartmentSchema>;

/**
 * Defines model output with internal passage references, resolved to source IDs before delivery.
 * All fields are required; null represents unavailable information.
 */
export const DraftBriefSchema = z.object({
  scope: ScopeSchema,
  department: DepartmentSchema,
  facts: z.array(FactSchema).max(FACT_LIMIT),
  callAngles: z.array(AngleSchema).max(ANGLE_LIMIT),
  questions: z.array(QuestionSchema).max(QUESTION_LIMIT),
});
export type DraftBrief = z.infer<typeof DraftBriefSchema>;

/** Returns the distinct values that occur more than once. */
export function duplicates<T>(values: Iterable<T>): Set<T> {
  const seen = new Set<T>();
  const repeated = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return repeated;
}

/** Validates the public brief, including unique IDs and references to existing facts and sources. */
export const BriefSchema = z
  .object({
    runId: text(80),
    mode: z.enum(["live", "sample"]),
    place: PlaceSchema,
    scope: ScopeSchema,
    department: DepartmentSchema,
    facts: z.array(FactSchema).max(FACT_LIMIT),
    callAngles: z.array(AngleSchema).max(ANGLE_LIMIT),
    questions: z.array(QuestionSchema).max(QUESTION_LIMIT),
    sources: z.array(SourceSchema).max(SOURCE_LIMIT),
    researchedAt: text(60),
    durationMs: z.number().min(0),
  })
  .superRefine((brief, context) => {
    /** Reports every duplicate occurrence and returns the IDs available for references. */
    const checkIds = (items: { id: string }[], key: "sources" | "facts") => {
      const ids = items.map((item) => item.id);
      const repeated = duplicates(ids);
      for (const [index, item] of items.entries())
        if (repeated.has(item.id))
          context.addIssue({
            code: "custom",
            message: `Duplicate ${key} ID: ${item.id}`,
            path: [key, index, "id"],
          });
      return new Set(ids);
    };
    const sourceIds = checkIds(brief.sources, "sources");
    const factIds = checkIds(brief.facts, "facts");
    /** Reports unresolved references at their exact positions in the brief. */
    const checkReferences = (
      references: string[],
      ids: Set<string>,
      path: (string | number)[],
    ) => {
      for (const [index, reference] of references.entries())
        if (!ids.has(reference))
          context.addIssue({
            code: "custom",
            message: `Unknown reference: ${reference}`,
            path: [...path, index],
          });
    };
    checkReferences(brief.scope.references, sourceIds, ["scope", "references"]);
    checkReferences(brief.department.references, sourceIds, [
      "department",
      "references",
    ]);
    for (const [index, fact] of brief.facts.entries())
      checkReferences(fact.references, sourceIds, [
        "facts",
        index,
        "references",
      ]);
    for (const [index, angle] of brief.callAngles.entries())
      checkReferences(angle.factIds, factIds, ["callAngles", index, "factIds"]);
    for (const [index, question] of brief.questions.entries())
      checkReferences(question.factIds, factIds, [
        "questions",
        index,
        "factIds",
      ]);
  });
export type Brief = z.infer<typeof BriefSchema>;
const ResearchStageSchema = z.enum([
  "resolving",
  "searching",
  "reading",
  "synthesizing",
  "validating",
]);
export type ResearchStage = z.infer<typeof ResearchStageSchema>;
export const PublicErrorSchema = z.object({
  message: text(500),
  retryable: z.boolean(),
  requestId: z.string().optional(),
});
export type PublicError = z.infer<typeof PublicErrorSchema>;
/** Validates progress, identity, completion, and error events sent to the client. */
export const ResearchEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("stage"), stage: ResearchStageSchema }),
  z.object({ type: z.literal("identity"), place: PlaceSchema }),
  z.object({ type: z.literal("complete"), brief: BriefSchema }),
  z.object({ type: z.literal("error"), error: PublicErrorSchema }),
]);
export type ResearchEvent = z.infer<typeof ResearchEventSchema>;
const PLACE_ID_REQUIRED = "Enter a Google Place ID.";
const BriefRequestSchema = z
  .object({
    placeId: z
      .string()
      .trim()
      .min(1, PLACE_ID_REQUIRED)
      .max(300, "That Place ID is too long.")
      .refine(
        (value) => !/[\s/\\?#\p{Cc}]/u.test(value),
        "Paste the Place ID itself, without a URL or spaces.",
      ),
  })
  .strict();

/** Validates request shape and Place ID syntax, returning a trimmed ID or a public error message. */
export function parseBriefRequest(
  input: unknown,
): { ok: true; placeId: string } | { ok: false; message: string } {
  const parsed = BriefRequestSchema.safeParse(input);
  return parsed.success
    ? { ok: true, placeId: parsed.data.placeId }
    : {
        ok: false,
        message: parsed.error.issues[0]?.message ?? PLACE_ID_REQUIRED,
      };
}
