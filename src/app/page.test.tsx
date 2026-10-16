import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockReset();
});

describe("HomePage", () => {
  it("states the promise and offers search without an account", () => {
    render(<HomePage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /find the best cafe/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Cafe search" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /find my cafe/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /log in|sign in/i })).not.toBeInTheDocument();
  });

  it("opens /discover with the chosen settings on submit", async () => {
    const user = userEvent.setup();
    render(<HomePage />);

    await user.click(screen.getByRole("button", { name: /Riverside/ }));
    await user.click(screen.getByRole("radio", { name: "Relax / Read" }));
    await user.click(screen.getByRole("button", { name: /find my cafe/i }));

    expect(push).toHaveBeenCalledExactlyOnceWith(
      "/discover?area=riverside&purpose=relax&radius=3000",
    );
  });
});
