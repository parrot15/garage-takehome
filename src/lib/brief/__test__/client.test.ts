import { describe, expect, it, vi } from "vitest";
import { SAMPLE_BRIEF } from "@/lib/sample";
import { createBriefRequester } from "../client";

const ndjson = (events: unknown[], status = 200) =>
  new Response(events.map((event) => JSON.stringify(event)).join("\n"), {
    status,
    headers: { "Content-Type": "application/x-ndjson" },
  });
const collect = async (events: AsyncIterable<unknown>) => {
  const list: unknown[] = [];
  for await (const event of events) list.push(event);
  return list;
};
const request = (fetchImpl: typeof fetch) =>
  createBriefRequester(fetchImpl)("example-place");

describe("the browser's brief request", () => {
  it("posts the Place ID for an uncached event stream and yields the events", async () => {
    const stage = { type: "stage", stage: "searching" };
    const complete = { type: "complete", brief: SAMPLE_BRIEF };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(ndjson([stage, complete]));
    expect(await collect(request(fetchImpl))).toEqual([stage, complete]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/brief",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ placeId: "example-place" }),
        cache: "no-store",
        headers: expect.objectContaining({ Accept: "application/x-ndjson" }),
      }),
    );
  });
  it("reads events split across network chunks and line endings, then releases the stream", async () => {
    const brief = {
      ...SAMPLE_BRIEF,
      scope: { ...SAMPLE_BRIEF.scope, name: "Département" },
    };
    const bytes = new TextEncoder().encode(
      `${JSON.stringify({ type: "stage", stage: "reading" })}\r\n\n${JSON.stringify({ type: "complete", brief })}`,
    );
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (let offset = 0; offset < bytes.length; offset += 7)
            controller.enqueue(bytes.slice(offset, offset + 7));
          controller.close();
        },
      }),
    );
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    expect(await collect(request(fetchImpl))).toEqual([
      { type: "stage", stage: "reading" },
      { type: "complete", brief },
    ]);
    expect(response.body?.locked).toBe(false);
  });
  it("rejects an event outside the server contract", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(ndjson([{ type: "stage", stage: "guessing" }]));
    await expect(collect(request(fetchImpl))).rejects.toThrow();
  });
  it("turns a failed response into the error it carries", async () => {
    const error = { message: "Research is not configured.", retryable: false };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ error }), { status: 503 }),
      );
    expect(await collect(request(fetchImpl))).toEqual([
      { type: "error", error },
    ]);
  });
  it("knows a platform rate limit by its status alone, whatever the body", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("<html>Firewall blocked</html>", { status: 429 }),
      );
    expect(await collect(request(fetchImpl))).toEqual([
      {
        type: "error",
        error: {
          message:
            "Too many research requests. Please wait a few minutes and try again.",
          retryable: true,
        },
      },
    ]);
  });
  it("falls back to a safe error when a failed response carries none", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response("secret html error body", { status: 500 }),
      );
    expect(await collect(request(fetchImpl))).toEqual([
      {
        type: "error",
        error: {
          message: "Research is temporarily unavailable. Please try again.",
          retryable: true,
        },
      },
    ]);
  });
  it("throws when a successful response has no body", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    await expect(collect(request(fetchImpl))).rejects.toThrow(
      "Missing response body",
    );
  });
});

describe("a broken or idle stream", () => {
  it("throws on a stream cut off inside an event and releases the reader", async () => {
    const response = new Response(
      `${JSON.stringify({ type: "stage", stage: "reading" })}\n{"type":"comp`,
    );
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(collect(request(fetchImpl))).rejects.toThrow();
    expect(response.body?.locked).toBe(false);
  });
  it("ignores the blank keep-alive lines the server sends while it waits", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          `\n\n${JSON.stringify({ type: "stage", stage: "searching" })}\n\n\n`,
        ),
      );
    expect(await collect(request(fetchImpl))).toEqual([
      { type: "stage", stage: "searching" },
    ]);
  });
});
