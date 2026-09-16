// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ContactLink } from "../contact-link";

describe("ContactLink", () => {
  it.each([
    ["(802) 272-0892", "tel:8022720892"],
    ["+1 (802) 272-0892", "tel:+18022720892"],
    ["chief@example.gov", "mailto:chief@example.gov"],
  ])("links %s as %s and shows it as listed", (value, href) => {
    render(<ContactLink value={value} className="extra" />);
    const link = screen.getByRole("link", { name: value });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveClass("extra");
  });
});
