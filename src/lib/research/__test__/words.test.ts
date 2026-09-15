import { describe, expect, it } from "vitest";
import { hasPhrase, words } from "../words";

describe("words", () => {
  it("lowercases, folds diacritics, and splits on anything that is not a letter or a digit", () => {
    expect(words("Trois-Rivières (Québec): Engine 27's crew")).toEqual([
      "trois",
      "rivieres",
      "quebec",
      "engine",
      "27",
      "s",
      "crew",
    ]);
  });
  it("finds a phrase only as consecutive words", () => {
    const text = words("Lake Ozark Fire Protection District");
    expect(hasPhrase(text, words("lake ozark"))).toBe(true);
    expect(hasPhrase(text, words("ozark protection"))).toBe(false);
    expect(hasPhrase(text, [])).toBe(false);
  });
});
