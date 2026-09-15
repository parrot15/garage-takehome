import type { Place } from "@/lib/brief/schema";
import { hasPhrase, words } from "./words";

/** Words in department names that do not identify one department. */
const GENERIC_NAME_WORDS = new Set([
  "fire",
  "department",
  "dept",
  "volunteer",
  "volunteers",
  "company",
  "co",
  "station",
  "rescue",
  "district",
  "emergency",
  "service",
  "services",
  "protection",
  "inc",
  "the",
  "and",
  "of",
]);

/** Collects the town and distinctive department-name words used to recognize relevant pages. */
export function identityWords(place: Place): string[] {
  const town = place.locality === null ? [] : [words(place.locality).join(" ")];
  const nameWords = words(place.name).filter(
    (word) => word.length > 2 && !GENERIC_NAME_WORDS.has(word),
  );
  return [...new Set([...town, ...nameWords])];
}

/** Checks whether tokenized text contains a town or department identity phrase. */
export function namesPlace(text: string[], identity: string[]): boolean {
  return identity.some((term) => hasPhrase(text, words(term)));
}
