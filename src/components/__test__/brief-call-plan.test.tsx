// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CallApproach, QualificationQuestions } from "../brief-call-plan";
import type { RenderCitations } from "../citations";

/** Stands in for the source cards: the references it was asked to cite, joined. */
const cite: RenderCitations = (references) => (
  <span data-testid="cite">{references.join("+")}</span>
);
const angleReferences = (ids: string[]) => ids.map((id) => `src-of-${id}`);

describe("CallApproach", () => {
  it("says plainly when no timely reason exists", () => {
    render(
      <CallApproach
        angles={[]}
        cite={cite}
        angleReferences={angleReferences}
      />,
    );
    const region = screen.getByRole("region", { name: "Reason to call" });
    expect(region).toHaveTextContent("No timely signal");
    expect(region).toHaveTextContent(
      "The sources reviewed did not establish a timely reason to call.",
    );
    expect(screen.queryByTestId("cite")).not.toBeInTheDocument();
  });
  it("ranks each reason under its kind and cites the sources behind its facts", () => {
    render(
      <CallApproach
        angles={[
          {
            kind: "listing",
            reason: "Engine 1 is listed on GovDeals.",
            factIds: ["F1", "F2"],
          },
          {
            kind: "aging",
            reason: "Tanker 3 is a 1998 model.",
            factIds: ["F3"],
          },
        ]}
        cite={cite}
        angleReferences={angleReferences}
      />,
    );
    const region = screen.getByRole("region", { name: "Reason to call" });
    expect(region.textContent).toMatch(
      /Listed for sale.*Engine 1 is listed on GovDeals\..*Aging apparatus.*Tanker 3 is a 1998 model\./,
    );
    expect(
      within(region)
        .getAllByTestId("cite")
        .map((node) => node.textContent),
    ).toEqual(["src-of-F1+src-of-F2", "src-of-F3"]);
  });
});

describe("QualificationQuestions", () => {
  it("renders nothing without questions", () => {
    const { container } = render(
      <QualificationQuestions
        questions={[]}
        cite={cite}
        angleReferences={angleReferences}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
  it("numbers the questions and cites the facts they rest on", () => {
    render(
      <QualificationQuestions
        questions={[
          { text: "Who approves a sale?", factIds: [] },
          { text: "Does the new engine replace Engine 4?", factIds: ["F1"] },
        ]}
        cite={cite}
        angleReferences={angleReferences}
      />,
    );
    const region = screen.getByRole("region", { name: "Ask on the call" });
    expect(
      within(region)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "01Who approves a sale?",
      "02Does the new engine replace Engine 4?src-of-F1",
    ]);
  });
});
