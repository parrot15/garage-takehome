import { describe, expect, it, vi } from "vitest";
import { ResearchError } from "@/lib/server/errors";
import {
  isTransientStatus,
  ProviderHttpError,
  providerFailure,
  requestJson,
} from "../http";

const request = (signal = new AbortController().signal, timeoutMs = 5000) => ({
  url: "https://api.example.com/search",
  init: {},
  signal,
  timeoutMs,
});
const stalled: typeof fetch = (_input, init) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
      once: true,
    });
  });

describe("provider transport", () => {
  it("retries a transient status once", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("overloaded", {
          status: 503,
          headers: { "Retry-After": "0" },
        }),
      )
      .mockResolvedValueOnce(Response.json({ success: true }));
    await expect(requestJson(fetchImpl, request())).resolves.toEqual({
      success: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["1", 1000],
    ["30", 3000],
    ["soon", 500],
    [null, 500],
  ])(
    "waits out Retry-After %s before the retry, capped at three seconds and half a second by default",
    async (header, delayMs) => {
      const fetchImpl = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          new Response("slow down", {
            status: 429,
            headers: header === null ? {} : { "Retry-After": header },
          }),
        )
        .mockResolvedValueOnce(Response.json({ success: true }));
      const wait = vi.fn(async () => {});
      await expect(requestJson(fetchImpl, request(), wait)).resolves.toEqual({
        success: true,
      });
      expect(wait).toHaveBeenCalledExactlyOnceWith(
        delayMs,
        expect.any(AbortSignal),
      );
      expect(wait.mock.invocationCallOrder[0]).toBeLessThan(
        fetchImpl.mock.invocationCallOrder[1] ?? 0,
      );
    },
  );

  it("stops waiting for Retry-After when the deadline expires", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("slow down", {
        status: 429,
        headers: { "Retry-After": "3" },
      }),
    );
    await expect(
      requestJson(fetchImpl, request(AbortSignal.timeout(10))),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a dropped connection once, after the default wait", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(Response.json({ success: true }));
    const wait = vi.fn(async () => {});
    await expect(requestJson(fetchImpl, request(), wait)).resolves.toEqual({
      success: true,
    });
    expect(wait).toHaveBeenCalledExactlyOnceWith(500, expect.any(AbortSignal));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports a second transient failure without retrying again", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response("overloaded", {
          status: 500,
          headers: { "Retry-After": "0" },
        }),
    );
    await expect(requestJson(fetchImpl, request())).rejects.toMatchObject({
      status: 500,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not retry a client error", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("denied", { status: 403 }));
    await expect(requestJson(fetchImpl, request())).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("aborts a stalled provider when the deadline expires", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(stalled);
    await expect(
      requestJson(fetchImpl, request(undefined, 10)),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("honors the overall research deadline before the provider deadline", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(stalled);
    await expect(
      requestJson(fetchImpl, request(AbortSignal.timeout(10))),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed JSON without exposing the body or retrying", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("secret html error body"));
    await expect(requestJson(fetchImpl, request())).rejects.toMatchObject({
      message:
        "A research provider returned an unreadable response. Please try again.",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

/** What a function throws, so the thrown value can be matched as an object. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("provider failure classification", () => {
  it.each([
    [408, true],
    [429, true],
    [500, true],
    [503, true],
    [400, false],
    [403, false],
    [404, false],
    [200, false],
  ])("treats HTTP %i as transient: %s", (status, transient) => {
    expect(isTransientStatus(status)).toBe(transient);
  });
  it("carries only the status of a failed response", () => {
    const error = new ProviderHttpError(502);
    expect(error.name).toBe("ProviderHttpError");
    expect(error.status).toBe(502);
    expect(error.message).toBe("Provider returned HTTP 502");
  });
  it("rethrows a research error and a deadline untouched", () => {
    const own = new ResearchError("Ours", { retryable: false });
    expect(thrown(() => providerFailure(own, "Exa"))).toBe(own);
    const deadline = new DOMException("late", "TimeoutError");
    expect(thrown(() => providerFailure(deadline, "Exa"))).toBe(deadline);
  });
  it.each([400, 401, 402, 403, 404, 422])(
    "reports HTTP %i as a configuration problem that retrying cannot fix",
    (status) => {
      expect(
        thrown(() =>
          providerFailure(new ProviderHttpError(status), "Web search"),
        ),
      ).toMatchObject({
        message:
          "Web search is not configured for this request. Please contact the site owner.",
        retryable: false,
      });
    },
  );
  it.each([
    ["HTTP 500", new ProviderHttpError(500)],
    ["HTTP 429", new ProviderHttpError(429)],
    ["a dropped connection", new TypeError("fetch failed")],
    ["a thrown string", "boom"],
  ])("reports %s as temporarily unavailable and retryable", (_name, error) => {
    expect(thrown(() => providerFailure(error, "Web search"))).toMatchObject({
      message: "Web search is temporarily unavailable. Please try again.",
      retryable: true,
    });
  });
});
