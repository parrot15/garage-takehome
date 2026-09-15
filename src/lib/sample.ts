import { type Brief, BriefSchema, type Source } from "@/lib/brief/schema";

/**
 * The two Place IDs supplied with the assignment: Wise Avenue Volunteer Fire
 * Co in Dundalk, Maryland, and Washington Fire Department in Washington,
 * Vermont. The home page offers them as Sample 1 and 2, the evaluation runs
 * them as sample1 and sample2, and the gold set covers both.
 */
export const SAMPLE_PLACE_IDS = [
  "ChIJpcN7ecgAyIkRrOcWzZx3Yyc",
  "ChIJr-yREGP9tEwRr7M-F00PpM8",
] as const;

/**
 * A historical, editorial example. This is never returned by the research API.
 * It describes a 2025 plan, not the department’s current status.
 */
const SAMPLE_SOURCE: Source = {
  id: "S1",
  url: "https://www.cityofpeekskillny.gov/AgendaCenter/ViewFile/Item/1378?fileID=8976",
  title: "Fire Department Apparatus Purchase · Memo 25-02-02",
  publisher: "City of Peekskill",
  publishedAt: "2025-02-10",
  dateOrigin: "source",
  retrieval: "unknown",
};

/** Provides a historical brief for previewing the interface without making API calls. */
export const SAMPLE_BRIEF: Brief = BriefSchema.parse({
  runId: "historical-peekskill-example",
  mode: "sample",
  place: {
    id: "sample-peekskill-historical",
    name: "Peekskill Fire Department",
    address: "Peekskill, New York",
    locality: "Peekskill",
    region: "New York",
    country: "United States",
    latitude: null,
    longitude: null,
    phone: null,
    websiteUrl: null,
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Peekskill%20Fire%20Department%20New%20York",
    businessStatus: null,
    resolvedAt: "2025-02-10T00:00:00.000Z",
  },
  scope: {
    name: "Peekskill Fire Department",
    relationship: "selected_place",
    explanation:
      "Historical example from a city memo; no Google Place lookup was performed.",
    references: ["S1"],
  },
  department: { kind: "unknown", summary: null, references: [] },
  facts: [
    {
      id: "F1",
      category: "disposition",
      title: "Engine 132 planned for surplus",
      statement:
        "The February 2025 memo planned to declare Engine 132 surplus once the new apparatus entered service.",
      references: ["S1"],
      eventDate: null,
      asOf: "2025-02-10",
      status: "planned_surplus",
      person: null,
      vehicle: {
        unit: "Engine 132",
        modelYear: 1996,
        make: "Pierce",
        description: "engine",
        replacementRelationship:
          "Surplus once the approved Seagrave replacements enter service",
      },
      money: null,
    },
    {
      id: "F2",
      category: "disposition",
      title: "Rescue 134 in the same plan",
      statement: "Rescue 134 was covered by the same conditional surplus plan.",
      references: ["S1"],
      eventDate: null,
      asOf: "2025-02-10",
      status: "planned_surplus",
      person: null,
      vehicle: {
        unit: "Rescue 134",
        modelYear: 2006,
        make: "E-One",
        description: "rescue",
        replacementRelationship:
          "Surplus once the approved Seagrave replacements enter service",
      },
      money: null,
    },
    {
      id: "F3",
      category: "leadership",
      title: "Fire Chief",
      statement:
        "Chief James E. Seymour IV wrote the February 10, 2025 apparatus memo to the city.",
      references: ["S1"],
      eventDate: "2025-02-10",
      asOf: "2025-02-10",
      status: "reported",
      person: {
        name: "James E. Seymour IV",
        role: "Fire Chief",
        phone: null,
        email: null,
      },
      vehicle: null,
      money: null,
    },
    {
      id: "F4",
      category: "fleet",
      title: "Two Seagrave replacements approved",
      statement: "Approved Seagrave replacements were expected in early 2026.",
      references: ["S1"],
      eventDate: "Early 2026",
      asOf: "2025-02-10",
      status: "approved",
      person: null,
      vehicle: {
        unit: null,
        modelYear: null,
        make: "Seagrave",
        description: "two replacement apparatus",
        replacementRelationship: "Replacing Engine 132 and Rescue 134",
      },
      money: null,
    },
    {
      id: "F5",
      category: "funding",
      title: "Engine 130 replacement requested",
      statement:
        "A separate engine purchase to replace the 2001 E-One Engine 130 was requested, targeting 2028–2029 delivery.",
      references: ["S1"],
      eventDate: "2028–2029 planned delivery",
      asOf: "2025-02-10",
      status: "proposed",
      person: null,
      vehicle: {
        unit: "Engine 130",
        modelYear: 2001,
        make: "E-One",
        description: "engine",
        replacementRelationship: "Replacement requested for 2028–2029 delivery",
      },
      money: null,
    },
  ],
  callAngles: [
    {
      kind: "disposition",
      reason:
        "A February 2025 memo planned to surplus the 1996 Engine 132 and 2006 Rescue 134 once two approved Seagrave replacements, expected in early 2026, entered service.",
      factIds: ["F1", "F2", "F4"],
    },
  ],
  questions: [
    {
      text: "Has either vehicle's ownership or disposition plan changed since the memo?",
      factIds: ["F1", "F2"],
    },
    { text: "Who has authority to approve the sales process?", factIds: [] },
  ],
  sources: [SAMPLE_SOURCE],
  researchedAt: "2025-02-10T00:00:00.000Z",
  durationMs: 0,
});
