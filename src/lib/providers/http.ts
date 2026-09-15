import "server-only";

import { setTimeout } from "node:timers/promises";
import { ResearchError } from "@/lib/server/errors";

/** Carries only the status. Provider bodies can contain secrets or source text. */
export class ProviderHttpError extends Error {
  constructor(readonly status: number) {
    super(`Provider returned HTTP ${status}`);
    this.name = "ProviderHttpError";
  }
}

/** Identifies HTTP statuses eligible for a request retry. */
export function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

interface JsonRequest {
  url: string;
  init: RequestInit;
  signal: AbortSignal;
  timeoutMs: number;
}

/** Waits within the request deadline and preserves its abort reason. */
const sleep = (ms: number, signal: AbortSignal) =>
  setTimeout(ms, undefined, { signal }).catch(() => signal.throwIfAborted());

/** Fetches JSON under one deadline, retrying a connection failure or transient status once after a bounded delay. */
export async function requestJson(
  fetchImpl: typeof fetch,
  request: JsonRequest,
  wait = sleep,
): Promise<unknown> {
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(request.timeoutMs),
  ]);
  const send = () =>
    fetchImpl(request.url, { ...request.init, signal, cache: "no-store" });
  let response = await send().catch(() => null);
  if (!response || isTransientStatus(response.status)) {
    signal.throwIfAborted();
    // Exa answers a burst of searches with 429 and Retry-After; wait it out before the one retry.
    const header = response?.headers.get("retry-after");
    const seconds = header ? Number(header) : Number.NaN;
    await wait(
      Math.min(3_000, (Number.isFinite(seconds) ? seconds : 0.5) * 1000),
      signal,
    );
    response = await send();
  }
  if (!response.ok) throw new ProviderHttpError(response.status);
  try {
    return (await response.json()) as unknown;
  } catch {
    signal.throwIfAborted();
    throw new ResearchError(
      "A research provider returned an unreadable response. Please try again.",
    );
  }
}

/** Preserves safe application errors and timeouts, replacing other provider failures with public messages. */
export function providerFailure(error: unknown, provider: string): never {
  if (error instanceof ResearchError) throw error;
  if (error instanceof Error && error.name === "TimeoutError") {
    throw error;
  }
  const configuration =
    error instanceof ProviderHttpError &&
    [400, 401, 402, 403, 404, 422].includes(error.status);
  throw new ResearchError(
    configuration
      ? `${provider} is not configured for this request. Please contact the site owner.`
      : `${provider} is temporarily unavailable. Please try again.`,
    { retryable: !configuration },
  );
}
