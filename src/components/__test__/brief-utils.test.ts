import { describe, expect, it } from "vitest";
import { makeFact } from "@/__test__/factories";
import { ANGLE_KINDS, DraftBriefSchema } from "@/lib/brief/schema";
import {
  ANGLE_KIND_LABELS,
  ageFlag,
  DEPARTMENT_KIND_LABELS,
  factDateLabel,
  formatDate,
  moneyLabel,
  personContacts,
  placeLine,
  referencesForFacts,
  STATUS_LABELS,
  sectionFacts,
  vehicleAge,
  vehicleLabel,
} from "../brief-utils";

describe("brief utilities", () => {
  it("does not invent date precision", () => {
    expect(formatDate("2025")).toBe("2025");
    expect(formatDate("Early 2026")).toBe("Early 2026");
    expect(formatDate("2025-02-10")).toBe("Feb 10, 2025");
    expect(formatDate("2025-02-10T23:30:00.000Z")).toBe("Feb 10, 2025");
    expect(formatDate("2025-13-40")).toBe("2025-13-40");
    expect(formatDate(null)).toBe("Date not provided");
  });
  it("keeps the event date and the date of the source assertion distinct", () => {
    expect(
      factDateLabel(makeFact({ eventDate: "2015", asOf: "2025-06-27" })),
    ).toBe("2015 · As of Jun 27, 2025");
    expect(factDateLabel(makeFact({ eventDate: null, asOf: null }))).toBeNull();
  });
  it("derives apparatus age from the documented model year and flags NFPA 1911 thresholds", () => {
    const vehicle = {
      unit: "Engine 4",
      modelYear: 2005,
      make: "Pierce",
      description: "pumper",
      replacementRelationship: null,
    };
    expect(vehicleAge(vehicle, "2026-09-13T00:00:00.000Z")).toBe(21);
    expect(
      vehicleAge({ ...vehicle, modelYear: null }, "2026-09-13"),
    ).toBeNull();
    expect(vehicleAge(vehicle, "not a date")).toBeNull();
    expect(ageFlag(21)).toBe("watch");
    expect(ageFlag(25)).toBe("replace");
    expect(ageFlag(3)).toBeNull();
    expect(ageFlag(null)).toBeNull();
  });
});

describe("brief labels and groupings", () => {
  it("joins the town and region Google listed, whichever it had", () => {
    expect(placeLine({ locality: "Dundalk", region: "MD" })).toBe(
      "Dundalk, MD",
    );
    expect(placeLine({ locality: null, region: "MD" })).toBe("MD");
    expect(placeLine({ locality: "Dundalk", region: null })).toBe("Dundalk");
    expect(placeLine({ locality: null, region: null })).toBe("");
  });
  it("groups facts by section in their original order", () => {
    const facts = [
      makeFact({ id: "F1", category: "news" }),
      makeFact({ id: "F2", category: "leadership" }),
      makeFact({ id: "F3", category: "fleet" }),
      makeFact({ id: "F4", category: "funding" }),
      makeFact({ id: "F5", category: "disposition" }),
      makeFact({ id: "F6", category: "leadership" }),
    ];
    const sections = sectionFacts(facts);
    const ids = (list: { id: string }[]) => list.map((fact) => fact.id);
    expect(ids(sections.people)).toEqual(["F2", "F6"]);
    expect(ids(sections.fleet)).toEqual(["F3"]);
    expect(ids(sections.disposition)).toEqual(["F5"]);
    expect(ids(sections.funding)).toEqual(["F4"]);
    expect(ids(sections.news)).toEqual(["F1"]);
  });
  it("labels a vehicle by year, make, and type, skipping what is unknown", () => {
    expect(
      vehicleLabel({
        unit: "Engine 4",
        modelYear: 1996,
        make: "Pierce",
        description: "pumper",
        replacementRelationship: null,
      }),
    ).toBe("1996 Pierce pumper");
    expect(
      vehicleLabel({
        unit: null,
        modelYear: null,
        make: null,
        description: "two engines",
        replacementRelationship: null,
      }),
    ).toBe("two engines");
  });
  it("lists only the contacts a source gave", () => {
    expect(
      personContacts({
        name: "A",
        role: "Chief",
        phone: "555",
        email: "a@x.org",
      }),
    ).toEqual(["555", "a@x.org"]);
    expect(
      personContacts({ name: "A", role: "Chief", phone: null, email: null }),
    ).toEqual([]);
  });
  it("labels money as the source stated it, or not at all", () => {
    expect(
      moneyLabel({
        amount: "$750,000",
        program: "FEMA AFG",
        fiscalYear: "FY2026",
      }),
    ).toBe("$750,000 · FEMA AFG · FY2026");
    expect(moneyLabel({ amount: null, program: "AFG", fiscalYear: null })).toBe(
      "AFG",
    );
    expect(
      moneyLabel({ amount: null, program: null, fiscalYear: null }),
    ).toBeNull();
  });
  it("collects the sources behind a reason's facts in fact order, ignoring unknown ids", () => {
    const facts = [
      makeFact({ id: "F1", references: ["S2"] }),
      makeFact({ id: "F2", references: ["S1", "S3"] }),
    ];
    expect(referencesForFacts(facts, ["F2", "F1", "F9"])).toEqual([
      "S2",
      "S1",
      "S3",
    ]);
    expect(referencesForFacts(facts, [])).toEqual([]);
  });
  it("has a label for every status, reason kind, and department kind", () => {
    for (const status of DraftBriefSchema.shape.facts.element.shape.status
      .options)
      expect(STATUS_LABELS[status]).toMatch(/\S/);
    for (const kind of ANGLE_KINDS)
      expect(ANGLE_KIND_LABELS[kind]).toMatch(/\S/);
    expect(DEPARTMENT_KIND_LABELS.unknown).toBeNull();
    for (const kind of ["volunteer", "career", "combination"] as const)
      expect(DEPARTMENT_KIND_LABELS[kind]).toMatch(/department$/);
  });
});
