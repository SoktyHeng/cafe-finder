import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GoogleMapsAttribution } from "./google-maps-attribution";

describe("GoogleMapsAttribution", () => {
  it("shows untranslated Google Maps text", () => {
    render(<GoogleMapsAttribution />);
    const text = screen.getByText("Google Maps");
    expect(text).toHaveAttribute("translate", "no");
    expect(screen.getByTestId("google-maps-attribution")).toHaveTextContent(/^Google Maps$/);
  });

  it("credits third-party providers, linking when a URI is given", () => {
    render(
      <GoogleMapsAttribution
        providers={[{ provider: "Data Co", providerUri: "https://data.example/" }, { provider: "Other" }]}
      />,
    );
    expect(screen.getByTestId("google-maps-attribution")).toHaveTextContent(
      "Google Maps · Data: Data Co, Other",
    );
    expect(screen.getByRole("link", { name: "Data Co" })).toHaveAttribute("href", "https://data.example/");
  });
});
