import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HomeDiscovery } from "@/features/discovery/components/home-discovery";
import * as savedClient from "@/features/favorites/saved-places-client";
import { ACCOUNT_DELETION_CONFIRMATION, DEFAULT_PREFERENCES } from "@/lib/user-data/schemas";

import { AuthStateProvider, type AuthState } from "../auth-provider";
import { AccountView } from "./account-view";
import { LoginView } from "./login-view";

const nav = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, push: nav.push, refresh: nav.refresh }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/",
}));

// Server actions can't run in jsdom; the UI only needs callable stand-ins.
vi.mock("../actions", () => ({
  signInAction: vi.fn(async () => ({ status: "error", message: "Email or password is incorrect." })),
  signUpAction: vi.fn(async () => ({ status: "check-email", email: "new@example.test" })),
  googleSignInAction: vi.fn(),
}));

vi.mock("@/features/favorites/saved-places-client", () => ({
  getPreferences: vi.fn(),
  savePreferences: vi.fn(),
  updateProfile: vi.fn(),
  deleteAccount: vi.fn(),
}));
const api = vi.mocked(savedClient);

const signOut = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { signOut } }),
  isAuthConfigured: () => true,
}));

const SIGNED_IN: AuthState = { status: "signed-in", user: { id: "user-a", email: "a@example.test" } };
const withAuth = (auth: AuthState, ui: ReactNode) => render(<AuthStateProvider value={auth}>{ui}</AuthStateProvider>);

beforeEach(() => {
  nav.search = "";
  nav.replace.mockReset();
  nav.push.mockReset();
  signOut.mockClear();
  api.getPreferences.mockReset();
  api.savePreferences.mockReset().mockResolvedValue({ ok: true, data: { preferences: DEFAULT_PREFERENCES } });
  api.updateProfile.mockReset().mockResolvedValue({ ok: true, data: { profile: { displayName: "S", email: null } } });
  api.deleteAccount.mockReset().mockResolvedValue({ ok: true, data: null });
});

describe("LoginView", () => {
  it("explains when sign-in isn't configured", () => {
    withAuth({ status: "unavailable" }, <LoginView />);
    expect(screen.getByTestId("auth-unavailable")).toHaveTextContent(/search for cafes as a guest/);
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("offers email sign-in, sign-up and Google, carrying a safe next path", async () => {
    nav.search = "next=%2Ffavorites";
    const user = userEvent.setup();
    withAuth({ status: "signed-out" }, <LoginView />);

    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    for (const input of document.querySelectorAll<HTMLInputElement>('input[name="next"]')) {
      expect(input.value).toBe("/favorites");
    }

    await user.click(screen.getByRole("button", { name: "Create account", pressed: false }));
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("never forwards an unsafe next path", () => {
    nav.search = "next=https%3A%2F%2Fevil.example";
    withAuth({ status: "signed-out" }, <LoginView />);
    for (const input of document.querySelectorAll<HTMLInputElement>('input[name="next"]')) {
      expect(input.value).toBe("/");
    }
  });

  it("shows errors from the server action and from the OAuth callback", async () => {
    nav.search = "error=oauth";
    const user = userEvent.setup();
    withAuth({ status: "signed-out" }, <LoginView />);
    expect(screen.getByText(/google sign-in didn.t complete/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Email"), "a@example.test");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(document.querySelector('form[aria-label="Sign in"] button[type="submit"]') as HTMLElement);
    expect(await screen.findByText("Email or password is incorrect.")).toBeInTheDocument();
  });

  it("confirms sign-up without revealing whether the email exists", async () => {
    const user = userEvent.setup();
    withAuth({ status: "signed-out" }, <LoginView />);
    await user.click(screen.getByRole("button", { name: "Create account", pressed: false }));
    await user.type(screen.getByLabelText("Email"), "new@example.test");
    await user.type(screen.getByLabelText("Password"), "long enough password");
    await user.click(document.querySelector('form[aria-label="Create account"] button[type="submit"]') as HTMLElement);
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText(/If new@example.test can be used/)).toBeInTheDocument();
  });

  it("continues to the next page when already signed in", async () => {
    nav.search = "next=%2Faccount";
    withAuth(SIGNED_IN, <LoginView />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/account"));
  });
});

describe("AccountView", () => {
  const renderAccount = () =>
    withAuth(
      SIGNED_IN,
      <AccountView
        profile={{ displayName: "Sokha", email: "a@example.test" }}
        preferences={{ ...DEFAULT_PREFERENCES, purpose: "relax", radiusMeters: 5000 }}
        maxRadiusMeters={15_000}
      />,
    );

  it("shows the profile and saves edited defaults", async () => {
    const user = userEvent.setup();
    renderAccount();
    expect(screen.getByText("a@example.test")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Relax / Read" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Date" }));
    await user.click(screen.getByRole("checkbox", { name: "Open now only" }));
    await user.click(screen.getByRole("button", { name: "Save defaults" }));
    expect(api.savePreferences).toHaveBeenCalledWith({
      ...DEFAULT_PREFERENCES,
      purpose: "date",
      radiusMeters: 5000,
      openNowOnly: true,
    });
    expect(await screen.findByText("Search defaults saved.")).toBeInTheDocument();
  });

  it("saves the display name", async () => {
    const user = userEvent.setup();
    renderAccount();
    const name = screen.getByLabelText("Display name");
    await user.clear(name);
    await user.type(name, " New Name ");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(api.updateProfile).toHaveBeenCalledWith("New Name");
  });

  it("deletes the account only after typing the confirmation phrase", async () => {
    const user = userEvent.setup();
    renderAccount();
    const button = screen.getByRole("button", { name: "Delete my account" });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/to confirm/), "delete my acc");
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText(/to confirm/), "ount");
    await user.click(button);

    expect(api.deleteAccount).toHaveBeenCalledWith(ACCOUNT_DELETION_CONFIRMATION);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/"));
    expect(signOut).toHaveBeenCalled();
  });

  it("signs out locally and returns home", async () => {
    renderAccount();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/"));
    expect(signOut).toHaveBeenCalled();
  });
});

describe("HomeDiscovery with saved defaults", () => {
  it("starts signed-in users from their saved defaults", async () => {
    api.getPreferences.mockResolvedValue({
      ok: true,
      data: { preferences: { ...DEFAULT_PREFERENCES, purpose: "friends", openNowOnly: true } },
    });
    withAuth(SIGNED_IN, <HomeDiscovery maxRadiusMeters={15_000} />);
    expect(await screen.findByTestId("saved-defaults-notice")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Friends" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Open now only" })).toBeChecked();
  });

  it("does not fetch defaults for guests", () => {
    withAuth({ status: "signed-out" }, <HomeDiscovery maxRadiusMeters={15_000} />);
    expect(api.getPreferences).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Work / Study" })).toBeChecked();
  });
});
