import { describe, expect, it, vi } from "vitest";
import {
  makeDraft,
  makeEvidenceSource,
  makePlace,
  TEST_DATE,
} from "@/__test__/factories";
import type { SynthesisInput } from "@/lib/research/contracts";
import { createSynthesizer } from "../openai";
import { PROMPT_VERSION } from "../prompt";

const config = {
  openaiApiKey: "test-openai-key",
  openaiModel: "gpt-6-astra",
  reasoningEffort: "medium" as const,
  modelTimeoutMs: 5_000,
};
const signal = () => new AbortController().signal;
const input: SynthesisInput = {
  place: makePlace(),
  sources: [makeEvidenceSource()],
  researchDate: TEST_DATE.slice(0, 10),
};
const draft = makeDraft();

function responseBody(
  options: { text?: string; refusal?: string; status?: string } = {},
) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 1_784_000_000,
    status: options.status ?? "completed",
    model: "gpt-6-astra-2026-09-10",
    output: [
      {
        type: "message",
        id: "msg_test",
        role: "assistant",
        status: "completed",
        content: options.refusal
          ? [{ type: "refusal", refusal: options.refusal }]
          : [
              {
                type: "output_text",
                text: options.text ?? JSON.stringify(draft),
                annotations: [],
              },
            ],
      },
    ],
    usage: { input_tokens: 2300, output_tokens: 900, total_tokens: 3200 },
  };
}

describe("OpenAI Responses adapter", () => {
  it("uses the actual SDK Structured Outputs parser and returns recorded usage", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(responseBody()));
    const result = await createSynthesizer(config, fetchImpl)(input, signal());
    expect(result.draft).toEqual(draft);
    expect(result.usage).toEqual({
      inputTokens: 2300,
      outputTokens: 900,
      model: "gpt-6-astra-2026-09-10",
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      model: "gpt-6-astra",
      reasoning: { effort: "medium" },
      store: false,
      max_output_tokens: 16000,
      truncation: "disabled",
      metadata: { prompt_version: PROMPT_VERSION },
      text: {
        format: { type: "json_schema", strict: true, name: "department_brief" },
      },
    });
    const evidence = JSON.parse(payload.input);
    expect(evidence.selected_place).toEqual(input.place);
    expect(evidence.evidence_sources).toEqual(input.sources);
    expect(payload.tools).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects a refusal without displaying its raw content", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(responseBody({ refusal: "Sensitive untrusted content" })),
      );
    const request = createSynthesizer(config, fetchImpl)(input, signal());
    await expect(request).rejects.toMatchObject({
      message: expect.stringContaining("could not prepare a brief"),
      retryable: false,
    });
    await expect(request).rejects.not.toThrow("Sensitive untrusted content");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects incomplete output instead of parsing a partial brief", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          responseBody({ text: '{"scope":', status: "incomplete" }),
        ),
      );
    await expect(
      createSynthesizer(config, fetchImpl)(input, signal()),
    ).rejects.toMatchObject({
      message: expect.stringContaining("could not be completed"),
      retryable: true,
    });
  });

  it.each(["not JSON", '{"scope":"wrong shape"}'])(
    "rejects malformed model output: %s",
    async (text) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(responseBody({ text })));
      await expect(
        createSynthesizer(config, fetchImpl)(input, signal()),
      ).rejects.toMatchObject({
        message: expect.stringContaining("could not be validated"),
        retryable: true,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it("retries a transient status once through the SDK", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { error: { message: "Provider overload" } },
          { status: 429, headers: { "retry-after-ms": "1" } },
        ),
      )
      .mockResolvedValueOnce(Response.json(responseBody()));
    await expect(
      createSynthesizer(config, fetchImpl)(input, signal()),
    ).resolves.toMatchObject({ draft });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("never retries credential failures or exposes the provider message", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { message: `Bad API key: ${config.openaiApiKey}` } },
          { status: 401 },
        ),
      );
    const request = createSynthesizer(config, fetchImpl)(input, signal());
    await expect(request).rejects.toMatchObject({
      message: expect.stringContaining("is not configured for this request"),
      retryable: false,
    });
    await expect(request).rejects.not.toThrow(config.openaiApiKey);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("makes no request after the research deadline expires", async () => {
    const deadline = AbortSignal.abort(
      new DOMException("Research deadline", "TimeoutError"),
    );
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(
      createSynthesizer(config, fetchImpl)(input, deadline),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("preserves the research timeout when the SDK wraps an interrupted request", async () => {
    const deadline = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            {
              once: true,
            },
          );
          deadline.abort(new DOMException("Research deadline", "TimeoutError"));
        }),
    );
    await expect(
      createSynthesizer(config, fetchImpl)(input, deadline.signal),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("reports an unavailable configured model as a configuration error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: { message: "Unknown model in private project" } },
          { status: 404 },
        ),
      );
    await expect(
      createSynthesizer(config, fetchImpl)(input, signal()),
    ).rejects.toMatchObject({
      message: expect.stringContaining("is not configured for this request"),
      retryable: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("OpenAI attempt deadline", () => {
  it("reports the SDK's own attempt timeout as the model taking too long, after its one retry", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );
    await expect(
      createSynthesizer({ ...config, modelTimeoutMs: 20 }, fetchImpl)(
        input,
        signal(),
      ),
    ).rejects.toMatchObject({
      message:
        "The research model took too long to write this brief. Please try again.",
      retryable: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  }, 10_000);
});
