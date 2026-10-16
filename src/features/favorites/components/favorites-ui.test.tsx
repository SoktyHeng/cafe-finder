import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthStateProvider, type AuthState } from "@/features/auth/auth-provider";
import { AuthNav } from "@/features/auth/components/auth-nav";

import * as client from "../saved-places-client";
import { SavedPlacesProvider } from "../saved-places-provider";
import { FavoritesView } from "./favorites-view";
import { FavoriteButton, VisitedButton } from "./save-buttons";

vi.mock("next/navigation", () => ({
  usePathname: () => "/discover",
  useSearchParams: () => new URLSearchParams("area=bkk1&radius=3000"),
}));

vi.mock("../saved-places-client", () => ({
  listFavorites: vi.fn(),
  listVisits: vi.fn(),
  addFavorite: vi.fn(),
  removeFavorite: vi.fn(),
  markVisited: vi.fn(),
  unmarkVisited: vi.fn(),
  updateFavoriteNotes: vi.fn(),
}));
const api = vi.mocked(client);
const ok = <T,>(data: T) => ({ ok: true as const, data });

const SIGNED_IN: AuthState = { status: "signed-in", user: { id: "user-a", email: "a@example.test" } };

function renderWith(auth: AuthState, ui: ReactNode) {
  return render(
    <AuthStateProvider value={auth}>
      <SavedPlacesProvider>{ui}</SavedPlacesProvider>
    </AuthStateProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  api.listFavorites.mockResolvedValue(ok({ favorites: [{ placeId: "ChIJsaved", notes: null, createdAt: "2026-10-01T00:00:00Z" }] }));
  api.listVisits.mockResolvedValue(ok({ visits: [] }));
  api.addFavorite.mockResolvedValue(ok(null));
  api.removeFavorite.mockResolvedValue(ok(null));
  api.markVisited.mockResolvedValue(ok(null));
  api.updateFavoriteNotes.mockResolvedValue(ok(null));
});

describe("FavoriteButton", () => {
  it("renders nothing when sign-in isn't configured or still loading", () => {
    const { container, rerender } = renderWith({ status: "unavailable" }, <FavoriteButton placeId="ChIJa" placeName="A" />);
    expect(container).toBeEmptyDOMElement();
    rerender(
      <AuthStateProvider value={{ status: "loading" }}>
        <FavoriteButton placeId="ChIJa" placeName="A" />
      </AuthStateProvider>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(api.listFavorites).not.toHaveBeenCalled();
  });

  it("asks guests to sign in and returns them to the same page", () => {
    renderWith({ status: "signed-out" }, <FavoriteButton placeId="ChIJa" placeName="A" />);
    expect(screen.getByRole("link", { name: /sign in to save/i })).toHaveAttribute(
      "href",
      "/login?next=%2Fdiscover%3Farea%3Dbkk1%26radius%3D3000",
    );
    expect(api.listFavorites).not.toHaveBeenCalled();
  });

  it("reflects saved state and toggles optimistically", async () => {
    const user = userEvent.setup();
    renderWith(SIGNED_IN, (
      <>
        <FavoriteButton placeId="ChIJsaved" placeName="Saved Cafe" />
        <FavoriteButton placeId="ChIJnew" placeName="New Cafe" />
      </>
    ));
    const saved = await screen.findByRole("button", { name: /saved cafe is in your favorites/i });
    expect(saved).toHaveAttribute("aria-pressed", "true");

    const fresh = screen.getByRole("button", { name: /new cafe to favorites/i });
    await waitFor(() => expect(fresh).toBeEnabled());
    await user.click(fresh);
    expect(api.addFavorite).toHaveBeenCalledWith("ChIJnew");
    expect(screen.getByRole("button", { name: /new cafe is in your favorites/i })).toHaveAttribute("aria-pressed", "true");

    await user.click(saved);
    expect(api.removeFavorite).toHaveBeenCalledWith("ChIJsaved");
  });

  it("rolls back and announces failures", async () => {
    api.addFavorite.mockResolvedValue({ ok: false, code: "RATE_LIMITED" });
    const user = userEvent.setup();
    renderWith(SIGNED_IN, <FavoriteButton placeId="ChIJnew" placeName="New Cafe" />);
    const button = await screen.findByRole("button", { name: /new cafe to favorites/i });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn.t update your favorites/i);
    expect(screen.getByRole("button", { name: /new cafe to favorites/i })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("VisitedButton", () => {
  it("only appears for signed-in users and toggles visits", async () => {
    const { rerender } = renderWith({ status: "signed-out" }, <VisitedButton placeId="ChIJv" placeName="V" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    rerender(
      <AuthStateProvider value={SIGNED_IN}>
        <SavedPlacesProvider>
          <VisitedButton placeId="ChIJv" placeName="V" />
        </SavedPlacesProvider>
      </AuthStateProvider>,
    );
    const button = await screen.findByRole("button", { name: /mark as visited/i });
    await waitFor(() => expect(button).toBeEnabled());
    await userEvent.click(button);
    expect(api.markVisited).toHaveBeenCalledWith("ChIJv");
    expect(screen.getByRole("button", { name: /visited: v/i })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AuthNav", () => {
  it.each([
    [{ status: "unavailable" } as AuthState, []],
    [{ status: "loading" } as AuthState, []],
    [{ status: "signed-out" } as AuthState, ["Sign in"]],
    [SIGNED_IN, ["Favorites", "Account"]],
  ])("shows the right links for %o", (auth, links) => {
    render(
      <AuthStateProvider value={auth}>
        <AuthNav />
      </AuthStateProvider>,
    );
    expect(screen.queryAllByRole("link").map((link) => link.textContent)).toEqual(links);
  });
});

describe("FavoritesView", () => {
  const favorites = [
    { placeId: "ChIJsaved", notes: "Great matcha", createdAt: "2026-10-01T00:00:00Z" },
    { placeId: "ChIJgone", notes: null, createdAt: "2026-09-01T00:00:00Z" },
  ];
  const summaries = {
    ChIJsaved: { placeId: "ChIJsaved", name: "Saved Cafe", address: "St 51", dataSource: "google" as const },
  };

  it("lists favorites with Google attribution, notes and safe fallbacks", async () => {
    renderWith(SIGNED_IN, (
      <FavoritesView
        favorites={favorites}
        visits={[{ placeId: "ChIJsaved", visitDate: "2026-10-16", createdAt: "2026-10-16T00:00:00Z" }]}
        summaries={summaries}
        degraded
      />
    ));
    expect(screen.getByRole("heading", { name: "Favorites (2)" })).toBeInTheDocument();
    const saved = screen.getByRole("article", { name: "Saved Cafe" });
    expect(within(saved).getByText("Visited")).toBeInTheDocument();
    expect(within(saved).getByLabelText(/your notes/i)).toHaveValue("Great matcha");
    expect(within(saved).getByRole("link", { name: /directions/i })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Cafe details unavailable" })).toBeInTheDocument();
    expect(screen.getByTestId("google-maps-attribution")).toBeInTheDocument();
    expect(screen.getByText(/couldn.t load right now/)).toBeInTheDocument();
    expect(screen.getByText("Visited Oct 16, 2026")).toBeInTheDocument();
  });

  it("saves notes and removes favorites", async () => {
    const user = userEvent.setup();
    renderWith(SIGNED_IN, <FavoritesView favorites={favorites} visits={[]} summaries={summaries} degraded={false} />);
    const saved = screen.getByRole("article", { name: "Saved Cafe" });

    const notes = within(saved).getByLabelText(/your notes/i);
    await user.clear(notes);
    await user.type(notes, "Try the cold brew");
    await user.click(within(saved).getByRole("button", { name: "Save notes" }));
    expect(api.updateFavoriteNotes).toHaveBeenCalledWith("ChIJsaved", "Try the cold brew");
    expect(await within(saved).findByText("Notes saved.")).toBeInTheDocument();

    await waitFor(() => expect(api.listFavorites).toHaveBeenCalled());
    await waitFor(async () => {
      await user.click(within(screen.getByRole("article", { name: "Saved Cafe" })).getByRole("button", { name: /remove/i }));
      expect(screen.queryByRole("article", { name: "Saved Cafe" })).not.toBeInTheDocument();
    });
    expect(api.removeFavorite).toHaveBeenCalledWith("ChIJsaved");
  });

  it("shows an empty state", () => {
    renderWith(SIGNED_IN, <FavoritesView favorites={[]} visits={[]} summaries={{}} degraded={false} />);
    expect(screen.getByText("No favorites yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find cafes" })).toHaveAttribute("href", "/discover");
  });
});
