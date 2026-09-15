import { describe, expect, it } from "vitest";
import { publicError, ResearchError } from "../errors";

describe("ResearchError", () => {
  it("is a retryable bad-gateway failure unless told otherwise", () => {
    const error = new ResearchError("Try again");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ResearchError");
    expect(error.message).toBe("Try again");
    expect(error.status).toBe(502);
    expect(error.retryable).toBe(true);
  });
  it("carries the status and retryability it is given", () => {
    const error = new ResearchError("Not configured", {
      status: 503,
      retryable: false,
    });
    expect(error.status).toBe(503);
    expect(error.retryable).toBe(false);
  });
});

describe("publicError", () => {
  it("passes a research error through with the request id", () => {
    expect(
      publicError(
        new ResearchError("Check the Place ID.", { retryable: false }),
        "req-1",
      ),
    ).toEqual({
      message: "Check the Place ID.",
      retryable: false,
      requestId: "req-1",
    });
  });
  it.each([
    [
      "a timeout DOMException",
      new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      ),
    ],
    [
      "any error named TimeoutError",
      Object.assign(new Error("deadline"), { name: "TimeoutError" }),
    ],
  ])("reports %s as research taking too long", (_name, error) => {
    expect(publicError(error, "req-2")).toEqual({
      message: "Research took longer than expected. Please try again.",
      retryable: true,
      requestId: "req-2",
    });
  });
  it.each([
    ["an unexpected error", new Error("ECONNRESET with key sk-secret")],
    ["an abort that is not a timeout", new DOMException("gone", "AbortError")],
    ["a thrown string", "sk-secret"],
    ["nothing at all", undefined],
  ])("hides %s behind one generic retryable message", (_name, error) => {
    const safe = publicError(error, "req-3");
    expect(safe).toEqual({
      message: "We couldn't finish this research. Please try again.",
      retryable: true,
      requestId: "req-3",
    });
    expect(JSON.stringify(safe)).not.toContain("secret");
  });
  it("leaves the request id out of the wire format when none is given", () => {
    const wire = JSON.parse(
      JSON.stringify(publicError(new ResearchError("x"))),
    );
    expect(wire).toEqual({ message: "x", retryable: true });
  });
});
