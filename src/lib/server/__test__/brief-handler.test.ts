import { afterEach, describe, expect, it, vi } from "vitest";
import { makePlace, makeProviders } from "@/__test__/factories";
import { createBriefHandler } from "../brief-handler";
import { getServerConfig } from "../env";
import { ResearchError } from "../errors";

const config = () =>
  getServerConfig({
    GOOGLE_PLACES_API_KEY: "test",
    EXA_API_KEY: "test",
    OPENAI_API_KEY: "test",
  });
const request = (body: unknown = { placeId: "test" }) =>
  new Request("https://app.example.org/api/brief", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
const setup = (
  overrides: Partial<Parameters<typeof createBriefHandler>[0]> = {},
) =>
  createBriefHandler({
    getConfig: config,
    createProviders: () => makeProviders(),
    ...overrides,
  });

afterEach(() => vi.useRealTimers());

describe("POST brief HTTP boundary", () => {
  it("streams genuine stages and a final validated result with no caching", async () => {
    const response = await setup()(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cache-control")).toContain("no-transform");
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events[0]).toEqual({ type: "stage", stage: "resolving" });
    expect(events.at(-1).type).toBe("complete");
  });
  it.each(["complete", "error", "disconnect"])(
    "keeps a waiting connection active and clears its heartbeat on %s",
    async (outcome) => {
      vi.useFakeTimers();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const log = vi.fn();
      const response = await setup({
        log,
        createProviders: () =>
          makeProviders({
            resolvePlace: async () => {
              await gate;
              if (outcome === "error") throw new Error("Provider unavailable");
              return makePlace();
            },
          }),
      })(request());
      if (!response.body) throw new Error("Missing response body");
      const reader = response.body.getReader();
      expect(new TextDecoder().decode((await reader.read()).value)).toContain(
        '"stage":"resolving"',
      );
      await vi.advanceTimersByTimeAsync(15_000);
      expect(new TextDecoder().decode((await reader.read()).value)).toBe("\n");
      if (outcome === "disconnect") {
        await reader.cancel();
        expect(vi.getTimerCount()).toBe(0);
      }
      release();
      await vi.advanceTimersByTimeAsync(0);
      if (outcome !== "disconnect") {
        const chunks: string[] = [];
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          chunks.push(new TextDecoder().decode(next.value));
        }
        expect(chunks.join("")).toContain(`"type":"${outcome}"`);
      }
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: outcome === "error" ? "request_failed" : "complete",
        }),
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it.each([
    "{bad json",
    {},
    { placeId: "" },
    { placeId: "https://google.com/something" },
    { placeId: "abc", unexpected: true },
  ])("rejects malformed input before provider work: %j", async (body) => {
    const createProviders = vi.fn(() => makeProviders());
    const response = await setup({ createProviders })(request(body));
    expect(response.status).toBe(400);
    expect(createProviders).not.toHaveBeenCalled();
  });
  it("returns missing configuration as a safe setup error", async () => {
    const response = await setup({ getConfig: () => getServerConfig({}) })(
      request(),
    );
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatchObject({
      message: expect.stringContaining("not configured"),
      retryable: false,
    });
  });
  it("streams safe terminal provider errors without exposing raw secrets", async () => {
    const response = await setup({
      createProviders: () =>
        makeProviders({
          resolvePlace: async () => {
            throw new Error("SECRET_DO_NOT_LEAK");
          },
        }),
    })(request());
    const body = await response.text();
    expect(body).not.toContain("SECRET_DO_NOT_LEAK");
    expect(body).toContain("We couldn't finish this research");
  });
  it("streams a retryable timeout when the overall research deadline expires", async () => {
    const response = await setup({
      getConfig: () => ({ ...config(), researchTimeoutMs: 10 }),
      createProviders: () =>
        makeProviders({
          resolvePlace: async (_id, signal) =>
            new Promise((_resolve, reject) => {
              signal.addEventListener("abort", () => reject(signal.reason), {
                once: true,
              });
            }),
        }),
    })(request());
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({
      type: "error",
      error: {
        message: "Research took longer than expected. Please try again.",
        retryable: true,
      },
    });
  });
  it("finishes research when the request connection closes", async () => {
    const connection = new AbortController();
    const search = vi.fn(makeProviders().search);
    const log = vi.fn();
    const response = await setup({
      createProviders: () =>
        makeProviders({
          resolvePlace: async () => {
            connection.abort();
            return makePlace();
          },
          search,
        }),
      log,
    })(new Request(request(), { signal: connection.signal }));
    expect(await response.text()).toContain('"type":"complete"');
    expect(search).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: "complete" }),
    );
  });
  it.each(["complete", "request_failed"])(
    "handles a disconnected response while research reaches %s",
    async (terminalEvent) => {
      let providerSignal: AbortSignal | undefined;
      let finish: () => void = () => {};
      const pending = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const providers = makeProviders({
        resolvePlace: async (_id, signal) => {
          providerSignal = signal;
          await pending;
          if (terminalEvent === "request_failed")
            throw new Error("Provider down");
          return makePlace();
        },
      });
      const log = vi.fn();
      const response = await setup({ createProviders: () => providers, log })(
        request(),
      );
      const reader = response.body?.getReader();
      await reader?.read();
      await reader?.cancel();
      expect(providerSignal?.aborted).toBe(false);
      finish();
      await vi.waitFor(() =>
        expect(log).toHaveBeenCalledWith(
          expect.objectContaining({ event: terminalEvent }),
        ),
      );
      if (terminalEvent === "complete")
        expect(log).not.toHaveBeenCalledWith(
          expect.objectContaining({ event: "request_failed" }),
        );
    },
  );
  it("maps expected errors to their HTTP status before streaming", async () => {
    const response = await setup({
      createProviders: () => {
        throw new ResearchError("Try later", { status: 503 });
      },
    })(request());
    expect(response.status).toBe(503);
  });
});

describe("failures before the stream starts", () => {
  it("answers an unexpected failure with a generic 500 that names nothing", async () => {
    const response = await setup({
      getConfig: () => {
        throw new Error("ENV_SECRET");
      },
    })(request());
    expect(response.status).toBe(500);
    const body = await response.text();
    expect(body).not.toContain("ENV_SECRET");
    expect(JSON.parse(body).error).toEqual({
      message: "We couldn't finish this research. Please try again.",
      retryable: true,
      requestId: expect.any(String),
    });
  });
  it("gives every rejection its own reference id", async () => {
    const handler = setup();
    const first = (await (await handler(request({}))).json()).error.requestId;
    const second = (await (await handler(request({}))).json()).error.requestId;
    expect(first).toEqual(expect.any(String));
    expect(first).not.toBe(second);
  });
});
