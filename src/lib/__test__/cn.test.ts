import { describe, expect, it } from "vitest";
import { cn } from "../cn";

const classes = (value: string) => value.split(" ").sort();

describe("cn", () => {
  it("drops falsy values and merges conflicting utilities, last one winning", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
    expect(classes(cn("px-2 text-sm", "px-4"))).toEqual(["px-4", "text-sm"]);
  });
  it("keeps a line height beside a later font size, because the theme's text scale sets size only", () => {
    expect(classes(cn("leading-loose", "text-sm"))).toEqual([
      "leading-loose",
      "text-sm",
    ]);
    expect(classes(cn("text-sm", "leading-loose"))).toEqual([
      "leading-loose",
      "text-sm",
    ]);
  });
});
