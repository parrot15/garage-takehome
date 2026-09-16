// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RequestBrief } from "@/lib/brief/client";
import type { ResearchEvent } from "@/lib/brief/schema";
import { SAMPLE_BRIEF } from "@/lib/sample";
import { useResearch } from "../use-research";

const complete: ResearchEvent = { type: "complete", brief: SAMPLE_BRIEF };
const connectionLost =
  "The connection ended before your brief was ready. Please try again.";
/** A request that yields these events and ends. */
const events = (...list: ResearchEvent[]): RequestBrief =>
  async function* () {
    yield* list;
  };
/** A request whose first pull fails, as a broken connection would. */
const failing =
  (error: Error): RequestBrief =>
  () => ({
    [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) }),
  });
const research = (request: RequestBrief) =>
  renderHook(() => useResearch(request));

describe("useResearch", () => {
  it("passes the Place ID to the request and follows progress, identity, and the final brief", async () => {
    const request = vi.fn<RequestBrief>(
      events(
        { type: "stage", stage: "searching" },
        { type: "identity", place: SAMPLE_BRIEF.place },
        complete,
      ),
    );
    const { result } = research(request);
    await act(async () => result.current.research("example-place"));
    expect(request).toHaveBeenCalledWith("example-place");
    expect(result.current.status).toBe("success");
    expect(result.current.brief).toEqual(SAMPLE_BRIEF);
    expect(result.current.identity).toEqual(SAMPLE_BRIEF.place);
  });
  it("shows the error a request yields", async () => {
    const error = { message: "Research is not configured.", retryable: false };
    const { result } = research(events({ type: "error", error }));
    await act(async () => result.current.research("place"));
    expect(result.current.status).toBe("error");
    expect(result.current.error).toEqual(error);
  });
  it("keeps an incomplete stream from becoming a successful brief", async () => {
    const { result } = research(events({ type: "stage", stage: "reading" }));
    await act(async () => result.current.research("place"));
    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toBe(connectionLost);
  });
  it("reports a failed request as a lost connection, never with its own message", async () => {
    const { result } = research(failing(new Error("private-secret")));
    await act(async () => result.current.research("place"));
    expect(result.current.status).toBe("error");
    expect(result.current.error?.message).toBe(connectionLost);
  });
  it("finishes the active run before accepting another request or a sample", async () => {
    let finish!: (event: ResearchEvent) => void;
    const request = vi.fn<RequestBrief>(async function* () {
      yield await new Promise<ResearchEvent>((resolve) => {
        finish = resolve;
      });
    });
    const { result } = research(request);
    let run!: Promise<void>;
    act(() => {
      run = result.current.research("place");
    });
    await act(async () => {
      await result.current.research("other-place");
      result.current.showSample(SAMPLE_BRIEF);
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("researching");
    expect(result.current.brief).toBeNull();
    await act(async () => {
      finish(complete);
      await run;
    });
    expect(result.current.status).toBe("success");
    expect(result.current.brief).toEqual(SAMPLE_BRIEF);
    const nextBrief = { ...SAMPLE_BRIEF, runId: "next-generation" };
    request.mockImplementationOnce(
      events({ type: "complete", brief: nextBrief }),
    );
    await act(async () => result.current.research("next-place"));
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.brief).toEqual(nextBrief);
  });
  it.each([
    [
      "a streamed error",
      events({
        type: "error",
        error: { message: "Try again.", retryable: true },
      }),
    ],
    ["an incomplete stream", events({ type: "stage", stage: "reading" })],
    ["a failed request", failing(new Error("Connection lost"))],
  ])("allows another run after %s", async (_failure, failed) => {
    const request = vi
      .fn<RequestBrief>()
      .mockImplementationOnce(failed)
      .mockImplementationOnce(events(complete));
    const { result } = research(request);
    await act(async () => result.current.research("place"));
    expect(result.current.status).toBe("error");
    expect(result.current.error?.retryable).toBe(true);
    await act(async () => result.current.research("place"));
    expect(request).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("success");
    expect(result.current.error).toBeNull();
    expect(result.current.brief).toEqual(SAMPLE_BRIEF);
  });
});

describe("progress while a run is under way", () => {
  it("reports the current stage and the resolved identity before the brief arrives", async () => {
    let finish!: (event: ResearchEvent) => void;
    const request: RequestBrief = async function* () {
      yield { type: "stage", stage: "searching" };
      yield { type: "identity", place: SAMPLE_BRIEF.place };
      yield await new Promise<ResearchEvent>((resolve) => {
        finish = resolve;
      });
    };
    const { result } = research(request);
    let run!: Promise<void>;
    act(() => {
      run = result.current.research("place");
    });
    await waitFor(() =>
      expect(result.current.identity).toEqual(SAMPLE_BRIEF.place),
    );
    expect(result.current).toMatchObject({
      status: "researching",
      stage: "searching",
      brief: null,
      error: null,
    });
    await act(async () => {
      finish(complete);
      await run;
    });
    expect(result.current.status).toBe("success");
  });
  it("shows a sample as a finished brief with its own place and no error", async () => {
    const { result } = research(
      events({
        type: "error",
        error: { message: "Try again.", retryable: true },
      }),
    );
    await act(async () => result.current.research("place"));
    act(() => result.current.showSample(SAMPLE_BRIEF));
    expect(result.current).toMatchObject({
      status: "success",
      brief: SAMPLE_BRIEF,
      identity: SAMPLE_BRIEF.place,
      error: null,
    });
  });
  it("starts every run from a clean slate", async () => {
    const request = vi
      .fn<RequestBrief>()
      .mockImplementationOnce(events(complete))
      .mockImplementationOnce(events({ type: "stage", stage: "reading" }));
    const { result } = research(request);
    await act(async () => result.current.research("place"));
    expect(result.current.brief).toEqual(SAMPLE_BRIEF);
    await act(async () => result.current.research("place"));
    expect(result.current).toMatchObject({
      status: "error",
      brief: null,
      identity: null,
    });
  });
});
