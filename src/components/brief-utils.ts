import {
  modelYearsOld,
  REPLACEMENT_AGE_YEARS,
  RESERVE_AGE_YEARS,
} from "@/lib/brief/apparatus-age";
import type {
  CallAngle,
  Department,
  Fact,
  Money,
  Person,
  Place,
  Vehicle,
} from "@/lib/brief/schema";

/** Joins the available locality and region into a location label. */
export function placeLine(place: Pick<Place, "locality" | "region">): string {
  return [place.locality, place.region]
    .filter((value) => value !== null)
    .join(", ");
}

export const STATUS_LABELS: Record<Fact["status"], string> = {
  reported: "Reported",
  proposed: "Proposed",
  approved: "Approved",
  ordered: "Ordered",
  delivered: "Delivered",
  in_service: "In service",
  retained: "Retained",
  retired: "Retired",
  planned_surplus: "Planned surplus",
  listed: "Listed",
  sold: "Sold",
  donated: "Donated",
  cancelled: "Cancelled",
  unknown: "Status unconfirmed",
};
export const ANGLE_KIND_LABELS: Record<CallAngle["kind"], string> = {
  listing: "Listed for sale",
  disposition: "Surplus planned",
  replacement: "Replacement under way",
  funding: "Money in motion",
  aging: "Aging apparatus",
  leadership: "Leadership",
  news: "In the news",
  context: "Context",
};
export const DEPARTMENT_KIND_LABELS: Record<Department["kind"], string | null> =
  {
    volunteer: "Volunteer department",
    career: "Career department",
    combination: "Combination department",
    unknown: null,
  };

/** Formats complete dates in UTC while preserving partial and prose dates. */
export function formatDate(value: string | null): string {
  if (!value) return "Date not provided";
  // Keep partial and prose dates as supplied; do not invent precision.
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

interface BriefSections {
  people: Fact[];
  fleet: Fact[];
  disposition: Fact[];
  funding: Fact[];
  news: Fact[];
}
/** Groups facts by brief section while preserving their order. */
export function sectionFacts(facts: Fact[]): BriefSections {
  return {
    people: facts.filter((fact) => fact.category === "leadership"),
    fleet: facts.filter((fact) => fact.category === "fleet"),
    disposition: facts.filter((fact) => fact.category === "disposition"),
    funding: facts.filter((fact) => fact.category === "funding"),
    news: facts.filter((fact) => fact.category === "news"),
  };
}

/** Calculates model-year age at the reference date, or returns null when unavailable. */
export function vehicleAge(
  vehicle: Vehicle,
  referenceDate: string,
): number | null {
  return modelYearsOld(vehicle.modelYear, referenceDate);
}

/** Classifies known ages against the reserve and replacement thresholds. */
export function ageFlag(age: number | null): "replace" | "watch" | null {
  if (age === null) return null;
  if (age >= REPLACEMENT_AGE_YEARS) return "replace";
  if (age >= RESERVE_AGE_YEARS) return "watch";
  return null;
}

/** Combines the available model year, make, and description into an apparatus label. */
export function vehicleLabel(vehicle: Vehicle): string {
  return [vehicle.modelYear, vehicle.make, vehicle.description]
    .filter((part) => part !== null && part !== undefined)
    .join(" ");
}

/** Returns the person's listed phone and email without empty values. */
export function personContacts(person: Person): string[] {
  return [person.phone, person.email].filter((value): value is string =>
    Boolean(value),
  );
}

/** Combines the amount, program, and fiscal year, or returns null when all are absent. */
export function moneyLabel(money: Money): string | null {
  const parts = [money.amount, money.program, money.fiscalYear].filter(
    (value): value is string => Boolean(value),
  );
  return parts.length ? parts.join(" · ") : null;
}

/** Labels the event date and the date of the source's claim separately. */
export function factDateLabel(fact: Fact): string | null {
  const parts = [
    fact.eventDate && formatDate(fact.eventDate),
    fact.asOf && `As of ${formatDate(fact.asOf)}`,
  ].filter((value): value is string => Boolean(value));
  return parts.length ? parts.join(" · ") : null;
}

/** Collects source references for selected fact IDs in fact order. */
export function referencesForFacts(facts: Fact[], ids: string[]): string[] {
  return facts
    .filter((fact) => ids.includes(fact.id))
    .flatMap((fact) => fact.references);
}
