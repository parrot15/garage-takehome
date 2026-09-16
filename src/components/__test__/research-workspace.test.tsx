// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makePlace } from "@/__test__/factories";
import type { RequestBrief } from "@/lib/brief/client";
import type { ResearchEvent } from "@/lib/brief/schema";
import { SAMPLE_BRIEF, SAMPLE_PLACE_IDS } from "@/lib/sample";
import { ResearchWorkspace } from "../research-workspace";

describe("ResearchWorkspace", () => {
  it("opens a clearly identified sample without any request", async () => {
    const user = userEvent.setup();
    const request = vi.fn<RequestBrief>();
    render(<ResearchWorkspace request={request} />);
    await user.click(
      screen.getByRole("button", { name: /View example brief/ }),
    );
    expect(
      screen.getByRole("heading", { name: /Peekskill Fire Department/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Historical example brief")).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
  it("populates example IDs without silently starting paid research", async () => {
    const user = userEvent.setup();
    const request = vi.fn<RequestBrief>();
    render(<ResearchWorkspace request={request} />);
    await user.click(screen.getByRole("button", { name: "Sample 1" }));
    expect(screen.getByRole("textbox")).toHaveValue(SAMPLE_PLACE_IDS[0]);
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(request).not.toHaveBeenCalled();
  });
  it("explains invalid input, returns focus to the field, and sends nothing", async () => {
    const user = userEvent.setup();
    const request = vi.fn<RequestBrief>();
    render(<ResearchWorkspace request={request} />);
    await user.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a Google Place ID.",
    );
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    await user.type(screen.getByRole("textbox"), "https://maps.example/place");
    await user.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Paste the Place ID itself, without a URL or spaces.",
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("displays a non-retryable configuration error without an endless retry action", async () => {
    const user = userEvent.setup();
    const request: RequestBrief =
      async function* (): AsyncGenerator<ResearchEvent> {
        yield {
          type: "error",
          error: {
            message: "Research is not configured yet.",
            retryable: false,
          },
        };
      };
    render(<ResearchWorkspace request={request} />);
    await user.type(screen.getByRole("textbox"), "department-id");
    await user.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Research is not configured yet.",
    );
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
  });
});

/** A request that yields these events and ends. */
const events = (...list: ResearchEvent[]): RequestBrief =>
  async function* () {
    yield* list;
  };

describe("ResearchWorkspace through a run", () => {
  it("shows real progress, then the brief, and readies the form for another run", async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const request: RequestBrief = async function* () {
      yield { type: "stage", stage: "searching" };
      yield { type: "identity", place: makePlace() };
      await gate;
      yield { type: "stage", stage: "reading" };
      yield {
        type: "complete",
        brief: { ...SAMPLE_BRIEF, mode: "live", place: makePlace() },
      };
    };
    render(<ResearchWorkspace request={request} />);
    await user.type(screen.getByRole("textbox"), SAMPLE_PLACE_IDS[0]);
    await user.click(screen.getByRole("button", { name: "Generate brief" }));

    expect(
      await screen.findByRole("button", { name: "Researching…" }),
    ).toBeDisabled();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sample 1" })).toBeDisabled();
    expect(
      screen.queryByText("Go into the call prepared"),
    ).not.toBeInTheDocument();
    const progress = screen.getByRole("region", { name: "Research progress" });
    expect(within(progress).getByRole("status")).toHaveTextContent(
      "Looking for a reason to call",
    );
    expect(
      within(progress).getByRole("link", { name: "Maple Fire Department" }),
    ).toHaveAttribute("href", makePlace().mapsUrl);
    expect(within(progress).getByText("Maple, Vermont")).toBeInTheDocument();

    finish();
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: /Peekskill Fire Department/,
    });
    expect(heading).toHaveFocus();
    expect(
      screen.queryByRole("region", { name: "Research progress" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Research another department")).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Generate brief" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Sample 2" })).toBeEnabled();
  });
  it("retries the same Place ID from the error and shows the reference id", async () => {
    const user = userEvent.setup();
    const request = vi
      .fn<RequestBrief>()
      .mockImplementationOnce(
        events({
          type: "error",
          error: {
            message: "Search is temporarily unavailable. Please try again.",
            retryable: true,
            requestId: "req-42",
          },
        }),
      )
      .mockImplementationOnce(
        events({ type: "complete", brief: SAMPLE_BRIEF }),
      );
    render(<ResearchWorkspace request={request} />);
    await user.type(screen.getByRole("textbox"), "department-id");
    await user.click(screen.getByRole("button", { name: "Generate brief" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your brief couldn’t be completed");
    expect(alert).toHaveTextContent("Search is temporarily unavailable.");
    expect(alert).toHaveTextContent("Reference: req-42");
    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { level: 1, name: /Peekskill/ });
    expect(request).toHaveBeenNthCalledWith(1, "department-id");
    expect(request).toHaveBeenNthCalledWith(2, "department-id");
    expect(
      screen.queryByText("Your brief couldn’t be completed"),
    ).not.toBeInTheDocument();
  });
  it("submits with Enter and clears the input error as the user types", async () => {
    const user = userEvent.setup();
    const request = vi.fn<RequestBrief>(
      events({ type: "complete", brief: SAMPLE_BRIEF }),
    );
    render(<ResearchWorkspace request={request} />);
    await user.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a Google Place ID.",
    );
    await user.type(screen.getByRole("textbox"), "d");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
    await user.type(screen.getByRole("textbox"), "epartment-id{Enter}");
    await screen.findByRole("heading", { level: 1, name: /Peekskill/ });
    expect(request).toHaveBeenCalledExactlyOnceWith("department-id");
  });
  it("relabels the form and hides the introduction once a brief is on screen", async () => {
    const user = userEvent.setup();
    render(<ResearchWorkspace request={vi.fn<RequestBrief>()} />);
    expect(screen.getByLabelText("Start with a Google Place ID")).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: /View example brief/ }),
    );
    expect(screen.getByLabelText("Research another department")).toBeEnabled();
    expect(
      screen.queryByText("Go into the call prepared"),
    ).not.toBeInTheDocument();
  });
});
