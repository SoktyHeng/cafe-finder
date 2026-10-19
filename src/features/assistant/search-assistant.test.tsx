import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "@/lib/user-data/schemas";
import type { AssistantResponse } from "@/lib/ai/schemas";
import { SearchAssistant } from "./search-assistant";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const reply: AssistantResponse = { status: "clarify", provider: "fixture", message: "Choose a location.", preferences: { ...DEFAULT_PREFERENCES, preferWifi: true }, location: null, locationLabel: null, filters: null, notices: ["Unknown amenities stay unverified."], results: null };

describe("Conversational search", () => {
  it("identifies NVIDIA as the receiving service when selected", () => {
    render(<SearchAssistant maxRadiusMeters={15000} demo={false} vendor="NVIDIA" />);
    expect(screen.getByText(/preferences go to NVIDIA/)).toBeInTheDocument();
    expect(screen.queryByText(/preferences go to OpenAI/)).not.toBeInTheDocument();
  });
  it("makes no automatic calls or calls while typing; submits once and carries context forward", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(reply));
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<SearchAssistant maxRadiusMeters={15000} demo />);
    const field = screen.getByRole("textbox", { name: /what kind of cafe/i });
    await user.click(field);
    await user.paste("Find quiet cafes near me");
    expect(fetcher).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Search with assistant" }));
    await screen.findByText("Choose a location.", { exact: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("region", { name: "Interpreted search" })).toHaveTextContent("Wi-Fi preference: Yes");
    fetcher.mockResolvedValueOnce(Response.json(reply));
    await user.click(field);
    await user.paste("Only open now");
    await user.click(screen.getByRole("button", { name: "Search with assistant" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(body.history).toEqual(["Find quiet cafes near me"]);
    expect(body.preferences.preferWifi).toBe(true);
  });
  it("preserves input and regular-search fallback when AI fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "RATE_LIMITED", message: "Limit" } }, { status: 429 })));
    const user = userEvent.setup();
    render(<SearchAssistant maxRadiusMeters={15000} demo={false} />);
    const field = screen.getByRole("textbox", { name: /what kind of cafe/i });
    await user.type(field, "Show cafes in BKK1");
    await user.click(screen.getByRole("button", { name: "Search with assistant" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("allowance");
    expect(field).toHaveValue("Show cafes in BKK1");
    expect(screen.getByRole("link", { name: "Use regular search filters" })).toHaveAttribute("href", "/discover");
  });
  it("keeps the chosen location in the fallback when the first AI request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "UPSTREAM_UNAVAILABLE", message: "Unavailable" } }, { status: 503 })));
    const user = userEvent.setup();
    render(<SearchAssistant maxRadiusMeters={1000} demo={false} />);
    await user.click(screen.getByText("Choose or change location"));
    await user.click(screen.getByRole("button", { name: /BKK1/ }));
    await user.type(screen.getByRole("textbox", { name: /what kind of cafe/i }), "cafes");
    await user.click(screen.getByRole("button", { name: "Search with assistant" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("link", { name: "Use regular search filters" }).getAttribute("href")).toMatch(/area=bkk1.*radius=1000/);
  });
  it("does not send duplicate requests on rapid submit and prevents location edits while busy", async () => {
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetcher);
    render(<SearchAssistant maxRadiusMeters={15000} demo={false} />);
    const field = screen.getByRole("textbox", { name: /what kind of cafe/i });
    fireEvent.change(field, { target: { value: "cafes" } });
    fireEvent.submit(field.closest("form")!); fireEvent.submit(field.closest("form")!);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Use my current location/i, hidden: true })).toBeDisabled();
  });
});
