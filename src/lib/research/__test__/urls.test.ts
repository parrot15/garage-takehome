import { describe, expect, it } from "vitest";
import { canonicalUrl, safeLinkUrl, siteHost } from "../urls";

describe("source URLs", () => {
  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,unsafe",
    "https://user:password@example.org",
    "invalid",
  ])("rejects a link that is not a plain web address: %s", (url) =>
    expect(safeLinkUrl(url)).toBeNull(),
  );
  it("keeps a plain web link as given", () =>
    expect(safeLinkUrl("https://example.com/memo?fileID=20")).toBe(
      "https://example.com/memo?fileID=20",
    ));
  it("preserves document identity while removing tracking", () =>
    expect(
      canonicalUrl(
        "https://city.example.gov/AgendaCenter/ViewFile/Item/1378?fileID=8976&utm_source=mail#page=1",
      ),
    ).toBe(
      "https://city.example.gov/AgendaCenter/ViewFile/Item/1378?fileID=8976",
    ));
  it("does not collapse distinct files", () =>
    expect(canonicalUrl("https://city.example.gov/view?fileID=1")).not.toBe(
      canonicalUrl("https://city.example.gov/view?fileID=2"),
    ));
  it("keeps case-sensitive paths and meaningful query values", () =>
    expect(canonicalUrl("https://CITY.EXAMPLE.ORG/Records/ID?Token=AbC")).toBe(
      "https://city.example.org/Records/ID?Token=AbC",
    ));
  it.each([
    [
      "https://www.CityOfPeekskillNY.gov/AgendaCenter/x?fileID=1",
      "cityofpeekskillny.gov",
    ],
    ["http://fire.maple.example.org/apparatus", "fire.maple.example.org"],
    ["https://www2.example.org/", "www2.example.org"],
  ])("names the site behind %s as %s", (url, host) =>
    expect(siteHost(url)).toBe(host),
  );
});

describe("canonical links", () => {
  it("rejects a link longer than an address bar accepts", () => {
    const long = `https://example.org/${"a".repeat(2048)}`;
    expect(safeLinkUrl(long)).toBeNull();
    expect(canonicalUrl(long)).toBeNull();
  });
  it("drops click identifiers of any case and sorts what remains", () => {
    expect(
      canonicalUrl(
        "https://city.example.gov/view?UTM_Campaign=x&fbclid=1&GCLID=2&msclkid=3&fileID=9&a=1",
      ),
    ).toBe("https://city.example.gov/view?a=1&fileID=9");
  });
  it("keeps the www prefix and trailing slash, which are part of the address", () => {
    expect(canonicalUrl("https://www.example.org/fire/")).toBe(
      "https://www.example.org/fire/",
    );
  });
});
