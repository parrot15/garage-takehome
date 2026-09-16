import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ANGLE_KINDS, duplicates, TRACKS } from "@/lib/brief/schema";

const GOLD_PATH = path.resolve("evaluation/gold.json");

const text = z.string().trim().min(1);
const pattern = text.refine(
  (value) => {
    try {
      new RegExp(value, "i");
      return true;
    } catch {
      return false;
    }
  },
  { message: "must be a valid regular expression" },
);

const PersonSchema = z.object({
  name: text,
  /** The evidence supports only a historical role; presenting it as current is a warning. */
  historicalOnly: z.boolean().default(false),
  /** When the person took the role, for the reader; not used by the scorer. */
  since: text.optional(),
});
const ContactSchema = z
  .object({
    name: text,
    /** Any one of these, matched on the last seven digits. */
    phones: z.array(text).default([]),
    emails: z.array(z.email()).default([]),
  })
  .refine((contact) => contact.phones.length + contact.emails.length > 0, {
    message: "a contact needs a phone or an email",
  });
const VehicleSchema = z
  .object({
    label: text,
    unit: text.optional(),
    modelYear: z.number().int().min(1900).max(2100).optional(),
    make: text.optional(),
    /** Matched against the fact's title, statement, and vehicle fields. */
    pattern: pattern.optional(),
  })
  .refine(
    (vehicle) =>
      vehicle.unit || vehicle.modelYear || vehicle.make || vehicle.pattern,
    {
      message: "a vehicle needs a unit, model year, make, or pattern",
    },
  );
const SignalSchema = z.object({
  label: text,
  pattern,
  where: z.enum(["facts", "angles", "any"]).default("any"),
  category: z.enum(TRACKS).optional(),
  status: text.optional(),
  kind: z.enum(ANGLE_KINDS).optional(),
});
const ForbiddenSchema = z.object({
  pattern,
  where: z.enum(["facts", "angles", "questions", "all"]).default("all"),
  note: text.optional(),
});

export const DepartmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  placeId: text,
  name: text,
  locality: text,
  region: text,
  /** The Place ID is not a department; the run must be rejected before research. */
  expectRejected: z.boolean().default(false),
  scope: z
    .array(z.enum(["selected_place", "parent_department", "unresolved"]))
    .default(["selected_place"]),
  scopeName: pattern.optional(),
  chief: PersonSchema.nullable().default(null),
  /** People who must not be presented as current leadership. */
  formerLeaders: z.array(PersonSchema).default([]),
  contacts: z.array(ContactSchema).default([]),
  vehicles: z.array(VehicleSchema).default([]),
  signals: z.array(SignalSchema).default([]),
  /** Reason-to-call kinds that make sense for this department; others are warnings. */
  angleKinds: z.array(z.enum(ANGLE_KINDS)).optional(),
  forbidden: z.array(ForbiddenSchema).default([]),
  /** Public pages the values were checked against. */
  sources: z.array(z.url()).default([]),
  notes: text.optional(),
});

const GoldSchema = z
  .object({
    version: z.literal(1),
    verifiedOn: z.iso.date(),
    departments: z.array(DepartmentSchema).min(1),
  })
  .superRefine((gold, context) => {
    for (const key of ["id", "placeId"] as const) {
      const repeated = duplicates(
        gold.departments.map((department) => department[key]),
      );
      for (const [index, department] of gold.departments.entries())
        if (repeated.has(department[key]))
          context.addIssue({
            code: "custom",
            path: ["departments", index, key],
            message: `duplicate ${key}`,
          });
    }
  });

export type GoldDepartment = z.infer<typeof DepartmentSchema>;
type Gold = z.infer<typeof GoldSchema>;

/** Validates the gold dataset and reports invalid fields and duplicate identifiers. */
export function parseGold(value: unknown): Gold {
  const parsed = GoldSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      `Invalid gold file: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  return parsed.data;
}

/** Loads and validates a gold dataset from a JSON file. */
export function loadGold(file = GOLD_PATH): Gold {
  return parseGold(JSON.parse(readFileSync(file, "utf8")));
}
