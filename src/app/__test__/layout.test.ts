import { describe, expect, it } from "vitest";
import { metadata } from "../layout";

describe("root layout metadata", () => {
  it("names the app and keeps the deployment out of search indexes", () => {
    expect(metadata.title).toBe("Department Brief | Garage");
    expect(metadata.description).toMatch(/pre-call brief/);
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
