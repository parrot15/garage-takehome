import { describe, expect, it } from "vitest";
import { makePlace } from "@/__test__/factories";
import { identityWords, namesPlace } from "../identity";
import { words } from "../words";

describe("place identity", () => {
  it("names the town and the distinctive words of the name, and nothing when the town is missing", () => {
    const place = makePlace({
      name: "Wise Avenue Volunteer Fire Company",
      locality: "Dundalk",
    });
    expect(identityWords(place)).toEqual(["dundalk", "wise", "avenue"]);
    expect(identityWords({ ...place, locality: null })).toEqual([
      "wise",
      "avenue",
    ]);
  });
  it("treats a two-word town as a phrase", () => {
    const identity = identityWords(
      makePlace({ name: "Fire Station 3", locality: "Lake Ozark" }),
    );
    expect(identity).toEqual(["lake ozark"]);
    expect(namesPlace(words("Lake Ozark FPD adds an engine"), identity)).toBe(
      true,
    );
    expect(namesPlace(words("Ozark County lake report"), identity)).toBe(false);
  });
  it("matches across accents and hyphens", () => {
    const identity = identityWords(
      makePlace({
        name: "Service de sécurité incendie de Trois-Rivières",
        locality: "Trois-Rivières",
      }),
    );
    expect(namesPlace(words("TROIS RIVIERES council minutes"), identity)).toBe(
      true,
    );
  });
});
