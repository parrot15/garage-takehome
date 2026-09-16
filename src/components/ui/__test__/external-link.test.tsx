// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExternalLink } from "../external-link";

describe("ExternalLink", () => {
  it("opens a safe address in a new tab without a referrer", () => {
    render(
      <ExternalLink
        href="https://example.org/page"
        className="extra"
        aria-label="Example"
        title="Ex"
      >
        Open
      </ExternalLink>,
    );
    const link = screen.getByRole("link", { name: "Example" });
    expect(link).toHaveAttribute("href", "https://example.org/page");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("title", "Ex");
    expect(link).toHaveClass("extra");
  });
  it.each([
    null,
    undefined,
    "javascript:alert(1)",
    "not a url",
    "https://user:pw@example.org/",
  ])("renders %s as plain text instead of a link", (href) => {
    render(
      <ExternalLink href={href} className="extra">
        Label
      </ExternalLink>,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Label")).toHaveClass("extra");
  });
});
