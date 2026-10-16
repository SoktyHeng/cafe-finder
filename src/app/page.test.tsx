import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("states the product promise and does not claim search is live", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /find the best cafe/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/not available yet/i);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });
});
