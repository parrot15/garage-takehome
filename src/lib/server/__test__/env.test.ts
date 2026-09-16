import { describe, expect, it } from "vitest";
import { getServerConfig } from "../env";

const credentials = {
  GOOGLE_PLACES_API_KEY: "google-test",
  EXA_API_KEY: "exa-test",
  OPENAI_API_KEY: "openai-test",
};
describe("central server configuration", () => {
  it("loads defaults and requires all live provider credentials", () => {
    expect(getServerConfig(credentials)).toMatchObject({
      openaiModel: "gpt-6-astra",
      reasoningEffort: "low",
      modelTimeoutMs: 170000,
      researchTimeoutMs: 220000,
    });
    expect(() => getServerConfig({})).toThrow("not configured");
  });
  it("reads every setting from its variable", () => {
    expect(
      getServerConfig({
        ...credentials,
        OPENAI_MODEL: "gpt-6-nova",
        OPENAI_REASONING_EFFORT: "high",
        PROVIDER_TIMEOUT_MS: "30000",
        MODEL_TIMEOUT_MS: "120000",
        RESEARCH_TIMEOUT_MS: "200000",
      }),
    ).toEqual({
      googlePlacesApiKey: "google-test",
      exaApiKey: "exa-test",
      openaiApiKey: "openai-test",
      openaiModel: "gpt-6-nova",
      reasoningEffort: "high",
      providerTimeoutMs: 30000,
      modelTimeoutMs: 120000,
      researchTimeoutMs: 200000,
    });
  });
  it("never leaks credentials in a validation failure", () => {
    try {
      getServerConfig({
        ...credentials,
        OPENAI_MODEL: "",
        MODEL_TIMEOUT_MS: "invalid",
      });
    } catch (error) {
      expect(String(error)).not.toContain("openai-test");
    }
  });
  it.each([
    { NODE_ENV: "development" },
    { NODE_ENV: "production" },
    { NODE_ENV: "production", VERCEL: "1" },
  ])("requires only provider credentials in %j", (environment) => {
    expect(getServerConfig({ ...credentials, ...environment })).toMatchObject({
      googlePlacesApiKey: credentials.GOOGLE_PLACES_API_KEY,
      exaApiKey: credentials.EXA_API_KEY,
      openaiApiKey: credentials.OPENAI_API_KEY,
    });
  });
  it.each(["0", "1", "999999", "NaN"])(
    "rejects an invalid timeout %s",
    (value) =>
      expect(() =>
        getServerConfig({ ...credentials, RESEARCH_TIMEOUT_MS: value }),
      ).toThrow(),
  );
  it("normalizes environment whitespace", () => {
    expect(
      getServerConfig({ ...credentials, OPENAI_API_KEY: " openai-test " }),
    ).toMatchObject({ openaiApiKey: "openai-test" });
  });
});
