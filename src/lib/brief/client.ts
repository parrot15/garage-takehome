import { z } from "zod";
import {
  type PublicError,
  PublicErrorSchema,
  type ResearchEvent,
  ResearchEventSchema,
} from "./schema";

/** Asks the server for a brief and yields the events it streams back. */
export type RequestBrief = (placeId: string) => AsyncIterable<ResearchEvent>;

const RATE_LIMITED: PublicError = {
  message:
    "Too many research requests. Please wait a few minutes and try again.",
  retryable: true,
};
const UNAVAILABLE: PublicError = {
  message: "Research is temporarily unavailable. Please try again.",
  retryable: true,
};
const FailureSchema = z.object({ error: PublicErrorSchema });

/** Parses and validates streamed events, including lines split across network chunks. */
async function* readEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<ResearchEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      const lines = pending.split("\n");
      pending = done ? "" : (lines.pop() ?? "");
      for (const line of lines) {
        if (line.trim()) yield ResearchEventSchema.parse(JSON.parse(line));
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}

/** Extracts a public error, recognizing rate limits even when the response is not JSON. */
async function failure(response: Response): Promise<PublicError> {
  if (response.status === 429) return RATE_LIMITED;
  const parsed = FailureSchema.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success ? parsed.data.error : UNAVAILABLE;
}

/**
 * Creates a brief API client that yields validated research events.
 * HTTP failures yield an error event; connection and event-parsing failures throw.
 */
export function createBriefRequester(fetchImpl: typeof fetch): RequestBrief {
  return async function* requestBrief(
    placeId: string,
  ): AsyncGenerator<ResearchEvent> {
    const response = await fetchImpl("/api/brief", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify({ placeId }),
      cache: "no-store",
    });
    if (!response.ok) {
      yield { type: "error", error: await failure(response) };
      return;
    }
    if (!response.body) throw new Error("Missing response body");
    yield* readEvents(response.body);
  };
}
