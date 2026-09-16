// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makePlace } from "@/__test__/factories";
import type { ResearchStage } from "@/lib/brief/schema";
import { ResearchProgress } from "../research-progress";

const STEPS = ["Identify", "Discover", "Read", "Prepare"];

describe("ResearchProgress", () => {
  it.each<[ResearchStage, string, string]>([
    ["resolving", "Finding the right department", "Identify"],
    ["searching", "Looking for a reason to call", "Discover"],
    ["reading", "Reading the source material", "Read"],
    ["synthesizing", "Preparing your call brief", "Prepare"],
    ["validating", "Checking the evidence links", "Prepare"],
  ])(
    "announces the %s stage politely and marks its step as current",
    (stage, title, step) => {
      render(<ResearchProgress stage={stage} identity={null} />);
      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(
        within(status).getByRole("heading", { level: 2 }),
      ).toHaveTextContent(title);
      const items = within(
        screen.getByRole("list", { name: "Research stages" }),
      ).getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual(STEPS);
      expect(
        items
          .filter((item) => item.getAttribute("aria-current") === "step")
          .map((item) => item.textContent),
      ).toEqual([step]);
    },
  );
  it("explains what the current stage is doing", () => {
    render(<ResearchProgress stage="searching" identity={null} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Searching the department’s own site, local news, grant awards, surplus listings, and council records.",
    );
  });
  it("shows the resolved department with a map link once Google answers", () => {
    render(<ResearchProgress stage="searching" identity={makePlace()} />);
    const region = screen.getByRole("region", { name: "Research progress" });
    expect(
      within(region).getByRole("link", { name: "Maple Fire Department" }),
    ).toHaveAttribute("href", makePlace().mapsUrl);
    expect(within(region).getByText("Maple, Vermont")).toBeInTheDocument();
  });
  it("names no department before the Place ID resolves", () => {
    render(<ResearchProgress stage="resolving" identity={null} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText(/This can take a few minutes/)).toBeInTheDocument();
  });
});
