"use client";

import { useReducer, useRef } from "react";
import { createBriefRequester, type RequestBrief } from "@/lib/brief/client";
import type {
  Brief,
  Place,
  PublicError,
  ResearchStage,
} from "@/lib/brief/schema";

type ResearchState = {
  status: "idle" | "researching" | "success" | "error";
  stage: ResearchStage | null;
  identity: Place | null;
  brief: Brief | null;
  error: PublicError | null;
};
type Action =
  | { type: "start" }
  | { type: "stage"; stage: ResearchStage }
  | { type: "identity"; place: Place }
  | { type: "complete"; brief: Brief }
  | { type: "error"; error: PublicError };

const initialState: ResearchState = {
  status: "idle",
  stage: null,
  identity: null,
  brief: null,
  error: null,
};

/** Updates research state, clearing previous results when a new run starts. */
function reducer(state: ResearchState, action: Action): ResearchState {
  switch (action.type) {
    case "start":
      return { ...initialState, status: "researching", stage: "resolving" };
    case "stage":
      return { ...state, stage: action.stage };
    case "identity":
      return { ...state, identity: action.place };
    case "complete":
      return {
        ...state,
        status: "success",
        brief: action.brief,
        identity: action.brief.place,
        error: null,
      };
    case "error":
      return { ...state, status: "error", error: action.error };
  }
}

const connectionError: PublicError = {
  message:
    "The connection ended before your brief was ready. Please try again.",
  retryable: true,
};

/**
 * Tracks research progress, results, and errors, allowing one request at a time.
 *
 * @param request - Streams research events; defaults to the brief API.
 */
export function useResearch(
  request: RequestBrief = createBriefRequester(fetch),
) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const inFlight = useRef(false);

  /**
   * Starts research for a Place ID unless a request is already active.
   * Reports interrupted or incomplete streams as connection errors.
   */
  async function research(placeId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    dispatch({ type: "start" });
    try {
      for await (const event of request(placeId)) {
        dispatch(event);
        if (event.type === "complete" || event.type === "error") return;
      }
      dispatch({ type: "error", error: connectionError });
    } catch {
      dispatch({ type: "error", error: connectionError });
    } finally {
      inFlight.current = false;
    }
  }

  /** Displays a sample brief unless a research request is active. */
  function showSample(brief: Brief) {
    if (inFlight.current) return;
    dispatch({ type: "complete", brief });
  }
  return { ...state, research, showSample };
}
