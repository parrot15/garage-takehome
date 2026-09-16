// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeSource } from "@/__test__/factories";
import { Citations } from "../citations";

describe("Citations", () => {
  it("deduplicates source references and uses stable source-index numbers", () => {
    render(
      <Citations
        sources={[makeSource(), makeSource({ id: "S7", title: "Budget" })]}
        references={["S7", "S7"]}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Source 2: Budget" }),
    ).toHaveTextContent("2");
  });

  it("shows metadata on hover without moving focus", async () => {
    const user = userEvent.setup();
    render(
      <Citations
        sources={[
          makeSource({
            publishedAt: "2025-02-10",
            dateOrigin: "estimated",
            retrieval: "unknown",
          }),
        ]}
        references={["S1"]}
      />,
    );
    const trigger = screen.getByRole("button");
    await user.hover(trigger);
    const card = await screen.findByRole("dialog");
    expect(trigger).not.toHaveFocus();
    expect(card).not.toHaveAttribute("aria-modal", "true");
    expect(
      within(card).getByText("Published Feb 10, 2025 (estimated)"),
    ).toBeInTheDocument();
    expect(within(card).getByText("Freshness unconfirmed")).toBeInTheDocument();
    const link = within(card).getByRole("link", { name: "Open source" });
    expect(link).toHaveAttribute("href", makeSource().url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.tab();
    await user.tab({ shift: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens on keyboard focus, tabs to the source, and returns focus on Escape", async () => {
    const user = userEvent.setup();
    render(<Citations sources={[makeSource()]} references={["S1"]} />);
    const trigger = screen.getByRole("button");
    await user.tab();
    expect(trigger).toHaveFocus();
    const card = await screen.findByRole("dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.tab();
    expect(within(card).getByRole("link")).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("lets keyboard focus leave the card and dismisses it", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Citations sources={[makeSource()]} references={["S1"]} />
        <button type="button">Next</button>
      </>,
    );
    await user.tab();
    await screen.findByRole("dialog");
    await user.tab();
    await user.tab();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
  });

  it("toggles by click and dismisses when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Citations
          sources={[makeSource({ publishedAt: null })]}
          references={["S1"]}
        />
        <button type="button">Outside</button>
      </>,
    );
    const trigger = screen.getByRole("button", { name: /^Source 1:/ });
    await user.click(trigger);
    expect(
      screen.getByText("Publication date not provided"),
    ).toBeInTheDocument();
    await user.click(trigger);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders source titles as text and never links an unsafe URL", async () => {
    const user = userEvent.setup();
    const title = '<img src=x onerror="alert(1)">';
    render(
      <Citations
        sources={[makeSource({ title, url: "javascript:alert(1)" })]}
        references={["S1"]}
      />,
    );
    await user.click(screen.getByRole("button"));
    const card = screen.getByRole("dialog");
    expect(within(card).getByRole("heading")).toHaveTextContent(title);
    expect(within(card).queryByRole("img")).not.toBeInTheDocument();
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
  });
});
