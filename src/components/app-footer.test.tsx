import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppFooter } from "./app-footer";

describe("AppFooter", () => {
  it("labels fixture mode as demo data", () => {
    render(<AppFooter placesProvider="fixture" />);

    expect(screen.getByTestId("fixture-mode-notice")).toHaveTextContent(
      /not live Google Maps results/i,
    );
  });

  it("hides the demo notice for the live provider", () => {
    render(<AppFooter placesProvider="google" />);

    expect(screen.queryByTestId("fixture-mode-notice")).not.toBeInTheDocument();
  });
});
