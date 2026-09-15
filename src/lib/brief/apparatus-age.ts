/**
 * NFPA 1911 guidance for fire apparatus: consider reserve status at fifteen
 * years and replacement at twenty-five. Validation and the brief's age flags
 * read these numbers, so what the view highlights is what a reason to call
 * may rest on.
 */
export const RESERVE_AGE_YEARS = 15;
export const REPLACEMENT_AGE_YEARS = 25;

/**
 * Calculates age from the model year and reference date.
 * Returns null for a missing or future model year, or an invalid reference date.
 */
export function modelYearsOld(
  modelYear: number | null,
  asOf: string,
): number | null {
  if (modelYear === null) return null;
  const year = new Date(asOf).getUTCFullYear();
  if (!Number.isFinite(year)) return null;
  const age = year - modelYear;
  return age >= 0 ? age : null;
}
