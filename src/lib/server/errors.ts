import type { PublicError } from "@/lib/brief/schema";

/** Carries a client-safe failure message; HTTP status applies only before streaming starts. */
export class ResearchError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(
    message: string,
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "ResearchError";
    this.status = options.status ?? 502;
    this.retryable = options.retryable ?? true;
  }
}

/** Converts failures to public errors, hiding internal messages unless explicitly marked safe. */
export function publicError(error: unknown, requestId?: string): PublicError {
  if (error instanceof ResearchError)
    return { message: error.message, retryable: error.retryable, requestId };
  if (error instanceof Error && error.name === "TimeoutError")
    return {
      message: "Research took longer than expected. Please try again.",
      retryable: true,
      requestId,
    };
  return {
    message: "We couldn't finish this research. Please try again.",
    retryable: true,
    requestId,
  };
}
