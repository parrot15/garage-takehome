// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeFact } from "@/__test__/factories";
import {
  FleetSection,
  MoneySection,
  NewsSection,
  PeopleSection,
  ReplacementSection,
  Section,
} from "../brief-sections";
import type { RenderCitations } from "../citations";

const STATUS_TITLE = "Status described by the cited source";
/** Stands in for the source cards: the references it was asked to cite, joined. */
const cite: RenderCitations = (references) => (
  <span data-testid="cite">{references.join("+")}</span>
);
const vehicle = (
  modelYear: number | null,
  unit: string | null = "Engine 4",
) => ({
  unit,
  modelYear,
  make: "Pierce",
  description: "pumper",
  replacementRelationship: null,
});

describe("Section", () => {
  it("is a labelled region with a heading and a kicker", () => {
    render(
      <Section id="x-heading" title="People" kicker="Who runs it">
        body
      </Section>,
    );
    const region = screen.getByRole("region", { name: "People" });
    expect(within(region).getByRole("heading", { level: 2 })).toHaveTextContent(
      "People",
    );
    expect(region).toHaveTextContent("Who runs it");
    expect(region).toHaveTextContent("body");
  });
});

describe("PeopleSection", () => {
  it("says when no one was named", () => {
    render(<PeopleSection facts={[]} cite={cite} />);
    expect(
      screen.getByText(
        "No named leadership was found in the sources reviewed.",
      ),
    ).toBeInTheDocument();
  });
  it("leads with the person, their role, their listed contacts, and the statement", () => {
    render(
      <PeopleSection
        cite={cite}
        facts={[
          makeFact({
            category: "leadership",
            title: "Fire Chief",
            statement: "Listed as chief on the town site.",
            status: "reported",
            vehicle: null,
            person: {
              name: "Jane Doe",
              role: "Fire Chief",
              phone: "(802) 555-0100",
              email: "chief@example.gov",
            },
            eventDate: null,
            asOf: "2026-01-05",
          }),
        ]}
      />,
    );
    const row = screen.getByRole("listitem");
    expect(row.textContent).toMatch(/^Jane DoeFire Chief/);
    expect(
      within(row).getByRole("link", { name: "(802) 555-0100" }),
    ).toHaveAttribute("href", "tel:8025550100");
    expect(
      within(row).getByRole("link", { name: "chief@example.gov" }),
    ).toHaveAttribute("href", "mailto:chief@example.gov");
    expect(
      within(row).getByText("Listed as chief on the town site."),
    ).toBeInTheDocument();
    expect(within(row).getByText("As of Jan 5, 2026")).toBeInTheDocument();
    expect(within(row).getByTestId("cite")).toHaveTextContent("S1:P1");
    expect(within(row).queryByTitle(STATUS_TITLE)).not.toBeInTheDocument();
  });
  it("tags any status other than reported", () => {
    render(
      <PeopleSection
        cite={cite}
        facts={[
          makeFact({
            category: "leadership",
            status: "retired",
            vehicle: null,
            person: {
              name: "Old Chief",
              role: "Fire Chief, historical",
              phone: null,
              email: null,
            },
          }),
        ]}
      />,
    );
    expect(screen.getByTitle(STATUS_TITLE)).toHaveTextContent("Retired");
  });
});

describe("FleetSection", () => {
  const researchedAt = "2026-09-12T12:00:00.000Z";
  it("says when no roster was found", () => {
    render(<FleetSection facts={[]} researchedAt={researchedAt} cite={cite} />);
    expect(
      screen.getByText(
        "No apparatus roster was found in the sources reviewed.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("tables each vehicle with its age flagged against NFPA 1911", () => {
    render(
      <FleetSection
        researchedAt={researchedAt}
        cite={cite}
        facts={[
          makeFact({
            id: "F1",
            category: "fleet",
            status: "in_service",
            vehicle: vehicle(1996),
          }),
          makeFact({
            id: "F2",
            category: "fleet",
            status: "reported",
            vehicle: vehicle(2008, "Tanker 2"),
          }),
          makeFact({
            id: "F3",
            category: "fleet",
            status: "reported",
            vehicle: vehicle(2024, "Brush 6"),
          }),
          makeFact({
            id: "F4",
            category: "fleet",
            status: "ordered",
            vehicle: {
              ...vehicle(null, null),
              replacementRelationship: "Replaces Engine 4",
            },
          }),
        ]}
      />,
    );
    const [engine, tanker, brush, incoming] = within(screen.getByRole("table"))
      .getAllByRole("row")
      .slice(1) as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
    expect(
      within(engine).getByRole("cell", { name: "Engine 4" }),
    ).toBeInTheDocument();
    expect(
      within(engine).getByRole("cell", { name: "1996" }),
    ).toBeInTheDocument();
    expect(within(engine).getByText("Pierce pumper")).toBeInTheDocument();
    expect(within(engine).getByTitle(STATUS_TITLE)).toHaveTextContent(
      "In service",
    );
    expect(within(engine).getByText(makeFact().statement)).toBeInTheDocument();
    expect(within(engine).getByTestId("cite")).toHaveTextContent("S1:P1");
    expect(
      within(engine).getByTitle(
        "Past the 25-year replacement guidance in NFPA 1911",
      ),
    ).toHaveTextContent("30 yrs");
    expect(
      within(tanker).getByTitle(
        "Past the 15-year reserve guidance in NFPA 1911",
      ),
    ).toHaveTextContent("18 yrs");
    expect(within(brush).getByText("2 yrs")).not.toHaveAttribute("title");
    expect(within(brush).queryByTitle(STATUS_TITLE)).not.toBeInTheDocument();
    expect(within(incoming).getAllByRole("cell", { name: "—" })).toHaveLength(
      2,
    );
    expect(within(incoming).queryByText(/yrs/)).not.toBeInTheDocument();
    expect(within(incoming).getByText("Replaces Engine 4")).toBeInTheDocument();
    expect(within(incoming).getByTitle(STATUS_TITLE)).toHaveTextContent(
      "Ordered",
    );
  });
  it("lists summary facts without a vehicle below the table", () => {
    render(
      <FleetSection
        researchedAt={researchedAt}
        cite={cite}
        facts={[
          makeFact({ id: "F1", category: "fleet", vehicle: vehicle(2001) }),
          makeFact({
            id: "F2",
            category: "fleet",
            title: "Two engines and a tanker",
            status: "reported",
            vehicle: null,
          }),
        ]}
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent(
      "Two engines and a tanker",
    );
  });
});

describe("MoneySection", () => {
  it("says when nothing was found", () => {
    render(<MoneySection facts={[]} cite={cite} />);
    expect(
      screen.getByText(
        "No apparatus funding or grant activity was found in the sources reviewed.",
      ),
    ).toBeInTheDocument();
  });
  it("shows the money line and the vehicle it funds", () => {
    render(
      <MoneySection
        cite={cite}
        facts={[
          makeFact({
            category: "funding",
            status: "approved",
            money: {
              amount: "$750,000",
              program: "FEMA AFG",
              fiscalYear: "FY2026",
            },
            vehicle: vehicle(null, null),
          }),
        ]}
      />,
    );
    const row = screen.getByRole("listitem");
    expect(
      within(row).getByText("$750,000 · FEMA AFG · FY2026"),
    ).toBeInTheDocument();
    expect(within(row).getByText("Pierce pumper")).toBeInTheDocument();
    expect(within(row).getByTitle(STATUS_TITLE)).toHaveTextContent("Approved");
  });
});

describe("NewsSection", () => {
  it("says when nothing was found", () => {
    render(<NewsSection facts={[]} cite={cite} />);
    expect(
      screen.getByText(
        "No recent department news was found in the sources reviewed.",
      ),
    ).toBeInTheDocument();
  });
  it("leads each item with its event date and keeps the source date on the date line", () => {
    render(
      <NewsSection
        cite={cite}
        facts={[
          makeFact({
            category: "news",
            title: "New chief appointed",
            status: "reported",
            eventDate: "2026-03-16",
            asOf: "2026-03-20",
            vehicle: null,
          }),
        ]}
      />,
    );
    const row = screen.getByRole("listitem");
    expect(row.textContent).toMatch(/^Mar 16, 2026New chief appointed/);
    expect(within(row).getByText("As of Mar 20, 2026")).toBeInTheDocument();
  });
});

describe("ReplacementSection", () => {
  it("says when nothing was found", () => {
    render(<ReplacementSection facts={[]} cite={cite} />);
    expect(
      screen.getByText(
        "No separate replacement or surplus findings in this section.",
      ),
    ).toBeInTheDocument();
  });
  it("names the outgoing vehicle and what replaces it", () => {
    render(<ReplacementSection facts={[makeFact()]} cite={cite} />);
    const row = screen.getByRole("listitem");
    expect(
      within(row).getByText("Engine 4 · 1996 Pierce pumper"),
    ).toBeInTheDocument();
    expect(
      within(row).getByText("After replacement enters service"),
    ).toBeInTheDocument();
    expect(within(row).getByTitle(STATUS_TITLE)).toHaveTextContent(
      "Planned surplus",
    );
    expect(within(row).getByText("As of September 2026")).toBeInTheDocument();
  });
});
