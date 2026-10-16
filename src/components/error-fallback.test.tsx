import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorFallback } from "./error-fallback";

describe("ErrorFallback", () => {
  it("announces the error and retries on click", async () => {
    const onRetry = vi.fn();
    render(<ErrorFallback onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
