import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FORM_VALUES, type ReadyFormValues } from "../form-state";
import { DiscoveryForm } from "./discovery-form";

type GetCurrentPosition = Geolocation["getCurrentPosition"];

function mockGeolocation(impl: GetCurrentPosition | undefined) {
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: impl ? { getCurrentPosition: vi.fn(impl) } : undefined,
  });
}

function geoError(code: number): GeolocationPositionError {
  return { code, message: "", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 };
}

function renderForm(maxRadiusMeters = 15_000) {
  const onSubmit = vi.fn<(values: ReadyFormValues) => void>();
  render(
    <DiscoveryForm
      initialValues={DEFAULT_FORM_VALUES}
      maxRadiusMeters={maxRadiusMeters}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit, user: userEvent.setup() };
}

afterEach(() => {
  mockGeolocation(undefined);
  Reflect.deleteProperty(navigator, "geolocation");
});

describe("DiscoveryForm", () => {
  it("requires a location before searching", async () => {
    const { onSubmit, user } = renderForm();

    await user.click(screen.getByRole("button", { name: /find my cafe/i }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/choose a location first/i)).toBeInTheDocument();
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });

  it("never searches while controls are edited", async () => {
    const { onSubmit, user } = renderForm();

    await user.click(screen.getByRole("button", { name: /BKK1/ }));
    await user.click(screen.getByRole("radio", { name: "Date" }));
    fireEvent.change(screen.getByRole("slider", { name: /distance/i }), {
      target: { value: "8000" },
    });
    await user.selectOptions(screen.getByRole("combobox", { name: /minimum rating/i }), "4.5");
    await user.click(screen.getByRole("checkbox", { name: /open now only/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits every chosen setting", async () => {
    const { onSubmit, user } = renderForm();

    await user.type(screen.getByRole("searchbox"), "russian");
    await user.click(screen.getByRole("button", { name: /Tuol Tom Poung/ }));
    await user.click(screen.getByRole("radio", { name: "Friends" }));
    fireEvent.change(screen.getByRole("slider", { name: /distance/i }), {
      target: { value: "5000" },
    });
    await user.selectOptions(screen.getByRole("combobox", { name: /minimum rating/i }), "4");
    await user.click(screen.getByRole("checkbox", { name: /open now only/i }));
    await user.click(screen.getByText(/more preferences/i));
    await user.click(screen.getByRole("radio", { name: "Under $5" }));
    await user.click(screen.getByRole("checkbox", { name: "Wi-Fi" }));
    await user.click(screen.getByRole("checkbox", { name: "Quiet place" }));
    await user.click(screen.getByRole("button", { name: /find my cafe/i }));

    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({
      location: expect.objectContaining({ kind: "area", areaId: "tuol-tom-poung" }),
      purpose: "friends",
      radiusMeters: 5000,
      minRating: 4,
      openNowOnly: true,
      budget: "under_5",
      preferQuiet: true,
      preferWifi: true,
    });
  });

  it("explains that budget, Wi-Fi and quiet are not verified", () => {
    renderForm();
    expect(screen.getByText(/preferences, not strict filters/i)).toHaveTextContent(/sufficient approved member reports/i);
  });

  it("picks the first matching area on Enter instead of submitting", async () => {
    const { onSubmit, user } = renderForm();

    await user.type(screen.getByRole("searchbox"), "river{Enter}");

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId("selected-location")).toHaveTextContent("Riverside");
  });

  it("shows a message when no area matches", async () => {
    const { user } = renderForm();
    await user.type(screen.getByRole("searchbox"), "atlantis");
    expect(screen.getByText(/no areas match/i)).toBeInTheDocument();
  });

  it("limits the radius slider to the configured maximum", () => {
    renderForm(5000);
    expect(screen.getByRole("slider", { name: /distance/i })).toHaveAttribute("max", "5000");
  });

  describe("geolocation", () => {
    it("does not ask for location until the button is pressed", () => {
      const getCurrentPosition = vi.fn();
      mockGeolocation(getCurrentPosition);
      renderForm();
      expect(navigator.geolocation.getCurrentPosition).not.toHaveBeenCalled();
    });

    it("uses a rounded device position once permission is granted", async () => {
      mockGeolocation((onSuccess) =>
        onSuccess({
          coords: { latitude: 11.556449, longitude: 104.928512, accuracy: 25 },
        } as GeolocationPosition),
      );
      const { onSubmit, user } = renderForm();

      await user.click(screen.getByRole("button", { name: /use my current location/i }));
      expect(screen.getByTestId("selected-location")).toHaveTextContent(
        "your current location",
      );
      await user.click(screen.getByRole("button", { name: /find my cafe/i }));

      expect(onSubmit.mock.calls[0]?.[0].location).toEqual({
        kind: "device",
        label: "your current location",
        latitude: 11.556,
        longitude: 104.929,
        accuracyMeters: 25,
      });
    });

    it("warns when the reported position is imprecise", async () => {
      mockGeolocation((onSuccess) =>
        onSuccess({
          coords: { latitude: 11.55, longitude: 104.92, accuracy: 5000 },
        } as GeolocationPosition),
      );
      const { user } = renderForm();
      await user.click(screen.getByRole("button", { name: /use my current location/i }));
      expect(screen.getByText(/approximate position/i)).toBeInTheDocument();
    });

    it.each([
      [1, /location access was blocked/i],
      [2, /could not be determined/i],
      [3, /took too long/i],
    ])("explains error code %d and keeps manual selection available", async (code, message) => {
      mockGeolocation((_onSuccess, onError) => onError?.(geoError(code)));
      const { onSubmit, user } = renderForm();

      await user.click(screen.getByRole("button", { name: /use my current location/i }));
      expect(screen.getByText(message)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /Wat Phnom/ }));
      await user.click(screen.getByRole("button", { name: /find my cafe/i }));
      expect(onSubmit).toHaveBeenCalledOnce();
    });

    it("handles browsers without geolocation", async () => {
      Reflect.deleteProperty(navigator, "geolocation");
      const { user } = renderForm();
      await user.click(screen.getByRole("button", { name: /use my current location/i }));
      expect(screen.getByText(/cannot share your location/i)).toBeInTheDocument();
    });
  });
});
