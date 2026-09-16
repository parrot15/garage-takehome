// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeFact, makePlace, makeSource } from "@/__test__/factories";
import type { Brief } from "@/lib/brief/schema";
import { SAMPLE_BRIEF } from "@/lib/sample";
import { BriefView } from "../brief-view";

describe("BriefView", () => {
  it("shows listed contacts without a Maps logo or an invented purchasing role", () => {
    const place = makePlace({
      phone: "555-0100",
    });
    render(
      <BriefView
        brief={{
          ...SAMPLE_BRIEF,
          mode: "live",
          place,
          scope: {
            name: place.name,
            relationship: "selected_place",
            explanation: null,
            references: [],
          },
        }}
      />,
    );
    expect(screen.queryByAltText("Google Maps")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "555-0100" })).toHaveAttribute(
      "href",
      "tel:5550100",
    );
    expect(
      screen.getByRole("link", { name: /maple.example.org/ }),
    ).toHaveAttribute("href", "https://maple.example.org/fire");
    expect(screen.queryByText("Purchasing contact")).not.toBeInTheDocument();
  });
  it("presents the fleet as a table with model year, make, and age against the research date", () => {
    render(<BriefView brief={SAMPLE_BRIEF} />);
    const fleet = screen.getByRole("table");
    const rows = within(fleet).getAllByRole("row");
    expect(rows).toHaveLength(2);
    const row = rows[1] as HTMLElement;
    // Incoming apparatus with no unit label or model year yet shows blank cells.
    expect(within(row).getAllByRole("cell", { name: "—" })).toHaveLength(2);
    expect(
      within(row).getByText("Seagrave two replacement apparatus"),
    ).toBeInTheDocument();
    expect(within(row).getByText("Approved")).toBeInTheDocument();
    expect(
      within(row).getByText("Replacing Engine 132 and Rescue 134"),
    ).toBeInTheDocument();
    // Outgoing vehicles live under replacement & surplus with their identity intact.
    expect(
      screen.getByText("Engine 132 · 1996 Pierce engine"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Rescue 134 · 2006 E-One rescue"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Planned surplus")).toHaveLength(2);
  });
  it("flags apparatus age from the documented model year", () => {
    render(
      <BriefView
        brief={{
          ...SAMPLE_BRIEF,
          researchedAt: "2026-09-13T00:00:00.000Z",
          facts: SAMPLE_BRIEF.facts.map((fact) =>
            fact.id === "F1" ? { ...fact, category: "fleet" } : fact,
          ),
        }}
      />,
    );
    const flag = screen.getByText("30 yrs");
    expect(flag).toHaveAttribute(
      "title",
      "Past the 25-year replacement guidance in NFPA 1911",
    );
    expect(
      screen.getByRole("cell", { name: "Engine 132" }),
    ).toBeInTheDocument();
  });
  it("does not deny replacement activity documented in the fleet when disposition is empty", () => {
    const statement =
      "The 2025 engine replaces a 2009 engine retained for reserve use.";
    render(
      <BriefView
        brief={{
          ...SAMPLE_BRIEF,
          facts: [
            makeFact({
              references: ["S1"],
              category: "fleet",
              status: "delivered",
              statement,
            }),
          ],
          callAngles: [],
        }}
      />,
    );
    expect(screen.getByText(statement)).toBeInTheDocument();
    expect(
      screen.getByText(
        "No separate replacement or surplus findings in this section.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/No replacement, retirement, or surplus activity/),
    ).not.toBeInTheDocument();
  });
  it("names people with their documented role and links listed contacts", () => {
    render(
      <BriefView
        brief={{
          ...SAMPLE_BRIEF,
          facts: SAMPLE_BRIEF.facts.map((fact) =>
            fact.id === "F3"
              ? {
                  ...fact,
                  person: {
                    name: "James E. Seymour IV",
                    role: "Fire Chief",
                    phone: "(914) 555-0100",
                    email: "chief@example.gov",
                  },
                }
              : fact,
          ),
        }}
      />,
    );
    expect(screen.getByText("James E. Seymour IV")).toBeInTheDocument();
    expect(screen.getByText("Fire Chief")).toBeInTheDocument();
    // A fact that is merely reported carries no status tag.
    expect(screen.queryByText("Reported")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "(914) 555-0100" }),
    ).toHaveAttribute("href", "tel:9145550100");
    expect(
      screen.getByRole("link", { name: "chief@example.gov" }),
    ).toHaveAttribute("href", "mailto:chief@example.gov");
  });
  it("preserves short retirement qualifications instead of treating them as redundant names", () => {
    const statement = "Mark Niemeyer retired as Fire Chief in October 2025.";
    render(
      <BriefView
        brief={{
          ...SAMPLE_BRIEF,
          facts: [
            makeFact({
              references: ["S1"],
              category: "leadership",
              statement,
              person: {
                name: "Mark Niemeyer",
                role: "Fire Chief",
                phone: null,
                email: null,
              },
              vehicle: null,
              status: "reported",
            }),
          ],
          callAngles: [],
        }}
      />,
    );
    expect(screen.getByText(statement)).toBeInTheDocument();
  });
  it("shows historical fleet dates and keeps conflicts and conditional assignments explicit", () => {
    const statement =
      "The 2012 roster lists Engine 4; a newer source gives a conflicting model year. It remains retained until the replacement enters service.";
    render(
      <BriefView
        brief={{
          ...SAMPLE_BRIEF,
          facts: [
            makeFact({
              references: ["S1"],
              category: "fleet",
              statement,
              status: "unknown",
              eventDate: "2012",
              asOf: "2025-06-27",
            }),
          ],
          callAngles: [],
        }}
      />,
    );
    const fleet = screen.getByRole("table");
    expect(within(fleet).getByText(statement)).toBeInTheDocument();
    expect(
      within(fleet).getByText("2012 · As of Jun 27, 2025"),
    ).toBeInTheDocument();
    expect(within(fleet).getByText("Status unconfirmed")).toBeInTheDocument();
    expect(
      within(fleet).getByText("After replacement enters service"),
    ).toBeInTheDocument();
  });
  it("retains the source assertion date for news with a separate event date", () => {
    render(
      <BriefView
        brief={{
          ...SAMPLE_BRIEF,
          facts: [
            makeFact({
              references: ["S1"],
              category: "news",
              eventDate: "2025-10",
              asOf: "2025-06-27",
            }),
          ],
          callAngles: [],
        }}
      />,
    );
    expect(screen.getByText("2025-10")).toBeInTheDocument();
    expect(screen.getByText("As of Jun 27, 2025")).toBeInTheDocument();
  });
  it("makes unconfirmed status visible instead of silently dropping the qualification", () => {
    render(
      <BriefView
        brief={{
          ...SAMPLE_BRIEF,
          facts: SAMPLE_BRIEF.facts.map((fact) => ({
            ...fact,
            status: "unknown",
          })),
        }}
      />,
    );
    expect(screen.getAllByText("Status unconfirmed")).toHaveLength(
      SAMPLE_BRIEF.facts.length,
    );
  });
  it("labels the historical example and its reason to call", () => {
    render(<BriefView brief={SAMPLE_BRIEF} />);
    expect(screen.getByText("Historical example brief")).toBeInTheDocument();
    expect(screen.getByText("Surplus planned")).toBeInTheDocument();
    expect(
      screen.getByText(/planned to surplus the 1996 Engine 132/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Suggested opener/i)).not.toBeInTheDocument();
  });
  it("presents the historical example as context rather than a lead", () => {
    render(<BriefView brief={SAMPLE_BRIEF} />);
    expect(screen.getByText(/^Historical context/)).toBeInTheDocument();
    expect(
      screen.getByText(
        "Contact details are omitted in this historical example.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: SAMPLE_BRIEF.place.address }),
    ).not.toBeInTheDocument();
  });
  it("presents live research with its date, its listing, and a Maps link", () => {
    render(
      <BriefView
        brief={{ ...SAMPLE_BRIEF, mode: "live", place: makePlace() }}
      />,
    );
    expect(
      screen.queryByText("Historical example brief"),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/^Researched/)).toBeInTheDocument();
    expect(
      screen.getByText("No phone number was listed for this location."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: makePlace().address }),
    ).toHaveAttribute("href", makePlace().mapsUrl);
  });
  it("opens an accessible source card and returns keyboard focus to the citation", async () => {
    const user = userEvent.setup();
    render(<BriefView brief={SAMPLE_BRIEF} />);
    const citation = screen.getAllByRole("button", {
      name: /^Source 1:/,
    })[0];
    expect(citation).toBeDefined();
    await user.tab();
    expect(citation).toHaveFocus();
    const dialog = screen.getByRole("dialog", { name: /^Source 1: / });
    expect(
      within(dialog).getByRole("heading", {
        name: `Source 1: ${SAMPLE_BRIEF.sources[0]?.title}`,
      }),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText(
        /Behind the brief|Source material|This example uses/,
      ),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("link", { name: "Open source" }),
    ).toHaveAttribute("href", expect.stringContaining("fileID=8976"));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(citation).toHaveFocus();
  });
  it("says plainly when useful sources yield no timely reason to call", () => {
    render(
      <BriefView
        brief={{
          ...SAMPLE_BRIEF,
          facts: [],
          callAngles: [],
          questions: [],
        }}
      />,
    );
    expect(
      screen.getByText(
        "The sources reviewed did not establish a timely reason to call.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Public information is limited"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("flags a permanently closed location in the contact card", () => {
    render(
      <BriefView
        brief={{
          ...SAMPLE_BRIEF,
          mode: "live",
          place: makePlace({ businessStatus: "CLOSED_PERMANENTLY" }),
        }}
      />,
    );
    expect(
      screen.getByText("Google lists this location as permanently closed."),
    ).toBeInTheDocument();
  });
});

describe("BriefView scope and source index", () => {
  const live = (overrides: Partial<Brief> = {}): Brief => ({
    ...SAMPLE_BRIEF,
    mode: "live",
    place: makePlace(),
    ...overrides,
  });
  const scope = (overrides: Partial<Brief["scope"]>): Brief["scope"] => ({
    name: "Maple Fire Department",
    relationship: "selected_place",
    explanation: null,
    references: [],
    ...overrides,
  });
  const scopeNote = () => screen.getByText("Research scope.").parentElement;

  it("shows no scope note for the selected place without an explanation", () => {
    render(<BriefView brief={live({ scope: scope({}) })} />);
    expect(screen.queryByText("Research scope.")).not.toBeInTheDocument();
  });
  it("explains a parent department and names the selected location", () => {
    render(
      <BriefView
        brief={live({
          scope: scope({
            name: "Maple County Fire District",
            relationship: "parent_department",
            explanation: "Station 3 belongs to the district.",
            references: ["S1"],
          }),
        })}
      />,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Maple County Fire District",
    );
    expect(
      screen.getByText("Selected location: Maple Fire Department"),
    ).toBeInTheDocument();
    expect(scopeNote()).toHaveTextContent("Station 3 belongs to the district.");
  });
  it("falls back to naming what the research covers", () => {
    render(
      <BriefView
        brief={live({
          scope: scope({
            name: "Maple County Fire District",
            relationship: "parent_department",
            references: ["S1"],
          }),
        })}
      />,
    );
    expect(scopeNote()).toHaveTextContent(
      "Research covers Maple County Fire District.",
    );
  });
  it("warns when the organization could not be established", () => {
    render(
      <BriefView
        brief={live({
          scope: scope({ relationship: "unresolved" }),
          facts: [],
          callAngles: [],
          questions: [],
        })}
      />,
    );
    expect(scopeNote()).toHaveTextContent(
      "could not be established. Confirm the account before using this brief.",
    );
  });
  it("keeps a cited explanation for an unresolved organization", () => {
    render(
      <BriefView
        brief={live({
          scope: scope({
            relationship: "unresolved",
            explanation: "The sources name a district the listing does not.",
            references: ["S1"],
          }),
          facts: [],
          callAngles: [],
          questions: [],
        })}
      />,
    );
    expect(scopeNote()).toHaveTextContent(
      "could not be established. The sources name a district the listing does not.",
    );
  });
  it("describes the department when the evidence supports it", () => {
    render(
      <BriefView
        brief={live({
          department: {
            kind: "combination",
            summary: "Two career stations and three volunteer companies.",
            references: ["S1"],
          },
        })}
      />,
    );
    expect(screen.getByText("Combination department")).toBeInTheDocument();
    expect(screen.getByText(/Two career stations/)).toBeInTheDocument();
  });
  it("indexes every cited source with its publisher and dated provenance", () => {
    const sources = [
      makeSource({
        id: "S1",
        title: "Memo",
        publisher: "City of Maple",
        publishedAt: "2025-02-10",
        dateOrigin: "source",
      }),
      makeSource({
        id: "S2",
        title: "Roster",
        publisher: "maple.example.org",
        publishedAt: "2024-06-01",
        dateOrigin: "estimated",
        url: "https://maple.example.org/roster",
      }),
      makeSource({
        id: "S3",
        title: "Undated",
        publisher: "news.example.org",
        publishedAt: null,
        url: "https://news.example.org/x",
      }),
    ];
    render(
      <BriefView
        brief={live({
          sources,
          facts: [makeFact({ references: ["S1", "S2", "S3"] })],
          callAngles: [],
          questions: [],
        })}
      />,
    );
    expect(screen.getByText(/3 sources/)).toBeInTheDocument();
    const index = screen.getByRole("region", { name: "Source index" });
    expect(index).toHaveTextContent("All sources 3");
    const items = within(index).getAllByRole("listitem", { hidden: true });
    expect(items.map((item) => item.textContent)).toEqual([
      "MemoCity of Maple · Feb 10, 2025",
      "Rostermaple.example.org · Estimated Jun 1, 2024",
      "Undatednews.example.org",
    ]);
    expect(
      within(items[1] as HTMLElement).getByRole("link", { hidden: true }),
    ).toHaveAttribute("href", "https://maple.example.org/roster");
  });
  it("counts a single source in the singular", () => {
    render(<BriefView brief={SAMPLE_BRIEF} />);
    expect(screen.getByText(/1 source$/)).toBeInTheDocument();
  });
});
