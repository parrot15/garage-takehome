import { describe, expect, it } from "vitest";
import { DepartmentSchema, parseGold } from "../gold";

const base = {
  id: "maple",
  placeId: "p",
  name: "Maple",
  locality: "Maple",
  region: "VT",
};

describe("gold department schema", () => {
  it("fills in the defaults a minimal entry leaves out", () => {
    expect(DepartmentSchema.parse(base)).toMatchObject({
      expectRejected: false,
      scope: ["selected_place"],
      chief: null,
      formerLeaders: [],
      contacts: [],
      vehicles: [],
      signals: [],
      forbidden: [],
      sources: [],
    });
  });
  it.each([
    ["an id with capitals or spaces", { id: "Maple FD" }],
    ["a contact with neither phone nor email", { contacts: [{ name: "A" }] }],
    [
      "a contact with a malformed email",
      { contacts: [{ name: "A", emails: ["not-an-email"] }] },
    ],
    ["a vehicle with no identifying detail", { vehicles: [{ label: "x" }] }],
    [
      "a vehicle with an impossible model year",
      { vehicles: [{ label: "x", modelYear: 1850 }] },
    ],
    [
      "a signal with an invalid pattern",
      { signals: [{ label: "x", pattern: "[" }] },
    ],
    [
      "a signal with an unknown category",
      { signals: [{ label: "x", pattern: "x", category: "weather" }] },
    ],
    [
      "a forbidden rule with an unknown location",
      { forbidden: [{ pattern: "x", where: "sources" }] },
    ],
    ["a scope outside the vocabulary", { scope: ["citywide"] }],
    ["a source that is not a URL", { sources: ["not a url"] }],
  ])("rejects %s", (_name, overrides) => {
    expect(DepartmentSchema.safeParse({ ...base, ...overrides }).success).toBe(
      false,
    );
  });
  it("accepts contacts, vehicles, signals, and rules with their details", () => {
    const parsed = DepartmentSchema.parse({
      ...base,
      chief: { name: "Jane Doe", historicalOnly: true, since: "2024" },
      formerLeaders: [{ name: "Old Chief" }],
      contacts: [{ name: "Jane Doe", phones: ["802-555-0100"] }],
      vehicles: [
        {
          label: "Engine 4",
          unit: "4",
          modelYear: 1996,
          make: "Pierce",
          pattern: "Engine\\s+4",
        },
      ],
      signals: [
        {
          label: "bid",
          pattern: "sealed bid",
          where: "facts",
          category: "disposition",
          status: "listed",
        },
      ],
      forbidden: [
        { pattern: "Sutphen", where: "angles", note: "another town" },
      ],
      sources: ["https://maple.example.org/"],
    });
    expect(parsed.contacts[0]).toEqual({
      name: "Jane Doe",
      phones: ["802-555-0100"],
      emails: [],
    });
    expect(parsed.chief).toEqual({
      name: "Jane Doe",
      historicalOnly: true,
      since: "2024",
    });
    expect(parsed.signals[0]?.where).toBe("facts");
  });
});

describe("gold file", () => {
  const gold = (departments: unknown[]) => ({
    version: 1,
    verifiedOn: "2026-09-16",
    departments,
  });
  it("accepts a well-formed file", () => {
    expect(parseGold(gold([base])).departments).toHaveLength(1);
  });
  it("rejects a duplicate department id, an unknown version, and an empty set", () => {
    expect(() => parseGold(gold([base, { ...base, placeId: "q" }]))).toThrow(
      /duplicate id/,
    );
    expect(() => parseGold({ ...gold([base]), version: 2 })).toThrow(
      /Invalid gold file/,
    );
    expect(() => parseGold(gold([]))).toThrow(/Invalid gold file/);
  });
});
