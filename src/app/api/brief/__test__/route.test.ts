import { describe, expect, it } from "vitest";
import { getServerConfig } from "@/lib/server/env";
import { maxDuration, POST, runtime } from "../route";

const credentials = {
  GOOGLE_PLACES_API_KEY: "k",
  EXA_API_KEY: "k",
  OPENAI_API_KEY: "k",
};

describe("the brief route", () => {
  it("runs on Node with a host duration above the longest research deadline the configuration allows", () => {
    expect(runtime).toBe("nodejs");
    const longest = getServerConfig({
      ...credentials,
      RESEARCH_TIMEOUT_MS: "220000",
    }).researchTimeoutMs;
    expect(() =>
      getServerConfig({ ...credentials, RESEARCH_TIMEOUT_MS: "220001" }),
    ).toThrow();
    expect(maxDuration * 1000).toBeGreaterThan(longest);
  });
  it("rejects a malformed request before reading configuration or calling a provider", async () => {
    const response = await POST(
      new Request("https://app.example.org/api/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatchObject({ retryable: false });
  });
});
