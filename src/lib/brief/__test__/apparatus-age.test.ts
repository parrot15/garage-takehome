import { describe, expect, it } from "vitest";
import {
  modelYearsOld,
  REPLACEMENT_AGE_YEARS,
  RESERVE_AGE_YEARS,
} from "../apparatus-age";

describe("apparatus age", () => {
  it("counts model years to the reference date and knows when it cannot", () => {
    expect(modelYearsOld(2005, "2026-09-13T00:00:00.000Z")).toBe(21);
    expect(modelYearsOld(null, "2026-09-13")).toBeNull();
    expect(modelYearsOld(2005, "not a date")).toBeNull();
    expect(modelYearsOld(2027, "2026-09-13")).toBeNull();
  });
  it("orders the NFPA thresholds", () =>
    expect(RESERVE_AGE_YEARS).toBeLessThan(REPLACEMENT_AGE_YEARS));
});
